import { it } from "remix/test";
import * as assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { createApp } from "../app.ts";
import { createOperatorStore } from "../operator/store.ts";
import { openDatabase } from "../app/data/database.ts";
import { centralAuth } from "../app/data/central-auth.ts";
import { parseFixtureSites } from "./sites.ts";

const roleClaims = (roles: string[]) => ({
  "urn:zitadel:iam:org:project:cms-project:roles": Object.fromEntries(
    roles.map((role) => [role, { "cms-org": "fixture" }]),
  ),
});

it("binds one-use owner login to the host/client, preserves local links, and limits operator tickets and MCP", async () => {
  const values = {
    HARRHY_AUTH_ISSUER: "https://issuer.example.test",
    HARRHY_AUTH_PROJECT_ID: "cms-project",
    HARRHY_AUTH_ORGANIZATION_ID: "cms-org",
    HARRHY_AUTH_OWNER_SUBJECT: "reviewed-owner",
    HARRHY_AUTH_OPERATOR_CLIENT_ID: "operator-client",
    HARRHY_AUTH_ANDREW_CLIENT_ID: "andrew-client",
    HARRHY_AUTH_LUKE_CLIENT_ID: "luke-client",
    HARRHY_AUTH_INTROSPECTION_CLIENT_ID: "resource-client",
    HARRHY_AUTH_INTROSPECTION_SECRET: "fixture-secret",
    HARRHY_CMS_MCP_TOKEN: "legacy-must-not-work",
  };
  const previous = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, values);
  const dir = await mkdtemp(join(tmpdir(), "cms-owner-login-"));
  const sites = parseFixtureSites(
    ["andrew", "luke"].map((id) => ({
      id,
      template: id,
      name: id,
      origin: `https://${id}.example.test`,
      aliases: [],
      preview: true,
    })),
    dir,
  );
  const operator = createOperatorStore(":memory:", true);
  operator.sqlite
    .prepare(
      "INSERT INTO users(email,password_hash,auth_subject,auth_issuer) VALUES(?,?,?,?)",
    )
    .run(
      "owner@example.test",
      "unused",
      values.HARRHY_AUTH_OWNER_SUBJECT,
      values.HARRHY_AUTH_ISSUER,
    );
  operator.sqlite
    .prepare(
      "INSERT INTO users(email,password_hash,auth_subject,auth_issuer) VALUES(?,?,?,?)",
    )
    .run("other@example.test", "unused", "other-admin", values.HARRHY_AUTH_ISSUER);
  for (const site of sites) {
    const { sqlite } = await openDatabase(join(site.dataDir, "tea.db"));
    sqlite
      .prepare(
        "INSERT INTO users(email,password_hash,auth_subject,auth_issuer) VALUES(?,?,?,?)",
      )
      .run(
        "owner@example.test",
        "unused",
        "other-admin",
        values.HARRHY_AUTH_ISSUER,
      );
    sqlite.close();
  }
  const app = await createApp(sites, {
    origin: "https://operator.example.test",
    store: operator,
  });
  const pair = await generateKeyPair("RS256");
  const jwk = {
    ...(await exportJWK(pair.publicKey)),
    kid: "fixture-key",
    alg: "RS256",
  };
  const originalFetch = globalThis.fetch;
  const codes = new Map<
    string,
    {
      query: URLSearchParams;
      subject: string;
      roles: string[];
      issuer?: string;
    }
  >();
  let exchanges = 0;
  globalThis.fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = String(input);
    if (url.endsWith("openid-configuration"))
      return Response.json({
        issuer: values.HARRHY_AUTH_ISSUER,
        authorization_endpoint: values.HARRHY_AUTH_ISSUER + "/authorize",
        token_endpoint: values.HARRHY_AUTH_ISSUER + "/token",
        userinfo_endpoint: values.HARRHY_AUTH_ISSUER + "/userinfo",
        jwks_uri: values.HARRHY_AUTH_ISSUER + "/keys",
        introspection_endpoint: values.HARRHY_AUTH_ISSUER + "/introspect",
      });
    if (url.endsWith("/keys")) return Response.json({ keys: [jwk] });
    if (url.endsWith("/token")) {
      exchanges++;
      const form = new URLSearchParams(String(init?.body));
      const code = form.get("code")!;
      const record = codes.get(code);
      codes.delete(code);
      assert.ok(record);
      assert.equal(form.get("redirect_uri"), record.query.get("redirect_uri"));
      assert.equal(form.get("client_id"), record.query.get("client_id"));
      assert.equal(
        createHash("sha256")
          .update(form.get("code_verifier")!)
          .digest("base64url"),
        record.query.get("code_challenge"),
      );
      const idToken = await new SignJWT({
        nonce: record.query.get("nonce"),
        azp: record.query.get("client_id"),
      })
        .setProtectedHeader({ alg: "RS256", kid: "fixture-key" })
        .setIssuer(record.issuer ?? values.HARRHY_AUTH_ISSUER)
        .setSubject(record.subject)
        .setAudience(record.query.get("client_id")!)
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(pair.privateKey);
      return Response.json({
        access_token: JSON.stringify({
          subject: record.subject,
          roles: record.roles,
        }),
        token_type: "Bearer",
        id_token: idToken,
        expires_in: 300,
      });
    }
    if (url.endsWith("/userinfo")) {
      const { subject, roles } = JSON.parse(
        new Headers(init?.headers).get("Authorization")!.slice(7),
      );
      return Response.json({
        sub: subject,
        jack_auth_principal_type: "user",
        jack_auth_username: "fixture",
        name: "Fixture",
        ...roleClaims(roles),
      });
    }
    if (url.endsWith("/introspect")) {
      const token = new URLSearchParams(String(init?.body)).get("token");
      if (token === "legacy-must-not-work")
        return Response.json({ active: false });
      return Response.json({
        active: true,
        token_type: "Bearer",
        iss:
          token === "wrong-issuer"
            ? "https://wrong-issuer.example.test"
            : values.HARRHY_AUTH_ISSUER,
        ...(token === "acted"
          ? { act: { iss: values.HARRHY_AUTH_ISSUER, sub: "other-admin" } }
          : {}),
        sub:
          token === "other-admin"
            ? "other-admin"
            : values.HARRHY_AUTH_OWNER_SUBJECT,
        client_id: "delegated-client",
        jack_auth_principal_type: token === "service" ? "service" : "user",
        aud: [values.HARRHY_AUTH_PROJECT_ID],
        exp: Math.floor(Date.now() / 1000) + 300,
        scope:
          "openid urn:zitadel:iam:org:project:id:cms-project:aud urn:zitadel:iam:org:projects:roles urn:zitadel:iam:org:project:role:admin",
        ...roleClaims(token === "member" ? ["member"] : ["admin"]),
      });
    }
    throw new Error("Unexpected fixture endpoint");
  };
  const get = (url: string, cookie = "") =>
    app.fetch(new Request(url, { headers: { Cookie: cookie } }));
  let next = 0;
  const begin = async (
    host = "operator",
    subject = values.HARRHY_AUTH_OWNER_SUBJECT,
    roles = ["admin"],
    tokenIssuer?: string,
  ) => {
    const start = await get(
      `https://${host}.example.test/${host === "operator" ? "auth" : "tea/auth"}/login`,
    );
    assert.equal(start.status, 303);
    const query = new URL(start.headers.get("location")!).searchParams;
    assert.equal(query.get("code_challenge_method"), "S256");
    const cookie = start.headers.get("set-cookie")!.split(";")[0];
    assert.doesNotMatch(cookie, /verifier|nonce/);
    const code = `code-${next++}`;
    codes.set(code, { query, subject, roles, issuer: tokenIssuer });
    return {
      cookie,
      callback:
        query.get("redirect_uri")! +
        `?code=${code}&state=${query.get("state")}`,
    };
  };
  try {
    const login = await begin();
    const accepted = await get(login.callback, login.cookie);
    assert.equal(accepted.status, 303);
    const sessionCookie = accepted.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith("tea-operator-session="))!
      .split(";")[0];
    assert.equal(
      (await get("https://operator.example.test/", sessionCookie)).status,
      200,
    );
    const count = exchanges;
    assert.equal((await get(login.callback, login.cookie)).status, 400);
    assert.equal(exchanges, count);
    for (const [subject, roles] of [
      ["other-admin", ["admin"]],
      [values.HARRHY_AUTH_OWNER_SUBJECT, ["member"]],
    ] as const) {
      const denied = await begin("operator", subject, [...roles]);
      assert.equal((await get(denied.callback, denied.cookie)).status, 403);
    }
    const wrongIssuer = await begin(
      "operator",
      values.HARRHY_AUTH_OWNER_SUBJECT,
      ["admin"],
      "https://wrong-issuer.example.test",
    );
    assert.equal(
      (await get(wrongIssuer.callback, wrongIssuer.cookie)).status,
      401,
    );
    const unlinked = await begin("andrew");
    assert.equal((await get(unlinked.callback, unlinked.cookie)).status, 403);
    const wrongTenant = await begin("andrew");
    assert.equal(
      (
        await get(
          wrongTenant.callback.replace("andrew.example", "luke.example"),
          wrongTenant.cookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (await get(wrongTenant.callback, wrongTenant.cookie + "tampered")).status,
      400,
    );
    const badState = await begin();
    assert.equal(
      (
        await get(
          badState.callback.replace(/state=[^&]+/, "state=forged"),
          badState.cookie,
        )
      ).status,
      400,
    );
    assert.equal((await get(badState.callback, badState.cookie)).status, 400);
    const ticket = operator.issueTicket(sessionCookie.split("=")[1], "andrew")!;
    assert.equal(operator.redeemTicket("luke", ticket), null);
    const editor = operator.redeemTicket("andrew", ticket)!;
    assert.ok(operator.resolveSiteSession("andrew", editor.id));
    assert.equal(operator.resolveSiteSession("luke", editor.id), null);
    assert.equal(operator.redeemTicket("andrew", ticket), null);
    assert.equal(
      (
        await app.fetch(
          new Request("https://andrew.example.test/tea/logout", {
            method: "POST",
            headers: {
              Cookie: `tea-operator-andrew=${editor.id}`,
              Origin: "https://attacker.example",
            },
          }),
        )
      ).status,
      403,
    );
    for (const [token, expected] of [
      ["owner", 200],
      ["other-admin", 403],
      ["member", 403],
      ["service", 403],
      ["acted", 403],
      ["wrong-issuer", 401],
      [values.HARRHY_CMS_MCP_TOKEN, 401],
    ] as const) {
      const response = await app.fetch(
        new Request("https://andrew.example.test/tea/mcp", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
          },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
        }),
      );
      assert.equal(response.status, expected, await response.text());
    }
    const { sqlite } = await openDatabase(join(sites[0].dataDir, "tea.db"));
    assert.deepEqual(
      sqlite
        .prepare("SELECT auth_subject FROM users")
        .all()
        .map((row) => row.auth_subject),
      ["other-admin"],
    );
    sqlite.close();
    for (const issuer of [null, "https://wrong-issuer.example.test"]) {
      operator.sqlite
        .prepare("UPDATE users SET auth_issuer=? WHERE id=1")
        .run(issuer);
      assert.equal(
        operator.auth.bySubject(values.HARRHY_AUTH_OWNER_SUBJECT),
        null,
      );
      assert.equal(operator.resolveSiteSession("andrew", editor.id), null);
      assert.equal(
        operator.issueTicket(sessionCookie.split("=")[1], "andrew"),
        null,
      );
    }
    operator.sqlite
      .prepare("UPDATE users SET auth_issuer=? WHERE id=1")
      .run(values.HARRHY_AUTH_ISSUER);
    operator.auth.revoke(sessionCookie.split("=")[1]);
    assert.equal(operator.resolveSiteSession("andrew", editor.id), null);
    delete process.env.HARRHY_AUTH_OWNER_SUBJECT;
    assert.throws(
      () => centralAuth("https://operator.example.test", "operator-client"),
      /incomplete/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    app.close();
    await rm(dir, { recursive: true, force: true });
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
