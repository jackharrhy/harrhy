import { clientLinkPath } from "../../pi/src/runtime/stale-page.ts";

export const CHORD_PATH = clientLinkPath("script");

export const SESSION_LIST_PATH = "/list/other";

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
export const validSlug = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[a-z0-9]+(?:-[a-z0-9]+)*(?![\s\S])/.test(value) &&
  value.length <= 64 &&
  !uuid.test(value);

export function sessionKey(path: string) {
  const match = /^\/session\/([^/]+)$/.exec(path);
  const key = match?.[1];
  return key && (uuid.test(key) || validSlug(key)) ? key : undefined;
}

export function findSession<T extends { id: string; slug?: string }>(
  rows: readonly T[],
  key: string,
) {
  return uuid.test(key)
    ? rows.find((row) => row.id === key)
    : rows.find((row) => row.slug === key);
}

export function sessionPath(row: { id: string; slug?: string }) {
  return "/session/" + (validSlug(row.slug) ? row.slug : row.id);
}

export function canonicalSessionRedirect(
  key: string | undefined,
  row: { id: string; slug?: string } | undefined,
) {
  if (row && key === row.id && uuid.test(key) && validSlug(row.slug))
    return sessionPath(row);
}
