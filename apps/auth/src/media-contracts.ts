export interface CreationEffects {
  claimEffect(): Promise<void>;
  recordNativeId(nativeId: string): Promise<void>;
}
export type CreationResult =
  | { state: "created"; nativeId: string; mapping: "separate-exact-id-review" }
  | { state: "effect-unknown"; nativeId?: string };
export type ProvisioningState = "review" | "effect-unknown" | "created";
export type ProvisioningEventState = ProvisioningState | "native-id-recorded";
export interface Folder {
  id: string;
  name: string;
}
export interface JellyfinReview {
  username: string;
  folders: Folder[];
  profile: "selected-library-playback-v1";
  nativePassword: "separate-from-auth";
  mapping: "separate-exact-id-review";
}
export interface SeerrReview {
  jellyfinNativeId: string;
  username: string;
  permissions: 160;
  permissionMeaning: "request-and-auto-approve";
  userType: 3;
  profile: "exact-jellyfin-import-v1";
  mapping: "separate-exact-id-review";
}
export interface JellyfinProvisioning {
  libraries(): Promise<Folder[]>;
  preview(input: {
    username: string;
    folderIds: string[];
  }): Promise<JellyfinReview>;
  provision(
    review: JellyfinReview,
    effects: CreationEffects & { password: string },
  ): Promise<CreationResult>;
}
export interface SeerrProvisioning {
  preview(input: { jellyfinNativeId: string }): Promise<SeerrReview>;
  provision(
    review: SeerrReview,
    effects: CreationEffects,
  ): Promise<CreationResult>;
}
interface Target {
  instance: string;
  issuer: string;
  subject: string;
}
export interface JellyfinTarget extends Target {
  service: "jellyfin";
}
export interface SeerrTarget extends Target {
  service: "seerr";
  sourceInstance: string;
  sourceNativeId: string;
}
export type CreationBody =
  | { target: JellyfinTarget; reason: string; review: JellyfinReview }
  | { target: SeerrTarget; reason: string; review: SeerrReview };
export function isJellyfinCreation(
  body: CreationBody,
): body is Extract<CreationBody, { target: JellyfinTarget }> {
  return body.target.service === "jellyfin";
}
export type Creation = {
  id: string;
  actor: string;
  created_at: string;
  body: CreationBody;
} & (
  | { state: "review"; native_id: null }
  | { state: "effect-unknown"; native_id: string | null }
  | { state: "created"; native_id: string }
);
export interface WriteConfig {
  baseUrl: string;
  writeTokenFile: string;
}
export interface NativeDependencies {
  fetcher?: typeof fetch;
  readToken?: (path: string, encoding: "utf8") => Promise<string>;
}
export interface ProvisioningResolver {
  (target: { service: "jellyfin"; instance: string }): JellyfinProvisioning;
  (target: { service: "seerr"; instance: string }): SeerrProvisioning;
}
