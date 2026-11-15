import { DatabaseSync } from "node:sqlite";
import { build } from "esbuild";
import { expect, test } from "vitest";

const bundle = await build({
  entryPoints: [new URL("../directory-cell.ts", import.meta.url).pathname],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  plugins: [
    {
      name: "durable-object-test-host",
      setup(plugin) {
        plugin.onResolve({ filter: /^cloudflare:workers$/ }, () => ({
          path: "host",
          namespace: "test-host",
        }));
        plugin.onLoad({ filter: /.*/, namespace: "test-host" }, () => ({
          contents:
            "export class DurableObject { constructor(ctx,env) { this.ctx=ctx;this.env=env; } }",
        }));
      },
    },
  ],
});
const { DirectoryCell } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);

const hash = async (token) =>
  Buffer.from(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
  ).toString("hex");

test("private preview sessions and WebSocket access require the exact stored subject", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    const directory = new DirectoryCell(
      {
        blockConcurrencyWhile: (callback) => callback(),
        storage: {
          sql: {
            exec(sql, ...parameters) {
              if (sql.includes("CREATE TABLE")) {
                database.exec(sql);
                return { toArray: () => [] };
              }
              const rows = database.prepare(sql).all(...parameters);
              return { toArray: () => rows };
            },
          },
        },
      },
      {},
    );
    const board = directory.createBoard("Synthetic board");
    const expiry = Math.floor(Date.now() / 1000) + 3600;
    const owner = await directory.createCentralSession(
      "immutable-owner",
      expiry,
    );
    const otherMember = await directory.createCentralSession(
      "different-member",
      expiry,
    );
    expect(await directory.session(owner, "immutable-owner")).toBe(true);
    expect(await directory.session(otherMember, "immutable-owner")).toBe(false);
    expect(await directory.session("", "immutable-owner")).toBe(false);
    expect(
      await directory.socketAccess(
        board.id,
        await hash(owner),
        "immutable-owner",
      ),
    ).not.toBeNull();
    expect(
      await directory.socketAccess(
        board.id,
        await hash(otherMember),
        "immutable-owner",
      ),
    ).toBeNull();
    // Unset restriction preserves the shared production membership contract.
    expect(await directory.session(otherMember)).toBe(true);
    expect(
      await directory.socketAccess(board.id, await hash(otherMember)),
    ).not.toBeNull();
    await directory.endSession(owner);
    expect(
      await directory.socketAccess(
        board.id,
        await hash(owner),
        "immutable-owner",
      ),
    ).toBeNull();
  } finally {
    database.close();
  }
});
