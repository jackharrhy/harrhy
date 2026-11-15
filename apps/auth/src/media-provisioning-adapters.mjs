import { createJellyfinProvisioning } from "./jellyfin-provisioning.mjs";
import { createSeerrProvisioning } from "./seerr-provisioning.mjs";

// Shares the explicit host write configuration, never inventory credentials.
export function createMediaProvisioningAdapters(instances = []) {
  if (!Array.isArray(instances) || instances.length > 20)
    throw new Error("Invalid media write configuration");
  const adapters = new Map();
  const seen = new Set();
  for (const item of instances) {
    if (
      !item ||
      !["jellyfin", "seerr"].includes(item.service) ||
      typeof item.instance !== "string" ||
      !/^[A-Za-z0-9-]{1,100}$/.test(item.instance)
    )
      throw new Error("Invalid media write configuration");
    const key = JSON.stringify([item.service, item.instance]);
    if (seen.has(key)) throw new Error("Duplicate media write instance");
    seen.add(key);
    adapters.set(
      key,
      item.service === "jellyfin"
        ? createJellyfinProvisioning(item)
        : createSeerrProvisioning(item),
    );
  }
  return (target) => {
    const adapter = adapters.get(
      JSON.stringify([target.service, target.instance]),
    );
    if (!adapter)
      throw Object.assign(
        new Error(
          "Reviewed provisioning is not configured for this instance. No action was attempted.",
        ),
        { status: 503 },
      );
    return adapter;
  };
}
