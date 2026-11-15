import { readFile } from "node:fs/promises";

const limit = 1024 * 1024;
const invalid = () => new Error("Native inventory could not be verified");

function field(object, pascal) {
  const camel = pascal[0].toLowerCase() + pascal.slice(1);
  if (!object || typeof object !== "object" || Array.isArray(object))
    throw invalid();
  if (Object.hasOwn(object, pascal) && Object.hasOwn(object, camel))
    throw invalid();
  return object[Object.hasOwn(object, pascal) ? pascal : camel];
}

export function normalizeJellyfinUsers(value) {
  if (!Array.isArray(value) || value.length > 10000) throw invalid();
  const ids = new Set();
  return value.map((user) => {
    const nativeId = field(user, "Id");
    const name = field(user, "Name");
    const policy = field(user, "Policy");
    const administrator = field(policy, "IsAdministrator");
    const disabled = field(policy, "IsDisabled");
    if (
      typeof nativeId !== "string" ||
      !/^(?:[a-f0-9]{32}|[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})$/i.test(
        nativeId,
      ) ||
      ids.has(nativeId.replaceAll("-", "").toLowerCase()) ||
      (name !== null && (typeof name !== "string" || name.length > 200)) ||
      typeof administrator !== "boolean" ||
      typeof disabled !== "boolean"
    )
      throw invalid();
    ids.add(nativeId.replaceAll("-", "").toLowerCase());
    return {
      nativeId,
      name: name ?? "Unnamed native account",
      administrator,
      disabled,
    };
  });
}

export function createJellyfinInventory(
  { baseUrl, tokenFile, fullRosterReviewed },
  { fetcher = fetch, readToken = readFile } = {},
) {
  const url = new URL(baseUrl);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    typeof tokenFile !== "string" ||
    !tokenFile.startsWith("/")
  )
    throw invalid();
  const endpoint = new URL(`${url.pathname.replace(/\/$/, "")}/Users`, url);
  return async () => {
    if (fullRosterReviewed !== true) throw invalid();
    const token = (await readToken(tokenFile, "utf8")).trim();
    if (!/^[A-Za-z0-9._~-]{1,4096}$/.test(token)) throw invalid();
    const response = await fetcher(endpoint, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
      headers: {
        Accept: "application/json",
        Authorization: `MediaBrowser Token="${token}"`,
      },
    });
    if (
      !response.ok ||
      !response.body ||
      !response.headers.get("content-type")?.includes("application/json")
    )
      throw invalid();
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > limit) throw invalid();
      chunks.push(Buffer.from(chunk));
    }
    const accounts = normalizeJellyfinUsers(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
    return {
      state: "available",
      observedAt: new Date().toISOString(),
      accounts,
    };
  };
}
