import { css } from "remix/component";
import { composeTheme } from "@harrhy/ui/theme";
import { pennant } from "./pennant.ts";
import { originalBlue, originalSteel } from "../original.ts";
import type { LabConcept } from "./types.ts";

export const pennantVeranda: LabConcept = {
  ...pennant,
  id: "pennant-veranda",
  name: "Pennant Veranda",
  parent: "Pennant Park",
  summary:
    "Open broadcast windows: original steel-blue translucency, broad gutters and rounded fixtures.",
  source:
    "Original TeamStandings bg-cell-gray/30 and MatchDayCard bg-cell-gray/40; Pennant Park",
  changes:
    "Unblurred translucent scorebook windows reveal the original circles. Wide rounded fixtures sit in two columns, with a broad standings rail and open portrait shelves. Controls and heading strips remain opaque.",
  tokens: composeTheme(pennant.tokens, {
    panelRadius: "20px",
    tableSurface: "transparent",
    tableHeader: originalBlue[700],
    tableCellPadding: "12px 14px",
  }),
  parts: {
    ...pennant.parts,
    panelImage: `linear-gradient(${originalBlue[700]}2e,${originalBlue[700]}2e)`,
    panelSurface: `${originalSteel}4c`,
    panelFilter: "none",
    cardRadius: "18px",
    contentColumns: "minmax(0,1.2fr) minmax(360px,1fr)",
  },
  recipe: css({
    "& [data-lab-panel]": { boxShadow: "0 5px 14px rgb(17 45 112 / .14)" },
    "& [data-match]": {
      background: `${originalBlue[700]}59`,
      padding: "20px 16px",
    },
    "& [data-roster-card]": {
      background: `${originalBlue[700]}73`,
      borderRadius: "18px",
      padding: "16px 10px",
    },
    "& [data-panel-title]": { padding: "14px 18px" },
  }),
};
