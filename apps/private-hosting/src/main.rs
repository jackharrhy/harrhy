mod supervisor;

use anyhow::{Context, Result, bail, ensure};
use serde::Deserialize;
use std::{
    collections::BTreeMap,
    env, fs,
    io::{BufRead, BufReader, Read, Write},
    os::unix::{
        fs::{FileTypeExt, MetadataExt},
        net::{UnixListener, UnixStream},
    },
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread::sleep,
    time::Duration,
};
use supervisor::Supervisor;

const APPS: [&str; 3] = ["atlas", "go-demo", "slides"];

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Config {
    caddy: PathBuf,
    ingress: PathBuf,
    apps: BTreeMap<String, Spec>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Spec {
    host: String,
    port: u16,
    #[serde(default)]
    argv: Vec<String>,
    #[serde(default)]
    cwd: PathBuf,
    #[serde(default)]
    env: BTreeMap<String, String>,
}

fn socket_path(path: &Path) -> Result<()> {
    let bytes = path.as_os_str().as_encoded_bytes();
    ensure!(
        path.is_absolute()
            && bytes.len() <= 100
            && bytes
                .iter()
                .all(|c| c.is_ascii_alphanumeric() || b"/._-".contains(c)),
        "invalid Unix socket path"
    );
    Ok(())
}

fn valid_host(host: &str) -> bool {
    let alnum = |c: u8| c.is_ascii_lowercase() || c.is_ascii_digit();
    host.len() <= 253
        && host.contains('.')
        && host.split('.').all(|label| {
            let bytes = label.as_bytes();
            !bytes.is_empty()
                && bytes.len() <= 63
                && alnum(bytes[0])
                && alnum(bytes[bytes.len() - 1])
                && bytes.iter().all(|&c| alnum(c) || c == b'-')
        })
}

impl Config {
    fn read(path: &Path) -> Result<Self> {
        let config: Self = serde_json::from_slice(&fs::read(path)?)?;
        socket_path(&config.ingress)?;
        ensure!(
            config.caddy.is_absolute()
                && config.apps.contains_key("atlas")
                && config.apps.contains_key("go-demo")
                && config.apps.keys().all(|name| APPS.contains(&name.as_str())),
            "expected absolute Caddy executable, atlas and go-demo specs, and optional slides"
        );
        let atlas = &config.apps[APPS[0]];
        let demo = &config.apps[APPS[1]];
        ensure!(
            atlas.port != demo.port && atlas.host != demo.host,
            "duplicate app host or port"
        );
        for (name, spec) in &config.apps {
            if name == "slides" {
                ensure!(
                    valid_host(&spec.host)
                        && spec.port == 21394
                        && spec.argv.is_empty()
                        && spec.cwd.as_os_str().is_empty()
                        && spec.env.is_empty()
                        && ![atlas.port, demo.port].contains(&spec.port)
                        && spec.host != atlas.host
                        && spec.host != demo.host,
                    "slides requires a distinct host, port 21394, and no launch spec"
                );
                continue;
            }
            ensure!(
                valid_host(&spec.host)
                    && spec.port >= 1024
                    && spec.cwd.is_absolute()
                    && spec
                        .argv
                        .first()
                        .is_some_and(|arg| Path::new(arg).is_absolute())
                    && spec.argv.iter().all(|arg| !arg.contains('\0'))
                    && spec.env.iter().all(|(key, value)| !key.is_empty()
                        && key != "PORT"
                        && !key.contains(['=', '\0'])
                        && !value.contains('\0')),
                "invalid spec for {name}"
            );
        }
        Ok(config)
    }
}

fn remove_socket(path: &Path) -> Result<()> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_socket() => Ok(fs::remove_file(path)?),
        Ok(_) => bail!("refusing to remove non-socket at {}", path.display()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(err) => Err(err.into()),
    }
}

fn line(input: impl Read, max: u64) -> Result<String> {
    let mut line = String::new();
    BufReader::new(input).take(max).read_line(&mut line)?;
    ensure!(line.ends_with('\n'), "incomplete or oversized line");
    Ok(line)
}

