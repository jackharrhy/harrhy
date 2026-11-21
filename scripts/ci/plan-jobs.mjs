import { appendFileSync } from "node:fs";
import { nodeImageApps } from "./node-image-impact.mjs";

const runtimeApps = [
  "ref",
  "radio",
  "worldview",
  "maps-collaboration",
  "burger",
  "gurgur",
  "pool",
];

function flag(name) {
  const value = process.env[name];
  if (value !== "true" && value !== "false")
    throw new Error(`Invalid ${name} selection: ${value}`);
  return value === "true";
}

const nodeApps = JSON.parse(process.env.NODE_APPS);
if (
  !Array.isArray(nodeApps) ||
  nodeApps.some((app) => !nodeImageApps.includes(app)) ||
  new Set(nodeApps).size !== nodeApps.length
) {
  throw new Error("Invalid Node image selection");
}
const jobs = {
  check: flag("CHECK"),
  "node-images": nodeApps.length > 0,
  "selected-images": flag("RUNTIME_IMAGES"),
  "garden-image": flag("GARDEN"),
  "harry-sluggers-image": flag("HARRY_SLUGGERS"),
};
const outputs = [`jobs=${JSON.stringify(jobs)}`];
if (jobs["node-images"])
  outputs.push(`node_matrix=${JSON.stringify({ app: nodeApps })}`);
if (jobs["selected-images"])
  outputs.push(`runtime_matrix=${JSON.stringify({ app: runtimeApps })}`);

const omittedJobs = Object.keys(jobs).filter((job) => !jobs[job]);
const omittedNodeApps = nodeImageApps.filter((app) => !nodeApps.includes(app));
appendFileSync(
  process.env.GITHUB_STEP_SUMMARY,
  [
    "### CI selection",
    `- Jobs omitted: ${omittedJobs.join(", ") || "none"}`,
    `- Node image apps omitted: ${omittedNodeApps.join(", ") || "none"}`,
    "",
  ].join("\n"),
);
appendFileSync(process.env.GITHUB_OUTPUT, `${outputs.join("\n")}\n`);
