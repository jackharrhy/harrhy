import { run } from "remix/component";
const app = run({
  async loadModule() {
    throw new Error("No client component modules are registered");
  },
});
await app.ready();
