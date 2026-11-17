import type {
  Folder,
  JellyfinProvisioning,
  JellyfinReview,
  WriteConfig,
  NativeDependencies,
} from "./media-contracts.ts";
import { randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { createJellyfinApi } from "./jellyfin-api.mjs";

const invalid = () =>
  new Error("Jellyfin new-account contract could not be verified");
const invalidInput = (message: string) =>
  Object.assign(new Error(message), { status: 400 });
function nativeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw invalid();
  return value as Record<string, unknown>;
}
const uuid = /^(?:[a-f0-9]{32}|[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})$/i;

// This profile is only for a newly returned native ID, never an incumbent policy.
export function newJellyfinPlaybackPolicy(user: unknown, folders: string[]) {
  const native = nativeObject(user);
  const policy = nativeObject(native.Policy);
  if (
    typeof native.Id !== "string" ||
    !uuid.test(native.Id) ||
    policy.IsAdministrator !== false ||
    typeof policy.AuthenticationProviderId !== "string" ||
    !policy.AuthenticationProviderId ||
    typeof policy.PasswordResetProviderId !== "string" ||
    !policy.PasswordResetProviderId ||
    !Array.isArray(folders) ||
    !folders.length ||
    folders.length > 100 ||
    folders.some((id) => typeof id !== "string" || !uuid.test(id)) ||
    new Set(folders).size !== folders.length
  )
    throw invalid();
  return {
    IsAdministrator: false,
    IsHidden: true,
    EnableCollectionManagement: false,
    EnableSubtitleManagement: false,
    EnableLyricManagement: false,
    IsDisabled: false,
    BlockedTags: [],
    AllowedTags: [],
    EnableUserPreferenceAccess: true,
    AccessSchedules: [],
    BlockUnratedItems: [],
    EnableRemoteControlOfOtherUsers: false,
    EnableSharedDeviceControl: false,
    EnableRemoteAccess: true,
    EnableLiveTvManagement: false,
    EnableLiveTvAccess: false,
    EnableMediaPlayback: true,
    EnableAudioPlaybackTranscoding: true,
    EnableVideoPlaybackTranscoding: true,
    EnablePlaybackRemuxing: true,
    ForceRemoteSourceTranscoding: false,
    EnableContentDeletion: false,
    EnableContentDeletionFromFolders: [],
    EnableContentDownloading: false,
    EnableSyncTranscoding: false,
    EnableMediaConversion: false,
    EnabledDevices: [],
    EnableAllDevices: true,
    EnabledChannels: [],
    EnableAllChannels: false,
    EnabledFolders: [...folders],
    EnableAllFolders: false,
    InvalidLoginAttemptCount: 0,
    LoginAttemptsBeforeLockout: 5,
    MaxActiveSessions: 0,
    EnablePublicSharing: false,
    BlockedMediaFolders: [],
    BlockedChannels: [],
    RemoteClientBitrateLimit: 0,
    AuthenticationProviderId: policy.AuthenticationProviderId,
    PasswordResetProviderId: policy.PasswordResetProviderId,
    SyncPlayAccess: "None",
  };
}

