import { isDeepStrictEqual } from "node:util";
import { createSeerrApi } from "./seerr-api.mjs";

const invalid = () =>
  new Error("Seerr exact-ID import contract could not be verified");
const guid = (value) => {
  if (
    typeof value !== "string" ||
    !/^(?:[a-f0-9]{32}|[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})$/i.test(
      value,
    )
  )
    throw invalid();
  return value.replaceAll("-", "").toLowerCase();
};
const numericId = (value) => Number.isSafeInteger(value) && value > 0;

// Import one reviewed native ID only; never create a local/password account.
export function createSeerrProvisioning(config, dependencies = {}) {
  const request = createSeerrApi(config, dependencies);
  async function preview({ jellyfinNativeId }) {
    const normalized = guid(jellyfinNativeId);
    // Full settings stay in memory only; the API can include its own API key.
    const settings = await request("settings/main");
    if (settings.mediaServerType !== 2 || settings.defaultPermissions !== 160)
      throw invalid();
    const users = await request("settings/jellyfin/users");
    if (!Array.isArray(users) || users.length > 10000) throw invalid();
    const ids = users.map((user) => guid(user.id));
    if (new Set(ids).size !== ids.length) throw invalid();
    const native = users.find((user) => user.id === jellyfinNativeId);
    if (
      !native ||
      typeof native.username !== "string" ||
      !native.username ||
      native.username.length > 500
    )
      throw invalid();
    // An existing exact native association is not permission to mutate or auto-map it.
    const existing = await request(`user/jellyfin/${normalized}`, {
      allowNotFound: true,
    });
    if (existing !== null) throw invalid();
    return {
      jellyfinNativeId,
      username: native.username,
      permissions: 160,
      permissionMeaning: "request-and-auto-approve",
      userType: 3,
      profile: "exact-jellyfin-import-v1",
      mapping: "separate-exact-id-review",
    };
  }
  function verify(user, review, nativeId) {
    if (
      !numericId(user?.id) ||
      user.id === 1 ||
      String(user.id) !== nativeId ||
      guid(user.jellyfinUserId) !== guid(review.jellyfinNativeId) ||
      user.jellyfinUsername !== review.username ||
      user.permissions !== 160 ||
      user.userType !== 3
    )
      throw invalid();
  }
  return {
    preview,
    async provision(review, { claimEffect, recordNativeId }) {
      const current = await preview({
        jellyfinNativeId: review.jellyfinNativeId,
      });
      if (!isDeepStrictEqual(current, review)) throw invalid();
      await claimEffect();
      let nativeId;
      try {
        const created = await request("user/import-from-jellyfin", {
          method: "POST",
          json: true,
          body: { jellyfinUserIds: [review.jellyfinNativeId] },
        });
        if (
          !Array.isArray(created) ||
          created.length !== 1 ||
          !numericId(created[0]?.id)
        )
          throw invalid();
        nativeId = String(created[0].id);
        await recordNativeId(nativeId);
        verify(created[0], review, nativeId);
        verify(await request(`user/${nativeId}`), review, nativeId);
        return {
          state: "created",
          nativeId,
          mapping: "separate-exact-id-review",
        };
      } catch {
        // Native import/default settings are not transactional. Never repair,
        // delete, retry, auto-link, or infer success by rediscovering a username.
        return { state: "effect-unknown", ...(nativeId ? { nativeId } : {}) };
      }
    },
  };
}
