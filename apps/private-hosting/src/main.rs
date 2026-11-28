mod io_deadline;
mod supervisor;

use io_deadline::DeadlineStream;

use anyhow::{Context, Result, bail, ensure};
use serde::Deserialize;
use std::{
    collections::{BTreeMap, BTreeSet},
    env, fs,
    io::Write,
    os::unix::{
        fs::{FileTypeExt, MetadataExt},
        net::UnixListener,
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

const APPS: [&str; 5] = ["atlas", "go-demo", "slides", "world", "harrhy-ui"];

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
    #[serde(default)]
    port: u16,
    socket: Option<PathBuf>,
    readiness: Option<Vec<String>>,
    #[serde(default)]
    argv: Vec<String>,
    #[serde(default)]
    cwd: PathBuf,
    #[serde(default)]
    env: BTreeMap<String, String>,
}

impl Spec {
    fn adopted(&self) -> bool {
        self.argv.is_empty()
    }
}

fn valid_launch(argv: &[String], cwd: &Path, env: &BTreeMap<String, String>) -> bool {
    cwd.is_absolute()
        && argv.first().is_some_and(|arg| Path::new(arg).is_absolute())
        && argv.iter().all(|arg| !arg.contains('\0'))
        && env.iter().all(|(key, value)| {
            !key.is_empty() && key != "PORT" && !key.contains(['=', '\0']) && !value.contains('\0')
        })
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
            "expected absolute Caddy executable, atlas and go-demo specs, and optional slides/world/harrhy-ui"
        );
        let mut ports = BTreeSet::new();
        let mut hosts = BTreeSet::new();
        for (name, spec) in &config.apps {
            ensure!(
                valid_host(&spec.host) && hosts.insert(&spec.host),
                "invalid or duplicate host for {name}"
            );
            if name == "harrhy-ui" {
                let path = spec
                    .socket
                    .as_ref()
                    .context("Harrhy UI requires a private upstream socket")?;
                socket_path(path)?;
                ensure!(
                    path != &config.ingress
                        && path.file_name().is_some()
                        && spec.port == 0
                        && spec.argv.is_empty()
                        && spec.cwd.as_os_str().is_empty()
                        && spec.env.is_empty()
                        && spec.readiness.is_none(),
                    "Harrhy UI is socket-only and has no launch spec"
                );
                continue;
            }
            ensure!(
                spec.socket.is_none() && spec.port >= 1024 && ports.insert(spec.port),
                "invalid or duplicate port for {name}"
            );
            if name == "slides" && spec.adopted() {
                ensure!(
                    spec.port == 21394
                        && spec.argv.is_empty()
                        && spec.cwd.as_os_str().is_empty()
                        && spec.env.is_empty()
                        && spec.readiness.is_none(),
                    "slides requires port 21394 and no launch spec"
                );
                continue;
            }
            ensure!(
                valid_launch(&spec.argv, &spec.cwd, &spec.env),
                "invalid launch spec for {name}"
            );
            if let Some(paths) = &spec.readiness {
                ensure!(
                    !paths.is_empty()
                        && paths.len() <= 4
                        && paths.iter().all(|path| path.starts_with('/')
                            && !path.starts_with("//")
                            && path.len() <= 128
                            && path
                                .bytes()
                                .all(|b| b.is_ascii_alphanumeric() || b"/._-".contains(&b))),
                    "invalid readiness paths for {name}"
                );
            }
            if name == "slides" {
                ensure!(
                    spec.readiness
                        .as_deref()
                        .is_some_and(|paths| paths.iter().any(|p| p == "/")
                            && paths.iter().any(|p| p == "/position")),
                    "managed Slides requires / and /position readiness"
                );
            }
        }
        Ok(config)
    }
}

fn uid() -> u32 {
    // SAFETY: geteuid has no preconditions.
    unsafe { libc::geteuid() }
}

fn validate_directory(path: &Path, private: bool) -> Result<()> {
    ensure!(
        path.canonicalize()? == path,
        "directory must use a canonical, non-symlink path: {}",
        path.display()
    );
    let meta = fs::symlink_metadata(path)?;
    let forbidden = if private { 0o077 } else { 0o022 };
    ensure!(
        meta.is_dir() && meta.uid() == uid() && meta.mode() & forbidden == 0,
        "unsafe directory ownership or permissions: {}",
        path.display()
    );
    for ancestor in path.ancestors().skip(1) {
        let meta = fs::symlink_metadata(ancestor)?;
        ensure!(
            meta.is_dir()
                && (meta.uid() == 0 || meta.uid() == uid())
                && (meta.mode() & 0o022 == 0 || (meta.uid() == 0 && meta.mode() & 0o1000 != 0)),
            "unsafe directory ancestor: {}",
            ancestor.display()
        );
    }
    Ok(())
}

