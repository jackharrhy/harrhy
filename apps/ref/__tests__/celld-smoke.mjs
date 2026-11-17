import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { chromium } from "@playwright/test";

const { values } = parseArgs({
  options: {
    output: { type: "string" },
    "keep-state": { type: "boolean", default: false },
  },
});
const root = fileURLToPath(new URL("..", import.meta.url));
const state = await mkdtemp(join(tmpdir(), "tea-ref-celld-smoke-"));
const port = await new Promise((resolve, reject) => {
  const server = createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    server.close(() => resolve(address.port));
  });
});
const origin = `http://127.0.0.1:${port}`;
const authPort = await new Promise((resolve, reject) => {
  const server = createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    server.close(() => resolve(address.port));
  });
});
const authOrigin = `http://127.0.0.1:${authPort}`;
const binary = process.env.CELLD_BIN ?? "celld";
const environment = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("CELLD_")),
  ),
  CELLD_BUCKET: `sqlite://${join(state, "objects.sqlite3")}`,
  CELLD_WATCH: join(state, "replica"),
  CELLD_ADDR: `127.0.0.1:${port}`,
  CELLD_INTERNAL_ADDR: "127.0.0.1:0",
  CELLD_DURABILITY: "bucket",
  CELLD_VAR_AUTH_ISSUER: authOrigin,
  CELLD_VAR_AUTH_CLIENT_ID: "ref-local-browser",
  CELLD_VAR_AUTH_PROJECT_ID: "ref-local-project",
  CELLD_VAR_AUTH_ORGANIZATION_ID: "ref-local-org",
  CELLD_VAR_AUTH_PUBLIC_ORIGIN: origin,
  CELLD_VAR_AUTH_INTROSPECTION_CLIENT_ID: "ref-local-resource",
  CELLD_VAR_AUTH_INTROSPECTION_SECRET: "ref-local-resource-secret",
  CELLD_ESBUILD: join(root, "..", "..", "node_modules", ".bin", "esbuild"),
};
const result = { status: "running", state, checks: [] };
let runtime;
let auth;
let runtimeLogs = "";
let browser;

function command(args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(args[0], args.slice(1), {
      cwd: root,
      env: { ...environment, ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve(output)
        : reject(
            new Error(
              `${args.join(" ")} exited ${code}\n${output.slice(-12000)}`,
            ),
          ),
    );
  });
}

