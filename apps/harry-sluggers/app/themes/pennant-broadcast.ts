import { space } from "@harrhy/ui/styles";
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
    panelRadius: "8px",
    controlRadius: "8px",
    tableCellPadding: `${space(1)} ${space(1.25)}`,
  }),
  parts: {
    headingInk: "#ffffff",
    matchColumns: "minmax(0,1fr)",
    headingImage: `linear-gradient(${originalBlue[400]}, ${originalBlue[700]})`,
    panelImage:
      "linear-gradient(180deg, rgb(255 255 255 / .04), transparent 48%)",
    cardRadius: "6px",
    surfaceTint: "#457dc8",
    contentColumns: "minmax(0,1.8fr) minmax(340px,1fr)",
  },
  recipe: css({
    "& [data-panel-title]": { padding: space(2), fontSize: "20px" },
    "& [data-match]": {
      padding: `${space(2.25)} ${space(1.5)}`,
      background: "var(--lab-card-surface)",
    },
    "& [data-roster-card]": {
      borderRadius: "6px",
      gap: space(0.375),
    },
    "@media (min-width: 1001px)": {
      "& [data-roster-grid]:not([data-catalogue-grid])": {
        gridTemplateColumns: "repeat(4,minmax(0,1fr))",
      },
    },
  }),
};
