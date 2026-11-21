import {
  IdentityError,
  PROJECT_ROLES_SCOPE,
  projectAudienceScope,
  requireTokenRole,
  roleScope,
  type TokenPrincipal,
} from "@harrhy/identity";
import { authorizeArchive } from "../middleware/archive-auth.ts";

export type RefMcpAccess =
  | {
      subject: string;
      canRead: boolean;
      canWrite: boolean;
      archiveOnly?: false;
    }
  | { subject: string; canRead: false; canWrite: false; archiveOnly: true };

export const archiveMcpPath = "/mcp/archive";
export const archiveMcpMetadataPath = `/.well-known/oauth-protected-resource${archiveMcpPath}`;

export function archiveMcpScopes(projectId: string) {
  return [
    "openid",
    projectAudienceScope(projectId),
    PROJECT_ROLES_SCOPE,
    roleScope("admin"),
    roleScope("archive-read"),
  ];
}

export function archiveMcpMetadata(
  origin: string,
  issuer: string,
  projectId: string,
) {
  return Response.json(
    {
      resource: `${origin}${archiveMcpPath}`,
      authorization_servers: [issuer],
      bearer_methods_supported: ["header"],
      scopes_supported: archiveMcpScopes(projectId),
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}

export function authorizeArchiveMcp(
  principal: TokenPrincipal,
  projectId: string,
  browserClientId: string,
): RefMcpAccess {
  if (
    !principal.subject ||
    !principal.clientId ||
    !browserClientId ||
    principal.clientId === browserClientId
  )
    throw new IdentityError("Archive MCP requires a delegated client", 403);
  authorizeArchive(principal, projectId, "read");
  const scopes = new Set([
    ...archiveMcpScopes(projectId),
    "profile",
    "email",
    "offline_access",
  ]);
  if (!principal.scopes.has("openid"))
    throw new IdentityError("Archive MCP requires an identity scope", 403);
  for (const scope of principal.scopes) {
    if (!scopes.has(scope))
      throw new IdentityError(
        "Request only the Ref archive-read permission",
        403,
      );
  }
  return {
    subject: principal.subject,
    canRead: false,
    canWrite: false,
    archiveOnly: true,
  };
}

export function mcpScopes(projectId: string): string[] {
  return [
    "openid",
    "profile",
    projectAudienceScope(projectId),
    PROJECT_ROLES_SCOPE,
    ...["member", "admin", "boards-read", "boards-write"].map(roleScope),
  ];
}

export function authorizeRefMcp(
  principal: TokenPrincipal,
  projectId: string,
): RefMcpAccess {
  if (principal.principalType !== "user" || !principal.subject)
    throw new IdentityError("Ref MCP requires human authorization", 403);
  const membership = ["member", "admin"].filter((role) =>
    principal.scopes.has(roleScope(role)),
  );
  if (membership.length !== 1)
    throw new IdentityError("Request exactly one Ref membership role", 403);
  requireTokenRole(principal, projectId, membership[0]!);
  const allowedRoles = new Set(
    [membership[0]!, "boards-read", "boards-write"].map(roleScope),
  );
  for (const scope of principal.scopes) {
    if (
      scope.startsWith("urn:zitadel:iam:org:project:role:") &&
      !allowedRoles.has(scope)
    )
      throw new IdentityError(
        "Board and other authorization families must be separate",
        403,
      );
  }
  const permission = (role: string) =>
    principal.roles.has(role) && principal.scopes.has(roleScope(role));
  const canRead = permission("boards-read");
  const canWrite = permission("boards-write");
  if (!canRead && !canWrite)
    throw new IdentityError(
      "Ref board operation authorization is required",
      403,
    );
  for (const role of ["boards-read", "boards-write"]) {
    if (principal.scopes.has(roleScope(role)) && !principal.roles.has(role))
      throw new IdentityError(
        "Every requested Ref capability requires a grant",
        403,
      );
  }
  return { subject: principal.subject, canRead, canWrite };
}

export function mcpAuthError(
  origin: string,
  status: number,
  message: string,
  archive?: { projectId: string; missingBearer?: boolean },
): Response {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (status === 401 || status === 403) {
    const parameters = [
      `resource_metadata="${origin}${archive ? archiveMcpMetadataPath : "/.well-known/oauth-protected-resource/mcp"}"`,
    ];
    if (archive)
      parameters.push(
        `scope="${archiveMcpScopes(archive.projectId).join(" ")}"`,
      );
    if (!(status === 401 && archive?.missingBearer))
      parameters.push(
        `error="${status === 401 ? "invalid_token" : "insufficient_scope"}"`,
      );
    headers.set("WWW-Authenticate", `Bearer ${parameters.join(", ")}`);
  }
  return Response.json({ error: message }, { status, headers });
}
