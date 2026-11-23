import { css } from "remix/component";
import type { IconSet } from "@harrhy/ui/icons";
import { desktopIconStyle } from "./desktop-styles.ts";

const symbol = css({ ...desktopIconStyle, fontSize: "16px" });
const filled = css({ fontVariationSettings: '"FILL" 1' });

export const dialIcons = {
  back: () => <span mix={symbol}>arrow_back</span>,
  play: () => <span mix={[symbol, filled]}>play_arrow</span>,
  pause: () => <span mix={[symbol, filled]}>pause</span>,
  power: () => <span mix={symbol}>power_settings_new</span>,
  sync: () => <span mix={symbol}>sync</span>,
} satisfies IconSet;
