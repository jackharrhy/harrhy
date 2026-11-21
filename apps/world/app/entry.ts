import { run } from "remix/component";

run({
  async loadModule(moduleUrl, exportName) {
    if (moduleUrl !== "/assets/world.js" || exportName !== "Canvas") {
      throw Error("Unknown World component");
    }
    return (await import("./canvas")).Canvas;
  },
});
