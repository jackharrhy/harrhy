import { css } from "remix/component";
import { composeTheme } from "@harrhy/ui/theme";
import { pennant } from "./pennant.ts";
import { originalBlue, originalSteel } from "../original.ts";
import type { LabConcept } from "./types.ts";

export const pennantCanopy: LabConcept = {
  ...pennant,
  id: "pennant-canopy",
  name: "Pennant Canopy",
  parent: "Pennant Park",
  summary:
    "A flowing glass scorebook: full-width shelves, soft frosting and wide cobalt header ribbons.",
  source:
    "Original translucent event panels; Pennant Park with rounded exhibition framing",
  changes:
    "Full-width panels replace the desktop sidebar. Three fixtures share a broad shelf, then standings span the next shelf. Light 3px frosting and rounded capsule portraits soften the original tinted material without white glass.",
  tokens: composeTheme(pennant.tokens, {
    panelRadius: "24px",
    controlRadius: "22px",
    tableSurface: "transparent",
    tableCellPadding: "10px 16px",
  }),
  parts: {
    ...pennant.parts,
    panelImage: `linear-gradient(${originalBlue[700]}38,${originalBlue[800]}66)`,
    panelSurface: `${originalSteel}3d`,
    panelFilter: "blur(3px)",
    headingImage: `linear-gradient(100deg,${originalBlue[400]},${originalBlue[700]})`,
    cardRadius: "20px",
    contentColumns: "minmax(0,1fr)",
    matchColumns: "repeat(3,minmax(0,1fr))",
  },
  recipe: css({
    "& [data-panel-title]": { padding: "16px 22px", fontSize: "20px" },
    "& [data-match]": {
      background: `${originalBlue[700]}73`,
      padding: "20px 14px",
    },
    "& [data-roster-card]": {
      background: `${originalBlue[700]}80`,
      borderRadius: "24px",
      padding: "18px 12px",
    },
    "@media (min-width: 1001px)": {
      "& [data-two-columns]": {
        gridTemplateColumns: "minmax(0,1fr) minmax(0,1.2fr)",
      },
    },
    "@media (min-width: 481px) and (max-width: 1000px)": {
      "& [data-match-list]": { gridTemplateColumns: "repeat(2,minmax(0,1fr))" },
    },
  }),
};
