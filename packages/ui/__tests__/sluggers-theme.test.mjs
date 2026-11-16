import assert from "node:assert/strict";
import test from "node:test";
import "remix/node-tsx";
const { cleanTheme, sluggersTheme, composeTheme } = await import("../theme.ts");

function luminance(hex) {
  const values = hex.match(/[0-9a-f]{2}/gi).map((part) => {
    const channel = parseInt(part, 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}
function contrast(a, b) {
  const values = [luminance(a), luminance(b)].toSorted((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("Sluggers exports composable semantic token data with readable controls and feedback", () => {
  const snapshot = structuredClone(cleanTheme);
  const themed = composeTheme(sluggersTheme, { space: "14px" });
  assert.equal(themed.space, "14px");
  assert.equal(sluggersTheme.space, "10px");
  assert.deepEqual(cleanTheme, snapshot);
  assert.equal(sluggersTheme.colorScheme, "dark");
  assert.equal(sluggersTheme.tableHeaderTextSize, "12px");
  assert.equal(sluggersTheme.tableCellPadding, "10px 12px");
  for (const [foreground, background] of [
    ["ink", "surface"],
    ["muted", "surface"],
    ["muted", "disabledSurface"],
    ["selectedInk", "selectedSurface"],
    ["onAccent", "accent"],
    ["onDanger", "danger"],
    ["danger", "dangerSurface"],
    ["success", "successSurface"],
  ])
    assert.ok(
      contrast(sluggersTheme[foreground], sluggersTheme[background]) >= 4.5,
      `${foreground}/${background}`,
    );
  assert.ok(contrast(sluggersTheme.controlBorder, sluggersTheme.surface) >= 3);
  assert.ok(contrast(sluggersTheme.focus, sluggersTheme.surface) >= 3);
});
