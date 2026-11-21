import { run } from "remix/component";
import { SessionList } from "./sessions.tsx";
run({
  async loadModule(_url, name) {
    if (name !== "SessionList") throw Error("Unknown client entry");
    return SessionList;
  },
});
