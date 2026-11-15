import { createSeerrApi } from "./seerr-api.mjs";
import { isDeepStrictEqual } from "node:util";

const invalid = () =>
  new Error("Seerr account removal contract could not be verified");
const exactId = (value) =>
  typeof value === "string" &&
  /^[1-9][0-9]*$/.test(value) &&
  Number.isSafeInteger(Number(value));

// Removal intentionally deletes requests. It is not disable or session revocation.
export function createSeerrLifecycle(config, dependencies = {}) {
  const request = createSeerrApi(config, dependencies);
  async function inspect(nativeId) {
    if (!exactId(nativeId) || nativeId === "1") throw invalid();
    const user = await request(`user/${nativeId}`);
    // The owner and administrators cannot be targeted by this product operation.
    if (
      user.id !== Number(nativeId) ||
      !Number.isSafeInteger(user.permissions) ||
      user.permissions < 0 ||
      (user.permissions & 2) !== 0
    )
      throw invalid();
    const requests = [];
    let count;
    for (let skip = 0; ; skip += 100) {
      const page = await request(
        `user/${nativeId}/requests?take=100&skip=${skip}`,
      );
      const total = page.pageInfo?.results;
      if (
        !Number.isSafeInteger(total) ||
        total < 0 ||
        total > 10000 ||
        (count !== undefined && count !== total) ||
        !Array.isArray(page.results) ||
        page.results.length > 100
      )
        throw invalid();
      count = total;
      for (const item of page.results) {
        if (
          !Number.isSafeInteger(item.id) ||
          item.id < 1 ||
          !Number.isSafeInteger(item.status) ||
          typeof item.updatedAt !== "string" ||
          !Number.isFinite(Date.parse(item.updatedAt)) ||
          item.requestedBy?.id !== Number(nativeId)
        )
          throw invalid();
        requests.push({
          id: item.id,
          status: item.status,
          updatedAt: item.updatedAt,
        });
      }
      if (requests.length === count) break;
      if (requests.length > count || page.results.length !== 100)
        throw invalid();
    }
    if (new Set(requests.map((item) => item.id)).size !== count)
      throw invalid();
    requests.sort((a, b) => a.id - b.id);
    return {
      nativeId,
      permissions: user.permissions,
      requestCount: count,
      requests,
      effect: "remove-account-and-requests",
      conditionalDelete: false,
    };
  }
  return {
    inspect,
    async removeAccountAndRequests(review, claimEffect) {
      const current = await inspect(review.nativeId);
      if (!isDeepStrictEqual(current, review)) throw invalid();
      // No conditional native delete exists: a concurrent request can arrive after review.
      await claimEffect();
      try {
        await request(`user/${review.nativeId}`, { method: "DELETE" });
        return { state: "removed", sessionRevocation: "not-claimed" };
      } catch {
        // Native route is not transactional; even a failed response can mean partial removal.
        return { state: "effect-unknown", sessionRevocation: "not-claimed" };
      }
    },
  };
}
