import { createIdentityClient, type IdentityConfig } from "@harrhy/identity";

export {
  createLoginTransaction,
  loginTransactionCookieName,
  validLoginTransaction,
} from "@harrhy/identity";
export type { LoginTransaction } from "@harrhy/identity";

export function identityConfig(): IdentityConfig {
  return {
    issuer: process.env.AUTH_ISSUER ?? "https://auth.jackharrhy.dev",
    clientId: process.env.AUTH_CLIENT_ID ?? "",
    projectId: process.env.AUTH_PROJECT_ID ?? "",
    organizationId: process.env.AUTH_ORGANIZATION_ID ?? "",
  };
}
export function identityClient() {
  return createIdentityClient(identityConfig(), (input, options) =>
    fetch(input, options),
  );
}
export function canonicalArtbinUrl(): string {
  return process.env.ARTBIN_URL ?? "http://localhost:5175";
}

export function alternateBrowserOrigin(): URL | null {
  const value = process.env.HARRHY_ARTBIN_BROWSER_ORIGIN;
  if (!value) return null;
  const alternate = URL.parse(value);
  const canonical = URL.parse(canonicalArtbinUrl());
  if (
    !alternate ||
    ![alternate.origin, alternate.origin + "/"].includes(value) ||
    (alternate.protocol !== "https:" &&
      !(
        process.env.NODE_ENV !== "production" && alternate.protocol === "http:"
      )) ||
    !canonical ||
    alternate.hostname === canonical.hostname
  ) {
    throw new Error(
      "HARRHY_ARTBIN_BROWSER_ORIGIN must be a separate browser origin (HTTPS in production)",
    );
  }
  return alternate;
}

export function requestAuthority(request: Request): string {
  return request.headers.get("Host") ?? new URL(request.url).host;
}

export function browserRedirectUri(request?: Request): string {
  const alternate = alternateBrowserOrigin();
  if (alternate && request && requestAuthority(request) === alternate.host) {
    return alternate.origin + "/auth/callback";
  }
  return `${canonicalArtbinUrl()}/auth/callback`;
}
export function getCliRedirectUri(): string {
  return `${canonicalArtbinUrl()}/auth/cli/callback`;
}
