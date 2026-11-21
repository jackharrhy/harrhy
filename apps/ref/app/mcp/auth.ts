import {
  IdentityError,
  PROJECT_ROLES_SCOPE,
  projectAudienceScope,
  requireTokenRole,
  roleScope,
  type TokenPrincipal,
} from "@harrhy/identity";
export interface RefMcpAccess {
  subject: string;
  canRead: boolean;
  canWrite: boolean;
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
): Response {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (status === 401 || status === 403) {
    headers.set(
      "WWW-Authenticate",
      `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp", error="${status === 401 ? "invalid_token" : "insufficient_scope"}"`,
    );
  }
  return Response.json({ error: message }, { status, headers });
}
