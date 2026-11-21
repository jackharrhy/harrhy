use anyhow::{Context, Result, ensure};
use serde_json::{Value, json};
use std::{
    env, fs,
    io::{BufRead, BufReader, Read, Write},
    net::TcpListener,
    os::unix::{fs::PermissionsExt, net::UnixStream},
    path::Path,
    process::{Child, Command, Stdio},
    thread::sleep,
    time::{Duration, Instant},
};

const BIN: &str = env!("CARGO_BIN_EXE_private-hosting");

#[test]
#[ignore = "launched by the lifecycle test"]
fn atlas_fixture() -> Result<()> {
    let listener = TcpListener::bind(("127.0.0.1", env::var("PORT")?.parse::<u16>()?))?;
    for conn in listener.incoming() {
        let mut conn = conn?;
        std::thread::spawn(move || -> Result<()> {
            let mut req = String::new();
            BufReader::new(&conn).read_line(&mut req)?;
            if req.starts_with("GET /stream ") {
                conn.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\ndata: opened\n\n")?;
                sleep(Duration::from_secs(30));
            } else {
                let ok = !req.starts_with("GET /healthz ") || Path::new("ready").exists();
                write!(
                    conn,
                    "HTTP/1.1 {}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                    if ok { "200 OK" } else { "503 Unavailable" }
                )?;
            }
            Ok(())
        });
    }
    Ok(())
}

struct Daemon(Child);
impl Drop for Daemon {
    fn drop(&mut self) {
        // SAFETY: the test owns this unreaped child.
        unsafe { libc::kill(self.0.id() as i32, libc::SIGTERM) };
        let _ = self.0.wait();
    }
}

fn until(mut check: impl FnMut() -> bool) -> Result<()> {
    let deadline = Instant::now() + Duration::from_secs(10);
    while !check() {
        ensure!(Instant::now() < deadline, "condition timed out");
        sleep(Duration::from_millis(50));
    }
    Ok(())
}

fn request(socket: &Path, host: &str, path: &str) -> Result<UnixStream> {
    let mut conn = UnixStream::connect(socket)?;
    conn.set_read_timeout(Some(Duration::from_secs(2)))?;
    write!(
        conn,
        "GET {path} HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n"
    )?;
    Ok(conn)
}

#[test]
fn caddy_and_go_lifecycle() -> Result<()> {
    let Some(caddy) = env::var_os("HARRHY_PRIVATE_HOSTING_TEST_CADDY") else {
        eprintln!("Skipping real Caddy + Go smoke: HARRHY_PRIVATE_HOSTING_TEST_CADDY is not set");
        return Ok(());
    };
    let temp = tempfile::tempdir()?;
    let root = temp.path();
    let demo = root.join("demo");
    ensure!(
        Command::new("go")
            .args(["build", "-o"])
            .arg(&demo)
            .arg("./demo/main.go")
            .status()?
            .success(),
        "Go build failed"
    );
    let first = TcpListener::bind(("127.0.0.1", 0))?;
    let second = TcpListener::bind(("127.0.0.1", 0))?;
    let ingress_dir = root.join("ingress");
    fs::create_dir(&ingress_dir)?;
    let socket = ingress_dir.join("http.sock");
    let runtime = root.join("run");
    let state = root.join("state");
    let config = root.join("config.json");
    fs::write(&config, json!({"caddy":Path::new(&caddy),"ingress":socket,"apps":{
        "atlas":{"host":"atlas.test","port":first.local_addr()?.port(),"argv":[env::current_exe()?,"--exact","atlas_fixture","--ignored"],"cwd":root,"env":{}},
        "go-demo":{"host":"demo.test","port":second.local_addr()?.port(),"argv":[demo],"cwd":root,"env":{}}
    }}).to_string())?;
    drop((first, second));
    let base = || {
        let mut cmd = Command::new(BIN);
        cmd.arg("--runtime").arg(&runtime);
        cmd
    };
    let run = || {
        let mut cmd = base();
        cmd.args(["run", "--state"])
            .arg(&state)
            .arg("--config")
            .arg(&config);
        cmd
    };
    let start = || -> Result<Daemon> { Ok(Daemon(run().stdout(Stdio::null()).spawn()?)) };
    let ctl = |args: &[&str]| -> Result<Value> {
        let out = base().args(args).output()?;
        ensure!(
            out.status.success(),
            "CLI failed: {}",
            String::from_utf8_lossy(&out.stderr)
        );
        Ok(serde_json::from_slice(&out.stdout)?)
    };
    let fetch = |host, code| -> bool {
        let Ok(conn) = request(&socket, host, "/") else {
            return false;
        };
        let mut status = String::new();
        BufReader::new(conn).read_line(&mut status).is_ok()
            && status.split_whitespace().nth(1) == Some(code)
    };
    let daemon = start()?;
    until(|| fetch("atlas.test", "404"))?;
    assert!(
        !run().output()?.status.success(),
        "second writer acquired the database"
    );
    fs::write(root.join("ready"), "")?;
    until(|| fetch("atlas.test", "200"))?;
    assert_eq!(fs::metadata(&socket)?.permissions().mode() & 0o777, 0o660);
    assert!(fetch("unknown.test", "404"));
    assert!(fetch("demo.test", "404"));
    ctl(&["start", "go-demo"])?;
    until(|| fetch("demo.test", "200"))?;
    let mut stream = BufReader::new(request(&socket, "atlas.test", "/stream")?);
    loop {
        let mut line = String::new();
        ensure!(stream.read_line(&mut line)? > 0, "stream did not open");
        if line == "data: opened\n" {
            break;
        }
    }
    let stopped = ctl(&["stop", "atlas"])?;
    let mut remainder = Vec::new();
    stream
        .read_to_end(&mut remainder)
        .context("stream still open after stop")?;
    assert!(
        !remainder.ends_with(b"0\r\n\r\n"),
        "stream was not forcibly closed"
    );
    assert_eq!(stopped["apps"]["atlas"]["running"], false);
    until(|| fetch("atlas.test", "404") && fetch("demo.test", "200"))?;
    assert!(!runtime.join("caddy/autosave.json").exists());
    drop(daemon);
    let _restarted = start()?;
    until(|| fetch("atlas.test", "404") && fetch("demo.test", "404"))?;
    let status = ctl(&["status"])?;
    for name in ["atlas", "go-demo"] {
        assert_eq!(status["apps"][name]["enabled"], false);
        assert_eq!(status["apps"][name]["running"], false);
    }
    Ok(())
}
