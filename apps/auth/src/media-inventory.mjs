import { open } from "node:fs/promises";
import { createJellyfinInventory } from "./jellyfin-inventory.mjs";

const limit = 1024 * 1024;
const invalid = () => new Error("Invalid media inventory configuration");

export function createMediaInventory(instances = []) {
  if (!Array.isArray(instances) || instances.length > 20) throw invalid();
  const keys = new Set();
  const configured = instances.map((item) => {
    if (
      !["jellyfin", "seerr", "navidrome"].includes(item.service) ||
      typeof item.instance !== "string" ||
      !/^[A-Za-z0-9-]{1,100}$/.test(item.instance) ||
      typeof item.name !== "string" ||
      !item.name.trim() ||
      item.name.length > 100 ||
      (item.adapter !== "jellyfin" &&
        (typeof item.snapshotFile !== "string" ||
          !item.snapshotFile.startsWith("/"))) ||
      (item.adapter !== undefined && item.adapter !== "jellyfin") ||
      (item.adapter === "jellyfin" &&
        (item.service !== "jellyfin" || item.snapshotFile !== undefined))
    )
      throw invalid();
    const key = JSON.stringify([item.service, item.instance]);
    if (keys.has(key)) throw invalid();
    keys.add(key);
    return {
      service: item.service,
      instance: item.instance,
      name: item.name,
      snapshotFile: item.snapshotFile,
      reader:
        item.adapter === "jellyfin" ? createJellyfinInventory(item) : null,
    };
  });
  return {
    instances: () =>
      configured.map(({ service, instance, name }) => ({
        service,
        instance,
        name,
      })),
    async read(service, instance) {
      const source = configured.find(
        (item) => item.service === service && item.instance === instance,
      );
      if (!source)
        throw Object.assign(new Error("Media instance not found."), {
          status: 404,
        });
      let file;
      try {
        if (source.reader)
          return { service, instance, ...(await source.reader()) };
        file = await open(source.snapshotFile, "r");
        const stat = await file.stat();
        if (!stat.isFile() || stat.size > limit) throw invalid();
        const buffer = Buffer.alloc(limit + 1);
        const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
        if (bytesRead > limit) throw invalid();
        const value = JSON.parse(
          buffer.subarray(0, bytesRead).toString("utf8"),
        );
        if (
          value.service !== service ||
          value.instance !== instance ||
          value.state !== "available" ||
          !Array.isArray(value.accounts) ||
          value.accounts.length > 10000 ||
          typeof value.observedAt !== "string" ||
          !Number.isFinite(Date.parse(value.observedAt))
        )
          throw invalid();
        const ids = new Set();
        const accounts = value.accounts.map((account) => {
          if (
            typeof account.nativeId !== "string" ||
            !account.nativeId.trim() ||
            account.nativeId.length > 200 ||
            ids.has(account.nativeId) ||
            typeof account.name !== "string" ||
            account.name.length > 200 ||
            typeof account.disabled !== "boolean" ||
            typeof account.administrator !== "boolean"
          )
            throw invalid();
          ids.add(account.nativeId);
          return {
            nativeId: account.nativeId,
            name: account.name,
            disabled: account.disabled,
            administrator: account.administrator,
          };
        });
        return {
          service,
          instance,
          state: "available",
          observedAt: value.observedAt,
          accounts,
        };
      } catch {
        return {
          service,
          instance,
          state: "unavailable",
          observedAt: null,
          accounts: [],
        };
      } finally {
        await file?.close();
      }
    },
  };
}
