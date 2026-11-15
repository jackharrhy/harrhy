import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";

const invalid = () =>
  new Error("Jellyfin lifecycle contract could not be verified");
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;

// The installed policy endpoint replaces the policy; never send a partial patch.
export function reviewJellyfinDisable(user) {
  if (
    !user ||
    !uuid.test(user.Id) ||
    !user.Policy ||
    typeof user.Policy !== "object" ||
    Array.isArray(user.Policy) ||
    user.Policy.IsAdministrator !== false ||
    typeof user.Policy.IsDisabled !== "boolean" ||
    typeof user.Policy.AuthenticationProviderId !== "string" ||
    !user.Policy.AuthenticationProviderId ||
    typeof user.Policy.PasswordResetProviderId !== "string" ||
    !user.Policy.PasswordResetProviderId
  )
    throw invalid();
  return {
    nativeId: user.Id,
    before: structuredClone(user.Policy),
    after: { ...structuredClone(user.Policy), IsDisabled: true },
    sessionRevocation: "manual-required",
  };
}

// Intentionally not connected to runtime configuration until durable action review exists.
export function createJellyfinLifecycle(
  { baseUrl, writeTokenFile },
  { fetcher = fetch, readToken = readFile } = {},
) {
  const base = new URL(baseUrl);
  if (
    !["http:", "https:"].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    typeof writeTokenFile !== "string" ||
    !writeTokenFile.startsWith("/")
  )
    throw invalid();
  async function request(path, method = "GET", body) {
    const token = (await readToken(writeTokenFile, "utf8")).trim();
    if (!/^[A-Za-z0-9._~-]{1,4096}$/.test(token)) throw invalid();
    const url = new URL(`${base.pathname.replace(/\/$/, "")}/${path}`, base);
    const response = await fetcher(url, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(5000),
      headers: {
        Accept: 'application/json; profile="PascalCase"',
        Authorization: `MediaBrowser Token="${token}"`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw invalid();
    if (method !== "GET") return;
    if (
      !response.body ||
      !response.headers.get("content-type")?.includes("application/json")
    )
      throw invalid();
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > 1024 * 1024) throw invalid();
      chunks.push(Buffer.from(chunk));
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }
  async function inspect(nativeId) {
    if (typeof nativeId !== "string" || !uuid.test(nativeId)) throw invalid();
    const user = await request(`Users/${nativeId}`);
    if (user.Id !== nativeId) throw invalid();
    return reviewJellyfinDisable(user);
  }
  return {
    inspect,
    async disable(review, claimEffect) {
      const current = await inspect(review.nativeId);
      if (!isDeepStrictEqual(current, review)) throw invalid();
      if (current.before.IsDisabled)
        return {
          state: "already-disabled",
          sessionRevocation: "manual-required",
        };
      // The caller must durably record uncertainty BEFORE the first native mutation.
      await claimEffect();
      try {
        await request(`Users/${review.nativeId}/Policy`, "POST", current.after);
        const verified = await inspect(review.nativeId);
        if (!isDeepStrictEqual(verified.before, current.after)) throw invalid();
        return { state: "disabled", sessionRevocation: "manual-required" };
      } catch {
        return {
          state: "effect-unknown",
          sessionRevocation: "manual-required",
        };
      }
    },
  };
}
