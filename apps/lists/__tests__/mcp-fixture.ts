export const mcpHeaders = {
  Accept: "application/json, text/event-stream",
  "MCP-Protocol-Version": "2025-11-25",
};

export async function readMcpResponse(response: Response) {
  const text = await response.text();
  if (!response.headers.get("content-type")?.includes("text/event-stream"))
    return JSON.parse(text);
  const data = text.split("\n").find((line) => line.startsWith("data: "));
  if (!data) throw new Error("Missing MCP response");
  return JSON.parse(data.slice(6));
}
