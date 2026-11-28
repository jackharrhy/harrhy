use super::*;
use serde_json::json;

fn registry(root: &Path) -> serde_json::Value {
    json!({"caddy":"/bin/false", "ingress":root.join("ingress.sock"), "apps": {
        "atlas":{"host":"atlas.test", "port":14101, "argv":["/bin/false"], "cwd":root, "env":{}},
        "go-demo":{"host":"go.test", "port":14102, "argv":["/bin/false"], "cwd":root, "env":{}}
    }})
}

#[test]
fn registration_requires_distinct_exact_endpoints() -> Result<()> {
    let temp = tempfile::tempdir()?;
    let path = temp.path().join("registry.json");
    let valid = registry(temp.path());
    fs::write(&path, valid.to_string())?;
    Config::read(&path)?;
    for (key, replacement) in [
        ("port", json!(14101)),
        ("host", json!("atlas.test")),
        ("host", json!("*.test")),
    ] {
        let mut invalid = valid.clone();
        invalid["apps"]["go-demo"][key] = replacement;
        fs::write(&path, invalid.to_string())?;
        assert!(Config::read(&path).is_err());
    }
    Ok(())
}

#[test]
fn sqlite_remembers_atlas_stop_but_not_demo_start() -> Result<()> {
    let temp = tempfile::tempdir()?;
    let root = temp.path();
    let config = || serde_json::from_value(registry(root)).unwrap();
    let supervisor = Supervisor::new(config(), root, root)?;
    assert_eq!(supervisor.wanted()?, ["atlas".to_owned()].into());
    drop(supervisor);
    let db = rusqlite::Connection::open(root.join("hosting.sqlite3"))?;
    db.execute("UPDATE apps SET enabled=(name='go-demo')", [])?;
    drop(db);
    assert!(Supervisor::new(config(), root, root)?.wanted()?.is_empty());
    Ok(())
}

#[test]
fn regenerated_routes_restore_only_slides_forwarded_origin() -> Result<()> {
    let temp = tempfile::tempdir()?;
    let root = temp.path();
    let mut config = registry(root);
    config["apps"]["slides"] = json!({"host":"slides.test", "port":21394});
    let supervisor = Supervisor::new(serde_json::from_value(config)?, root, root)?;
    let config = supervisor.caddy_config(&supervisor.wanted()?);
    let routes = &config["apps"]["http"]["servers"]["private"]["routes"];
    assert!(routes[1]["handle"][0].get("headers").is_none());
    let slides = &routes[2];
    assert_eq!(slides["match"][0]["host"], json!(["slides.test"]));
    assert_eq!(
        slides["handle"][0]["headers"]["request"]["set"],
        json!({
            "X-Forwarded-Proto":["https"], "X-Forwarded-Host":["slides.test"]
        })
    );
    Ok(())
}

#[test]
fn partial_reads_do_not_extend_the_deadline() -> Result<()> {
    use std::{os::unix::net::UnixStream, time::Instant};
    let (input, mut output) = UnixStream::pair()?;
    let writer = std::thread::spawn(move || {
        for byte in b"abcdefghij\n" {
            if output.write_all(&[*byte]).is_err() {
                break;
            }
            sleep(Duration::from_millis(30));
        }
    });
    let start = Instant::now();
    let mut stream = DeadlineStream::accepted(input, Duration::from_millis(100));
    let result = stream.line(128);
    assert!(
        result.is_err(),
        "slow input completed beyond its total budget"
    );
    assert!(start.elapsed() < Duration::from_millis(250));
    drop(stream);
    writer.join().unwrap();
    Ok(())
}

#[test]
fn refuses_unsafe_ingress_and_preserves_live_socket() -> Result<()> {
    use std::os::unix::fs::{PermissionsExt, symlink};
    let temp = tempfile::tempdir()?;
    let ingress = temp.path().join("ingress");
    fs::create_dir(&ingress)?;
    fs::set_permissions(&ingress, fs::Permissions::from_mode(0o775))?;
    assert!(validate_directory(&ingress, false).is_err());
    fs::set_permissions(&ingress, fs::Permissions::from_mode(0o750))?;
    validate_directory(&ingress, false)?;
    let alias = temp.path().join("alias");
    symlink(&ingress, &alias)?;
    assert!(validate_directory(&alias, false).is_err());
    let socket = ingress.join("live.sock");
    let live = UnixListener::bind(&socket)?;
    assert!(remove_stale_socket(&socket).is_err());
    assert!(socket.exists());
    drop(live);
    remove_stale_socket(&socket)?;
    assert!(!socket.exists());
    Ok(())
}

#[test]
fn shutdown_reaps_origins_even_if_socket_cleanup_fails() -> Result<()> {
    let temp = tempfile::tempdir()?;
    let root = temp.path();
    let mut config = registry(root);
    let listener = std::net::TcpListener::bind(("127.0.0.1", 0))?;
    config["apps"]["atlas"]["port"] = json!(listener.local_addr()?.port());
    config["apps"]["atlas"]["argv"] = json!(["/bin/sleep", "60"]);
    drop(listener);
    let mut supervisor = Supervisor::new(serde_json::from_value(config)?, root, root)?;
    supervisor.reconcile()?;
    assert_eq!(
        supervisor.command("status")?["apps"]["atlas"]["running"],
        true
    );
    fs::write(root.join("ingress.sock"), "not a socket")?;
    assert!(supervisor.shutdown().is_err());
    assert_eq!(
        supervisor.command("status")?["apps"]["atlas"]["running"],
        false
    );
    assert_eq!(
        fs::read_to_string(root.join("ingress.sock"))?,
        "not a socket"
    );
    Ok(())
}
