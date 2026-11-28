export const modes = ["system", "light", "dark"] as const;
export type Mode = (typeof modes)[number];
export const tints = ["pi", "slate", "sage", "plum"] as const;
export type Tint = (typeof tints)[number];
const modeSlot = "__Host-clank-theme";
const tintSlot = "__Host-clank-tint";

export function themeMode(value: string | null): Mode | undefined {
  return modes.find((mode) => mode === value);
}

// Parse just the preference slot. Never decode, pick a duplicate, or return other cookies.
function preference<T extends string>(
  header: string | undefined,
  name: string,
  choices: readonly T[],
): T | undefined {
  if (!header) return;
  let value: T | undefined;
  for (const part of header.split(";")) {
    const pair = part.replace(/^[ \t]+/, "");
    const equals = pair.indexOf("=");
    const key = equals < 0 ? pair : pair.slice(0, equals);
    if (key.trimEnd() !== name) continue;
    if (value || equals < 0 || key !== name) return;
    value = choices.find((choice) => choice === pair.slice(equals + 1));
    if (!value) return;
  }
  return value;
}
export const readThemeCookie = (header?: string) =>
  preference(header, modeSlot, modes);
export const readTintCookie = (header?: string) =>
  preference(header, tintSlot, tints);

// Browser-writable appearance preference, never an identity or authorization signal.
export const themeCookie = (mode: Mode) => cookie(modeSlot, mode);
export const tintCookie = (tint: Tint) => cookie(tintSlot, tint);
function cookie(name: string, value: string): string {
  return `${name}=${value}; Path=/; Secure; SameSite=Lax; Max-Age=31536000`;
}
