import {
  IdentityError,
  PROJECT_ROLES_SCOPE,
  projectAudienceScope,
  requireTokenRole,
  roleScope,
  type TokenPrincipal,
} from "@harrhy/identity";

export function authorizeArchive(
  principal: TokenPrincipal,
  projectId: string,
  operation: "read" | "restore",
): void {
  if (principal.principalType !== "user")
    throw new IdentityError("Human archive authorization required", 403);
  if (
    principal.roles.has("member") ||
    principal.scopes.has(roleScope("member")) ||
    !principal.scopes.has(roleScope("admin"))
  )
    throw new IdentityError("Archive requires an admin scope", 403);
  if (
    ["boards-read", "boards-write"].some((role) =>
      principal.scopes.has(roleScope(role)),
    )
  )
    throw new IdentityError(
      "Board and archive authorization must be separate",
      403,
    );
  requireTokenRole(principal, projectId, "admin");
  const permissions =
    operation === "read"
      ? ["archive-read"]
      : ["archive-read", "archive-restore"];
  for (const permission of permissions)
    if (
      !principal.roles.has(permission) ||
      !principal.scopes.has(roleScope(permission))
    )
      throw new IdentityError(
        `Archive ${operation} permission is missing`,
        403,
      );
}

export function archiveExportScopes(projectId: string) {
  return [
    "openid",
    projectAudienceScope(projectId),
    PROJECT_ROLES_SCOPE,
    roleScope("admin"),
    roleScope("archive-read"),
  ];
}

export function authorizeArchiveExport(
  principal: TokenPrincipal,
  projectId: string,
  browserClientId: string,
): void {
  if (
    !principal.subject ||
    !principal.clientId ||
    !browserClientId ||
    principal.clientId === browserClientId
  )
    throw new IdentityError("Archive export requires a delegated client", 403);
  authorizeArchive(principal, projectId, "read");
  const scopes = new Set([
    ...archiveExportScopes(projectId),
    "profile",
    "email",
    "offline_access",
  ]);
  if (!principal.scopes.has("openid"))
    throw new IdentityError("Archive export requires an identity scope", 403);
  for (const scope of principal.scopes) {
    if (!scopes.has(scope))
      throw new IdentityError(
        "Request only the Ref archive-read permission",
        403,
      );
  }
}
