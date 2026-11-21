import { logRequest, failOperation } from "./app/logging.ts";
import { BoardCell } from "./app/data/board-cell.ts";
import { DirectoryCell } from "./app/data/directory-cell.ts";
import { ExportCell } from "./app/data/export-cell.ts";
import { createRuntime } from "./app/data/runtime.ts";
import { readSessionCookie } from "./app/middleware/session.ts";
import { createAppRouter } from "./app/router.ts";
import { authorizeArchive } from "./app/middleware/archive-auth.ts";
import {
  authorizeRefMcp,
  archiveMcpMetadataPath,
  archiveMcpMetadata,
  archiveMcpPath,
  authorizeArchiveMcp,
  mcpScopes,
  mcpAuthError,
  type RefMcpAccess,
} from "./app/mcp/auth.ts";
import {
  createIdentityClient,
  IdentityError,
  PROJECT_ROLES_SCOPE,
  projectAudienceScope,
  roleScope,
} from "@harrhy/identity";

export { BoardCell, DirectoryCell, ExportCell };

type RefEnv = Env & { HARRHY_REF_ALTERNATE_BROWSER_ORIGIN?: string };

export default {
  fetch(request: Request, env: RefEnv): Promise<Response> {
    return logRequest(request, () => handleRequest(request, env), {
      privateValues: [env.AUTH_INTROSPECTION_SECRET ?? ""],
    });
  },
} satisfies ExportedHandler<Env>;

