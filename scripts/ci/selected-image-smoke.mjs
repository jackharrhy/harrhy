import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const [app, image] = process.argv.slice(2);
const configs = {
  ref: {
    port: 8080,
    paths: [
      ["/health", 200],
      ["/ready", 200],
      ["/mcp", 401],
    ],
  },
  radio: { port: 44100, paths: [["/", 200]] },
  worldview: {
    port: 8790,
    paths: [
      ["/", 200],
      ["/viewer", 200],
      ["/editor", 200],
    ],
  },
  "maps-collaboration": { port: 44100, paths: [["/health", 200]] },
  burger: {
    port: 5000,
    paths: [
      ["/api/atlas", 200],
      ["/", 200],
    ],
    bun: true,
  },
  gurgur: {
    port: 3000,
    paths: [
      ["/readyz", 200],
      ["/", 200],
    ],
    bun: true,
  },
  pool: { port: 3188, paths: [["/api/health", 200]], bun: true },
};
const config = configs[app];
assert.ok(
  config && image,
  "Usage: node scripts/ci/selected-image-smoke.mjs APP IMAGE",
);
const docker = (...args) =>
  execFileSync("docker", args, { encoding: "utf8", timeout: 180_000 });
const variables = {
  AUTH_ISSUER: "https://auth.example.test",
  AUTH_CLIENT_ID: "image-smoke",
  AUTH_PROJECT_ID: "image-smoke-project",
  AUTH_ORGANIZATION_ID: "image-smoke-org",
  AUTH_PUBLIC_ORIGIN: "https://image-smoke.example.test",
  RADIO_SESSION_SECRET: "disposable-image-smoke-session-secret",
  HARRHY_MAPS_REALTIME_TICKET_SECRET: "disposable-image-smoke-ticket-secret",
};
const environment = Object.entries(variables).flatMap(([key, value]) => [
  "-e",
  `${config.bun ? "" : "CELLD_VAR_"}${key}=${value}`,
]);
const id = docker(
  "run",
  "-d",
  "--network",
  "none",
  ...environment,
  image,
).trim();
try {
  const script = `
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const origin = 'http://127.0.0.1:${config.port}';
const restarted = false;
for (const [path, status] of ${JSON.stringify(config.paths)}) {
  let response;
  for (let attempt = 0; attempt < 180; attempt++) {
    try { response = await fetch(origin + path); break; }
    catch(error) { if(attempt === 179) throw error; await new Promise(resolve => setTimeout(resolve, 500)); }
  }
  assert.equal(response.status, status, path + ': ' + await response.text());
  console.log(path + ' ' + status);
}
assert.notEqual(process.getuid(), 0);
const root = ${JSON.stringify(config.bun ? "/app/dist/client" : `/app/apps/${app}/dist/client`)};
let count = 0;
async function assets(directory, prefix = '') {
  for(const entry of readdirSync(directory, {withFileTypes:true})) {
    if(entry.name.startsWith('.')) continue;
    const path = prefix + '/' + entry.name;
    if(entry.isDirectory()) { await assets(directory + '/' + entry.name, path); continue; }
    if(!/\\.(js|css|woff2?|wasm|svg|png|ico)$/.test(entry.name)) continue;
    const response = await fetch(origin + path);
    assert.equal(response.status, 200, path);
    const hash = bytes => createHash('sha256').update(bytes).digest('hex');
    assert.equal(hash(Buffer.from(await response.arrayBuffer())), hash(readFileSync(directory + '/' + entry.name)), path);
    count++;
  }
}
if(${JSON.stringify(app !== "maps-collaboration")}) {
  assert.ok(existsSync(root), 'built browser directory must be present');
  await assets(root); assert.ok(count > 0, 'built assets must be present');
}
console.log('exact built asset bodies: ' + count);
${
  config.bun
    ? `
const {Database} = await import('bun:sqlite');
const path='/tmp/image-smoke.sqlite';
const db=new Database(path);
if(!restarted) db.exec("CREATE TABLE smoke(value TEXT); INSERT INTO smoke VALUES ('persisted')");
assert.equal(db.query('SELECT count(*) AS count FROM smoke').get().count,1);db.close();
const reopened=new Database(path);assert.equal(reopened.query('SELECT value FROM smoke').get().value,'persisted');reopened.close();
`
    : `
assert.deepEqual(readdirSync('/app/apps'), [${JSON.stringify(app)}]);
assert.ok(existsSync('/app/tsconfig.base.json'));
const {createRequire}=await import('node:module');
const require=createRequire(import.meta.url);
const esbuild=require('esbuild');assert.equal(esbuild.transformSync('const value: number = 1', {loader:'ts'}).code.includes('const value = 1'), true);
const {DatabaseSync}=await import('node:sqlite');
const db=new DatabaseSync('/tmp/image-smoke.sqlite');
if(!restarted) db.exec("CREATE TABLE smoke(value TEXT); INSERT INTO smoke VALUES ('persisted')");
assert.equal(db.prepare('SELECT count(*) AS count FROM smoke').get().count,1);db.close();
const reopened=new DatabaseSync('/tmp/image-smoke.sqlite');assert.equal(reopened.prepare('SELECT value FROM smoke').get().value,'persisted');reopened.close();
${app === "radio" ? `const azure=await import('@azure/storage-blob');assert.equal(typeof azure.BlobServiceClient,'function');assert.ok(existsSync('wrangler.celld-cutover.jsonc'));` : ""}
`
}
console.log('selected runtime, compiler and SQLite write/reopen passed');
`;
  process.stdout.write(
    docker(
      "exec",
      id,
      ...(config.bun ? ["bun", "-e"] : ["node", "--input-type=module", "-e"]),
      script,
    ),
  );
  docker("stop", "--time", "15", id);
  if (!config.bun) {
    // Startup diagnostics reject offline peers until Celld's 10-second lease expires.
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }
  docker("start", id);
  process.stdout.write(
    docker(
      "exec",
      id,
      ...(config.bun ? ["bun", "-e"] : ["node", "--input-type=module", "-e"]),
      script.replace("const restarted = false;", "const restarted = true;"),
    ),
  );
  console.log(
    `${app}: default CMD, assets, SQLite capability and same-container restart passed`,
  );
} catch (error) {
  process.stderr.write(docker("logs", id));
  throw error;
} finally {
  docker("rm", "-f", "-v", id);
}
