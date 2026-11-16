import { css } from "remix/component";
import { composeTheme } from "@harrhy/ui/theme";
import { pennant } from "./pennant.ts";
import { originalBlue } from "../original.ts";
import type { LabConcept } from "./types.ts";

export const pennantBroadcast: LabConcept = {
  ...pennant,
  id: "pennant-broadcast",
  name: "Pennant Broadcast",
  parent: "Pennant Park",
  summary:
    "An opaque broadcast board: oversized scores, deep gradient headers and a narrow standings ticker.",
  source: "Original match-stats scoreboard; Pennant Park gradient framing",
  changes:
    "A dominant result board takes two-thirds of the desktop, with close-set standings alongside it. Large score numerals and compact four-across portrait shelves emphasize the broadcast rather than glass.",
  tokens: composeTheme(pennant.tokens, {
    panelRadius: "8px",
    controlRadius: "8px",
    tableCellPadding: "8px 10px",
  }),
  parts: {
    ...pennant.parts,
    headingImage: `linear-gradient(${originalBlue[400]}, ${originalBlue[700]})`,
    panelImage: `linear-gradient(${originalBlue[600]}, ${originalBlue[800]})`,
    panelEdge: "2px solid #88b3df",
    cardRadius: "6px",
    contentColumns: "minmax(0,1.8fr) minmax(340px,1fr)",
  },
  recipe: css({
    "& [data-panel-title]": { padding: "16px", fontSize: "20px" },
    "& [data-match-score]": { fontSize: "36px" },
    "& [data-match]": {
      padding: "18px 12px",
      background: `linear-gradient(${originalBlue[500]}, ${originalBlue[700]})`,
    },
    "& [data-roster-card]": {
      background: originalBlue[700],
      borderRadius: "6px",
      gap: "3px",
    },
    "@media (min-width: 1001px)": {
      "& [data-roster-grid]": {
        gridTemplateColumns: "repeat(4,minmax(0,1fr))",
      },
    },
  }),
};
