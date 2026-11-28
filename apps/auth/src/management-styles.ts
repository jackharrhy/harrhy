import { space } from "@harrhy/ui/styles";
import { css } from "remix/component";

export const managementStyles = css({
  "& .filters": {
    display: "flex",
    gap: space(1.75),
    alignItems: "end",
    marginBottom: space(2.75),
  },
  "& .filters label:first-child": { flex: 1, maxWidth: "430px" },
  "& .filters label": { fontSize: "13px" },
  "& .filters select": { minWidth: "180px" },
  "& .result-count": {
    fontSize: "12px",
    color: "var(--muted)",
    marginBottom: space(1.5),
  },
  "& .people-list": { borderTop: "1px solid var(--line)" },
  "& .row-action": {
    fontSize: "12px",
    color: "var(--blue)",
    textAlign: "right",
  },
  "& .row-meta": { fontSize: "12px", color: "var(--muted)" },
  "& .status-label": {
    display: "inline-block",
    fontSize: "12px",
    lineHeight: 1.5,
    padding: `${space(0.375)} ${space(1)}`,
    background: "#e9edf0",
    color: "#3c4d5b",
    borderRadius: "4px",
    fontWeight: 450,
  },
  "& .table-frame": { width: "100%", overflow: "auto" },
  "& table": {
    width: "100%",
    borderCollapse: "collapse",
    textAlign: "left",
    lineHeight: 1.6,
  },
  "& th": {
    fontWeight: 450,
    fontSize: "12px",
    color: "var(--muted)",
    padding: `0 ${space(2.25)} ${space(1.5)} 0`,
  },
  "& td": {
    borderTop: "1px solid var(--line)",
    padding: `${space(2.25)} ${space(2.25)} ${space(2.25)} 0`,
    verticalAlign: "top",
    fontSize: "13px",
    maxWidth: "420px",
  },
  "& td:first-child": { minWidth: "140px" },
  "& .table-subline": {
    display: "block",
    marginTop: space(0.75),
    color: "var(--muted)",
    fontSize: "12px",
  },
  "& .membership-row": {
    padding: `${space(2.25)} 0`,
    borderBottom: "1px solid var(--line)",
    display: "grid",
    gridTemplateColumns: "220px minmax(0, 1fr)",
    gap: space(3),
  },
  "& .membership-row > .form-stack": { maxWidth: "530px" },
  "& .membership-row > a": { fontWeight: 600 },
  "& .settings-row": {
    display: "grid",
    gridTemplateColumns: "minmax(180px, 0.8fr) minmax(0, 1.2fr)",
    gap: space(6.25),
    borderTop: "1px solid var(--line)",
    padding: `${space(3.75)} 0`,
  },
  "& .settings-row > div > p": {
    color: "var(--muted)",
    fontSize: "13px",
  },
  "& .check": {
    display: "flex",
    alignItems: "center",
    gap: space(1.125),
    fontWeight: 400,
    margin: `${space(1.25)} 0`,
    overflowWrap: "anywhere",
  },
  "& .role-options": {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: `${space(2.5)} ${space(3.75)}`,
  },
  "& .role-options > div": {
    padding: `${space(1.875)} 0`,
    borderTop: "1px solid var(--line)",
  },
  "& .compact-row": {
    padding: `${space(1.5)} 0`,
    borderBottom: "1px solid var(--line)",
  },
  "& .cleanup-item": {
    padding: `${space(2.25)} 0`,
    borderTop: "1px solid var(--line)",
  },
  "& .cleanup-item > .form-stack": { marginTop: space(2.5) },
});
