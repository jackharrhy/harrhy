import { it } from "remix/test";
import * as assert from "remix/assert";
import bcrypt from "bcryptjs";
import { openDatabase } from "../database.ts";
import { createAuthStore } from "../auth.ts";

it("verifies passwords, expires and revokes opaque sessions", async () => {
  const { sqlite } = await openDatabase(":memory:");
  sqlite
    .prepare("INSERT INTO users (email,password_hash) VALUES (?,?)")
    .run("editor@test.local", await bcrypt.hash("correct-test-password", 4));
  const auth = createAuthStore(sqlite);
  assert.equal(await auth.verify("editor@test.local", "wrong"), null);
  const user = await auth.verify("editor@test.local", "correct-test-password");
  assert.ok(user);
  const session = auth.createSession(user!.id);
  assert.equal(auth.resolve(session.id)?.email, "editor@test.local");
  auth.revoke(session.id);
  assert.equal(auth.resolve(session.id), null);
  const expired = auth.createSession(user!.id);
  sqlite
    .prepare("UPDATE sessions SET expires_at=? WHERE id=?")
    .run("2000-01-01", expired.id);
  assert.equal(auth.resolve(expired.id), null);
  sqlite.close();
});

it("reserves login attempts before asynchronous password checks", async () => {
  const { sqlite } = await openDatabase(":memory:");
  try {
    sqlite
      .prepare("INSERT INTO users(email,password_hash) VALUES(?,?)")
      .run("limited@test.local", await bcrypt.hash("test-password", 4));
    const auth = createAuthStore(sqlite);
    const pending = Array.from({ length: 8 }, () =>
      auth.verify("limited@test.local", "wrong"),
    );
    assert.equal(auth.throttled("limited@test.local"), true);
    assert.equal(
      await auth.verify("limited@test.local", "test-password"),
      null,
    );
    assert.deepEqual(await Promise.all(pending), Array(8).fill(null));
  } finally {
    sqlite.close();
  }
});

it("links only the reviewed owner subject and rejects legacy or other linked sessions in central mode", async () => {
  const previous = process.env.TEA_AUTH_OWNER_SUBJECT;
  const previousIssuer = process.env.TEA_AUTH_ISSUER;
  process.env.TEA_AUTH_ISSUER = "https://issuer.example.test";
  process.env.TEA_AUTH_OWNER_SUBJECT = "reviewed-subject";
  const { sqlite } = await openDatabase(":memory:");
  try {
    sqlite
      .prepare(
        "INSERT INTO users(email,password_hash,auth_subject,auth_issuer) VALUES(?,?,?,?)",
      )
      .run(
        "editor@test.local",
        "unused",
        "reviewed-subject",
        process.env.TEA_AUTH_ISSUER,
      );
    sqlite
      .prepare(
        "INSERT INTO users(email,password_hash,auth_subject,auth_issuer) VALUES(?,?,?,?)",
      )
      .run(
        "other@test.local",
        "unused",
        "other-subject",
        process.env.TEA_AUTH_ISSUER,
      );
    const otherSession = createAuthStore(sqlite).createSession(
      2,
      1000,
      "other-subject",
    );
    assert.equal(
      createAuthStore(sqlite, true).bySubject("other-subject"),
      null,
    );
    assert.equal(createAuthStore(sqlite, true).resolve(otherSession.id), null);
    const user = createAuthStore(sqlite, true).bySubject("reviewed-subject");
    assert.ok(user);
    const passwordSession = createAuthStore(sqlite).createSession(user.id);
    const central = createAuthStore(sqlite, true);
    assert.equal(central.resolve(passwordSession.id), null);
    assert.throws(() =>
      central.createSession(user.id, 1000, "another-subject"),
    );
    const session = central.createSession(user.id, 1000, "reviewed-subject");
    assert.equal(central.resolve(session.id)?.id, user.id);
    for (const issuer of [null, "https://other-issuer.example.test"]) {
      sqlite
        .prepare("UPDATE sessions SET auth_issuer=? WHERE id=?")
        .run(issuer, session.id);
      assert.equal(central.resolve(session.id), null);
    }
    sqlite
      .prepare("UPDATE sessions SET auth_issuer=? WHERE id=?")
      .run(process.env.TEA_AUTH_ISSUER!, session.id);
    for (const issuer of [null, "https://other-issuer.example.test"]) {
      sqlite
        .prepare("UPDATE users SET auth_issuer=? WHERE id=?")
        .run(issuer, user.id);
      assert.equal(central.bySubject("reviewed-subject"), null);
      assert.equal(central.resolve(session.id), null);
      assert.throws(() =>
        central.createSession(user.id, 1000, "reviewed-subject"),
      );
    }
    sqlite
      .prepare("UPDATE users SET auth_issuer=? WHERE id=?")
      .run(process.env.TEA_AUTH_ISSUER!, user.id);
    sqlite
      .prepare("UPDATE users SET auth_subject=NULL WHERE id=?")
      .run(user.id);
    assert.equal(central.resolve(session.id), null);
  } finally {
    sqlite.close();
    if (previous === undefined) delete process.env.TEA_AUTH_OWNER_SUBJECT;
    else process.env.TEA_AUTH_OWNER_SUBJECT = previous;
    if (previousIssuer === undefined) delete process.env.TEA_AUTH_ISSUER;
    else process.env.TEA_AUTH_ISSUER = previousIssuer;
  }
});
