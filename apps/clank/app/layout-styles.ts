import { css } from "remix/component";
import { phoneWidth } from "./sidebar/swipe.ts";

export const phone = `@media ${phoneWidth}`;

export const titleStyle = css({
  margin: 0,
  fontSize: "0.9375rem",
  fontWeight: 600,
  overflowWrap: "anywhere",
});

export const iconAction = css({
  width: "2rem",
  padding: 0,
  minHeight: "2rem",
  flex: "none",
  [phone]: { width: "2.75rem", minHeight: "2.75rem" },
});
