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
const uuid = /^(?:[a-f0-9]{32}|[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})$/i;

// This profile is only for a newly returned native ID, never an incumbent policy.
export function newJellyfinPlaybackPolicy(
  user: {
    Id?: unknown;
    Policy?: {
      IsAdministrator?: unknown;
      AuthenticationProviderId?: unknown;
      PasswordResetProviderId?: unknown;
    };
  },
  folders: string[],
) {
  if (
    typeof user?.Id !== "string" ||
    !uuid.test(user.Id) ||
    user.Policy?.IsAdministrator !== false ||
    typeof user.Policy.AuthenticationProviderId !== "string" ||
    !user.Policy.AuthenticationProviderId ||
    typeof user.Policy.PasswordResetProviderId !== "string" ||
    !user.Policy.PasswordResetProviderId ||
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
    AuthenticationProviderId: user.Policy.AuthenticationProviderId,
    PasswordResetProviderId: user.Policy.PasswordResetProviderId,
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
      .map((row) => {
        if (
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
      throw invalid();
    const available = await libraries();
    const folders = folderIds
      .map((id) => {
        const row = available.find((item) => item.id === id);
        if (!row) throw invalid();
        return row;
      })
      .toSorted((a, b) => a.id.localeCompare(b.id));
    const accounts = await request("Users");
    if (
      !Array.isArray(accounts) ||
      accounts.length > 10000 ||
      accounts.some((row) => typeof row.Name !== "string" || !uuid.test(row.Id))
    )
      throw invalid();
    if (
      accounts.some((row) => row.Name.toLowerCase() === username.toLowerCase())
    )
      throw invalid();
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
    async provision(review, { password, claimEffect, recordNativeId }) {
      if (
        typeof password !== "string" ||
        password.length < 16 ||
        password.length > 256
      )
        throw invalid();
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
        const created = await request("Users/New", {
          method: "POST",
          json: true,
          body: {
            Name: review.username,
            Password: randomBytes(48).toString("base64url"),
          },
        });
        if (!uuid.test(created?.Id)) throw invalid();
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
        const observed = await request(`Users/${nativeId}`);
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
