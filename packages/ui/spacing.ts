import { scale, type DimensionToken } from "@pitlane/theme";

export const defaultSpaceUnit = "0.5rem";

export const space = scale(
  `var(--hui-space-unit, ${defaultSpaceUnit})` as DimensionToken,
);
