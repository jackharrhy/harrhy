export const modes = ["system", "light", "dark"] as const;
export type Mode = (typeof modes)[number];
const name = "__Host-clank-theme";

export function themeMode(value: string | null): Mode | undefined {
  return modes.find((mode) => mode === value);
}

// Parse just the preference slot. Never decode, pick a duplicate, or return other cookies.
export function readThemeCookie(header?: string): Mode | undefined {
  if (!header) return;
  let mode: Mode | undefined;
  for (const part of header.split(";")) {
    const pair = part.replace(/^[ \t]+/, "");
    const equals = pair.indexOf("=");
    const key = equals < 0 ? pair : pair.slice(0, equals);
    if (key.trimEnd() !== name) continue;
    if (mode || equals < 0 || key !== name) return;
    mode = themeMode(pair.slice(equals + 1));
    if (!mode) return;
  }
  return mode;
}

// Browser-writable appearance preference, never an identity or authorization signal.
export function themeCookie(mode: Mode): string {
  return `${name}=${mode}; Path=/; Secure; SameSite=Lax; Max-Age=31536000`;
}
