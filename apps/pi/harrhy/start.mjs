// v0 has no deployment or production-data entry point.
// Exercise the source host only inside the disposable fixture namespace.
import { sandbox } from "./sandbox.mjs";

sandbox(["src/hosts/server.ts"]);
