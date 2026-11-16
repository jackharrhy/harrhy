export function applicationForClient(applications, clientId) {
  const application = applications.find((item) =>
    item.clientIds.includes(clientId),
  );
  if (!application || application.authorizationHold)
    throw Object.assign(new Error("This application is not enabled."), {
      status: 403,
    });
  return application;
}

export function applicationRoleKeys(application, role) {
  return role
    ? [
        ...new Set([
          role,
          ...(role === "member" ? application.apiRoles || [] : []),
        ]),
      ]
    : [];
}

export async function searchAll(api, path, queries = []) {
  const result = [];
  for (let offset = 0; offset < 10_000; offset += 100) {
    const page = await api(path, {
      management: true,
      method: "POST",
      body: { query: { limit: "100", offset: String(offset) }, queries },
    });
    result.push(...(page.result || []));
    if (!page.result || page.result.length < 100) return result;
  }
  throw new Error("The identity directory exceeds the supported page limit.");
}

function requireFreshRequest(request, minimum) {
  if (
    minimum &&
    (!Number.isFinite(Date.parse(minimum)) ||
      !Number.isFinite(Date.parse(request.creationDate)) ||
      Date.parse(request.creationDate) <= Date.parse(minimum))
  ) {
    throw Object.assign(
      new Error("Restart sign-in to create a fresh authorization request."),
      { status: 400 },
    );
  }
}

const denied = (code) =>
  Object.assign(new Error("This authorization request is not enabled."), {
    status: 403,
    code,
  });

export function authorizationForRequest(applications, request) {
  const known = applications.find((app) =>
    app.clientIds.includes(request?.clientId),
  );
  if (known) {
    if (known.authorizationHold)
      throw Object.assign(new Error("This application is not enabled."), {
        status: 403,
      });
    requireFreshRequest(
      request,
      known.authRequestNotBefore?.[request.clientId],
    );
    const intent = { application: known, roles: [], consent: false };
    if (known.clientRoleRequirements?.[request.clientId])
      intent.anyRoles = known.clientRoleRequirements[request.clientId];
    return intent;
  }
  const scopes = request?.scope;
  if (
    typeof request?.clientId !== "string" ||
    !request.clientId ||
    !Array.isArray(scopes) ||
    scopes.length > 32 ||
    scopes.some((scope) => typeof scope !== "string" || scope.length > 256)
  )
    throw denied("authorization_request_shape");
  const targets = applications.filter((app) =>
    scopes.includes(`urn:zitadel:iam:org:project:id:${app.projectId}:aud`),
  );
  if (targets.length !== 1) throw denied("authorization_audience");
  const application = targets[0];
  if (!application.delegatedRoles?.length)
    throw denied("authorization_delegation_unavailable");
  if (application.authorizationHold) throw denied("authorization_hold");
  requireFreshRequest(request, application.delegatedAuthRequestNotBefore);
  const roles = application.delegatedRoles.filter((role) =>
    scopes.includes(`urn:zitadel:iam:org:project:role:${role}`),
  );
  if (roles.length !== 1) throw denied("authorization_membership_scope");
  const required = [
    "openid",
    `urn:zitadel:iam:org:project:id:${application.projectId}:aud`,
    "urn:zitadel:iam:org:projects:roles",
    `urn:zitadel:iam:org:project:role:${roles[0]}`,
  ];
  const permissions = (application.delegatedPermissions || []).filter((role) =>
    scopes.includes(`urn:zitadel:iam:org:project:role:${role}`),
  );
  if (application.delegatedPermissions?.length && !permissions.length)
    throw denied("authorization_permission_scope");
  if (application.delegatedPermissionPolicies) {
    const matching = application.delegatedPermissionPolicies.filter(
      (policy) =>
        policy.roles.includes(roles[0]) &&
        permissions.length > 0 &&
        permissions.every((permission) =>
          policy.permissions.includes(permission),
        ),
    );
    if (matching.length !== 1) throw denied("authorization_permission_family");
  }
  const allowed = new Set([
    ...required,
    ...permissions.map((role) => `urn:zitadel:iam:org:project:role:${role}`),
    "profile",
    "email",
    "offline_access",
  ]);
  if (required.some((scope) => !scopes.includes(scope)))
    throw denied("authorization_required_scope");
  if (scopes.some((scope) => !allowed.has(scope)))
    throw denied("authorization_unexpected_scope");
  let callback;
  try {
    callback = new URL(request.redirectUri);
  } catch {
    throw denied("authorization_callback_url");
  }
  if (
    callback.username ||
    callback.password ||
    callback.hash ||
    (callback.protocol !== "https:" &&
      !(
        callback.protocol === "http:" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(callback.hostname)
      ))
  )
    throw denied("authorization_callback_policy");
  return {
    application,
    roles: [...roles, ...permissions],
    consent: true,
    clientOrigin: callback.origin,
    offline: scopes.includes("offline_access"),
  };
}

export function authorizationCallback(registered, actual) {
  let expected, callback;
  try {
    expected = new URL(registered);
    callback = new URL(actual);
  } catch {
    throw Object.assign(new Error("Invalid callback."), { status: 502 });
  }
  if (
    !["https:", "http:"].includes(callback.protocol) ||
    callback.origin !== expected.origin ||
    callback.pathname !== expected.pathname ||
    callback.username ||
    callback.password ||
    callback.hash
  )
    throw Object.assign(
      new Error("The identity service returned a different callback."),
      { status: 502 },
    );
  return callback.href;
}
