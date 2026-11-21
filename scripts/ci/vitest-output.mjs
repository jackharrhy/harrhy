import { realpathSync } from "node:fs";

// pnpm check scripts mix Vitest with other commands, so adding flags to
// `pnpm run check` would pass them to the wrong command in some workspaces.
const [, entry, command, ...args] = process.argv;
if (
  command === "run" &&
  entry &&
  /[/\\]node_modules[/\\]vitest[/\\]vitest\.mjs$/.test(
    realpathSync(entry, { throwIfNoEntry: false }) ?? "",
  ) &&
  !args.some((arg) => /^--(?:reporter|silent)(?:=|$)/.test(arg))
) {
  process.argv.splice(3, 0, "--reporter=minimal", "--silent=passed-only");
}
