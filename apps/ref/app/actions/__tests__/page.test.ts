import { expect, test } from "vitest";
import { createElement } from "remix/component";
import { renderToString } from "remix/component/server";
import { AuthPage } from "../page.tsx";
test("minimal sign-in retains escaped actionable errors", async () => {
  const html = await renderToString(
    createElement(AuthPage, { error: "Try again <safely>" }),
  );
  expect(html).toContain('role="alert"');
  expect(html).toContain("Try again &lt;safely&gt;");
});
