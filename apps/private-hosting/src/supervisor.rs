use super::{Config, Spec, line, remove_socket};
use anyhow::{Result, ensure};
use rusqlite::{Connection, params};
use serde_json::{Value, json};
use socket2::{Domain, Protocol, Socket, Type};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    io::{self, Write},
    net::{SocketAddr, TcpStream},
    os::unix::{fs::FileTypeExt, net::UnixStream, process::CommandExt},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    thread::sleep,
    time::{Duration, Instant},
};

type Routes = BTreeSet<String>;
const HEALTH_TIMEOUT: Duration = Duration::from_millis(250);

fn http_ok(input: impl io::Read) -> Result<()> {
    let response = line(input, 512)?;
    let mut parts = response.split_ascii_whitespace();
    ensure!(
        matches!(parts.next(), Some("HTTP/1.0" | "HTTP/1.1")) && parts.next() == Some("200"),
        "HTTP request did not return 200"
    );
    Ok(())
}

fn healthy(port: u16, path: &str) -> Result<()> {
    let mut conn =
        TcpStream::connect_timeout(&SocketAddr::from(([127, 0, 0, 1], port)), HEALTH_TIMEOUT)?;
    conn.set_read_timeout(Some(HEALTH_TIMEOUT))?;
    conn.set_write_timeout(Some(HEALTH_TIMEOUT))?;
    write!(
        conn,
        "GET {path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n"
    )?;
    http_ok(conn)
}

fn healthy_socket(socket: &Path, host: &str) -> Result<()> {
    let mut conn = UnixStream::connect(socket)?;
    conn.set_read_timeout(Some(HEALTH_TIMEOUT))?;
    conn.set_write_timeout(Some(HEALTH_TIMEOUT))?;
    write!(
        conn,
        "GET /healthz HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n"
    )?;
    http_ok(conn)
}

