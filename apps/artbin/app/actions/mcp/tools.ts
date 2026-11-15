import { createRequestLogger } from "evlog";
import { ZodError } from "zod";

import type { OperationContext } from "../../operations/context.ts";
import { mcpOperations } from "../../operations/catalog.ts";
import { OperationError } from "../../operations/errors.ts";

export async function callArtbinTool(
  user: OperationContext["user"],
  name: string,
  args: unknown,
) {
  const log = createRequestLogger();
  log.set({ mcp: { tool: name, userId: user.id } });
  const operation = mcpOperations.get(name);
  if (!operation) {
    log.set({ mcp: { tool: name, userId: user.id, outcome: "unknown-tool" } });
    log.emit();
    return toolError(`Unknown tool: ${name}`);
  }
  try {
    const value = await operation.execute({ user, channel: "mcp" }, args);
    log.set({ mcp: { tool: name, userId: user.id, outcome: "success" } });
    log.emit();
    return {
      content: [
        { type: "text" as const, text: JSON.stringify(value, null, 2) },
      ],
      structuredContent: value,
    };
  } catch (error) {
    const expected =
      error instanceof OperationError || error instanceof ZodError;
    const message =
      error instanceof OperationError
        ? error.message
        : error instanceof ZodError
          ? "Operation input is invalid"
          : "Tool failed";
    if (expected) {
      log.set({ mcp: { tool: name, userId: user.id, outcome: "rejected" } });
    } else {
      log.error(error instanceof Error ? error : new Error(message), {
        tool: name,
        userId: user.id,
      });
    }
    log.emit();
    return toolError(message);
  }
}

function toolError(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}
