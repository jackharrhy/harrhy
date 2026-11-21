import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { loadWorkspaces, planChecks } from "./affected.mjs";

const selected = JSON.parse(process.env.SELECTED_CHECKS || "[]");
const workspaces = loadWorkspaces();
const timings = [];
const env = { ...process.env };
if (env.GITHUB_ACTIONS === "true") {
  const preload = new URL("./vitest-output.mjs", import.meta.url);
  env.NODE_OPTIONS = [env.NODE_OPTIONS, `--import=${preload.href}`]
    .filter(Boolean)
    .join(" ");
}
for (const { name, script } of planChecks(selected, workspaces)) {
  console.log(
    `\n${script === "check" ? "Checking" : "Building dependency"} ${name}`,
  );
  const start = performance.now();
  const result = spawnSync("pnpm", ["--filter", name, "run", script], {
    stdio: "inherit",
    env,
  });
  const seconds = ((performance.now() - start) / 1000).toFixed(2);
  const passed = result.status === 0;
  timings.push(
    `| ${name} | ${script} | ${passed ? "Passed" : "Failed"} | ${seconds} |`,
  );
  if (!passed) {
    console.error(`${script} failed for ${name}`);
    process.exitCode = result.status || 1;
    break;
  }
}

if (timings.length && process.env.GITHUB_STEP_SUMMARY) {
  try {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Workspace timings

| Workspace | Script | Result | Seconds |
| --- | --- | --- | ---: |
${timings.join("\n")}

`,
    );
  } catch (error) {
    console.warn(`Could not write workspace timings: ${error.message}`);
  }
}
