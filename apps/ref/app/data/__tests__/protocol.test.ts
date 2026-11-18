import { describe, expect, it } from "vitest";
import { parseOperation } from "../protocol.ts";

const id = "b9e1d673-9bc8-405f-81b1-78be26d171d2";
const assetId = "b6bca822-74b5-4fc9-b24c-180871c64a5a";
const operationId = "c6750c74-8d6d-4eb0-a455-17e708ed1ba7";

const geometry = {
  x: -100,
  y: 25,
  width: 400,
  height: 200,
  rotation: 15,
  z: 1,
};
const item = { id, assetId, ...geometry };

describe("board operation validation", () => {
  it("accepts a bounded placement without trusting client-supplied metadata", () => {
    expect(
      parseOperation({
        kind: "create",
        operationId,
        item: { ...item, revision: 9, filename: "ignored" },
      }),
    ).toEqual({ kind: "create", operationId, item });
  });
  it.each([
    { kind: "create", operationId, item: { ...item, width: Infinity } },
    {
      kind: "transform",
      operationId,
      itemId: id,
      baseRevision: 0,
      ...geometry,
    },
    { kind: "remove", operationId: "malformed", itemId: id, baseRevision: 1 },
  ])("rejects invalid $kind operations", (operation) => {
    expect(parseOperation(operation)).toBeNull();
  });
});
