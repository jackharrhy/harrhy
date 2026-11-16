import { highlightCodeHtml } from "@harrhy/ui/highlight";

const THEME = "github-light";

export async function highlightTemplateSource(
  source: string | null,
  format: "html" | "mjml" | "text",
) {
  return highlightCodeHtml(source ?? "(text only)", {
    language: format === "text" ? "text" : "html",
    theme: THEME,
  });
}
