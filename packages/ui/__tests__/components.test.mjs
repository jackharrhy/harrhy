import assert from "node:assert/strict";
import test from "node:test";
import "remix/node-tsx";
import { createElement as h } from "remix/component";
import { renderToString } from "remix/component/server";
const { Button, ButtonLink, Field, Input, Textarea, Range } =
  await import("../components.tsx");
const { Dialog, Tabs, TabList, Tab, TabPanel } =
  await import("../interactive.ts");
const { composeTheme, cleanTheme, tactileTheme, brutalistTheme, themeStyles } =
  await import("../theme.ts");

test("native actions keep native form and navigation contracts without a client boundary", async () => {
  const html = await renderToString(
    h(
      "form",
      { action: "/save", method: "post" },
      h(Button, {}, "Cancel"),
      h(
        Button,
        { type: "submit", name: "intent", value: "save", disabled: true },
        "Save",
      ),
      h(ButtonLink, { href: "/boards", "aria-current": "page" }, "Boards"),
    ),
  );
  assert.match(html, /type="button"/);
  assert.match(html, /type="submit"/);
  assert.match(html, /name="intent"/);
  assert.match(html, /value="save"/);
  assert.match(html, /disabled/);
  assert.match(html, /href="\/boards"/);
  assert.match(html, /aria-current="page"/);
  assert.doesNotMatch(html, /rmx:h:|<script/);
});

test("Field wires a single control and merges authored description IDs without duplicates", async () => {
  for (const Control of [Input, Textarea]) {
    const html = await renderToString(
      h(
        Field,
        {
          id: "email",
          label: "Email",
          description: "Used for delivery",
          error: "Enter a valid address",
        },
        h(Control, {
          name: "email",
          required: true,
          "aria-describedby": "policy email-description policy",
          id: "ignored",
        }),
      ),
    );
    assert.match(html, /for="email"/);
    assert.match(html, /id="email"/);
    assert.match(html, /id="email-description"/);
    assert.match(html, /id="email-error"/);
    assert.match(
      html,
      /aria-describedby="policy email-description email-error"/,
    );
    assert.match(html, /aria-invalid="true"/);
    assert.doesNotMatch(html, /id="ignored"/);
    assert.doesNotMatch(html, /role="alert"/);
  }
});

test("Field treats numeric content as present", async () => {
  const html = await renderToString(
    h(
      Field,
      { id: "count", label: "Count", description: 0, error: 0 },
      h(Input, {}),
    ),
  );
  assert.match(html, /aria-describedby="count-description count-error"/);
  assert.match(html, /aria-invalid="true"/);
  assert.match(html, /id="count-error"[^>]*>0<\/p>/);
});

test("standalone controls preserve authored invalid state and native metadata", async () => {
  const html = await renderToString(
    h(Input, {
      id: "password",
      type: "password",
      name: "password",
      autocomplete: "current-password",
      "aria-invalid": true,
      "aria-describedby": "help",
    }),
  );
  assert.match(html, /id="password"/);
  assert.match(html, /autocomplete="current-password"/);
  assert.match(html, /aria-describedby="help"/);
  assert.match(html, /aria-invalid="true"/);
});

test("theme composition is immutable and emits scoped semantic and recipe variables", async () => {
  const theme = composeTheme(tactileTheme, {
    controlHeight: "3rem",
    accent: "#ffffff",
  });
  assert.equal(tactileTheme.controlHeight, cleanTheme.controlHeight);
  assert.equal(theme.controlHeight, "3rem");
  assert.notEqual(theme.panelImage, "none");
  const html = await renderToString(
    h("section", { mix: themeStyles(theme) }, "Scoped"),
  );
  assert.match(html, /--hui-control-height: 3rem/);
  assert.match(html, /--hui-button-image:/);
  assert.match(html, /--hui-font-ui:/);
});

function luminance(hex) {
  const [r, g, b] = hex
    .slice(1)
    .match(/../g)
    .map((part) => {
      const value = Number.parseInt(part, 16) / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

test("Artbin feedback ink preserves readable contrast on its source surfaces", () => {
  for (const [ink, surface] of [
    [brutalistTheme.ink, brutalistTheme.surface],
    [brutalistTheme.muted, brutalistTheme.canvas],
    [brutalistTheme.success, brutalistTheme.successSurface],
    [brutalistTheme.danger, brutalistTheme.dangerSurface],
  ]) {
    assert.ok((luminance(surface) + 0.05) / (luminance(ink) + 0.05) >= 4.5);
  }
});

test("Dialog SSR stays closed with labelled content and no browser access", async () => {
  const html = await renderToString(
    h(Dialog, {
      open: false,
      title: "Remove board?",
      description: "This fixture removes nothing.",
      "aria-describedby": "supplemental-help",
      onClose() {},
      children: h(Button, {}, "Cancel"),
    }),
  );
  assert.match(html, /<dialog[^>]*aria-labelledby="[^"]+"/);
  assert.match(html, /aria-describedby="supplemental-help [^"]+-description"/);
  assert.doesNotMatch(html, /<dialog[^>]*\sopen(?:[\s=>])/);
  assert.match(html, /Remove board\?/);
});

test("official tabs SSR links selected tab and excludes inactive content from interaction", async () => {
  const html = await renderToString(
    h(
      Tabs,
      { defaultActiveTab: "a" },
      h(
        TabList,
        { "aria-label": "Examples" },
        h(Tab, { name: "a" }, "Native"),
        h(Tab, { name: "b" }, "Enhanced"),
      ),
      h(TabPanel, { name: "a" }, "Native form"),
      h(TabPanel, { name: "b" }, "Enhanced form"),
    ),
  );
  assert.match(html, /role="tablist"/);
  assert.match(html, /aria-selected="true"/);
  assert.match(html, /aria-controls="[^"]+"/);
  assert.match(html, /role="tabpanel"/);
  assert.match(html, /hidden/);
  assert.match(html, /inert/);
});

test("Range renders a labelled native slider and preserves form and disabled contracts", async () => {
  const html = await renderToString(
    h(
      "form",
      {},
      h(Range, {
        "aria-label": "Volume",
        name: "volume",
        min: "0",
        max: "1",
        step: "0.01",
        defaultValue: "0.5",
      }),
      h(Range, { "aria-label": "Unavailable", disabled: true }),
    ),
  );
  assert.match(html, /type="range"/);
  assert.match(html, /aria-label="Volume"/);
  assert.match(html, /name="volume"/);
  assert.match(html, /step="0.01"/);
  assert.match(html, /value="0.5"/);
  assert.match(html, /disabled/);
  assert.doesNotMatch(html, /rmx:h:|<script/);
});
