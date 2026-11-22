use anyhow::{Context, Result, ensure};
use serde_json::{Value, json};
use std::{
    env, fs,
    io::{BufRead, BufReader, Read, Write},
    net::TcpListener,
    os::unix::{
        fs::PermissionsExt,
        net::{UnixListener, UnixStream},
    },
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
    fs::write("pid", std::process::id().to_string())?;
    for conn in listener.incoming() {
        let mut conn = conn?;
        std::thread::spawn(move || -> Result<()> {
            let mut req = String::new();
            let mut reader = BufReader::new(&conn);
            reader.read_line(&mut req)?;
            if req.starts_with("GET /websocket ") {
                // The test uses the fixed RFC 6455 example handshake key.
                let mut header = String::new();
                while reader.read_line(&mut header)? != 0 && header != "\r\n" {
                    header.clear();
                }
                conn.write_all(b"HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=\r\n\r\n")?;
                until(|| Path::new("send-atlas-frame").exists())?;
                conn.write_all(b"\x81\x05alive")?;
            } else if req.starts_with("GET /position ") {
                let mut headers = String::new();
                while let Ok(n) = reader.read_line(&mut headers) {
                    if n == 0 || headers.ends_with("\r\n\r\n") {
                        break;
                    }
                }
                let headers = headers.to_ascii_lowercase();
                let ok = Path::new("position-ready").exists()
                    && headers.contains("host: slides.test")
                    && headers.contains("x-forwarded-host: slides.test")
                    && headers.contains("x-forwarded-proto: https");
                write!(
                    conn,
                    "HTTP/1.1 {}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                    if ok { "200 OK" } else { "503 Unavailable" }
                )?;
            } else if req.starts_with("GET /stream ") {
                conn.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\ndata: opened\n\n")?;
                until(|| Path::new("send-atlas-frame").exists())?;
                conn.write_all(
                    b"data: still here

",
                )?;
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

fn open_events(socket: &Path, host: &str) -> Result<BufReader<UnixStream>> {
    let mut stream = BufReader::new(request(socket, host, "/stream")?);
    loop {
        let mut line = String::new();
        ensure!(
            stream.read_line(&mut line)? > 0,
            "{host} stream did not open"
        );
        if line == "data: opened\n" {
            return Ok(stream);
        }
    }
}

fn open_websocket(socket: &Path) -> Result<BufReader<UnixStream>> {
    let mut conn = UnixStream::connect(socket)?;
    conn.set_read_timeout(Some(Duration::from_secs(2)))?;
    conn.write_all(b"GET /websocket HTTP/1.1\r\nHost: atlas.test\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n")?;
    let mut stream = BufReader::new(conn);
    let mut line = String::new();
    stream.read_line(&mut line)?;
    ensure!(
        line.starts_with("HTTP/1.1 101 "),
        "unexpected WebSocket response: {line}"
    );
    loop {
        line.clear();
        ensure!(
            stream.read_line(&mut line)? > 0,
            "incomplete WebSocket handshake"
        );
        if line == "\r\n" {
            return Ok(stream);
        }
    }
}

#[test]
fn caddy_managed_and_adopted_lifecycles() -> Result<()> {
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
    let web_dir = root.join("world-web");
    let authority_dir = root.join("world-authority");
    let ui_dir = root.join("ui");
    for dir in [&web_dir, &authority_dir, &ui_dir] {
        fs::create_dir(dir)?;
    }
    fs::write(web_dir.join("ready"), "")?;
    let web = TcpListener::bind(("127.0.0.1", 0))?;
    let authority = TcpListener::bind(("127.0.0.1", 0))?;
    let slides_port = TcpListener::bind(("127.0.0.1", 0))?;
    let slides_dir = root.join("slides");
    fs::create_dir(&slides_dir)?;
    fs::write(slides_dir.join("ready"), "")?;
    let ui_socket = ui_dir.join("http.sock");
    let ui = UnixListener::bind(&ui_socket)?;
    std::thread::spawn(move || {
        for conn in ui.incoming().flatten() {
            let mut reader = BufReader::new(conn);
            let mut request = String::new();
            while let Ok(n) = reader.read_line(&mut request) {
                if n == 0 || request.ends_with("\r\n\r\n") {
                    break;
                }
            }
            let code = if request
                .to_ascii_lowercase()
                .contains("\r\nhost: ui.test\r\n")
            {
                "200 OK"
            } else {
                "404 Not Found"
            };
            let _ = write!(
                reader.get_mut(),
                "HTTP/1.1 {code}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
            );
        }
    });
    let fixture = [
        env::current_exe()?.to_string_lossy().into_owned(),
        "--exact".into(),
        "atlas_fixture".into(),
        "--ignored".into(),
    ];
    fs::write(
        &config, json!({"caddy":Path::new(&caddy),"ingress":socket,"apps":{
        "atlas":{"host":"atlas.test","port":first.local_addr()?.port(),"argv":[env::current_exe()?,"--exact","atlas_fixture","--ignored"],"cwd":root,"env":{}},
        "go-demo":{"host":"demo.test","port":second.local_addr()?.port(),"argv":[demo],"cwd":root,"env":{}},
        "world":{"host":"world.test","port":web.local_addr()?.port(),"argv":fixture,"cwd":web_dir,"companion":{
            "port":authority.local_addr()?.port(),"argv":fixture,"cwd":authority_dir}},
        "slides":{"host":"slides.test","port":slides_port.local_addr()?.port(),"argv":fixture,"cwd":slides_dir,"readiness":["/","/position"]},
        "harrhy-ui":{"host":"ui.test","socket":ui_socket}
    }}).to_string())?;
    drop((first, second, web, authority, slides_port));
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
    assert!(fetch("slides.test", "404"));
    fs::write(slides_dir.join("position-ready"), "")?;
    until(|| fetch("slides.test", "200"))?;
    let mut reply = String::new();
    BufReader::new(request(&socket, "slides.test", "/position")?).read_line(&mut reply)?;
    assert!(reply.starts_with("HTTP/1.1 200 "));
    reply.clear();
    BufReader::new(request(&socket, "slides.test", "/_operator/layout")?).read_line(&mut reply)?;
    assert!(reply.starts_with("HTTP/1.1 404 "));
    let slides_pid = fs::read_to_string(slides_dir.join("pid"))?;
    let stopped = ctl(&["stop", "slides"])?;
    assert_eq!(stopped["apps"]["slides"]["adopted"], false);
    assert!(!Path::new("/proc").join(slides_pid).exists());
    assert_eq!(fs::metadata(&socket)?.permissions().mode() & 0o777, 0o660);
    assert!(fetch("unknown.test", "404"));
    assert!(fetch("demo.test", "404"));
    ctl(&["start", "go-demo"])?;
    until(|| fetch("demo.test", "200"))?;
    ctl(&["start", "harrhy-ui"])?;
    until(|| fetch("ui.test", "200"))?;
    ctl(&["stop", "harrhy-ui"])?;
    until(|| fetch("ui.test", "404"))?;
    assert!(
        UnixStream::connect(&ui_socket).is_ok(),
        "adopted origin was closed"
    );
    ctl(&["start", "world"])?;
    until(|| authority_dir.join("pid").is_file() && web_dir.join("pid").is_file())?;
    assert!(fetch("world.test", "404"), "world routed before both ready");
    fs::write(authority_dir.join("ready"), "")?;
    until(|| fetch("world.test", "200"))?;
    let old_web = fs::read_to_string(web_dir.join("pid"))?;
    let authority_pid: i32 = fs::read_to_string(authority_dir.join("pid"))?.parse()?;
    // SAFETY: the fixture reports the PID of the disposable authority.
    assert_eq!(unsafe { libc::kill(authority_pid, libc::SIGKILL) }, 0);
    until(|| fetch("world.test", "404"))?;
    until(|| fetch("world.test", "200"))?;
    let new_web = fs::read_to_string(web_dir.join("pid"))?;
    assert_ne!(old_web, new_web);
    assert!(!Path::new("/proc").join(old_web).exists());
    ctl(&["stop", "world"])?;
    until(|| fetch("world.test", "404"))?;
    assert!(!Path::new("/proc").join(new_web).exists());
    let mut atlas_ws = open_websocket(&socket)?;
    let mut atlas_events = open_events(&socket, "atlas.test")?;
    let mut go_events = open_events(&socket, "demo.test")?;
    let before_stop = Instant::now();
    let stopped = ctl(&["stop", "go-demo"])?;
    assert_eq!(stopped["apps"]["go-demo"]["running"], false);
    assert!(fetch("demo.test", "404"));
    go_events
        .read_to_end(&mut Vec::new())
        .context("Go stream still open after stop")?;
    assert!(before_stop.elapsed() < Duration::from_secs(5));
    // This frame only exists after Go has been withdrawn, so buffered data
    // cannot make a severed Atlas WebSocket appear to have survived the reload.
    fs::write(root.join("send-atlas-frame"), "")?;
    let mut frame = [0; 7];
    atlas_ws
        .read_exact(&mut frame)
        .context("Atlas WebSocket did not survive Go withdrawal")?;
    assert_eq!(&frame, b"\x81\x05alive");
    drop(atlas_ws);
    loop {
        let mut line = String::new();
        ensure!(
            atlas_events.read_line(&mut line)? > 0,
            "Atlas SSE did not survive Go withdrawal"
        );
        if line
            == "data: still here
"
        {
            break;
        }
    }
    ctl(&["start", "go-demo"])?;
    until(|| fetch("demo.test", "200"))?;
    let stopped = ctl(&["stop", "atlas"])?;
    atlas_events
        .read_to_end(&mut Vec::new())
        .context("Atlas stream still open after Atlas stop")?;
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
