import { css } from "remix/component";
import type { ThemeTokens } from "@harrhy/ui/theme";
import type { BaseballFieldPaint } from "@harrhy/ui/baseball";

export interface LabPartTokens {
  panelImage: string;
  headingImage: string;
  headingInk: string;
  panelEdge: string;
  cardRadius: string;
  matchColumns: string;
  contentColumns: string;
}
export function labPartStyles(parts: LabPartTokens) {
  return css({
    "--lab-panel-image": parts.panelImage,
    "--lab-heading-image": parts.headingImage,
    "--lab-heading-ink": parts.headingInk,
    "--lab-panel-edge": parts.panelEdge,
    "--lab-card-radius": parts.cardRadius,
    "--lab-match-columns": parts.matchColumns,
    "--lab-content-columns": parts.contentColumns,
  });
}
export interface LabConcept {
  id: string;
  name: string;
  summary: string;
  source: string;
  changes: string;
  tokens: Readonly<ThemeTokens>;
  parts: LabPartTokens;
  field: BaseballFieldPaint;
  recipe: ReturnType<typeof css>;
}
