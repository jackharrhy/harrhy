import { createMcpHandler } from "@modelcontextprotocol/server";
import { readRequestBody } from "@harrhy/request-body";

export { Server, specTypeSchemas } from "@modelcontextprotocol/server";

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
