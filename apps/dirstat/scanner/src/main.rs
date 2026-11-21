use serde_json::{Value, json};
use std::{
    env, fs,
    io::{self, Read, Write},
    os::unix::fs::MetadataExt,
    path::{Path, PathBuf},
    thread,
    time::{Duration, Instant},
};

fn emit(out: &mut impl Write, event: Value) -> io::Result<()> {
    writeln!(out, "{event}")?;
    out.flush()
}

fn candidate(path: &Path, name: &str) -> Option<&'static str> {
    match name {
        "node_modules" => return Some("Dependencies"),
        ".venv" | "venv" => return Some("Python environment"),
        _ => {}
    }
    let marker = path.join("CMakeCache.txt");
    let marker_meta = fs::symlink_metadata(&marker).ok()?;
    let files_meta = fs::symlink_metadata(path.join("CMakeFiles")).ok()?;
    if !marker_meta.is_file() || !files_meta.is_dir() {
        return None;
    }
    let mut prefix = [0; 128];
    let mut file = fs::File::open(marker).ok()?;
    let n = file.read(&mut prefix).ok()?;
    prefix[..n]
        .starts_with(b"# This is the CMakeCache file.")
        .then_some("CMake output")
}

fn limit(key: &str, max: u64) -> u64 {
    env::var(key)
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(max)
        .min(max)
}

struct Frame {
    id: u64,
    children: fs::ReadDir,
    bytes: u64,
    hidden: bool,
    summary: Option<(u64, String, &'static str)>,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = PathBuf::from(
        env::args_os()
            .nth(1)
            .ok_or("usage: harrhy-dirstat-scanner DIRECTORY")?,
    )
    .canonicalize()?;
    let mode = env::args_os().nth(2);
    let aggregate = mode.as_deref().is_some_and(|arg| arg == "--aggregate");
    let file_details = aggregate || mode.as_deref().is_some_and(|arg| arg == "--files");
    let max_entries = limit("HARRHY_DIRSTAT_MAX_ENTRIES", 4096);
    let max_bytes = limit("HARRHY_DIRSTAT_MAX_BYTES", 32 * 1024 * 1024);
    let deadline = Instant::now() + Duration::from_millis(limit("HARRHY_DIRSTAT_MAX_MS", 8000));
    const FILE_LIMIT: u64 = 256;
    let (mut files, mut omitted, mut file_bytes) = (0, 0, 0);
    let mut detailed_files = 0;
    let device = root.metadata()?.dev();
    let mut frames = vec![Frame {
        id: 0,
        children: fs::read_dir(&root)?,
        bytes: 0,
        hidden: false,
        summary: None,
    }];
    let mut out = io::stdout().lock();
    let (mut next, mut entries, mut skipped) = (1u64, 0u64, 0u64);
    let mut last = Instant::now();
    let mut events = Vec::with_capacity(64);
    emit(
        &mut out,
        json!({"type":"start","version":if aggregate {3} else if file_details {2} else {1},"root":0}),
    )?;
    let mut total = 0;
    while !frames.is_empty() {
        let depth = frames.len();
        let frame = frames.last_mut().unwrap();
        let entry = frame.children.next();
        if entry.is_some() {
            entries += 1;
        }
        if aggregate {
            let reason = if entries > max_entries {
                Some("entry limit")
            } else if Instant::now() >= deadline {
                Some("time limit")
            } else {
                None
            };
            if let Some(reason) = reason {
                emit(&mut out, json!({"type":"abort","reason":reason}))?;
                return Ok(());
            }
        }
        match entry {
            None => {
                let Frame {
                    id,
                    bytes,
                    hidden,
                    summary,
                    ..
                } = frames.pop().unwrap();
                if let Some((parent, name, kind)) = summary {
                    events.push(json!({"type":"summary","id":id,"parent":parent,"name":name,"kind":kind,"bytes":bytes}));
                } else if !hidden {
                    events.push(json!({"type":"leave","id":id,"bytes":bytes}));
                }
                if let Some(parent) = frames.last_mut() {
                    parent.bytes += bytes;
                } else {
                    total = bytes;
                }
            }
            Some(Err(_)) => skipped += 1,
            Some(Ok(entry)) => {
                if entries % 256 == 0 {
                    thread::sleep(Duration::from_millis(10));
                }
                match entry.metadata() {
                    Ok(m) if m.dev() == device && !m.is_symlink() => {
                        if m.is_dir() && depth < 128 {
                            match fs::read_dir(entry.path()) {
                                Ok(children) => {
                                    let name = entry.file_name().to_string_lossy().into_owned();
                                    let summary = if aggregate && !frame.hidden {
                                        candidate(&entry.path(), &name)
                                            .map(|kind| (frame.id, name.clone(), kind))
                                    } else {
                                        None
                                    };
                                    let id = if frame.hidden {
                                        frame.id
                                    } else {
                                        let id = next;
                                        next += 1;
                                        if summary.is_none() {
                                            events.push(json!({"type":"enter","id":id,"parent":frame.id,"name":name}));
                                        }
                                        id
                                    };
                                    let hidden = frame.hidden || summary.is_some();
                                    frames.push(Frame {
                                        id,
                                        children,
                                        bytes: if aggregate { 0 } else { m.blocks() * 512 },
                                        hidden,
                                        summary,
                                    });
                                }
                                Err(_) => skipped += 1,
                            }
                        } else if m.is_file() && m.nlink() == 1 {
                            let allocated = m.blocks() * 512;
                            frame.bytes += allocated;
                            if file_details {
                                files += 1;
                                file_bytes += allocated;
                                if aggregate && file_bytes > max_bytes {
                                    emit(
                                        &mut out,
                                        json!({"type":"abort","reason":"allocated byte limit"}),
                                    )?;
                                    return Ok(());
                                }
                                if !frame.hidden {
                                    if detailed_files < FILE_LIMIT {
                                        detailed_files += 1;
                                        events.push(json!({"type":"file","id":next,"parent":frame.id,"name":entry.file_name().to_string_lossy(),"bytes":allocated}));
                                        next += 1;
                                    } else {
                                        omitted += 1;
                                    }
                                }
                            }
                        } else {
                            skipped += 1;
                        }
                    }
                    _ => skipped += 1,
                }
            }
        }
        let interval = Duration::from_millis(150);
        if events.len() >= 64 || last.elapsed() >= interval || frames.is_empty() {
            thread::sleep(interval.saturating_sub(last.elapsed()));
            emit(
                &mut out,
                json!({"type":"progress","events":events,"entries":entries,"skipped":skipped,"cursor":frames.iter().rev().find(|f| !f.hidden).map(|f| f.id)}),
            )?;
            events.clear();
            last = Instant::now();
        }
    }
    emit(
        &mut out,
        if file_details {
            json!({"type":"finish","entries":entries,"skipped":skipped,"estimated_bytes":total,"files":files,"fileBytes":file_bytes,"omitted":omitted})
        } else {
            json!({"type":"finish","entries":entries,"skipped":skipped,"estimated_bytes":total})
        },
    )?;
    Ok(())
}