export function createJellyfinProvisioning(
  config: WriteConfig,
  dependencies: NativeDependencies = {},
): JellyfinProvisioning {
  const request = createJellyfinApi(config, dependencies);
  async function libraries(): Promise<Folder[]> {
    const result = await request("Library/VirtualFolders");
    if (!Array.isArray(result) || result.length > 100) throw invalid();
    const rows = result
      .map((value: unknown) => {
        const row = nativeObject(value);
        if (
          typeof row.ItemId !== "string" ||
          !uuid.test(row.ItemId) ||
          typeof row.Name !== "string" ||
          !row.Name ||
          row.Name.length > 500
        )
          throw invalid();
        return { id: row.ItemId, name: row.Name };
      })
      .toSorted((a, b) => a.id.localeCompare(b.id));
    if (new Set(rows.map((row) => row.id)).size !== rows.length)
      throw invalid();
    return rows;
  }
  async function preview({
    username,
    folderIds,
  }: {
    username: string;
    folderIds: string[];
  }): Promise<JellyfinReview> {
    if (
      typeof username !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(username) ||
      !Array.isArray(folderIds) ||
      !folderIds.length ||
      new Set(folderIds).size !== folderIds.length
    )
      throw invalidInput(
        "Use 1–64 letters, digits, dots, underscores or hyphens for the Jellyfin username, starting with a letter or digit. Choose at least one library without duplicate selections.",
      );
    const available = await libraries();
    const folders = folderIds
      .map((id) => {
        const row = available.find((item) => item.id === id);
        if (!row)
          throw invalidInput(
            "The selected libraries are unavailable. Reload the libraries and start a new review.",
          );
        return row;
      })
      .toSorted((a, b) => a.id.localeCompare(b.id));
    const users = await request("Users");
    if (!Array.isArray(users) || users.length > 10000) throw invalid();
    const accounts = users.map((value: unknown) => {
      const row = nativeObject(value);
      if (
        typeof row.Name !== "string" ||
        typeof row.Id !== "string" ||
        !uuid.test(row.Id)
      )
        throw invalid();
      return { id: row.Id, name: row.Name };
    });
    if (
      accounts.some((row) => row.name.toLowerCase() === username.toLowerCase())
    )
      throw invalidInput(
        "That native username already exists. Choose a different username.",
      );
    return {
      username,
      folders,
      profile: "selected-library-playback-v1",
      nativePassword: "separate-from-auth",
      mapping: "separate-exact-id-review",
    };
  }
  return {
    libraries,
    preview,
    async inspectCreated(nativeId, review) {
      if (!uuid.test(nativeId)) throw invalid();
      const observed = nativeObject(await request(`Users/${nativeId}`));
      const policy = nativeObject(observed.Policy);
      const expected = newJellyfinPlaybackPolicy(
        observed,
        review.folders.map((folder) => folder.id),
      );
      // Failed-login counters are runtime state, not approval to broaden access.
      const actual = { ...policy, InvalidLoginAttemptCount: 0 };
      if (
        observed.Id !== nativeId ||
        observed.Name !== review.username ||
        !isDeepStrictEqual(actual, expected)
      )
        throw invalid();
    },
    async provision(review, { password, claimEffect, recordNativeId }) {
      if (
        typeof password !== "string" ||
        password.length < 16 ||
        password.length > 256
      )
        throw invalidInput(
          "Enter a separate native password of 16–256 characters.",
        );
      const current = await preview({
        username: review.username,
        folderIds: review.folders.map((row) => row.id),
      });
      if (!isDeepStrictEqual(current, review)) throw invalid();
      // No supported atomic create-with-policy endpoint exists. No usable credential
      // is released until the selected-library policy has been verified.
      await claimEffect();
      let nativeId: string | undefined;
      try {
        const created = nativeObject(
          await request("Users/New", {
            method: "POST",
            json: true,
            body: {
              Name: review.username,
              Password: randomBytes(48).toString("base64url"),
            },
          }),
        );
        if (typeof created.Id !== "string" || !uuid.test(created.Id))
          throw invalid();
        const returnedId: string = created.Id;
        nativeId = returnedId;
        // Durable receipt precedes all subsequent writes; never rediscover by name.
        await recordNativeId(returnedId);
        if (created.Name !== review.username) throw invalid();
        const policy = newJellyfinPlaybackPolicy(
          created,
          review.folders.map((row) => row.id),
        );
        await request(`Users/${nativeId}/Policy`, {
          method: "POST",
          body: policy,
        });
        const observed = nativeObject(await request(`Users/${nativeId}`));
        if (
          observed.Id !== nativeId ||
          observed.Name !== review.username ||
          !isDeepStrictEqual(observed.Policy, policy)
        )
          throw invalid();
        await request(`Users/Password?userId=${nativeId}`, {
          method: "POST",
          body: { NewPw: password, ResetPassword: false },
        });
        return {
          state: "created",
          nativeId,
          mapping: "separate-exact-id-review",
        };
      } catch {
        // Even a failed create response may have created a user. Never retry or
        // delete it automatically; no password, response or transport error escapes.
        return { state: "effect-unknown", ...(nativeId ? { nativeId } : {}) };
      }
    },
  };
}
