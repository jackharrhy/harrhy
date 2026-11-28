import { run } from "remix/component";
import { OwnerSessions } from "./shell.tsx";

run({
  async loadModule(_url, name) {
    if (name !== "OwnerSessions") throw Error("Unknown client entry");
    return OwnerSessions;
  },
});
