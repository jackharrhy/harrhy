import { parseArgs } from "node:util";
import { createManagementFixture } from "./management-server.mjs";

const { values } = parseArgs({
  options: {
    origin: { type: "string" },
    port: { type: "string", default: "0" },
    minutes: { type: "string", default: "55" },
  },
});
const origin = new URL(values.origin);
const port = Number(values.port);
const minutes = Number(values.minutes);
if (
  origin.protocol !== "https:" ||
  origin.username ||
  origin.password ||
  origin.pathname !== "/" ||
  origin.search ||
  origin.hash ||
  !Number.isInteger(port) ||
  port < 0 ||
  port > 65535 ||
  !Number.isInteger(minutes) ||
  minutes < 1 ||
  minutes > 720
)
  throw new Error(
    "Supply an HTTPS origin, loopback port and duration of 1–720 minutes",
  );

const fixture = await createManagementFixture({
  publicOrigin: origin.origin,
  port,
});
try {
  console.log(
    `Synthetic management preview ready: ${origin.origin} (backend 127.0.0.1:${fixture.listenPort})`,
  );
  await new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      process.off("SIGTERM", finish);
      process.off("SIGINT", finish);
      resolve();
    };
    const timer = setTimeout(finish, minutes * 60 * 1000);
    process.once("SIGTERM", finish);
    process.once("SIGINT", finish);
  });
} finally {
  await fixture.close();
}
