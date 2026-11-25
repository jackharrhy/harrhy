import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import type { TestContext } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";

async function request(port: number, path: string, body?: object) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: body ? "POST" : "GET",
    body: body ? JSON.stringify(body) : undefined,
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(1000),
  });
  assert.ok(response.ok, `Toxiproxy ${path}: ${response.status}`);
  await response.text();
}

export async function toxiproxy(
  t: TestContext,
  upstream: string,
  latency: number,
  port = 18473,
) {
  const post = (path: string, body?: object) => request(port, path, body);
  const child = spawn(
    "/bin/toxiproxy-server",
    ["-host", "127.0.0.1", "-port", String(port)],
    { stdio: "ignore" },
  );
  const exit = once(child, "exit");
  t.after(async () => {
    child.kill();
    await exit;
  });
  for (let retry = 0; ; retry++) {
    try {
      await post("/version");
      break;
    } catch (error) {
      if (retry === 50 || child.exitCode !== null) throw error;
      await sleep(20);
    }
  }
  await post("/proxies", {
    name: "marty",
    listen: `127.0.0.1:${port + 1}`,
    upstream: `127.0.0.1:${new URL(upstream).port}`,
  });
  for (const stream of ["upstream", "downstream"]) {
    if (latency)
      await post("/proxies/marty/toxics", {
        name: `delay-${stream}`,
        type: "latency",
        stream,
        attributes: { latency, jitter: 0 },
      });
  }
  return {
    url: `ws://127.0.0.1:${port + 1}/rpc`,
    enabled(enabled: boolean) {
      return post("/proxies/marty", { enabled });
    },
    blackhole() {
      return post("/proxies/marty/toxics", {
        name: "mute-replies",
        type: "timeout",
        stream: "downstream",
        attributes: { timeout: 0 },
      });
    },
  };
}
