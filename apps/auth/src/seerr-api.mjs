import { readFile } from "node:fs/promises";

const invalid = () => new Error("Seerr native contract could not be verified");

/**
 * @param {import("./media-contracts.ts").WriteConfig} config
 * @param {import("./media-contracts.ts").NativeDependencies} [dependencies]
 */
export function createSeerrApi(
  { baseUrl, writeTokenFile },
  { fetcher = fetch, readToken = readFile } = {},
) {
  const base = new URL(baseUrl);
  if (
    !["http:", "https:"].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    typeof writeTokenFile !== "string" ||
    !writeTokenFile.startsWith("/")
  )
    throw invalid();
  /** @returns {Promise<unknown>} */
  return async function request(
    path,
    {
      method = "GET",
      body,
      json = method === "GET",
      allowNotFound = false,
    } = {},
  ) {
    const token = (await readToken(writeTokenFile, "utf8")).trim();
    if (!/^[A-Za-z0-9._~+/-]{1,4094}={0,2}$/.test(token)) throw invalid();
    const response = await fetcher(
      new URL(`${base.pathname.replace(/\/$/, "")}/${path}`, base),
      {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(5000),
        headers: {
          Accept: "application/json",
          "X-Api-Key": token,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    );
    if (allowNotFound && response.status === 404) return null;
    if (!response.ok) throw invalid();
    if (!json) return;
    if (
      !response.body ||
      !response.headers.get("content-type")?.includes("application/json")
    )
      throw invalid();
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > 1024 * 1024) throw invalid();
      chunks.push(Buffer.from(chunk));
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  };
}
