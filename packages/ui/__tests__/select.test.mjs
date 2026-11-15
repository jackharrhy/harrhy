import assert from "node:assert/strict";
import test from "node:test";
import "remix/node-tsx";
import { createElement as h } from "remix/component";
import { renderToString } from "remix/component/server";
const { Field } = await import("../components.tsx");
const { Select } = await import("../interactive.ts");

const options = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta", disabled: true },
];
test("official Select SSR wires button, field, options and hidden form value", async () => {
  const html = await renderToString(
    h(
      Field,
      { id: "choice", label: "Choice", description: "Help", error: "Invalid" },
      h(Select, {
        options,
        name: "choice",
        defaultValue: "a",
        id: "ignored",
        "aria-describedby": "extra choice-description extra",
      }),
    ),
  );
  assert.doesNotMatch(html, /<select\b|id="ignored"/);
  assert.match(html, /<button[^>]*type="button"/);
  assert.match(html, /id="choice"/);
  assert.match(
    html,
    /aria-describedby="extra choice-description choice-error"/,
  );
  assert.match(html, /aria-invalid="true"/);
  assert.match(html, /aria-haspopup="listbox"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /aria-controls="[^"]+"/);
  assert.match(html, />Alpha<\/span>/);
  assert.match(html, /role="listbox"/);
  assert.match(html, /role="option"/);
  assert.match(html, /aria-disabled="true"/);
  assert.match(html, /popover="manual"/);
  assert.match(
    html,
    /<input[^>]*name="choice"[^>]*type="hidden"[^>]*value="a"/,
  );
});
test("Select disabled and empty defaults preserve upstream hidden-input semantics", async () => {
  const html = await renderToString(
    h(Select, {
      options,
      name: "choice",
      disabled: true,
      "aria-label": "Choice",
    }),
  );
  assert.match(html, /<button[^>]*disabled/);
  assert.match(
    html,
    /<input[^>]*disabled[^>]*name="choice"[^>]*type="hidden"[^>]*value=""/,
  );
  assert.match(html, /Choose an option/);
});
