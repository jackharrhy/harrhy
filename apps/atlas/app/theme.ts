import { createCookie } from "remix/cookie";
import {
  cleanTheme,
  tactileTheme,
  brutalistTheme,
  themeStyles,
  composeTheme,
} from "@harrhy/ui/theme";

export const themes = [
  { id: "clean", name: "Clean", tokens: cleanTheme },
  { id: "tactile", name: "Radio", tokens: tactileTheme },
  { id: "brutalist", name: "Artbin", tokens: brutalistTheme },
] as const;
export type ThemeId = (typeof themes)[number]["id"];
export const themeMixins = Object.fromEntries(
  themes.map(({ id, tokens }) => [
    id,
    themeStyles(composeTheme(tokens, { textSize: "18px", lineHeight: "1.7" })),
  ]),
);
const preference = createCookie("atlas-theme", {
  path: "/",
  httpOnly: true,
  sameSite: "Lax",
  maxAge: 31536000,
});
function valid(value: unknown): value is ThemeId {
  return themes.some((theme) => theme.id === value);
}
export async function requestTheme(request: Request) {
  const url = new URL(request.url);
  const selected = url.searchParams.get("theme");
  const saved: unknown = await preference.parse(request.headers.get("Cookie"));
  const theme: ThemeId = valid(selected)
    ? selected
    : valid(saved)
      ? saved
      : "clean";
  return {
    theme,
    cookie: valid(selected)
      ? await preference.serialize(theme, { secure: url.protocol === "https:" })
      : undefined,
  };
}
