export const positionSlot = "clank:reading-positions";

// Also embedded in the CSP-hashed first-paint script. No module dependencies.
export function readPositions(storageKey: string): [string, number][] {
  try {
    const rows: unknown = JSON.parse(
      sessionStorage.getItem(storageKey) ?? "[]",
    );
    if (Array.isArray(rows))
      return rows
        .slice(-24)
        .filter(
          (r): r is [string, number] =>
            Array.isArray(r) &&
            r.length === 2 &&
            typeof r[0] === "string" &&
            Number.isFinite(r[1]) &&
            r[1] >= 0,
        );
  } catch {
    /* Storage is optional. */
  }
  return [];
}

let positions: Map<string, number> | undefined;
let dirty = false;
function current() {
  return (positions ??= new Map(readPositions(positionSlot)));
}
export const readingPosition = (key: string) => current().get(key);

// Keep synchronous storage off the scroll path; flush the latest sample on pagehide.
export function flushPositions() {
  if (!dirty) return;
  dirty = false;
  try {
    if (current().size)
      sessionStorage.setItem(positionSlot, JSON.stringify([...current()]));
    else sessionStorage.removeItem(positionSlot);
  } catch {
    /* In-memory positions still work for this visit. */
  }
}
export function rememberPosition(key: string, top: number | undefined) {
  const rows = current();
  if (rows.get(key) === top) return;
  rows.delete(key);
  if (top !== undefined) rows.set(key, Math.max(0, top));
  if (rows.size > 24) rows.delete(rows.keys().next().value!);
  dirty = true;
}
export function forgetPositions() {
  dirty = false;
  positions = new Map();
  try {
    sessionStorage.removeItem(positionSlot);
  } catch {
    /* unavailable */
  }
}
