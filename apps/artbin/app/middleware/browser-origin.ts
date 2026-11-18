import type { Middleware } from "remix/router";

import {
  alternateBrowserOrigin,
  canonicalArtbinUrl,
  requestAuthority,
} from "#lib/oauth.server";

export function browserOriginBoundary(): Middleware {
  return (context, next) => {
    const alternate = alternateBrowserOrigin();
    if (!alternate) return next();

    const { pathname } = context.url;
    const host = requestAuthority(context.request);
    if (host === new URL(canonicalArtbinUrl()).host) return next();

    if (host !== alternate.host) {
      // The background BSP renderer opens the login shell and loads its entry.
      const internal = new URL(
        process.env.ARTBIN_INTERNAL_ORIGIN ??
          `http://127.0.0.1:${process.env.PORT ?? "3000"}`,
      );
      if (
        host === internal.host &&
        context.request.method === "GET" &&
        (pathname === "/login" || pathname.startsWith("/assets/"))
      )
        return next();
      return new Response("Unknown Artbin host", { status: 421 });
    }

    let path: string;
    try {
      path = decodeURIComponent(pathname).toLowerCase();
    } catch {
      return new Response("Invalid path", { status: 400 });
    }
    if (
      /^\/(?:mcp|\.well-known|auth\/(?:cli|support)|api\/(?:cli|assets))(?:\/|$)/.test(
        path,
      )
    ) {
      return new Response("Not Found", { status: 404 });
    }
    return next();
  };
}
