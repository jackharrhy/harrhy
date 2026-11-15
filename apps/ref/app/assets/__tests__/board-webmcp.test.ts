import { describe, expect, it, vi } from "vitest";
import { boardWebMcpTools, copyBoardItem } from "../board-webmcp.ts";

const itemId = "11111111-1111-4111-8111-111111111111";
const operationId = "22222222-2222-4222-8222-222222222222";
function setup() {
  const actions = {
    context: vi.fn(() => ({ boardId: "open-board", selectedItemId: itemId })),
    select: vi.fn(),
    focus: vi.fn(),
    fit: vi.fn(),
    mutate: vi.fn(async () => ({ status: "applied" })),
  };
  const tools = boardWebMcpTools(actions);
  const signal = new AbortController().signal;
  return {
    actions,
    tools,
    run: (name: string, input = {}, invocationSignal = signal) =>
      tools
        .find((tool) => tool.name === name)!
        .execute(input, { signal: invocationSignal }),
  };
}

describe("Ref browser tools", () => {
  it("reads live context and calls semantic camera/selection actions", () => {
    const { actions, run } = setup();
    expect(run("ref_board_context", { offset: 0 })).toEqual({
      boardId: "open-board",
      selectedItemId: itemId,
    });
    run("ref_board_select", { itemId });
    run("ref_board_select", { itemId: null });
    run("ref_board_focus", { itemId });
    run("ref_board_fit");
    expect(actions.select.mock.calls).toEqual([[itemId], [null]]);
    expect(actions.focus).toHaveBeenCalledWith(itemId);
    expect(actions.fit).toHaveBeenCalledOnce();
    expect(actions.context).toHaveBeenCalledWith(0);
    expect(() => run("ref_board_context", { offset: -1 })).toThrow("offset");
  });

  it("validates complete operations and forwards invocation cancellation", async () => {
    const { actions, run } = setup();
    const controller = new AbortController();
    const input = {
      operationId,
      itemId,
      baseRevision: 2,
      x: -3,
      y: 4,
      width: 100,
      height: 80,
      rotation: 90,
      z: 0,
    };
    await expect(
      run("ref_item_transform", input, controller.signal),
    ).resolves.toEqual({ status: "applied" });
    expect(actions.mutate).toHaveBeenCalledWith(
      { ...input, kind: "transform" },
      controller.signal,
    );
    expect(() => run("ref_item_transform", { ...input, width: 0 })).toThrow(
      "Invalid board operation",
    );
    expect(() => run("ref_item_transform", { ...input, x: Infinity })).toThrow(
      "Invalid board operation",
    );
    expect(() =>
      run("ref_item_remove", { operationId, itemId, baseRevision: 0 }),
    ).toThrow("Invalid board operation");
  });

  it("rejects unknown/missing arguments, invalid identity and cancelled calls before actions", () => {
    const { actions, run } = setup();
    expect(() => run("ref_board_fit", { script: "anything" })).toThrow(
      "exactly",
    );
    expect(() => run("ref_board_select")).toThrow("exactly");
    expect(() => run("ref_board_select", { itemId: "missing" })).toThrow(
      "UUID",
    );
    const controller = new AbortController();
    controller.abort();
    expect(() => run("ref_board_fit", {}, controller.signal)).toThrow();
    expect(actions.fit).not.toHaveBeenCalled();
    expect(actions.select).not.toHaveBeenCalled();
  });

  it("marks saved edits consequential and never exposes debug or arbitrary automation", () => {
    const { tools } = setup();
    expect(tools).toHaveLength(6);
    for (const tool of tools) {
      expect(tool.annotations?.debugging).toBe(false);
      expect(tool.annotations?.untrustedContentHint).toBe(true);
      expect(tool.annotations?.consequentialHint).toBe(
        tool.name.startsWith("ref_item_"),
      );
    }
  });

  it("copies nested link metadata instead of exposing mutable board state", () => {
    const item = {
      id: itemId,
      assetId: operationId,
      filename: "image",
      revision: 1,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      z: 0,
      link: {
        url: "https://example.com",
        title: "Original",
        description: "",
        imageUrl: null,
        siteName: "Example",
      },
    };
    const copy = copyBoardItem(item);
    copy.link!.title = "Changed";
    expect(item.link.title).toBe("Original");
  });
});
