import * as http from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequestListener } from "remix/node-fetch-server";
import { createApp } from "../app.ts";
import { assets } from "../app/assets.ts";
import { createOperatorStore } from "../operator/store.ts";
import { parseFixtureSites } from "./sites.ts";
import { seedFixture } from "./fixture.ts";

const dir = await mkdtemp(join(tmpdir(), "cms-central-browser-"));
const issuer = "http://127.0.0.1:4354";
const operatorOrigin = "http://operator.localhost:4353";
const subject = "synthetic-reviewed-owner";
const configPath = join(dir, "issuer.json");
await writeFile(
  configPath,
  JSON.stringify({
    applications: [
      {
        clientId: "cms-operator",
        projectId: "cms-project",
        organizationId: "cms-org",
        subject,
        username: "synthetic-owner",
        displayName: "Synthetic Owner",
        callback: `${operatorOrigin}/auth/callback`,
        resourceClientId: "cms-resource",
        resourceSecret: "synthetic-only",
        roles: ["admin"],
      },
    ],
  }),
  { mode: 0o600 },
);
const provider = spawn(
  process.execPath,
  [
    fileURLToPath(
      new URL("../../../packages/dev-auth/server.mjs", import.meta.url),
    ),
  ],
  {
    env: {
      ...process.env,
      HARRHY_DEV_AUTH_CONFIG: configPath,
      HARRHY_DEV_AUTH_PORT: "4354",
      HARRHY_DEV_AUTH_ORIGIN: issuer,
    },
    stdio: "inherit",
  },
);
let ready = false;
for (let attempt = 0; attempt < 100; attempt++) {
  if (
    await fetch(`${issuer}/.well-known/openid-configuration`).then(
      (response) => response.ok,
      () => false,
    )
  ) {
    ready = true;
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 50));
}
if (!ready) {
  provider.kill();
  throw new Error("Synthetic issuer did not start");
}
Object.assign(process.env, {
  HARRHY_AUTH_ISSUER: issuer,
  HARRHY_AUTH_PROJECT_ID: "cms-project",
  HARRHY_AUTH_ORGANIZATION_ID: "cms-org",
  HARRHY_AUTH_OWNER_SUBJECT: subject,
  HARRHY_AUTH_OPERATOR_CLIENT_ID: "cms-operator",
});
const sites = parseFixtureSites(
  ["andrew", "luke"].map((id) => ({
    id,
    template: id,
    name: `Central ${id}`,
    origin: `http://${id}.localhost:4353`,
    aliases: [],
    preview: true,
  })),
  dir,
);
const operator = createOperatorStore(join(dir, "operator/operator.db"), true);
operator.sqlite
  .prepare(
    "INSERT INTO users(email,password_hash,auth_subject,auth_issuer) VALUES(?,?,?,?)",
  )
  .run("synthetic-owner@example.test", "unused", subject, issuer);
const app = await createApp(sites, { origin: operatorOrigin, store: operator });
for (const site of sites) await seedFixture(site);
const server = http.createServer(
  createRequestListener((request) => app.fetch(request)),
);
server.listen(4353, "127.0.0.1");
let closing = false;
function close() {
  if (closing) return;
  closing = true;
  server.close(async () => {
    app.close();
    provider.kill("SIGTERM");
    await assets.close();
    await rm(dir, { recursive: true, force: true });
    process.exit(0);
  });
  server.closeAllConnections();
}
process.on("SIGTERM", close);
process.on("SIGINT", close);
