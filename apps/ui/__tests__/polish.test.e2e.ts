import * as assert from "remix/assert";
import { createTestServer } from "remix/node-fetch-server/test";
import { it } from "remix/test";
import { createApp } from "../app/router.tsx";

it("shares route/tab presentation in one Navigation example without merging semantics", async (t) => {
  const app = createApp();
  t.after(() => app.close());
  const page = await t.serve(await createTestServer(app.fetch));
  await page.goto("/explorer/navigation-menu?theme=tactile");
  await page.waitForFunction(
    () => document.documentElement.dataset.uiReady === "true",
  );
  const preview = page.locator('[data-preview="tabs"]');
  const link = preview.getByRole("link", { name: "Browse", exact: true });
  const tab = preview.getByRole("tab", { name: "Overview", exact: true });
  assert.equal(await link.getAttribute("aria-current"), "page");
  assert.equal(await link.getAttribute("role"), null);
  assert.equal(await tab.getAttribute("aria-selected"), "true");
  assert.deepEqual(
    await link.evaluate((node) => {
      const s = getComputedStyle(node);
      return [s.padding, s.borderBottomColor, s.fontSize];
    }),
    await tab.evaluate((node) => {
      const s = getComputedStyle(node);
      return [s.padding, s.borderBottomColor, s.fontSize];
    }),
  );
  await tab.focus();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  assert.equal(
    await preview
      .getByRole("tab", { name: "Activity", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  assert.match(
    await page.locator("[data-source] pre").innerText(),
    /import \{ NavigationMenu, NavigationMenuLink \}/,
  );
  assert.equal(
    await page
      .getByRole("link", { name: "NavigationMenu", exact: true })
      .count(),
    0,
  );
});

it("gives the table frame sole outer-border ownership and Radio its source-derived table treatment", async (t) => {
  const app = createApp();
  t.after(() => app.close());
  const page = await t.serve(await createTestServer(app.fetch));
  for (const theme of ["clean", "tactile", "brutalist"])
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/explorer/table?theme=${theme}`);
      const table = page.locator('[data-preview="table"] table');
      const borders = await table.evaluate((node) => ({
        frame: getComputedStyle(node.parentElement!).borderBottomWidth,
        rows: [...node.querySelectorAll("tr")].map((row) => [
          getComputedStyle(row).borderTopWidth,
          getComputedStyle(row).borderBottomWidth,
        ]),
        head: getComputedStyle(node.querySelector("thead")!).backgroundImage,
        column: getComputedStyle(node.querySelector("tbody td")!)
          .borderLeftWidth,
      }));
      assert.equal(borders.frame, "1px");
      assert.equal(
        borders.rows.every((row) => row[1] === "0px"),
        true,
      );
      assert.equal(
        borders.rows.slice(1).every((row) => row[0] === "1px"),
        true,
      );
      assert.equal(borders.head !== "none", theme === "tactile");
      assert.equal(borders.column, theme === "tactile" ? "1px" : "0px");
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
    }
});

it("uses the same official-anchor popup gap for Menu and Select, including flipped placement", async (t) => {
  const app = createApp();
  t.after(() => app.close());
  const page = await t.serve(await createTestServer(app.fetch));
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/explorer/menu?theme=tactile");
    await page.waitForFunction(
      () => document.documentElement.dataset.uiReady === "true",
    );
    const preview = page.locator('[data-preview="menu"]');
    for (const kind of ["menu", "select"])
      for (const flipped of [false, true]) {
        const trigger =
          kind === "menu"
            ? preview.getByRole("button", { name: "Actions", exact: true })
            : preview.getByLabel("File order", { exact: true });
        if (flipped)
          await trigger.evaluate((node) => {
            node.style.width = `${node.getBoundingClientRect().width}px`;
            node.style.position = "fixed";
            node.style.bottom = "4px";
            node.style.right = "4px";
          });
        await trigger.click();
        const list = preview.getByRole(kind === "menu" ? "menu" : "listbox");
        await list.waitFor();
        await page.waitForFunction(
          ({ kind: widget, flipped: above }) => {
            const menuList = document.querySelector(
              `[data-preview="menu"] [role="${widget === "menu" ? "menu" : "listbox"}"]`,
            )!;
            const popupSurface = menuList.parentElement!;
            return popupSurface.dataset.anchorPlacement?.startsWith(
              above ? "top" : "bottom",
            );
          },
          { kind, flipped },
        );
        const surface = list.locator("..");
        const popup = (await surface.boundingBox())!;
        const button = (await trigger.boundingBox())!;
        const gap = flipped
          ? button.y - (popup.y + popup.height)
          : popup.y - (button.y + button.height);
        assert.equal(
          Math.abs(gap - 6) < 1,
          true,
          `${kind} ${width}px ${flipped ? "flipped" : "below"}: ${gap}`,
        );
        assert.equal(
          popup.x >= 0 && popup.x + popup.width <= width,
          true,
          `${kind} ${width} flipped=${flipped} ${JSON.stringify(popup)}`,
        );
        await page.keyboard.press("Escape");
        await list.waitFor({ state: "hidden" });
        await page.waitForFunction(
          (id) => document.activeElement?.id === id,
          await trigger.getAttribute("id"),
        );
        if (flipped)
          await trigger.evaluate((node) => {
            node.style.width = "";
            node.style.position = "";
            node.style.bottom = "";
            node.style.right = "";
          });
      }
  }
  assert.deepEqual(errors, []);
});
