import { run } from "remix/component";
const app = run({
  async loadModule() {
    throw new Error("No client component modules are registered");
  },
});
await app.ready();

document.addEventListener("change", (event) => {
  const select = event.target;
  if (
    select instanceof HTMLSelectElement &&
    select.matches("[data-theme-picker]")
  ) {
    select.form?.requestSubmit();
  }
});
