const day = 86_400_000;

export function isRecent(
  row: { id: string; updatedAt: number; pinned: boolean },
  selected: string | undefined,
  now: number,
) {
  return row.pinned || row.id === selected || now - row.updatedAt < 3 * day;
}

export function age(time: number, now: number) {
  const seconds = Math.max(0, (now - time) / 1000);
  if (seconds < 60) return "now";
  if (seconds < 3600) return Math.floor(seconds / 60) + "m";
  if (seconds < 86400) return Math.floor(seconds / 3600) + "h";
  if (seconds < 604800) return Math.floor(seconds / 86400) + "d";
  return new Date(time).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
