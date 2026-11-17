import { currentLog } from "@harrhy/logger";
import { failOperation } from "../logging.ts";
import { specTypeSchemas } from "@harrhy/mcp";
import type { AppRuntimeService } from "../data/runtime.ts";
import { parseOperation } from "../data/protocol.ts";
import { tokenHash } from "../data/crypto.ts";
import { uploadBoardImage, saveBoardLink } from "../data/board-resources.ts";
import { MAX_UPLOAD_BYTES } from "../data/image-upload.ts";
import type { RefMcpAccess } from "./auth.ts";

const uuidSchema = { type: "string", format: "uuid" };
const board = { boardId: uuidSchema };
const geometry = {
  x: { type: "number", minimum: -1_000_000, maximum: 1_000_000 },
  y: { type: "number", minimum: -1_000_000, maximum: 1_000_000 },
  width: { type: "number", minimum: 24, maximum: 20_000 },
  height: { type: "number", minimum: 24, maximum: 20_000 },
  rotation: { type: "number", minimum: -360_000, maximum: 360_000 },
  z: { type: "integer", minimum: -1_000_000, maximum: 1_000_000 },
};
const revision = { type: "integer", minimum: 1 };
function tool(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  readOnlyHint: boolean,
  destructiveHint = false,
  idempotentHint = true,
  openWorldHint = false,
) {
  return {
    name,
    description,
    inputSchema: {
      type: "object",
      properties,
      required: Object.keys(properties),
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint,
      destructiveHint,
      idempotentHint,
      openWorldHint,
    },
  };
}
const catalog = specTypeSchemas.ListToolsResult["~standard"].validate({
  tools: [
    tool(
      "boards_list",
      "List the shared boards visible to all approved Ref members.",
      {},
      true,
    ),
    tool(
      "board_get",
      "Read a shared board and its current items, geometry, revisions and link metadata.",
      board,
      true,
    ),
    tool(
      "asset_get",
      "Inspect an uploaded image asset: content type, size and authenticated media URL; does not return image bytes.",
      { ...board, assetId: uuidSchema },
      true,
    ),
    tool(
      "board_create",
      "Create a shared board. Retrying may create another board.",
      { title: { type: "string", minLength: 1, maxLength: 100 } },
      false,
      false,
      false,
    ),
    tool(
      "board_rename",
      "Rename an existing shared board.",
      { ...board, title: { type: "string", minLength: 1, maxLength: 100 } },
      false,
    ),
    tool(
      "asset_upload",
      "Upload PNG/JPEG/GIF/WebP base64 bytes (at most20MB) to a board; use item_create to place the returned asset. Retrying creates another asset.",
      {
        ...board,
        filename: { type: "string", minLength: 1, maxLength: 160 },
        base64: {
          type: "string",
          minLength: 1,
          maxLength: Math.ceil(MAX_UPLOAD_BYTES / 3) * 4,
        },
      },
      false,
      false,
      false,
    ),
    tool(
      "link_add",
      "Save a public web link and best-effort cached preview; use item_create to place its asset. Existing links return their existing asset.",
      { ...board, url: { type: "string", format: "uri", maxLength: 2048 } },
      false,
      false,
      true,
      true,
    ),
    tool(
      "link_refresh",
      "Replace a saved link preview/metadata from its public source, preserving placed items. May reclaim the previous cached preview.",
      { ...board, url: { type: "string", format: "uri", maxLength: 2048 } },
      false,
      true,
      false,
      true,
    ),
    tool(
      "item_create",
      "Place an existing board asset using caller-generated UUIDs. Retry with the same operationId for deduplication.",
      {
        ...board,
        operationId: uuidSchema,
        itemId: uuidSchema,
        assetId: uuidSchema,
        ...geometry,
      },
      false,
    ),
    tool(
      "item_transform",
      "Update item geometry only if baseRevision is current. Retry the same operationId; inspect conflicts before choosing a new operation.",
      {
        ...board,
        operationId: uuidSchema,
        itemId: uuidSchema,
        baseRevision: revision,
        ...geometry,
      },
      false,
    ),
    tool(
      "item_remove",
      "Remove an item only if baseRevision is current. Removing its last use also reclaims its image or cached link preview. Retry with the same operationId.",
      {
        ...board,
        operationId: uuidSchema,
        itemId: uuidSchema,
        baseRevision: revision,
      },
      false,
      true,
    ),
  ],
});
if (catalog.issues) throw new Error("Invalid Ref MCP catalog");
const refTools = catalog.value.tools;
const readTools = new Set(["boards_list", "board_get", "asset_get"]);
export function toolsFor(access: RefMcpAccess) {
  return refTools.filter((t) =>
    readTools.has(t.name) ? access.canRead : access.canWrite,
  );
}
const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
function string(
  args: Record<string, unknown>,
  key: string,
  max = 4096,
): string {
  const value = args[key];
  if (typeof value !== "string" || !value.length || value.length > max)
    throw new TypeError("Invalid argument");
  return value;
}
function uuid(args: Record<string, unknown>, key: string): string {
  const value = string(args, key, 36);
  if (!uuidPattern.test(value)) throw new TypeError("Invalid UUID");
  return value;
}
export async function callRefTool(
  runtime: AppRuntimeService,
  access: RefMcpAccess,
  name: string,
  input: unknown,
  origin: string,
) {
  const log = currentLog();
  function success(
    value: Record<string, unknown>,
    outcome: "ok" | "error" = "ok",
  ) {
    log?.set({ "mcp.outcome": outcome });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(value) }],
      structuredContent: value,
    };
  }
  function failure(message: string) {
    log?.warn("mcp.rejected").set({ "mcp.outcome": "error" });
    if (log?.outcome !== "error")
      log?.set({ "error.code": "MCP_TOOL_REJECTED", "error.message": message });
    return {
      content: [{ type: "text" as const, text: message }],
      isError: true,
    };
  }

  const definition = toolsFor(access).find((entry) => entry.name === name);
  log?.set({
    "mcp.method": "tools/call",
    "mcp.tool": definition ? name : "unknown",
    "actor.id": access.subject.slice(0, 128),
    operation: definition ? `ref.mcp.${name}` : "ref.mcp.unknown",
  });
  if (!definition) return failure("Unknown or unauthorized Ref tool");
  if (!input || typeof input !== "object" || Array.isArray(input))
    return failure("Tool input is invalid");
  const args = input as Record<string, unknown>;
  if (
    Object.keys(args).some(
      (key) => !Object.hasOwn(definition.inputSchema.properties ?? {}, key),
    ) ||
    definition.inputSchema.required?.some((key) => !Object.hasOwn(args, key))
  )
    return failure("Tool input is invalid");
  try {
    if (name === "boards_list") {
      const boards = await runtime.directory.listBoards();
      log?.set({ "boards.count": boards.length, "mcp.outcome": "ok" });
      return success({ boards });
    }
    if (name === "board_create") {
      const created = await runtime.directory.createBoard(
        string(args, "title", 100),
      );
      if (!created) return failure("Enter a valid board name");
      log?.set({ "resource.boardId": created.id });
      await runtime.board(created.id).initialize(created.id);
      return success({ board: created });
    }
    const boardId = uuid(args, "boardId");
    log?.set({ "resource.boardId": boardId });
    const record = await runtime.directory.board(boardId);
    if (!record) return failure("Board not found");
    const cell = runtime.board(boardId);
    if (name === "board_get")
      return success({ board: record, ...(await cell.snapshot(boardId)) });
    if (name === "asset_get") {
      const assetId = uuid(args, "assetId");
      const asset = await cell.asset(boardId, assetId);
      if (!asset) return failure("Asset not found");
      return success({
        boardId,
        assetId,
        contentType: asset.contentType,
        size: asset.size,
        url: `${origin}/media/${boardId}/${assetId}`,
      });
    }
    if (name === "board_rename") {
      const renamed = await runtime.directory.renameBoard(
        boardId,
        string(args, "title", 100),
      );
      return renamed
        ? success({ board: renamed })
        : failure("Enter a valid board name");
    }
    if (name === "asset_upload") {
      const encoded = string(
        args,
        "base64",
        Math.ceil(MAX_UPLOAD_BYTES / 3) * 4,
      );
      if (encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))
        return failure("Image must be standard base64 bytes");
      const decoded = atob(encoded);
      if (decoded.length > MAX_UPLOAD_BYTES)
        return failure("Image must be 20 MB or less");
      const bytes = Uint8Array.from(decoded, (c) => c.charCodeAt(0));
      const result = await uploadBoardImage(
        runtime,
        boardId,
        new File([bytes], string(args, "filename", 160)),
      );
      return result.ok ? success({ ...result.value }) : failure(result.message);
    }
    if (name === "link_add" || name === "link_refresh") {
      const result = await saveBoardLink(
        runtime,
        boardId,
        string(args, "url", 2048),
        name === "link_refresh",
      );
      if (!result.ok) return failure(result.message);
      return success(
        access.canRead
          ? { ...result.value }
          : {
              assetId: result.value.assetId,
              existingItemId: result.value.existingItemId,
            },
      );
    }
    const operationId = uuid(args, "operationId");
    const itemId = uuid(args, "itemId");
    log?.set({
      "resource.itemId": itemId,
      "operation.id": operationId,
    });
    const operation = parseOperation(
      name === "item_create"
        ? {
            kind: "create",
            operationId,
            item: { ...args, id: itemId, assetId: uuid(args, "assetId") },
          }
        : {
            ...args,
            kind: name === "item_transform" ? "transform" : "remove",
            operationId,
            itemId,
          },
    );
    if (!operation)
      return failure("Invalid board operation geometry or revision");
    const result = await cell.submitOperation(
      boardId,
      await tokenHash(`mcp:${access.subject}`),
      operation,
    );
    if (result.type === "rejected") {
      log?.warn("mcp.operation_rejected").set({
        "mcp.outcome": "error",
        "error.code": "BOARD_OPERATION_REJECTED",
        "error.message": result.reason,
      });
      return {
        ...success(
          {
            applied: false,
            operationId,
            reason: result.reason,
            ...(access.canRead ? { snapshot: result.snapshot } : {}),
          },
          "error",
        ),
        isError: true,
      };
    }
    return success({
      applied: true,
      operationId,
      sequence: result.sequence,
      itemId: result.itemId,
      revision: result.item?.revision ?? null,
      ...(access.canRead ? { item: result.item } : {}),
    });
  } catch (error) {
    if (!(error instanceof TypeError)) failOperation(error);
    return failure(
      error instanceof TypeError
        ? "Tool input is invalid"
        : "Ref operation failed",
    );
  }
}
