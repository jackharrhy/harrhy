import { run } from "remix/component";
import {
  detectMultipleImportMapSupport,
  importModule,
  preloadShim,
} from "remix/multiple-import-maps-polyfill";
const app = run({
  async loadModule(url, name) {
    const module = await importModule(url);
    const component = module[name];
    if (typeof component !== "function")
      throw new Error(`Unknown component: ${name}`);
    return component;
  },
  async processClientEntryPreloads(preloads) {
    if (await detectMultipleImportMapSupport()) return preloads;
    preloadShim(preloads);
    return [];
  },
});
app.addEventListener("error", (event) =>
  console.error("UI component error", event.error),
);
await app.ready();
document.documentElement.dataset.uiReady = "true";
