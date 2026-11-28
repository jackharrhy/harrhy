// A leased process-group leader. The CLI inherits only ACP stdio, not the worker's lease.
import { spawn } from "node:child_process";
import { Socket } from "node:net";
import { isAbsolute } from "node:path";

const [command, ...args] = process.argv.slice(2);
if (process.platform === "win32" || !command || !isAbsolute(command)) process.exit(1);

const stop = () => process.kill(-process.pid, "SIGKILL");
const lease = new Socket({ fd: 3, readable: true, writable: false });
lease.once("end", stop);
lease.once("error", stop);
lease.resume();
process.on("SIGTERM", stop);

// No new process group: if the worker or CLI dies, the guard also kills its ordinary descendants.
const child = spawn(command, args, { stdio: ["inherit", "inherit", "inherit"] });
child.once("exit", stop);
child.once("error", stop);
