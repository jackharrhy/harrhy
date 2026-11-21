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
