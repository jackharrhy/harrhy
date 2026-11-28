import { css } from "remix/component";
import { composeTheme } from "@harrhy/ui/theme";
import { archiveTokens, archiveField } from "./foundation.ts";
import { originalBlue } from "../original.ts";
import type { LabConcept } from "./types.ts";

export const pennantBroadcast: LabConcept = {
  field: archiveField,
  id: "pennant-broadcast",
  name: "Pennant Broadcast",
  summary:
    "An opaque broadcast board: oversized scores, deep gradient headers and a narrow standings ticker.",
  source: "Original match-stats scoreboard; Pennant Park gradient framing",
  changes:
    "A dominant result board takes two-thirds of the desktop, with close-set standings alongside it. Large score numerals and compact four-across portrait shelves emphasize the broadcast rather than glass.",
  tokens: composeTheme(archiveTokens, {
    selectedSurface: "#9a303c",
    hoverSurface: "#9a303c",
    panelRadius: "0.5rem",
    controlRadius: "0.5rem",
    tableCellPadding: "0.5rem 0.625rem",
  }),
  parts: {
    headingInk: "#ffffff",
    matchColumns: "minmax(0,1fr)",
    headingImage: `linear-gradient(${originalBlue[400]}, ${originalBlue[700]})`,
    panelImage: `linear-gradient(${originalBlue[600]}, ${originalBlue[800]})`,
    panelEdge: "0.125rem solid #88b3df",
    cardRadius: "0.375rem",
    contentColumns: "minmax(0,1.8fr) minmax(21.25rem,1fr)",
  },
  recipe: css({
    "& [data-panel-title]": { padding: "1rem", fontSize: "1.25rem" },
    "& [data-match]": {
      padding: "1.125rem 0.75rem",
      background: `linear-gradient(${originalBlue[500]}, ${originalBlue[700]})`,
    },
    "& [data-roster-card]": {
      background: originalBlue[700],
      borderRadius: "0.375rem",
      gap: "0.1875rem",
    },
    "@media (min-width: 62.5625rem)": {
      "& [data-roster-grid]:not([data-catalogue-grid])": {
        gridTemplateColumns: "repeat(4,minmax(0,1fr))",
      },
    },
  }),
};