async function start() {
  runtimeLogs = "";
  let startupError;
  runtime = spawn(binary, ["--no-control-plane"], {
    cwd: root,
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  runtime.stdout.on("data", (chunk) => (runtimeLogs += chunk));
  runtime.stderr.on("data", (chunk) => (runtimeLogs += chunk));
  runtime.once("error", (error) => (startupError = error));
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (startupError) throw startupError;
    if (runtime.exitCode !== null || runtime.signalCode !== null)
      throw new Error(
        `Celld exited during startup\n${runtimeLogs.slice(-12000)}`,
      );
    try {
      const response = await fetch(`${origin}/ready`, {
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok) return;
    } catch {}
    await delay(200);
  }
  throw new Error(`Celld did not become ready\n${runtimeLogs.slice(-12000)}`);
}

function applicationEvents() {
  return runtimeLogs.split("\n").flatMap((line) => {
    try {
      const message = line.replace(
        /^.*? INFO cell_console: (?:WARN |ERROR )?/,
        "",
      );
      const event = JSON.parse(message);
      return event?.service === "ref" ? [event] : [];
    } catch {
      return [];
    }
  });
}

async function stop(signal) {
  if (!runtime?.pid || runtime.exitCode !== null || runtime.signalCode !== null)
    return;
  const child = runtime;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  process.kill(-child.pid, signal);
  let timer;
  try {
    await Promise.race([
      exited,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Celld did not exit after ${signal}`)),
          10_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
  runtime = undefined;
}

const tokenFile = join(state, "mcp-token");
const readTokenFile = join(state, "mcp-read-token");
const writeTokenFile = join(state, "mcp-write-token");
const mixedTokenFile = join(state, "mcp-mixed-token");
const mcpResultFile = join(state, "mcp-result.json");
const authConfigFile = join(state, "dev-auth.json");
const mcpEnvironment = {
  REF_SMOKE_URL: origin,
  REF_ACCESS_TOKEN_FILE: tokenFile,
  REF_MCP_RESULT_FILE: mcpResultFile,
  REF_READ_TOKEN_FILE: readTokenFile,
  REF_WRITE_TOKEN_FILE: writeTokenFile,
  REF_MIXED_TOKEN_FILE: mixedTokenFile,
};

try {
  const authConfig = JSON.parse(
    await readFile(join(root, "../../packages/dev-auth/apps.json"), "utf8"),
  );
  authConfig.applications[0].callback = `${origin}/auth/callback`;
  authConfig.applications[0].roles.push("boards-read", "boards-write");
  await writeFile(authConfigFile, JSON.stringify(authConfig), { mode: 0o600 });
  auth = spawn(process.execPath, ["../../packages/dev-auth/server.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      HARRHY_DEV_AUTH_CONFIG: authConfigFile,
      HARRHY_DEV_AUTH_PORT: String(authPort),
      HARRHY_DEV_AUTH_ORIGIN: authOrigin,
      HARRHY_DEV_AUTH_CALLBACK: `${origin}/auth/callback`,
    },
    stdio: "ignore",
  });
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      if ((await fetch(`${authOrigin}/.well-known/openid-configuration`)).ok)
        break;
    } catch {}
    if (attempt === 49) throw new Error("Local Jack Auth did not start");
    await delay(100);
  }
  for (const [file, roles] of [
    [tokenFile, "admin,boards-read,boards-write"],
    [readTokenFile, "admin,boards-read"],
    [writeTokenFile, "admin,boards-write"],
    [mixedTokenFile, "admin,boards-read,archive-read"],
  ]) {
    await command(
      [process.execPath, "../../packages/dev-auth/token.mjs", file],
      {
        HARRHY_DEV_AUTH_ORIGIN: authOrigin,
        HARRHY_DEV_AUTH_CALLBACK: `${origin}/auth/callback`,
        HARRHY_DEV_AUTH_ROLES: roles,
      },
    );
  }
  result.version = (await command([binary, "--version"])).trim();
  await command([
    binary,
    "diagnose",
    "--bucket",
    environment.CELLD_BUCKET,
    "--no-control-plane",
  ]);
  await command([binary, "deploy", ".", "--bucket", environment.CELLD_BUCKET]);
  await start();
  const smoke = await command([process.execPath, "scripts/smoke.mjs"], {
    REF_SMOKE_URL: origin,
  });
  const first = JSON.parse(smoke.trim().split("\n").at(-1));
  assert.equal(first.ok, true);
  result.checks.push(
    "browser smoke: live sync, private media, link preview, cleanup, logout",
  );

  const mcpSmoke = await command(
    [process.execPath, "__tests__/mcp-smoke.mjs"],
    mcpEnvironment,
  );
  const mcp = JSON.parse(mcpSmoke.trim().split("\n").at(-1));
  assert.equal(mcp.ok, true);
  result.checks.push(
    "MCP scoped clients: read/write filtering, denied mutations/reads, private conflicts, mixed-family rejection and media authorization",
  );
  result.mcpClients = mcp.clients;
  result.checks.push(
    "MCP legacy/current clients: upload, shared asset, browser broadcast, revision, dedupe and conflict",
  );

  const toolEvents = applicationEvents().filter(
    (event) => event.kind === "job" && event["mcp.method"] === "tools/call",
  );
  assert.ok(toolEvents.length > 0);
  assert.equal(
    new Set(toolEvents.map((event) => event.job_id)).size,
    toolEvents.length,
  );
  for (const event of toolEvents) {
    assert.match(event.request_id ?? "", /^[a-f0-9-]{36}$/);
    assert.equal(
      applicationEvents().filter(
        (request) =>
          request.kind === "request" &&
          request.request_id === event.request_id &&
          request["http.route"] === "/mcp" &&
          request["http.status"] === 200,
      ).length,
      1,
      "every completed tool job retains its own HTTP preparation correlation",
    );
  }
  assert.ok(
    toolEvents.every((event) => ["ok", "error"].includes(event["mcp.outcome"])),
    "tool outcomes survive awaited Durable Object RPC",
  );
  assert.ok(
    toolEvents.some(
      (event) =>
        event["mcp.outcome"] === "error" &&
        event.outcome !== "ok" &&
        applicationEvents().some(
          (request) =>
            request.kind === "request" &&
            request.request_id === event.request_id &&
            request["http.status"] === 200,
        ),
    ),
    "streamed HTTP 200 business failures stay observable in linked tool completions",
  );
  result.checks.push(
    "MCP tool completion events retain isolated correlation and outcomes across concurrent calls, streamed HTTP responses and awaited Durable Object RPC",
  );

  const boardEvents = applicationEvents().filter(
    (event) =>
      event.kind === "job" && event.operation?.startsWith("ref.board."),
  );
  assert.ok(boardEvents.length > 0);
  for (const event of boardEvents) {
    assert.equal(event["actor.id"], "local-jack");
    assert.match(event.job_id, /^[a-f0-9-]{36}$/);
  }
  const mutationEvents = toolEvents.filter((event) => event["operation.id"]);
  assert.ok(mutationEvents.length > 0);
  for (const event of mutationEvents) {
    const operations = boardEvents.filter(
      (board) => board.job_id === event["operation.id"],
    );
    assert.ok(operations.length > 0);
    assert.ok(
      operations.every((board) => board["actor.id"] === event["actor.id"]),
    );
  }
  assert.ok(
    boardEvents.some(
      (board) =>
        !mutationEvents.some((tool) => tool["operation.id"] === board.job_id),
    ),
    "browser WebSocket operations also carry the freshly authorized subject",
  );
  result.checks.push(
    "WebSocket and MCP board completions retain verified actors and existing operation-ID joins",
  );

  assert.equal(
    runtime.exitCode,
    null,
    "Celld must be alive at the crash boundary",
  );
  await stop("SIGKILL");
  await rm(environment.CELLD_WATCH, { recursive: true, force: true });
  await start();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(origin);
  await page.getByRole("link", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "Continue as local user" }).click();
  await page.getByText("Renamed board").waitFor();
  await page.goto(`${origin}/boards/${first.boardId}`);
  await page.locator("#connection.online").waitFor();
  assert.equal(await page.locator(".link-item").count(), 2);
  result.checks.push(
    "SIGKILL and empty-replica restore: board, links, WebSocket",
  );
  await command([process.execPath, "__tests__/mcp-smoke.mjs"], {
    ...mcpEnvironment,
    REF_MCP_PHASE: "verify",
  });
  result.checks.push(
    "MCP empty-replica persistence and last-use asset cleanup",
  );
  const receiptResponse = await fetch(
    `${origin}/health?sort=newest&code=fixture-private-code`,
    {
      headers: {
        Authorization: "Bearer fixture-private-token",
        Cookie: "ref_session=fixture-private-cookie",
      },
    },
  );
  const requestId = receiptResponse.headers.get("X-Request-Id");
  assert.match(requestId ?? "", /^[a-f0-9-]{36}$/);
  let receipt;
  for (let attempt = 0; attempt < 20; attempt++) {
    const events = applicationEvents().filter(
      (event) => event.request_id === requestId,
    );
    assert.ok(
      events.length <= 1,
      "one canonical completion per Worker request",
    );
    if (events.length) {
      receipt = events[0];
      break;
    }
    await delay(50);
  }
  assert.ok(
    receipt,
    "Celld console envelope must carry one parseable JSON application event",
  );
  assert.equal(receipt["http.query.sort"], "newest");
  assert.equal(receipt["http.status"], 200);
  assert.equal(receipt.outcome, "ok");
  assert.equal(typeof receipt.duration_ms, "number");
  assert.ok(!JSON.stringify(receipt).includes("fixture-private-"));
  result.checks.push(
    "wide-event receipt: qualified Celld console envelope, one JSON completion, support ID, ordinary query and credential omission",
  );
  result.status = "passed";
} catch (error) {
  result.status = "failed";
  result.error = error instanceof Error ? error.stack : String(error);
  result.runtimeLogTail = runtimeLogs.slice(-12000);
  process.exitCode = 1;
} finally {
  await browser?.close();
  auth?.kill();
  await Promise.all(
    [tokenFile, readTokenFile, writeTokenFile, mixedTokenFile].map((file) =>
      rm(file, { force: true }),
    ),
  );
  try {
    await stop("SIGKILL");
  } catch (error) {
    result.status = "failed";
    result.error = `${result.error ?? ""}\nCleanup: ${String(error)}`;
    process.exitCode = 1;
  }
  if (values.output) {
    await mkdir(dirname(values.output), { recursive: true });
    await writeFile(values.output, JSON.stringify(result, null, 2) + "\n");
  }
  if (result.status === "passed" && !values["keep-state"])
    await rm(state, { recursive: true, force: true });
  console.log(JSON.stringify(result));
}
