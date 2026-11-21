import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { BACKGROUND_CONTEXT } from "@p2/app/v1";
import { LocalInboxAdmin } from "../../integrations/local-inbox/contract.ts";
import { Hosts } from "@p2/app/v1/server";
import { FamiliarStore } from "../../plugins/familiar/contract.ts";
import { Catalog } from "../../plugins/sessions/contract.ts";
import { startServer } from "../../src/hosts/server.ts";
import { APP, clientHost, holdIn, http, localOwner, poll, startFixture } from "./helpers.ts";

const prefix = "/api/local-inbox/v1";
const credential = "a".repeat(64);
const headers = { Authorization: `Bearer ${credential}`, "Content-Type": "application/json" };
const hash = (secret: string) => createHash("sha256").update(secret).digest("hex");

it("does not install inbox routes in base Pi", { timeout: 15_000 }, async () => {
  const fixture = await startFixture();
  try {
    assert.equal((await fixture.http(prefix + "/targets")).status, 404);
  } finally {
    await fixture.close();
  }
});

it(
  "uses native addressed delivery over a dedicated, direct loopback inbox",
  { timeout: 45_000 },
  async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "p2-local-inbox-"));
    const plugin = join(dataDir, "plugins", "local-inbox");
    const other = randomUUID();
    const hidden = randomUUID();
    let server: Awaited<ReturnType<typeof startServer>> | undefined;
    const start = () =>
      startServer({ dataDir, port: 0, fake: true, web: false, allowedHosts: ["tunnel.test"] });
    try {
      await mkdir(join(dataDir, "plugins"));
      await cp(join(APP, "__tests__", "fixtures", "local-inbox-v1"), plugin, { recursive: true });
      const policy = (value: object) =>
        writeFile(join(plugin, "policy.json"), JSON.stringify(value), { mode: 0o600 });
      const rotate = (token: string) =>
        writeFile(join(plugin, "bearer.sha256"), hash(token), { mode: 0o600 });
      await policy({
        revision: "1",
        discover: [other],
        send: { sessions: [other], familiar: true },
        receipts: true,
      });
      server = await start();
      const targets = (extra = {}) =>
        http(server!.port, prefix + "/targets", { headers: { ...headers, ...extra } });
      const send = (event: object) =>
        http(server!.port, prefix + "/events", {
          method: "POST",
          headers,
          body: JSON.stringify(event),
        });
      const receipt = (id: string) => http(server!.port, prefix + "/receipts/" + id, { headers });

      assert.equal((await targets()).status, 404);
      await rotate(credential);
      assert.equal((await http(server.port, prefix + "/targets")).status, 401);
      assert.equal((await targets({ Authorization: "Bearer " + "b".repeat(64) })).status, 401);
      assert.equal((await http(server.port, "/__p2_tui", { headers })).status, 401);
      for (const extra of [
        { Host: "tunnel.test" },
        { Origin: `http://127.0.0.1:${server.port}` },
        { "Sec-Fetch-Mode": "cors" },
        { Cookie: "test=1" },
        { "X-Forwarded-Port": "443" },
        { Via: "1.1 proxy" },
      ])
        assert.equal((await targets(extra)).status, 403, JSON.stringify(extra));

      assert.equal(
        (await send({ eventId: "no-default-yet", text: "Do not create a Familiar" })).status,
        403,
      );
      const familiar = await server.host.root(async (ctx) => {
        const store = await ctx.get(FamiliarStore, {});
        assert.equal(store.session.value, null);
        return store.open(ctx);
      }, BACKGROUND_CONTEXT);
      await server.host.root(async (ctx) => {
        const catalog = await ctx.get(Catalog, {});
        for (const [id, title] of [
          [other, "Other inbox"],
          [hidden, "Hidden"],
        ] as const)
          await catalog.create(
            {
              id,
              title,
              cwd: dataDir,
              model: { provider: "faux", modelId: "faux-1" },
              thinkingLevel: "off",
            },
            ctx,
          );
      }, BACKGROUND_CONTEXT);
      const discovered = await targets();
      assert.equal(discovered.status, 200);
      assert.equal(discovered.headers["cache-control"], "no-store");
      assert.deepEqual(JSON.parse(discovered.body), {
        targets: [{ id: other, title: "Other inbox" }],
      });
      await server.host.root(
        async (ctx) => assert.equal((await ctx.get(Hosts, {})).workers.value[other], undefined),
        BACKGROUND_CONTEXT,
      );
      assert.equal((await receipt("missing")).status, 404);
      assert.equal((await receipt("nested/id")).status, 400);
      assert.equal(
        (await send({ eventId: "peer-override", peer: "other", text: "Denied" })).status,
        400,
      );
      assert.equal(
        (await send({ eventId: "denied", session: familiar.id, text: "No explicit fallback" }))
          .status,
        403,
      );
      assert.equal((await receipt("denied")).status, 404);
      assert.equal((await send({ eventId: "oversize", text: "x".repeat(256 * 1024) })).status, 413);

      const explicit = { eventId: "explicit", session: other, text: "synthetic explicit input" };
      const defaulted = { eventId: "default", text: "synthetic Familiar input" };
      for (const body of [explicit, defaulted]) {
        assert.equal((await send(body)).status, 202);
        assert.equal((await send({ ...body, text: "different" })).status, 409);
        await poll(
          async () => JSON.parse((await receipt(body.eventId)).body).state === "admitted",
          12_000,
        );
      }
      assert.equal((await send({ ...defaulted, session: other })).status, 409);
      const admitted = await receipt(explicit.eventId);
      assert.equal((await send(explicit)).body, admitted.body);
      await rotate("b".repeat(64));
      assert.equal((await receipt(explicit.eventId)).status, 401);
      await rotate(credential);

      await server.close();
      // Keep legacy files and the original client digest, but only the Chord grant may authorize.
      await cp(join(APP, "integrations", "local-inbox"), plugin, { recursive: true });
      server = await start();
      assert.equal((await receipt(explicit.eventId)).status, 404);
      const owner = clientHost(await localOwner(server));
      const admin = await holdIn(owner, LocalInboxAdmin, {}, "owner");
      assert.deepEqual(await admin.status({}, BACKGROUND_CONTEXT), { enabled: false });
      const broad = {
        discover: "all-private",
        send: { sessions: "all-private", familiar: true },
        receipts: true,
      } as const;
      const first = await admin.provision(
        { grant: broad, bearerHash: hash(credential) },
        BACKGROUND_CONTEXT,
      );
      assert(first.enabled);
      assert.deepEqual(first.grant, broad);
      assert.equal((await receipt(explicit.eventId)).body, admitted.body); // GET only: no replay.
      const future = randomUUID();
      await server.host.root(async (ctx) => {
        const catalog = await ctx.get(Catalog, {});
        await catalog.create(
          {
            id: future,
            title: "Created after grant",
            cwd: dataDir,
            model: { provider: "faux", modelId: "faux-1" },
            thinkingLevel: "off",
          },
          ctx,
        );
        await catalog.update({ id: hidden, archived: true }, ctx);
      }, BACKGROUND_CONTEXT);
      const listed = JSON.parse((await targets()).body).targets as { id: string }[];
      assert(listed.some(({ id }) => id === future));
      assert(!listed.some(({ id }) => id === hidden));
      assert.equal(
        (await send({ eventId: "archived", session: hidden, text: "not allowed" })).status,
        403,
      );
      assert.equal(
        (await send({ eventId: "future", session: future, text: "broad scope" })).status,
        202,
      );
      await poll(
        async () => JSON.parse((await receipt("future")).body).state === "admitted",
        12_000,
      );
      const rotated = await admin.rotate({ bearerHash: hash("b".repeat(64)) }, BACKGROUND_CONTEXT);
      assert.deepEqual(rotated, first);
      assert.equal((await receipt(explicit.eventId)).status, 401);
      assert.equal(
        (
          await http(server.port, prefix + "/receipts/explicit", {
            headers: { Authorization: "Bearer " + "b".repeat(64) },
          })
        ).body,
        admitted.body,
      );
      assert.deepEqual(await admin.revoke({}, BACKGROUND_CONTEXT), { enabled: false });
      assert.equal((await receipt(explicit.eventId)).status, 404);
      const enabled = await admin.provision(
        { grant: { receipts: true }, bearerHash: hash(credential) },
        BACKGROUND_CONTEXT,
      );
      assert(enabled.enabled && enabled.revision !== first.revision);
      admin.release();
      await owner.close(BACKGROUND_CONTEXT);

      await server.close();
      server = await start();
      assert.deepEqual(JSON.parse((await targets()).body), { targets: [] });
      assert.equal((await send({ ...explicit, eventId: "new" })).status, 403);
      assert.equal((await receipt(explicit.eventId)).body, admitted.body);
    } finally {
      await server?.close();
      await rm(dataDir, { recursive: true, force: true });
    }
  },
);
