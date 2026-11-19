import { createCredential } from "./credentials.mjs";

function rejectionPhase(path, method) {
  if (/^\/v2\/oidc\/auth_requests\/[^/?#]+$/.test(path)) {
    if (method === "GET") return "authorization_lookup";
    if (method === "POST") return "authorization_finalize";
  }
  if (path === "/v2/sessions" && method === "POST") return "session_create";
  if (/^\/v2\/sessions\/[^/?#]+$/.test(path)) {
    if (method === "GET") return "session_read";
    if (method === "DELETE") return "session_end";
  }
  return "other";
}

export function createZitadel({
  baseUrl,
  loginTokenFile,
  managementTokenFile,
  organizationId,
}) {
  const tokens = {
    login: createCredential(loginTokenFile, baseUrl),
    management: createCredential(managementTokenFile, baseUrl),
  };
  return async function api(
    path,
    { method = "GET", body, management = false } = {},
  ) {
    const response = await fetch(new URL(path, baseUrl), {
      method,
      headers: {
        authorization: `Bearer ${await tokens[management ? "management" : "login"]()}`,
        "content-type": "application/json",
        ...(path.startsWith("/zitadel.")
          ? { "Connect-Protocol-Version": "1" }
          : {}),
        "x-zitadel-orgid": organizationId,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
      redirect: "error",
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error("Identity service rejected the request");
      error.status = response.status;
      error.code = result.code;
      error.providerFailure = {
        upstream_service: "zitadel",
        phase: rejectionPhase(path, method),
        upstream_status: response.status,
        ...(Number.isInteger(result.code) &&
        result.code >= 1 &&
        result.code <= 16
          ? { code: result.code }
          : {}),
      };
      // Installed ZITADEL 4.20 rejects an invalid invite without consuming it.
      error.invitationProofRejected =
        /^\/v2\/users\/[^/]+\/invite_code\/verify$/.test(path) &&
        response.status === 400 &&
        result.code === 3 &&
        typeof result.message === "string" &&
        result.message.endsWith("(COMMAND-Wgn4q)");
      const passwordErrors = {
        "Password must contain upper case":
          "Include an uppercase letter in your password.",
        "Password must contain lower case":
          "Include a lowercase letter in your password.",
        "Password must contain number": "Include a number in your password.",
        "Password must contain symbol": "Include a symbol in your password.",
      };
      const passwordMessage =
        typeof result.message === "string"
          ? result.message.replace(/ \(DOMAIN-[A-Za-z0-9]+\)$/, "")
          : "";
      if (Object.hasOwn(passwordErrors, passwordMessage))
        error.passwordPolicyMessage = passwordErrors[passwordMessage];
      throw error;
    }
    return result;
  };
}
