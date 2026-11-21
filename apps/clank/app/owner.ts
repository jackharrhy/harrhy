// Ask Pi to evaluate its own owner cookie; Clank never mints or interprets it.
export function createOwnerGate(
  publicOrigin: URL,
  fetchPi: typeof fetch = fetch,
) {
  const check = new URL("/owner/check", publicOrigin);
  return async (request: Request): Promise<200 | 401 | 503> => {
    if (new URL(request.url).origin !== publicOrigin.origin) return 401;
    const origin = request.headers.get("Origin");
    if (origin !== null && origin !== publicOrigin.origin) return 401;
    const site = request.headers.get("Sec-Fetch-Site");
    if (site !== null && site !== "same-origin" && site !== "none") return 401;
    const cookie = request.headers.get("Cookie");
    if (!cookie) return 401;
    try {
      const response = await fetchPi(check, {
        headers: { Cookie: cookie, Accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(3000),
      });
      if (response.status === 401 || response.status === 403) return 401;
      if (!response.ok) return 503;
      const result: unknown = await response.json();
      return result !== null &&
        typeof result === "object" &&
        "owner" in result &&
        result.owner === true
        ? 200
        : 503;
    } catch {
      return 503;
    }
  };
}
