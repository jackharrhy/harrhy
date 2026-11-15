import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createMediaInventory } from "../src/media-inventory.mjs";
import {
  createJellyfinInventory,
  normalizeJellyfinUsers,
} from "../src/jellyfin-inventory.mjs";

const user = {
  Id: "00000000-0000-4000-8000-000000000001",
  Name: "Synthetic Native",
  Policy: { IsAdministrator: false, IsDisabled: false },
};

test("installed Jellyfin top-level array contract accepts explicit casing but never infers missing policies or partial wrapper results", () => {
  const expected = [
    {
      nativeId: user.Id,
      name: user.Name,
      administrator: false,
      disabled: false,
    },
  ];
  assert.deepEqual(normalizeJellyfinUsers([user]), expected);
  assert.deepEqual(
    normalizeJellyfinUsers([
      {
        id: user.Id,
        name: user.Name,
        policy: { isAdministrator: false, isDisabled: false },
      },
    ]),
    expected,
  );
  for (const value of [
    { Items: [user], TotalRecordCount: 1 },
    [user, { ...user, Id: user.Id.toUpperCase() }],
    [{ ...user, Policy: null }],
    [{ ...user, Policy: {} }],
    [{ ...user, id: user.Id }],
  ])
    assert.throws(() => normalizeJellyfinUsers(value));
});

test("Jellyfin adapter permits only unfiltered GET /Users, keeps credential server-side and requires full-roster permission review", async () => {
  const calls = [];
  const config = {
    baseUrl: "http://127.0.0.1:8096/",
    tokenFile: "/private/synthetic-key",
    fullRosterReviewed: true,
  };
  const transport = {
    readToken: async () => "synthetic-token",
    fetcher: async (url, options) => {
      calls.push({ url: String(url), options });
      return new Response(JSON.stringify([user]), {
        headers: { "content-type": "application/json" },
      });
    },
  };
  const read = createJellyfinInventory(config, transport);
  const result = await read();
  assert.equal(result.accounts.length, 1);
  assert.equal(JSON.stringify(result).includes("synthetic-token"), false);
  assert.equal(calls[0].url, "http://127.0.0.1:8096/Users");
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.redirect, "error");
  assert.equal(
    calls[0].options.headers.Authorization,
    'MediaBrowser Token="synthetic-token"',
  );
  await assert.rejects(
    createJellyfinInventory(
      { ...config, fullRosterReviewed: false },
      transport,
    )(),
  );
  assert.equal(calls.length, 1);
  await assert.rejects(
    createJellyfinInventory(config, {
      ...transport,
      fetcher: async () => new Response("{}", { status: 503 }),
    })(),
  );
});

test("file inventory is bounded, scope-checked, sanitized and reports unavailable instead of an authoritative empty roster", async (t) => {
  const directory = await mkdtemp(`${tmpdir()}/auth-media-`);
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = {
    service: "jellyfin",
    instance: "synthetic",
    name: "Synthetic Jellyfin",
    snapshotFile: `${directory}/snapshot.json`,
  };
  const inventory = createMediaInventory([source]);
  assert.deepEqual(inventory.instances(), [
    { service: source.service, instance: source.instance, name: source.name },
  ]);
  assert.equal(
    (await inventory.read(source.service, source.instance)).state,
    "unavailable",
  );
  const snapshot = {
    service: source.service,
    instance: source.instance,
    state: "available",
    observedAt: new Date().toISOString(),
    accounts: [
      {
        nativeId: "synthetic-id",
        name: "Synthetic Native",
        disabled: false,
        administrator: false,
        token: "must-not-escape",
      },
    ],
  };
  await writeFile(source.snapshotFile, JSON.stringify(snapshot));
  const result = await inventory.read(source.service, source.instance);
  assert.equal(result.state, "available");
  assert.equal(JSON.stringify(result).includes("must-not-escape"), false);
  for (const value of [
    { ...snapshot, instance: "other" },
    { ...snapshot, accounts: [...snapshot.accounts, ...snapshot.accounts] },
    { ...snapshot, accounts: [{ nativeId: "bad" }] },
  ]) {
    await writeFile(source.snapshotFile, JSON.stringify(value));
    const unavailable = await inventory.read(source.service, source.instance);
    assert.equal(unavailable.state, "unavailable");
    assert.deepEqual(unavailable.accounts, []);
  }
  await writeFile(source.snapshotFile, " ".repeat(1024 * 1024 + 1));
  assert.equal(
    (await inventory.read(source.service, source.instance)).state,
    "unavailable",
  );
  await assert.rejects(inventory.read("seerr", source.instance), {
    status: 404,
  });
});
