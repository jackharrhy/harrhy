import { alternateBrowserOrigin, requestAuthority } from "#lib/oauth.server";

import { routes } from "./routes.ts";

export function bookmarkPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 1024) return null;
  const path = value.split(/[?#]/, 1)[0]!;
  if (!/^\/(folder|file)\/.+/.test(path)) return null;
  try {
    for (const segment of path.slice(1).split("/")) {
      const decoded = decodeURIComponent(segment);
      if (
        !decoded ||
        decoded === "." ||
        decoded === ".." ||
        /[/\\\u0000-\u001f\u007f]/.test(decoded)
      )
        return null;
    }
    const url = new URL(path, "https://artbin.invalid");
    return url.pathname === path ? path : null;
  } catch {
    return null;
  }
}

export function movedNotice(request: Request): boolean {
  const url = new URL(request.url);
  return (
    (url.pathname === "/" ||
      url.pathname === "/login" ||
      url.pathname === "/auth/login" ||
      url.pathname === "/folders" ||
      bookmarkPath(url.pathname) !== null) &&
    url.searchParams.get("moved") === "1" &&
    alternateBrowserOrigin()?.host === requestAuthority(request)
  );
}

export function loginLink(
  href: string,
  returnTo: string | null,
  moved: boolean,
): string {
  const query = new URLSearchParams();
  if (returnTo) query.set("returnTo", returnTo);
  if (moved) query.set("moved", "1");
  return query.size ? `${href}?${query}` : href;
}

export function bookmarkLogin(request: Request): string {
  const destination = request.headers.get("Sec-Fetch-Dest");
  const document =
    request.method === "GET" &&
    (destination === "document" ||
      (!destination && request.headers.get("Accept")?.includes("text/html")));
  return loginLink(
    routes.login.href(),
    document ? bookmarkPath(new URL(request.url).pathname) : null,
    Boolean(document && movedNotice(request)),
  );
}

export function afterLogin(
  request: Request,
  returnTo: unknown,
  moved: unknown,
): string {
  const target = bookmarkPath(returnTo) ?? routes.folders.href();
  return moved === true &&
    alternateBrowserOrigin()?.host === requestAuthority(request)
    ? `${target}?moved=1`
    : target;
}
