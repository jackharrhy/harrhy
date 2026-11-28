import { on } from "node:events";
import { request, type IncomingMessage, type ServerResponse } from "node:http";
import { finished } from "node:stream/promises";
import { deviceCookie } from "./device-cookie.ts";

export type RenderDiagram = (
  source: string,
) => string | null | Promise<string | null>;
const diagramBytes = 40_000;

async function boundedText(
  message: IncomingMessage,
  limit: number,
  signal: AbortSignal,
) {
  const chunks: Buffer[] = [];
  let bytes = 0;
  // On overflow leave the socket writable for the 413 response.
  for await (const [chunk] of on(message, "data", {
    close: ["end", "close"],
    signal,
  })) {
    bytes += chunk.length;
    if (bytes > limit) return undefined;
    chunks.push(chunk);
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(
    Buffer.concat(chunks),
  );
}

async function checkDiagramOwner(
  port: number,
  host: string,
  cookie: string,
  signal: AbortSignal,
) {
  try {
    const reply = await new Promise<IncomingMessage>((resolve, reject) => {
      const check = request(
        {
          hostname: "127.0.0.1",
          port,
          method: "GET",
          path: "/owner/check",
          headers: {
            host,
            origin: `https://${host}`,
            cookie,
            "x-p2-proxy-secret": "clank-preview",
          },
          agent: false,
          signal,
        },
        resolve,
      );
      check.on("error", reject);
      check.once("close", () => reject(new Error("Owner check closed")));
      check.end();
    });
    try {
      if (reply.statusCode !== 200) return false;
      const text = await boundedText(reply, 1024, signal);
      if (!text) return false;
      const value = JSON.parse(text);
      return value?.owner === true && Object.keys(value).length === 1;
    } finally {
      reply.destroy();
    }
  } catch {
    return false;
  }
}

export function rejectDiagram(res: ServerResponse, status: number) {
  if (!res.destroyed && !res.writableEnded)
    res
      .writeHead(status, { "Cache-Control": "no-store", Connection: "close" })
      .end();
}

export async function serveDiagram(
  req: IncomingMessage,
  res: ServerResponse,
  port: number,
  host: string,
  render: RenderDiagram,
) {
  const { headers } = req;
  if (
    req.headersDistinct.host?.length !== 1 ||
    headers.origin !== `https://${host}` ||
    (headers["sec-fetch-site"] !== undefined &&
      headers["sec-fetch-site"] !== "same-origin")
  )
    return rejectDiagram(res, 403);
  if (
    req.headersDistinct["content-type"]?.length !== 1 ||
    !/^text\/plain(?:\s*;\s*charset=(?:utf-8|"utf-8"))?$/i.test(
      headers["content-type"] ?? "",
    ) ||
    (headers["content-encoding"] !== undefined &&
      headers["content-encoding"] !== "identity")
  )
    return rejectDiagram(res, 415);
  if (Number(headers["content-length"]) > diagramBytes)
    return rejectDiagram(res, 413);
  const cookie = deviceCookie(port, headers.cookie);
  if (!cookie) return rejectDiagram(res, 403);

  const abort = new AbortController();
  res.once("close", () => abort.abort());
  const deadline = setTimeout(() => {
    abort.abort();
    if (res.writableEnded) res.destroy();
    else rejectDiagram(res, 408);
  }, 5_000);
  try {
    let source;
    try {
      source = await boundedText(req, diagramBytes, abort.signal);
    } catch {
      return rejectDiagram(res, 400);
    }
    if (source === undefined) return rejectDiagram(res, 413);
    if (!(await checkDiagramOwner(port, host, cookie, abort.signal)))
      return rejectDiagram(res, 403);
    if (abort.signal.aborted) return;
    const svg = await render(source);
    if (abort.signal.aborted) return;
    res
      .writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      })
      .end(JSON.stringify({ svg }));
    await finished(res, { cleanup: true });
  } finally {
    clearTimeout(deadline);
  }
}
