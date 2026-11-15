import { createJellyfinProvisioning } from "./jellyfin-provisioning.ts";
import { createSeerrProvisioning } from "./seerr-provisioning.ts";
import type {
  JellyfinProvisioning,
  SeerrProvisioning,
  WriteConfig,
} from "./media-contracts.ts";

type Instance = WriteConfig & {
  service: "jellyfin" | "seerr";
  instance: string;
};

// Shares the explicit host write configuration, never inventory credentials.
export function createMediaProvisioningAdapters(instances: Instance[] = []) {
  if (!Array.isArray(instances) || instances.length > 20)
    throw new Error("Invalid media write configuration");
  const jellyfin = new Map<string, JellyfinProvisioning>();
  const seerr = new Map<string, SeerrProvisioning>();
  for (const item of instances) {
    if (
      !item ||
      !["jellyfin", "seerr"].includes(item.service) ||
      typeof item.instance !== "string" ||
      !/^[A-Za-z0-9-]{1,100}$/.test(item.instance)
    )
      throw new Error("Invalid media write configuration");
    if (item.service === "jellyfin") {
      if (jellyfin.has(item.instance))
        throw new Error("Duplicate media write instance");
      jellyfin.set(item.instance, createJellyfinProvisioning(item));
    } else {
      if (seerr.has(item.instance))
        throw new Error("Duplicate media write instance");
      seerr.set(item.instance, createSeerrProvisioning(item));
    }
  }
  function resolve(target: {
    service: "jellyfin";
    instance: string;
  }): JellyfinProvisioning;
  function resolve(target: {
    service: "seerr";
    instance: string;
  }): SeerrProvisioning;
  function resolve(target: { service: string; instance: string }) {
    const adapter =
      target.service === "jellyfin"
        ? jellyfin.get(target.instance)
        : target.service === "seerr"
          ? seerr.get(target.instance)
          : undefined;
    if (!adapter)
      throw Object.assign(
        new Error(
          "Reviewed provisioning is not configured for this instance. No action was attempted.",
        ),
        { status: 503 },
      );
    return adapter;
  }
  return resolve;
}