fn exited(child: &Child) -> io::Result<bool> {
    // WNOWAIT keeps the group's leader PID reserved until cleanup signals the group.
    let mut info = std::mem::MaybeUninit::<libc::siginfo_t>::zeroed();
    // SAFETY: kernel writes siginfo_t for a child owned by this single-threaded supervisor.
    if unsafe {
        libc::waitid(
            libc::P_PID,
            child.id(),
            info.as_mut_ptr(),
            libc::WEXITED | libc::WNOWAIT | libc::WNOHANG,
        )
    } < 0
    {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: successful waitid initialized the result (zero PID for no event).
    Ok(unsafe { info.assume_init().si_pid() } != 0)
}

fn signal_group(child: &Child, signal: i32) -> io::Result<()> {
    // SAFETY: launched with process_group(0); the unreaped leader reserves this ID.
    if unsafe { libc::kill(-(child.id() as i32), signal) } < 0 {
        let error = io::Error::last_os_error();
        if error.raw_os_error() != Some(libc::ESRCH) {
            return Err(error);
        }
    }
    Ok(())
}

fn stop(child: &mut Child, hard: bool) -> Result<()> {
    if !hard {
        signal_group(child, libc::SIGTERM)?;
        let deadline = Instant::now() + Duration::from_secs(2);
        while !exited(child)? && Instant::now() < deadline {
            sleep(Duration::from_millis(25));
        }
    }
    signal_group(child, libc::SIGKILL)?;
    let deadline = Instant::now() + Duration::from_secs(2);
    loop {
        if child.try_wait()?.is_some() {
            return Ok(());
        }
        ensure!(
            Instant::now() < deadline,
            "child did not exit after SIGKILL"
        );
        sleep(Duration::from_millis(25));
    }
}

fn launch(port: u16, argv: &[String], cwd: &Path, env: &BTreeMap<String, String>) -> Result<Child> {
    let probe = Socket::new(Domain::IPV4, Type::STREAM, Some(Protocol::TCP))?;
    probe.set_reuse_address(true)?;
    probe.bind(&SocketAddr::from(([127, 0, 0, 1], port)).into())?;
    drop(probe);
    Ok(Command::new(&argv[0])
        .args(&argv[1..])
        .current_dir(cwd)
        .env_clear()
        .env("PATH", "/usr/bin:/bin")
        .envs(env)
        .env("PORT", port.to_string())
        .stdin(Stdio::null())
        .process_group(0)
        .spawn()?)
}

struct Origin {
    children: Vec<Child>,
    health_deadline: Instant,
}
impl Origin {
    fn launch(spec: &Spec, now: Instant) -> Result<Self> {
        let mut children = Vec::new();
        if let Some(companion) = &spec.companion {
            children.push(launch(
                companion.port,
                &companion.argv,
                &companion.cwd,
                &companion.env,
            )?);
        }
        match launch(spec.port, &spec.argv, &spec.cwd, &spec.env) {
            Ok(child) => children.push(child),
            Err(error) => {
                for child in &mut children {
                    stop(child, true)?;
                }
                return Err(error);
            }
        }
        Ok(Self {
            children,
            health_deadline: now + Duration::from_secs(20),
        })
    }

    fn exited(&self) -> Result<bool> {
        for child in &self.children {
            if exited(child)? {
                return Ok(true);
            }
        }
        Ok(false)
    }

    fn stop(&mut self) -> Result<()> {
        for child in self.children.iter_mut().rev() {
            stop(child, false)?;
        }
        Ok(())
    }
}

struct Proxy {
    child: Child,
    admin_deadline: Instant,
    published: Option<Routes>,
}

pub(super) struct Supervisor {
    config: Config,
    db: Connection,
    runtime: PathBuf,
    admin: PathBuf,
    base: Value,
    proxy: Option<Proxy>,
    proxy_retry: Instant,
    origins: BTreeMap<String, Origin>,
    retries: BTreeMap<String, Instant>,
}

impl Supervisor {
    pub(super) fn new(config: Config, runtime: &Path, state: &Path) -> Result<Self> {
        let admin = runtime.join("admin.sock");
        let base = json!({"admin": {"listen": format!("unix/{}", admin.display()), "config": {"persist": false}}});
        fs::write(runtime.join("bootstrap.json"), serde_json::to_vec(&base)?)?;
        let db = Connection::open(state.join("hosting.sqlite3"))?;
        db.execute_batch("BEGIN; CREATE TABLE IF NOT EXISTS apps (name TEXT PRIMARY KEY, enabled INTEGER NOT NULL CHECK (enabled IN (0, 1))); INSERT OR IGNORE INTO apps VALUES ('atlas', 1), ('go-demo', 0), ('slides', 1), ('world', 0), ('harrhy-ui', 0); UPDATE apps SET enabled=0 WHERE name='go-demo'; COMMIT;")?;
        Ok(Self {
            config,
            db,
            runtime: runtime.into(),
            admin,
            base,
            proxy: None,
            proxy_retry: Instant::now(),
            origins: BTreeMap::new(),
            retries: BTreeMap::new(),
        })
    }

    pub(super) fn wanted(&self) -> Result<Routes> {
        let mut query = self.db.prepare("SELECT name FROM apps WHERE enabled=1")?;
        Ok(query
            .query_map([], |row| row.get(0))?
            .collect::<rusqlite::Result<Routes>>()?
            .into_iter()
            .filter(|name| self.config.apps.contains_key(name))
            .collect())
    }

    pub(super) fn caddy_config(&self, ready: &Routes) -> Value {
        let mut routes: Vec<_> = ready
            .iter()
            .map(|name| {
                let spec = &self.config.apps[name];
                let dial = match &spec.socket {
                    Some(path) => format!("unix/{}", path.display()),
                    None => format!("127.0.0.1:{}", spec.port),
                };
                let mut proxy = json!({
                    "handler":"reverse_proxy", "upstreams":[{"dial":dial}],
                    // Keep unrelated WebSockets alive during route changes. Caddy
                    // still closes old-generation upgrades after this delay.
                    "stream_close_delay":"30s",
                });
                if name == "slides" {
                    // The private gateway terminates TLS; Slides validates its native auth origin.
                    proxy["headers"] = json!({"request":{"set":{
                        "X-Forwarded-Proto":["https"], "X-Forwarded-Host":[spec.host]
                    }}});
                }
                json!({"match":[{"host":[spec.host]}], "terminal":true, "handle":[proxy]})
            })
            .collect();
        routes.push(json!({"handle":[{"handler":"static_response", "status_code":404}]}));
        let mut config = self.base.clone();
        config["apps"] = json!({"http":{"servers":{"private":{"listen":[format!("unix/{}|0660", self.config.ingress.display())], "automatic_https":{"disable":true}, "routes":routes}}}});
        config
    }

    fn close_proxy(&mut self) -> Result<()> {
        if let Some(proxy) = &mut self.proxy {
            stop(&mut proxy.child, true)?;
        }
        self.proxy = None;
        remove_socket(&self.admin)?;
        remove_socket(&self.config.ingress)
    }

    fn publish(&mut self, ready: Routes) -> Result<()> {
        if let Some(proxy) = &self.proxy {
            ensure!(!exited(&proxy.child)?, "Caddy exited");
        }
        if self.proxy.is_none() {
            if Instant::now() < self.proxy_retry {
                return Ok(());
            }
            self.close_proxy()?;
            let child = Command::new(&self.config.caddy)
                .arg("run")
                .arg("--config")
                .arg(self.runtime.join("bootstrap.json"))
                .env_clear()
                .env("XDG_CONFIG_HOME", &self.runtime)
                .env("XDG_DATA_HOME", &self.runtime)
                .stdin(Stdio::null())
                .process_group(0)
                .spawn()?;
            self.proxy = Some(Proxy {
                child,
                admin_deadline: Instant::now() + Duration::from_secs(5),
                published: None,
            });
        }
        let proxy = self.proxy.as_ref().unwrap();
        if proxy.published.as_ref() == Some(&ready) {
            return Ok(());
        }
        if !fs::symlink_metadata(&self.admin).is_ok_and(|m| m.file_type().is_socket()) {
            ensure!(
                Instant::now() < proxy.admin_deadline,
                "Caddy admin socket not ready"
            );
            return Ok(());
        }
        let body = serde_json::to_string(&self.caddy_config(&ready))?;
        let mut conn = UnixStream::connect(&self.admin)?;
        conn.set_read_timeout(Some(Duration::from_secs(2)))?;
        conn.set_write_timeout(Some(Duration::from_secs(2)))?;
        write!(
            conn,
            "POST /load HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        )?;
        http_ok(conn)?;
        self.proxy.as_mut().unwrap().published = Some(ready);
        Ok(())
    }

    pub(super) fn reconcile(&mut self) -> Result<()> {
        let wanted = self.wanted()?;
        let now = Instant::now();
        let mut retire: Routes = self
            .origins
            .keys()
            .filter(|name| !wanted.contains(*name))
            .cloned()
            .collect();
        let mut ready = Routes::new();
        for name in wanted {
            let spec = &self.config.apps[&name];
            if let Some(socket) = &spec.socket {
                if healthy_socket(socket, &spec.host).is_ok() {
                    ready.insert(name);
                }
                continue;
            }
            if name == "slides" {
                if healthy(spec.port, "/").is_ok() {
                    ready.insert(name);
                }
                continue;
            }
            if !self.origins.contains_key(&name)
                && self.retries.get(&name).is_none_or(|retry| now >= *retry)
            {
                match Origin::launch(spec, now) {
                    Ok(origin) => {
                        self.origins.insert(name.clone(), origin);
                    }
                    Err(error) => {
                        eprintln!("{name}: launch failed: {error}");
                        self.retries
                            .insert(name.clone(), now + Duration::from_secs(5));
                    }
                }
            }
            if let Some(origin) = self.origins.get_mut(&name) {
                if !origin.exited()?
                    && healthy(spec.port, "/healthz").is_ok()
                    && spec
                        .companion
                        .as_ref()
                        .is_none_or(|probe| healthy(probe.port, "/healthz").is_ok())
                    && !origin.exited()?
                {
                    origin.health_deadline = now + Duration::from_secs(20);
                    ready.insert(name);
                } else if origin.exited()? || now >= origin.health_deadline {
                    self.retries
                        .insert(name.clone(), now + Duration::from_secs(5));
                    retire.insert(name);
                }
            }
        }
        if let Err(error) = self.publish(ready) {
            // An ambiguous /load may have committed; close before stopping any origins.
            eprintln!("Caddy unavailable: {error}");
            self.close_proxy()?;
            self.proxy_retry = Instant::now() + Duration::from_secs(2);
        }
        for name in retire {
            self.origins.get_mut(&name).unwrap().stop()?;
            self.origins.remove(&name);
        }
        Ok(())
    }

    pub(super) fn command(&mut self, command: &str) -> Result<Value> {
        let parts: Vec<_> = command.split_ascii_whitespace().collect();
        match parts.as_slice() {
            ["status"] => {}
            [action @ ("start" | "stop"), name] if self.config.apps.contains_key(*name) => {
                self.db.execute(
                    "UPDATE apps SET enabled=?1 WHERE name=?2",
                    params![*action == "start", name],
                )?;
                if *action == "start" {
                    self.retries.remove(*name);
                }
                self.reconcile()?;
            }
            _ => return Ok(json!({"error":"expected status or start/stop with a registered app"})),
        }
        let wanted = self.wanted()?;
        let published = self.proxy.as_ref().and_then(|p| p.published.as_ref());
        let apps: BTreeMap<_, _> = self.config.apps.keys().map(|name| (name, json!({"host":self.config.apps[name].host,"enabled":wanted.contains(name),"running":self.origins.contains_key(name),"adopted":name=="slides" || self.config.apps[name].socket.is_some(),"published":published.is_some_and(|routes| routes.contains(name))}))).collect();
        Ok(json!({"ingress_ready":published.is_some(),"apps":apps}))
    }

    pub(super) fn shutdown(&mut self) -> Result<()> {
        self.close_proxy()?;
        for origin in self.origins.values_mut() {
            origin.stop()?;
        }
        Ok(())
    }
}
