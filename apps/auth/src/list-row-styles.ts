import { space } from "@harrhy/ui/styles";
import { css } from "remix/component";

export const listRowStyles = css({
  display: "grid",
  gridTemplateColumns: "38px minmax(180px, 1fr) 110px 90px 92px",
  gap: space(2),
  alignItems: "center",
  minHeight: "85px",
  padding: `${space(2.25)} ${space(1.5)}`,
  borderBottom: "1px solid var(--line)",
  color: "var(--ink)",
  textDecoration: "none",
  "&:hover": { background: "#eef1f3" },
  "& strong": { display: "block", fontSize: "14px" },
  "& .muted": { display: "block", fontSize: "12px", marginTop: space(0.5) },
  "@media (prefers-color-scheme: dark)": {
    "&:hover": { background: "#20262a" },
  },
});

export const personRowStyles = css({
  "@media (max-width: 1000px)": {
    gridTemplateColumns: "30px minmax(130px, 1fr) 95px 65px",
  },
  "@media (max-width: 760px)": {
    gridTemplateColumns: "28px minmax(110px, 1fr) auto",
    gap: space(1.25),
    padding: `${space(1.875)} 0`,
  },
});

export const groupRowStyles = css({
  gridTemplateColumns: "minmax(200px, 1fr) 100px 180px",
  "& > span:not(:first-child)": {
    fontSize: "12px",
    color: "var(--muted)",
  },
  "@media (max-width: 760px)": {
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: space(1.25),
    padding: `${space(2.25)} 0`,
    "& > span:last-child": { gridColumn: "1/-1" },
  },
});

export const operationRowStyles = css({
  gridTemplateColumns: "minmax(200px, 1fr) auto",
  "@media (max-width: 760px)": {
    gap: space(1.5),
    padding: `${space(2.25)} 0`,
    "& > span:first-child": { minWidth: 0, overflowWrap: "anywhere" },
  },
});

export const personInitialStyles = css({
  fontSize: "18px",
  color: "#586d7b",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "32px",
  height: "36px",
  "@media (prefers-color-scheme: dark)": { color: "#a8c1d2" },
});
