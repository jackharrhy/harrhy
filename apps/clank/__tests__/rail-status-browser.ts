import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright";
import type { Fixture } from "../../pi/__tests__/p2/helpers.ts";

const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });

// Read layout from Chromium, not CSS source. Each frame's lit dots, relative
// to that frame, can be compared even with different page animation phases.
function braille(el: Element) {
  const clip = el.getBoundingClientRect();
  const strip = el.firstElementChild!;
  const frames = Array.from(strip.children, (frame) => {
    const box = frame.getBoundingClientRect();
    return Array.from(frame.children, (i) => {
      const dot = i.getBoundingClientRect();
      return [dot.x - box.x, dot.y - box.y, dot.width, dot.height];
    });
  });
  const css = getComputedStyle(strip);
  return {
    size: [clip.width, clip.height],
    overflow: getComputedStyle(el).overflowX,
    frames,
    animation: [
      css.animationDuration,
      css.animationTimingFunction,
      css.animationIterationCount,
    ],
    running: strip.getAnimations().some((a) => a.playState === "running"),
    firstFrameOffset: strip.children[0].getBoundingClientRect().x - clip.x,
  };
}

function steadyDot(el: Element) {
  const box = el.getBoundingClientRect();
  const css = getComputedStyle(el);
  // Resolve theme colors (including oklch) to the same color space.
  const pixel = document.createElement("canvas").getContext("2d")!;
  pixel.fillStyle = css.backgroundColor;
  pixel.fillRect(0, 0, 1, 1);
  const [r, g, b, alpha] = pixel.getImageData(0, 0, 1, 1).data;
  return {
    size: [box.width, box.height],
    round:
      css.borderRadius === "50%" ||
      parseFloat(css.borderRadius) >= box.width / 2,
    opaque: alpha === 255 && css.opacity === "1",
    hue: b > r && b > g ? "blue" : r > b && r > g ? "red" : "other",
    animations: el.getAnimations({ subtree: true }).length,
  };
}

export type StatusFixture = {
  fixture: Fixture;
  piRoot: URL;
  id: string;
  main: number;
};

/** The non-Familiar session in proveRailArchive already has one answered child.
 * Only reader navigates to it; neither the Clank witness nor native Pi does. */
