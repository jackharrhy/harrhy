import {
  createMcpHandler,
  specTypeSchemas,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/server";
import { readRequestBody } from "@harrhy/request-body";
import type {
  StandardJSONSchemaV1,
  StandardSchemaV1,
} from "@standard-schema/spec";

export { Server, specTypeSchemas } from "@modelcontextprotocol/server";
export type {
  CallToolResult,
  Tool,
  ToolAnnotations,
} from "@modelcontextprotocol/server";

/** SDK-owned modern and stateless legacy transport, with bounded HTTP input. */
export function createNativeHandler(
  factory: Parameters<typeof createMcpHandler>[0],
  options: { maxRequestBytes: number; requestTimeoutMs?: number },
) {
  const handler = createMcpHandler(factory, {
    legacy: "stateless",
    maxRequestBodySize: options.maxRequestBytes,
  });
  return {
    async fetch(request: Request): Promise<Response> {
      let parsedBody: unknown;
      if (request.method === "POST") {
        const body = await readRequestBody(request, {
          maxBytes: options.maxRequestBytes,
          timeoutMs: options.requestTimeoutMs ?? 10_000,
        });
        if (!body.ok) {
          return new Response(
            body.error === "too_large"
              ? "Request body too large"
              : "Invalid request body",
            {
              status: body.error === "too_large" ? 413 : 400,
              headers: { "Cache-Control": "no-store" },
            },
          );
        }
        try {
          parsedBody = JSON.parse(new TextDecoder().decode(body.bytes));
        } catch {
          // Let the SDK produce its normal malformed-JSON response.
        }
        if (Array.isArray(parsedBody)) {
          return new Response("Batch requests are not supported", {
            status: 400,
            headers: { "Cache-Control": "no-store" },
          });
        }
        request = new Request(request, {
          method: "POST",
          body: new Uint8Array(body.bytes),
        });
      }
      const response = await handler.fetch(request, { parsedBody });
      response.headers.set("Cache-Control", "no-store");
      return response;
    },
  };
}

export type ToolSchema<Input = unknown, Output = Input> = StandardSchemaV1<
  Input,
  Output
> &
  StandardJSONSchemaV1<Input, Output>;

type OutputSchema = ToolSchema<
  Record<string, unknown>,
  Record<string, unknown>
>;
type ToolResult<Output extends OutputSchema | undefined> =
  Output extends OutputSchema
    ?
        | (CallToolResult & {
            isError?: false;
            structuredContent: StandardSchemaV1.InferInput<Output>;
          })
        | (CallToolResult & { isError: true })
    : CallToolResult;

export interface ToolDefinition<
  Input extends ToolSchema,
  Output extends OutputSchema | undefined = undefined,
> {
  readonly input: Input;
  readonly output: Output;
  readonly descriptor: Tool;
}

/** Declare the same schema used for discovery and typed handler input. */
export function defineTool<
  Input extends ToolSchema,
  Output extends OutputSchema | undefined = undefined,
>(
  definition: Omit<Tool, "inputSchema" | "outputSchema"> & {
    name: Tool["name"];
    input: Input;
    output?: Output;
  },
): ToolDefinition<Input, Output> {
  const { input, output, ...metadata } = definition;
  const { $schema: _inputDialect, ...inputSchema } = input[
    "~standard"
  ].jsonSchema.input({ target: "draft-2020-12" });
  const describedOutput = output?.["~standard"].jsonSchema.output({
    target: "draft-2020-12",
  });
  const outputSchema =
    describedOutput &&
    Object.fromEntries(
      Object.entries(describedOutput).filter(([key]) => key !== "$schema"),
    );
  const descriptor = specTypeSchemas.Tool["~standard"].validate({
    ...metadata,
    inputSchema,
    ...(outputSchema ? { outputSchema } : {}),
  });
  if (descriptor.issues) throw new Error("Invalid MCP tool descriptor");
  return { input, output: output as Output, descriptor: descriptor.value };
}

/** Bind authorized app state in the closure; transport and error policy stay with the app. */
export function bindTool<
  Input extends ToolSchema,
  Output extends OutputSchema | undefined,
>(
  definition: ToolDefinition<Input, Output>,
  handler: (
    input: StandardSchemaV1.InferOutput<Input>,
  ) => ToolResult<Output> | Promise<ToolResult<Output>>,
  options: {
    invalidInput: (issues: readonly StandardSchemaV1.Issue[]) => CallToolResult;
    invalidOutput: (
      issues: readonly StandardSchemaV1.Issue[],
    ) => CallToolResult;
  },
) {
  return async (input: unknown): Promise<CallToolResult> => {
    const parsed = await definition.input["~standard"].validate(input);
    if (parsed.issues) return options.invalidInput(parsed.issues);
    const result = await handler(parsed.value);
    if (!definition.output || result.isError) return result;
    const output = await definition.output["~standard"].validate(
      result.structuredContent,
    );
    if (output.issues) return options.invalidOutput(output.issues);
    return { ...result, structuredContent: output.value };
  };
}
