import { createHmac } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import path from "node:path";
import { createCommentBridge } from "./bridge.ts";

interface CommentConfiguration {
  readonly trust: "tailnet-owner-temporary";
  readonly articleOrigin: string;
  readonly stateDirectory: string;
  readonly bridgeEndpoint: string;
  readonly credentialFile: string;
  readonly defaultTargetKey: string;
}

async function privateFile(filename: string, limit: number): Promise<string> {
  if (!path.isAbsolute(filename))
    throw new Error("Private comment file must be absolute");
  let current = path.parse(filename).root;
  for (const part of filename
    .slice(current.length)
    .split(path.sep)
    .slice(0, -1)) {
    current = path.join(current, part);
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error("Invalid private comment path");
  }
  const file = await open(
    filename,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stat = await file.stat();
    if (
      !stat.isFile() ||
      stat.nlink !== 1 ||
      stat.uid !== process.getuid?.() ||
      (stat.mode & 0o077) !== 0 ||
      stat.size > limit
    )
      throw new Error("Comment configuration must be private and server-owned");
    const buffer = Buffer.alloc(limit + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead > limit)
      throw new Error("Private comment file exceeds limit");
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await file.close();
  }
}

export async function loadCommentConfiguration(filename: string) {
  const value: unknown = JSON.parse(await privateFile(filename, 16384));
  const keys = [
    "trust",
    "articleOrigin",
    "stateDirectory",
    "bridgeEndpoint",
    "credentialFile",
    "defaultTargetKey",
  ];
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw new Error("Invalid comment configuration");
  const config = value as CommentConfiguration;
  if (
    config.trust !== "tailnet-owner-temporary" ||
    keys.some(
      (key) => typeof (value as Record<string, unknown>)[key] !== "string",
    ) ||
    !/^[0-9a-f]{64}$/.test(config.defaultTargetKey) ||
    !path.isAbsolute(config.stateDirectory)
  )
    throw new Error("Invalid comment configuration");
  const origin = new URL(config.articleOrigin);
  if (
    origin.origin !== config.articleOrigin ||
    origin.username ||
    origin.password ||
    (origin.protocol !== "https:" &&
      !(
        origin.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)
      ))
  )
    throw new Error("Invalid comment article origin");
  // Credentials never become part of the browser configuration DTO.
  const token = (await privateFile(config.credentialFile, 4096)).replace(
    /\n$/,
    "",
  );
  const bridge = createCommentBridge({
    endpoint: config.bridgeEndpoint,
    token,
  });
  const csrfSecret = createHmac("sha256", token)
    .update("atlas-comments-csrf-v1\0")
    .update(config.articleOrigin)
    .digest("hex");
  return { config: Object.freeze(config), bridge, csrfSecret };
}
