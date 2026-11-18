export function movedReturnPath(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  if (value === "/?moved=1") return value;
  if (/^\/boards\/[A-Za-z0-9_-]{1,128}\?moved=1$/.test(value)) return value;
}

export function movedPath(request: Request, onAlternate?: boolean) {
  if (!onAlternate) return;
  const url = new URL(request.url);
  if (url.searchParams.get("moved") === "1")
    return movedReturnPath(`${url.pathname}?moved=1`);
}
