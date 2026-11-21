import type { ExportCell } from "./export-cell.ts";

export async function downloadExport(
  service: Pick<DurableObjectStub<ExportCell>, "readPage">,
  subject: string,
  id: string,
): Promise<Response> {
  const first = await service.readPage(subject, id, 1);
  const headers = new Headers({ "Cache-Control": "private, no-store" });
  if (first.state === "missing")
    return new Response("Not found", { status: 404, headers });
  if (first.state !== "ready")
    return new Response("Archive unavailable", { status: 409, headers });
  const { size } = first;
  let sent = 0;
  let next = 1;
  let buffered: typeof first | null = first;
  const stream = new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        const page = buffered ?? (await service.readPage(subject, id, next));
        buffered = null;
        if (
          page.state !== "ready" ||
          page.bytes.byteLength === 0 ||
          sent + page.bytes.byteLength > size
        )
          throw new Error("Archive unavailable or expired");
        controller.enqueue(page.bytes);
        sent += page.bytes.byteLength;
        next = page.next;
        if (sent === size) controller.close();
      },
    },
    { highWaterMark: 0 },
  );
  headers.set("Content-Type", "application/x-tar");
  headers.set("Content-Disposition", 'attachment; filename="ref-archive.tar"');
  headers.set("Content-Length", String(size));
  return new Response(stream, { headers });
}
