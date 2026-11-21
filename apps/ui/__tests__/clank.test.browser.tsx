import * as assert from "remix/assert";
import { render } from "remix/component/test";
import { it } from "remix/test";
import { Words, Settled } from "../app/public/clank/markdown.tsx";

it("does not promote agent HTML, image URLs or links into active elements", async (t) => {
  const source =
    "plain <button>Not a control</button> ![remote](/unused.png) [link](/unused)";
  for (const Component of [Words, Settled]) {
    const { $, act, cleanup } = render(
      <Component source={source} active={true} />,
    );
    t.after(cleanup);
    await act(() => {});
    assert.ok($("div")?.textContent?.includes("plain"));
    assert.equal($("button,img,a,iframe,svg,script"), null);
  }
});
