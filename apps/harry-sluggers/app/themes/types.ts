import { css } from "remix/component";
import type { ThemeTokens } from "@harrhy/ui/theme";
import type { BaseballFieldPaint } from "@harrhy/ui/baseball";

export interface LabPartTokens {
  panelImage: string;
  panelFilter?: string;
  headingImage: string;
  headingInk: string;
  cardRadius: string;
  surfaceTint: string;
  matchColumns: string;
  contentColumns: string;
}
export function labPartStyles(parts: LabPartTokens) {
  // The original tiles use the same tint at 40% for the fill and 50% for the edge.
  const fill = `color-mix(in srgb, ${parts.surfaceTint} 40%, transparent)`;
  const edge = `color-mix(in srgb, ${parts.surfaceTint} 50%, transparent)`;
  return css({
    "--lab-panel-image": parts.panelImage,
    "--lab-panel-surface": fill,
    "--lab-panel-filter": parts.panelFilter ?? "none",
    "--lab-heading-image": parts.headingImage,
    "--lab-heading-ink": parts.headingInk,
    "--lab-surface-edge": edge,
    "--lab-solid-surface": `color-mix(in srgb, ${parts.surfaceTint} 40%, var(--hui-canvas))`,
    "--lab-card-radius": parts.cardRadius,
    "--lab-card-surface": fill,
    "--lab-inset-surface": `color-mix(in srgb, ${parts.surfaceTint} 50%, var(--hui-canvas))`,
    "--lab-match-columns": parts.matchColumns,
    "--lab-content-columns": parts.contentColumns,
  });
}
export interface LabConcept {
  id: string;
  name: string;
  parent?: "Pennant Broadcast" | "Dugout Frost";
  summary: string;
  source: string;
  changes: string;
  tokens: Readonly<ThemeTokens>;
  parts: LabPartTokens;
  field: BaseballFieldPaint;
  recipe: ReturnType<typeof css>;
}
