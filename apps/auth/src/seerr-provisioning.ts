import type {
  SeerrProvisioning,
  SeerrReview,
  WriteConfig,
  NativeDependencies,
} from "./media-contracts.ts";
import { isDeepStrictEqual } from "node:util";
import { createSeerrApi } from "./seerr-api.mjs";

const invalid = () =>
  new Error("Seerr exact-ID import contract could not be verified");
const guid = (value: unknown) => {
  if (
    typeof value !== "string" ||
    !/^(?:[a-f0-9]{32}|[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})$/i.test(
      value,
    )
  )
    throw invalid();
  return value.replaceAll("-", "").toLowerCase();
};
const numericId = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

function nativeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw invalid();
  return value as Record<string, unknown>;
}
function verify(value: unknown, review: SeerrReview, nativeId: string) {
  const user = nativeObject(value);
  if (
    !numericId(user.id) ||
    user.id === 1 ||
    String(user.id) !== nativeId ||
    guid(user.jellyfinUserId) !== guid(review.jellyfinNativeId) ||
    user.jellyfinUsername !== review.username ||
    user.permissions !== 160 ||
    user.userType !== 3
  )
    throw invalid();
}

// Import one reviewed native ID only; never create a local/password account.
export function createSeerrProvisioning(
  config: WriteConfig,
  dependencies: NativeDependencies = {},
): SeerrProvisioning {
  const request = createSeerrApi(config, dependencies);
  async function preview({
    jellyfinNativeId,
  }: {
    jellyfinNativeId: string;
  }): Promise<SeerrReview> {
    const normalized = guid(jellyfinNativeId);
    // Full settings stay in memory only; the API can include its own API key.
    const settings = nativeObject(await request("settings/main"));
    if (settings.mediaServerType !== 2 || settings.defaultPermissions !== 160)
      throw invalid();
    const result = await request("settings/jellyfin/users");
    if (!Array.isArray(result) || result.length > 10000) throw invalid();
    const users = result.map(nativeObject);
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
  return {
    preview,
    async provision(review, { claimEffect, recordNativeId }) {
      const current = await preview({
        jellyfinNativeId: review.jellyfinNativeId,
      });
      if (!isDeepStrictEqual(current, review)) throw invalid();
      await claimEffect();
      let nativeId: string | undefined;
      try {
        const created = await request("user/import-from-jellyfin", {
          method: "POST",
          json: true,
          body: { jellyfinUserIds: [review.jellyfinNativeId] },
        });
        if (!Array.isArray(created) || created.length !== 1) throw invalid();
        const user = nativeObject(created[0]);
        if (!numericId(user.id)) throw invalid();
        nativeId = String(user.id);
        await recordNativeId(nativeId);
        verify(user, review, nativeId);
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