export async function proveRailStatus(
  actor: Page,
  reader: Page,
  pi: Page,
  title: string,
  { fixture, piRoot, id, main }: StatusFixture,
) {
  const { holdIn, TEST, until } = (await import(
    new URL("__tests__/p2/helpers.ts", piRoot).href
  )) as typeof import("../../pi/__tests__/p2/helpers.ts");
  const { Chat } = (await import(
    new URL("plugins/chat/contract.ts", piRoot).href
  )) as typeof import("../../pi/plugins/chat/contract.ts");
  const { SessionReads } = (await import(
    new URL("plugins/search/contract.ts", piRoot).href
  )) as typeof import("../../pi/plugins/search/contract.ts");
  const owner = fixture.browser();
  const chat = await holdIn(
    owner,
    Chat,
    { session: id, conversation: main },
    "participant",
  );
  const reads = await holdIn(owner, SessionReads, {}, "owner");
  const send = (text: string) =>
    chat.send({ text, requestId: crypto.randomUUID() }, TEST);
  const answerAfter = async (last: number) =>
    (await until(reads.answers, (a) => (a[id] ?? 0) > last, 15000))[id];
  const open = button(actor, title);
  const native = pi.getByRole("link", { name: title, exact: true });
  const clankRow = open.locator("..");
  const piRow = native.locator("..");
  const slot = open.locator(".rail-marker");
  const piSlot = piRow.locator(".nav-marker");
  const dir = process.env.HARRHY_CLANK_STATUS_SCREENSHOT_DIR;
  async function shot(state: string) {
    if (dir)
      await Promise.all([
        clankRow.screenshot({
          path: join(dir, `clank-rail-status-${state}.png`),
          timeout: 3000,
        }),
        piRow.screenshot({
          path: join(dir, `p2-rail-status-${state}.png`),
          timeout: 3000,
        }),
      ]);
  }
  async function labelOffsets() {
    return Promise.all(
      [open.locator(".rail-label"), native.locator(".session-title")].map(
        (label) =>
          label.evaluate(
            (el) =>
              el.getBoundingClientRect().x -
              el.closest("button,a")!.parentElement!.getBoundingClientRect().x,
          ),
      ),
    );
  }
  const archive = button(actor, `Archive ${title}`);
  async function dot(state: "unread" | "failed") {
    await slot.locator(`[data-rail-mark=${state}]`).waitFor();
    const nativeDot = piSlot.locator(`.${state}-dot`);
    await nativeDot.waitFor();
    const expected = await nativeDot.evaluate(steadyDot);
    assert.deepEqual(expected, {
      size: [8, 8],
      round: true,
      opaque: true,
      hue: state === "failed" ? "red" : "blue",
      animations: 0,
    });
    assert.deepEqual(
      await slot.locator(":scope > :only-child").evaluate(steadyDot),
      expected,
    );
    assert.deepEqual(await labelOffsets(), idleOffsets);
  }
  // The child report itself prompts another main answer. Wait for the reader
  // to acknowledge that answer, not the earlier spawn/tool message.
  const report = await until(
    chat.view,
    (v) => !!v?.entries.some((entry) => entry.kind === "p2.agent-message"),
  );
  const reportId = report!.entries.find(
    (entry) => entry.kind === "p2.agent-message",
  )!.id;
  const baseline = await answerAfter(reportId);
  await until(reads.reads, (r) => (r[id] ?? 0) >= baseline);
  await archive.waitFor({ state: "attached" });
  await Promise.all(
    [slot, piSlot].map((s) =>
      s.locator(":scope > *").waitFor({ state: "detached" }),
    ),
  );
  const idleOffsets = await labelOffsets();
  await shot("idle");
  const desktop = reader.viewportSize()!;
  await reader.setViewportSize({ width: 375, height: 667 });
  await button(reader, "Show sessions").click();
  await reader.getByLabel("Session detail").waitFor({ state: "hidden" });
  await reader
    .getByRole("button", { name: title, pressed: true, exact: true })
    .waitFor();
  const before = reads.reads.value[id];
  // Pi indexes the fake model's “Running bash.” preamble as an answer even
  // while bash is still running. Hold the tool in the disposable workspace
  // until we've inspected both precedence states in the real browsers.
  const gate = "release-rail-status";
  await send(
    `bash ${JSON.stringify({ command: `until test -f ${gate}; do sleep 0.1; done`, timeout: 90 })}`,
  );
  const preamble = await answerAfter(before);
  await piRow.locator(".background-work .pi-dots").waitFor();
  await clankRow.locator(".rail-details [data-rail-mark=working]").waitFor();
  await archive.waitFor({ state: "detached" });
  await dot("unread");
  assert.equal(
    reads.reads.value[id],
    before,
    "rail-only mobile must not read the main",
  );
  await button(reader, title).click();
  await until(reads.reads, (r) => (r[id] ?? 0) >= preamble);
  await Promise.all(
    [actor, pi].map((p) => p.emulateMedia({ reducedMotion: "no-preference" })),
  );
  const marks = [
    slot.locator("[data-rail-mark=working]"),
    piSlot.locator(".pi-dots"),
  ];
  await Promise.all(marks.map((m) => m.waitFor()));
  const [clank, p2] = await Promise.all(marks.map((m) => m.evaluate(braille)));
  assert.equal(p2.frames.length, 10);
  assert.deepEqual(p2.size, [16, 16]);
  assert(p2.running && clank.running);
  assert.deepEqual(clank.animation, p2.animation);
  assert.deepEqual(clank.frames, p2.frames);
  assert.deepEqual(clank.size, p2.size);
  assert.equal(clank.overflow, p2.overflow);
  // Sample adjacent frames deterministically; Chromium may throttle background tabs.
  for (const mark of marks) {
    const distance = await mark.evaluate(async (node) => {
      const strip = node.firstElementChild!;
      const [animation] = strip.getAnimations();
      animation.pause();
      await animation.ready;
      const timing = animation.effect!.getTiming();
      // Start inside cycle two, even with a negative phase delay.
      const start = Number(timing.duration) + Number(timing.delay) + 10;
      animation.currentTime = start;
      const x = strip.getBoundingClientRect().x;
      animation.currentTime = start + 160;
      const distance = x - strip.getBoundingClientRect().x;
      animation.play();
      return distance;
    });
    assert.equal(distance, 16);
  }
  assert.deepEqual(await labelOffsets(), idleOffsets);
  await Promise.all(
    [actor, pi].map((p) => p.emulateMedia({ reducedMotion: "reduce" })),
  );
  for (const mark of marks) {
    const still = await mark.evaluate(braille);
    assert.deepEqual([still.running, still.firstFrameOffset], [false, 0]);
  }
  await shot("working-reduced");
  await button(reader, "Show sessions").click();
  await reader.getByLabel("Session detail").waitFor({ state: "hidden" });
  await writeFile(join(fixture.workspace, gate), "");
  await archive.waitFor({ state: "attached", timeout: 15000 });
  const answer = await answerAfter(preamble);
  await dot("unread");
  await shot("unread");
  assert.equal(
    reads.reads.value[id],
    preamble,
    "rail-only mobile must not read the main",
  );

  // Enter the child directly from the rail (never pass through visible main).
  const toggle = button(reader, `Subagents for ${title}`);
  await toggle.click();
  await reader
    .locator(`[id="agents-${id}"]`)
    .getByRole("button", { name: "helper", exact: true })
    .click();
  await reader
    .getByLabel("Transcript")
    .getByText("hello helper", { exact: true })
    .waitFor();
  await reader.setViewportSize(desktop);
  // fake.ts parses `read <JSON>` when making its response. Invalid fixture
  // JSON fails the model stream (no tool executes), on top of real unread.
  await send("read {");
  await dot("failed");
  await shot("failed");
  assert.equal(
    reads.reads.value[id],
    preamble,
    "reading a child must not read its main",
  );
  const atFailure = reads.answers.value[id];
  assert.equal(atFailure, answer);
  await send("Recovered fixture answer");
  const recovered = await answerAfter(atFailure);
  await dot("unread");
  assert.equal(
    reads.reads.value[id],
    preamble,
    "a new main answer remains unread on the child",
  );
  await button(reader, title).click();
  await reader
    .getByLabel("Transcript")
    .getByText("Echo: Recovered fixture answer", { exact: true })
    .waitFor();
  await until(reads.reads, (r) => (r[id] ?? 0) >= recovered);
  for (const s of [slot, piSlot])
    await s.locator(":scope > *").waitFor({ state: "detached" });
  assert.deepEqual(await labelOffsets(), idleOffsets);
  await shot("read");
  await toggle.click(); // restore the archive proof's collapsed disclosure
  await Promise.all(
    [actor, pi].map((p) => p.emulateMedia({ reducedMotion: null })),
  );
  await owner.close(TEST);
}
