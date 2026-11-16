import type {
  Creation,
  CreationEffects,
  CreationResult,
  JellyfinProvisioning,
  ProvisioningState,
  SeerrReview,
} from "../src/media-contracts.ts";

// These assignments must remain compiler errors, not runtime test cases.
export function incompatibleCreationContracts(
  jellyfin: JellyfinProvisioning,
  seerrReview: SeerrReview,
  effects: CreationEffects & { password: string },
) {
  // @ts-expect-error Seerr's native import review cannot authorize Jellyfin creation.
  jellyfin.provision(seerrReview, effects);
  // @ts-expect-error A completed creation must include its exact native receipt.
  const result: CreationResult = {
    state: "created",
    mapping: "separate-exact-id-review",
  };
  // @ts-expect-error The checkpoint is an audit event, never a persisted row state.
  const state: ProvisioningState = "native-id-recorded";
  // @ts-expect-error A created ledger row cannot lose its exact native receipt.
  const creation: Creation = {
    id: "review",
    actor: "operator",
    created_at: "timestamp",
    body: {
      target: {
        service: "seerr",
        instance: "local",
        issuer: "issuer",
        subject: "subject",
        sourceInstance: "local",
        sourceNativeId: "source",
      },
      reason: "reviewed",
      review: seerrReview,
    },
    state: "created",
    native_id: null,
  };
  return { result, state, creation };
}