fn serve(runtime: &Path, state: &Path, config: Config) -> Result<()> {
    // Run before opening the database, control socket, or starting children.
    unsafe { libc::umask(0o077) };
    let control = runtime.join("control.sock");
    socket_path(&control)?;
    ensure!(state.is_absolute(), "state path must be absolute");
    for dir in [runtime, state] {
        if let Err(err) = fs::create_dir(dir)
            && err.kind() != std::io::ErrorKind::AlreadyExists
        {
            return Err(err.into());
        }
        let meta = fs::symlink_metadata(dir)?;
        // SAFETY: geteuid has no preconditions.
        ensure!(
            meta.is_dir() && meta.uid() == unsafe { libc::geteuid() } && meta.mode() & 0o077 == 0,
            "runtime and state must be private directories owned by the daemon UID"
        );
    }
    let ingress_dir = config.ingress.parent().unwrap().canonicalize()?;
    ensure!(
        ingress_dir != runtime.canonicalize()? && ingress_dir != state.canonicalize()?,
        "ingress requires its own directory"
    );
    let lock = fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(false)
        .open(state.join("daemon.lock"))?;
    lock.try_lock().context("acquire exclusive state lock")?;
    let shutdown = Arc::new(AtomicBool::new(false));
    for signal in [libc::SIGTERM, libc::SIGINT] {
        signal_hook::flag::register(signal, Arc::clone(&shutdown))?;
    }
    let mut supervisor = Supervisor::new(config, runtime, state)?;
    remove_socket(&control)?;
    let listener = UnixListener::bind(&control)?;
    let result = (|| -> Result<()> {
        listener.set_nonblocking(true)?;
        while !shutdown.load(Ordering::Relaxed) {
            supervisor.reconcile()?;
            match listener.accept() {
                Ok((mut stream, _)) => {
                    let timeout = Some(Duration::from_millis(250));
                    stream.set_read_timeout(timeout)?;
                    stream.set_write_timeout(timeout)?;
                    if let Ok(request) = line(&stream, 128) {
                        let reply = supervisor.command(&request)?;
                        let _ = writeln!(stream, "{reply}");
                    }
                }
                Err(err) if err.kind() == std::io::ErrorKind::WouldBlock => {
                    sleep(Duration::from_millis(250))
                }
                Err(err) => return Err(err.into()),
            }
        }
        Ok(())
    })();
    let cleanup = supervisor.shutdown();
    let socket_cleanup = remove_socket(&control);
    result.and(cleanup).and(socket_cleanup)
}

fn main() -> Result<()> {
    let args: Vec<String> = env::args().skip(1).collect();
    match args
        .iter()
        .map(String::as_str)
        .collect::<Vec<_>>()
        .as_slice()
    {
        [
            "--runtime",
            runtime,
            "run",
            "--state",
            state,
            "--config",
            config,
        ] => serve(
            Path::new(runtime),
            Path::new(state),
            Config::read(Path::new(config))?,
        ),
        ["--runtime", runtime, command @ ..]
            if matches!(
                command,
                ["status"] | ["start" | "stop", "atlas" | "go-demo" | "slides"]
            ) =>
        {
            let mut stream = UnixStream::connect(Path::new(runtime).join("control.sock"))?;
            stream.set_read_timeout(Some(Duration::from_secs(15)))?;
            writeln!(stream, "{}", command.join(" "))?;
            let reply: serde_json::Value = serde_json::from_str(&line(stream, 4096)?)?;
            println!("{}", serde_json::to_string_pretty(&reply)?);
            ensure!(reply.get("error").is_none(), "control command failed");
            Ok(())
        }
        _ => bail!(
            "usage: private-hosting --runtime DIR (run --state DIR --config FILE | status | (start|stop) (atlas|go-demo|slides))"
        ),
    }
}

#[cfg(test)]
#[path = "../__tests__/unit.rs"]
mod tests;
