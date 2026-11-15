import { createJellyfinLifecycle } from "./jellyfin-lifecycle.mjs";
import { createSeerrLifecycle } from "./seerr-lifecycle.mjs";

// This separate host-only configuration never falls back to roster credentials.
export function createMediaLifecycle(instances = []) {
  if (!Array.isArray(instances) || instances.length > 20)
    throw new Error("Invalid media write configuration");
  const adapters = new Map();
  for (const item of instances) {
    if (
      !item ||
      !["jellyfin", "seerr"].includes(item.service) ||
      typeof item.instance !== "string" ||
      !/^[A-Za-z0-9-]{1,100}$/.test(item.instance)
    )
      throw new Error("Invalid media write configuration");
    const key = JSON.stringify([item.service, item.instance]);
    if (adapters.has(key)) throw new Error("Duplicate media write instance");
    adapters.set(
      key,
      item.service === "jellyfin"
        ? createJellyfinLifecycle(item)
        : createSeerrLifecycle(item),
    );
  }
  return (mapping) => {
    const adapter = adapters.get(
      JSON.stringify([mapping.service, mapping.instance]),
    );
    if (!adapter)
      throw Object.assign(
        new Error(
          "Native writes are not configured for this instance. No action was attempted.",
        ),
        { status: 503 },
      );
    return adapter;
  };
}
