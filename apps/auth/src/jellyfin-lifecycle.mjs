import { createJellyfinApi } from "./jellyfin-api.mjs";
import { isDeepStrictEqual } from "node:util";

const invalid = () =>
  new Error("Jellyfin lifecycle contract could not be verified");
const uuid = /^(?:[a-f0-9]{32}|[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})$/i;

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

// Writes require explicit operator configuration and a durable same-actor review.
export function createJellyfinLifecycle(config, dependencies = {}) {
  const request = createJellyfinApi(config, dependencies);
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
        await request(`Users/${review.nativeId}/Policy`, {
          method: "POST",
          body: current.after,
        });
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
