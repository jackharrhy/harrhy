import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import path from "node:path";

export interface Space {
  readonly id: string;
  readonly name: string;
  readonly directory: string;
  readonly optional?: boolean;
  readonly legacyRoutes?: boolean;
}

function invalid() {
  return new Error("Atlas manifest must be a valid bounded registry");
}

export async function loadSpaces(filename: string): Promise<readonly Space[]> {
  if (!path.isAbsolute(filename)) throw invalid();
  try {
    let current = path.parse(filename).root;
    for (const part of filename
      .slice(current.length)
      .split(path.sep)
      .slice(0, -1)) {
      current = path.join(current, part);
      const stat = await lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw invalid();
    }
    const file = await open(
      filename,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    let source: string;
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > 131072) throw invalid();
      const buffer = Buffer.alloc(131073);
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      if (bytesRead > 131072) throw invalid();
      source = buffer.subarray(0, bytesRead).toString("utf8");
    } finally {
      await file.close();
    }
    const data = JSON.parse(source);
    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      Object.keys(data).some((key) => key !== "spaces") ||
      !Array.isArray(data.spaces) ||
      data.spaces.length > 64
    )
      throw invalid();
    const ids = new Set<string>();
    const directories = new Set<string>();
    let legacy = false;
    return Object.freeze(
      data.spaces.map((entry: Record<string, unknown>) => {
        if (
          !entry ||
          typeof entry !== "object" ||
          Array.isArray(entry) ||
          Object.keys(entry).some(
            (key) =>
              !["id", "name", "directory", "optional", "legacyRoutes"].includes(
                key,
              ),
          ) ||
          typeof entry.id !== "string" ||
          !/^[a-z][a-z0-9-]{0,63}$/.test(entry.id) ||
          typeof entry.name !== "string" ||
          !entry.name.trim() ||
          entry.name !== entry.name.trim() ||
          entry.name.length > 120 ||
          /[\p{Cc}\p{Cf}]/u.test(entry.name) ||
          typeof entry.directory !== "string" ||
          !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(entry.directory) ||
          ids.has(entry.id) ||
          directories.has(entry.directory) ||
          (entry.optional !== undefined &&
            typeof entry.optional !== "boolean") ||
          (entry.legacyRoutes !== undefined &&
            typeof entry.legacyRoutes !== "boolean") ||
          (entry.legacyRoutes && legacy)
        )
          throw invalid();
        ids.add(entry.id);
        directories.add(entry.directory);
        if (entry.legacyRoutes) legacy = true;
        return Object.freeze({ ...entry }) as unknown as Space;
      }),
    );
  } catch {
    throw invalid();
  }
}

export function spacePath(id: string) {
  return `/spaces/${id}`;
}