fn remove_stale_socket(path: &Path) -> Result<()> {
    match fs::symlink_metadata(path) {
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Ok(meta) => ensure!(
            meta.file_type().is_socket() && meta.uid() == uid(),
            "refusing to replace unowned or non-socket path: {}",
            path.display()
        ),
        Err(err) => return Err(err.into()),
    }
    match DeadlineStream::unix(path, Duration::from_millis(250)) {
        Err(err)
            if matches!(
                err.kind(),
                std::io::ErrorKind::ConnectionRefused | std::io::ErrorKind::NotFound
            ) =>
        {
            remove_socket(path)
        }
        _ => bail!(
            "refusing to replace a socket that may be live: {}",
            path.display()
        ),
    }
}

fn remove_socket(path: &Path) -> Result<()> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_socket() && metadata.uid() == uid() => {
            Ok(fs::remove_file(path)?)
        }
        Ok(_) => bail!("refusing to remove non-socket at {}", path.display()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(err) => Err(err.into()),
    }
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
        validate_directory(dir, true)?;
    }
    let ingress_dir = config
        .ingress
        .parent()
        .context("ingress must have a parent")?;
    validate_directory(ingress_dir, false)?;
    ensure!(
        runtime != state,
        "state and runtime require separate directories"
    );
    ensure!(
        ingress_dir != runtime && ingress_dir != state,
        "ingress requires its own directory"
    );
    if let Some(socket) = config
        .apps
        .get("harrhy-ui")
        .and_then(|spec| spec.socket.as_ref())
    {
        let parent = socket
            .parent()
            .unwrap()
            .canonicalize()
            .context("Harrhy UI socket parent must be provisioned")?;
        ensure!(
            parent != ingress_dir && parent != runtime && parent != state,
            "Harrhy UI upstream requires a separate socket directory"
        );
    }
    // Lock the directories themselves so different databases cannot share socket paths.
    let locks = [
        fs::File::open(state)?,
        fs::File::open(runtime)?,
        fs::File::open(ingress_dir)?,
    ];
    for (lock, name) in locks.iter().zip(["state", "runtime", "ingress"]) {
        lock.try_lock()
            .with_context(|| format!("acquire exclusive {name} lock"))?;
    }
    for socket in [
        control.as_path(),
        &runtime.join("admin.sock"),
        &config.ingress,
    ] {
        remove_stale_socket(socket)?;
    }
    let shutdown = Arc::new(AtomicBool::new(false));
    for signal in [libc::SIGTERM, libc::SIGINT] {
        signal_hook::flag::register(signal, Arc::clone(&shutdown))?;
    }
    let mut supervisor = Supervisor::new(config, runtime, state)?;
    let listener = UnixListener::bind(&control)?;
    let result = (|| -> Result<()> {
        listener.set_nonblocking(true)?;
        while !shutdown.load(Ordering::Relaxed) {
            match listener.accept() {
                Ok((stream, _)) => {
                    let mut stream = DeadlineStream::accepted(stream, Duration::from_millis(250));
                    if let Ok(request) = stream.line(128) {
                        let reply = supervisor.command(&request)?;
                        let mut stream = stream.with_timeout(Duration::from_millis(250));
                        let _ = writeln!(stream, "{reply}");
                    }
                    supervisor.reconcile()?;
                }
                Err(err) if err.kind() == std::io::ErrorKind::WouldBlock => {
                    supervisor.reconcile()?;
                    sleep(Duration::from_millis(100));
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
            if matches!(command, ["status"])
                || matches!(command, ["start" | "stop", app] if APPS.contains(app)) =>
        {
            let mut stream = DeadlineStream::unix(
                &Path::new(runtime).join("control.sock"),
                Duration::from_secs(15),
            )?;
            writeln!(stream, "{}", command.join(" "))?;
            let reply: serde_json::Value = serde_json::from_str(&stream.line(4096)?)?;
            println!("{}", serde_json::to_string_pretty(&reply)?);
            ensure!(reply.get("error").is_none(), "control command failed");
            Ok(())
        }
        _ => bail!(
            "usage: private-hosting --runtime DIR (run --state DIR --config FILE | status | (start|stop) (atlas|go-demo|slides|world|harrhy-ui))"
        ),
    }
}

#[cfg(test)]
#[path = "../__tests__/unit.rs"]
mod tests;