async function handleRequest(request: Request, env: RefEnv): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/health") return Response.json({ ok: true });
  const origin = request.headers.get("Origin");
  if (origin && origin !== url.origin) {
    return new Response("Cross-origin requests are not accepted", {
      status: 403,
    });
  }
  if (
    url.pathname === "/style.css" ||
    url.pathname === "/favicon.svg" ||
    url.pathname.startsWith("/assets/")
  ) {
    return withSecurityHeaders(await env.ASSETS.fetch(request));
  }

  let publicOrigin: URL | null = null;
  if (env.AUTH_PUBLIC_ORIGIN) {
    try {
      publicOrigin = new URL(env.AUTH_PUBLIC_ORIGIN);
    } catch {
      return new Response("Sign-in is not configured", { status: 503 });
    }
  }
  if (
    !env.AUTH_ISSUER ||
    !env.AUTH_CLIENT_ID ||
    !env.AUTH_PROJECT_ID ||
    !env.AUTH_ORGANIZATION_ID ||
    !publicOrigin ||
    (publicOrigin.protocol !== "https:" &&
      !(
        publicOrigin.protocol === "http:" &&
        (["localhost", "127.0.0.1", "[::1]"].includes(publicOrigin.hostname) ||
          publicOrigin.hostname.endsWith(".localhost"))
      )) ||
    publicOrigin.origin !== env.AUTH_PUBLIC_ORIGIN
  )
    return new Response("Sign-in is not configured", { status: 503 });
  const alternate = env.HARRHY_REF_ALTERNATE_BROWSER_ORIGIN;
  if (alternate) {
    const parsed = URL.parse(alternate);
    if (parsed?.protocol !== "https:" || parsed.origin !== alternate)
      return new Response("Sign-in is not configured", { status: 503 });
    if (
      url.origin !== publicOrigin.origin &&
      url.origin !== alternate &&
      url.pathname !== "/ready"
    )
      return new Response("Unrecognized request origin", { status: 421 });
  }
  const onAlternate =
    alternate === url.origin && alternate !== publicOrigin.origin;
  const archiveMcp = url.pathname === archiveMcpPath;
  if (
    (archiveMcp ||
      url.pathname === archiveMcpMetadataPath ||
      url.pathname.startsWith("/api/archive/exports")) &&
    url.origin !== publicOrigin.origin
  )
    return new Response("Use the canonical Ref origin", { status: 421 });
  if (url.pathname === archiveMcpMetadataPath)
    return archiveMcpMetadata(
      publicOrigin.origin,
      env.AUTH_ISSUER,
      env.AUTH_PROJECT_ID,
    );
  if (url.pathname === "/.well-known/oauth-protected-resource/mcp") {
    return Response.json(
      {
        resource: `${env.AUTH_PUBLIC_ORIGIN}/mcp`,
        authorization_servers: [env.AUTH_ISSUER],
        bearer_methods_supported: ["header"],
        scopes_supported: mcpScopes(env.AUTH_PROJECT_ID),
      },
      { headers: { "Cache-Control": "public, max-age=300" } },
    );
  }
  if (url.pathname === "/.well-known/oauth-protected-resource/api/archive") {
    return Response.json(
      {
        resource: `${env.AUTH_PUBLIC_ORIGIN}/api/archive`,
        authorization_servers: [env.AUTH_ISSUER],
        bearer_methods_supported: ["header"],
        scopes_supported: [
          "openid",
          "profile",
          projectAudienceScope(env.AUTH_PROJECT_ID),
          PROJECT_ROLES_SCOPE,
          ...["member", "admin", "archive-read", "archive-restore"].map(
            roleScope,
          ),
        ],
      },
      { headers: { "Cache-Control": "public, max-age=300" } },
    );
  }

  const config = {
    issuer: env.AUTH_ISSUER,
    clientId: env.AUTH_CLIENT_ID,
    projectId: env.AUTH_PROJECT_ID,
    organizationId: env.AUTH_ORGANIZATION_ID,
  };
  try {
    const runtime = createRuntime(env);
    if (url.pathname === "/ready") {
      await runtime.directory.listBoards();
      return Response.json({ ready: true });
    }
    const bearer = request.headers.get("Authorization");
    const introspection =
      env.AUTH_INTROSPECTION_CLIENT_ID && env.AUTH_INTROSPECTION_SECRET
        ? {
            clientId: env.AUTH_INTROSPECTION_CLIENT_ID,
            clientSecret: env.AUTH_INTROSPECTION_SECRET,
          }
        : null;
    let mcpAccess: RefMcpAccess | null = null;
    if (url.pathname === "/mcp" || archiveMcp) {
      if (!bearer?.startsWith("Bearer "))
        return mcpAuthError(
          env.AUTH_PUBLIC_ORIGIN,
          401,
          "Ref MCP bearer authorization is required",
          archiveMcp
            ? { projectId: env.AUTH_PROJECT_ID, missingBearer: true }
            : undefined,
        );
      if (!introspection)
        return mcpAuthError(
          env.AUTH_PUBLIC_ORIGIN,
          503,
          "Ref MCP authentication is unavailable",
        );
      try {
        const principal = await createIdentityClient(config).introspect(
          bearer.slice(7),
          introspection,
        );
        mcpAccess = archiveMcp
          ? authorizeArchiveMcp(
              principal,
              env.AUTH_PROJECT_ID,
              env.AUTH_CLIENT_ID,
            )
          : authorizeRefMcp(principal, env.AUTH_PROJECT_ID);
      } catch (error) {
        return mcpAuthError(
          env.AUTH_PUBLIC_ORIGIN,
          error instanceof IdentityError ? error.status : 503,
          "Ref MCP authorization failed",
          archiveMcp ? { projectId: env.AUTH_PROJECT_ID } : undefined,
        );
      }
    }
    const archive = url.pathname.startsWith("/api/archive/");
    const token = archive ? null : readSessionCookie(request);
    let authenticated = token ? await runtime.directory.session(token) : false;
    let archiveSubject: string | null = null;
    const archiveSnapshot =
      request.method === "GET" &&
      /^\/api\/boards\/[^/]+\/snapshot$/.test(url.pathname);
    if (
      bearer?.startsWith("Bearer ") &&
      (archive ||
        archiveSnapshot ||
        (!authenticated &&
          (url.pathname.startsWith("/media/") ||
            url.pathname.startsWith("/previews/"))))
    ) {
      if (!introspection)
        return new Response("Archive authentication is unavailable", {
          status: 503,
          headers: { "Cache-Control": "no-store" },
        });
      try {
        const principal = await createIdentityClient(config).introspect(
          bearer.slice(7),
          introspection,
        );
        const boardGrant =
          principal.scopes.has(roleScope("boards-read")) ||
          principal.scopes.has(roleScope("boards-write"));
        if (!archive && boardGrant) {
          if (!authorizeRefMcp(principal, env.AUTH_PROJECT_ID).canRead)
            throw new IdentityError(
              "Ref board read authorization is required",
              403,
            );
        } else {
          if (url.pathname.startsWith("/api/archive/exports"))
            authorizeArchiveMcp(
              principal,
              env.AUTH_PROJECT_ID,
              env.AUTH_CLIENT_ID,
            );
          else
            authorizeArchive(
              principal,
              env.AUTH_PROJECT_ID,
              archive && request.method !== "GET" ? "restore" : "read",
            );
          if (archive) archiveSubject = principal.subject;
        }
        if (!archive) authenticated = true;
      } catch (error) {
        return new Response("Archive authorization failed", {
          status: error instanceof IdentityError ? error.status : 503,
          headers: { "Cache-Control": "no-store" },
        });
      }
    }
    if (archive && !archiveSubject)
      return new Response("Archive bearer token required", {
        status: 401,
        headers: {
          "Cache-Control": "no-store",
          "WWW-Authenticate": `Bearer resource_metadata="${env.AUTH_PUBLIC_ORIGIN}/.well-known/oauth-protected-resource/api/archive"`,
        },
      });
    const router = createAppRouter(
      runtime,
      authenticated,
      token,
      {
        config,
        origin: onAlternate ? url.origin : publicOrigin.origin,
        onAlternate,
      },
      mcpAccess,
      archiveSubject,
    );
    return withSecurityHeaders(await router.fetch(request), true);
  } catch (error) {
    failOperation(error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

function withSecurityHeaders(
  response: Response,
  privateResponse = false,
): Response {
  if (response.status === 101) return response;
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "same-origin");
  if (privateResponse && !headers.has("Cache-Control"))
    headers.set("Cache-Control", "private, no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
