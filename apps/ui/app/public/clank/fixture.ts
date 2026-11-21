// All four sessions and their file receipts are synthetic.
export const sessions = [
  {
    name: "Align the trim marks",
    id: "024",
    time: "14:32",
    note: "Proof geometry",
    prompt:
      "The trim marks sit inside the artwork on the A5 proof. Find the offset and show the corrected bounds.",
    file: "marks.ts",
    intro:
      "The export measures from the trim edge instead of the bleed edge. The marks need another 3 mm of clearance.",
    code: "const bleed = 3;\nconst origin = trim.inset(-bleed);\ndrawMarks(origin, { offset: 2 });",
    rows: [
      ["Boundary", "Before", "After"],
      ["Trim", "148 × 210", "148 × 210"],
      ["Mark offset", "2 mm", "5 mm"],
    ],
    end: "The trim size stays fixed. Only the marks move outside the bleed.",
  },
  {
    name: "Check the paper profile",
    id: "023",
    time: "13:58",
    note: "Colour management",
    prompt: "Confirm which profile the uncoated stock preset uses.",
    file: "profiles.ts",
    intro: "The preset resolves to the uncoated profile before export.",
    code: "const profile = profiles.uncoated;\napplyProfile(sheet, profile);",
    rows: [
      ["Stock", "Profile"],
      ["Uncoated", "FOGRA52"],
    ],
    end: "Both sides use the same output profile.",
  },
  {
    name: "Trace the blank folio",
    id: "022",
    time: "11:46",
    note: "Imposition",
    prompt: "Find the empty page in the folded signature.",
    file: "folios.ts",
    intro:
      "A blank is inserted after the final spread to complete the signature.",
    code: "const pages = padToFour(spreads);",
    rows: [
      ["Input", "Output"],
      ["15 pages", "16 pages"],
    ],
    end: "The last folio is intentionally blank.",
  },
  {
    name: "Audit plate names",
    id: "021",
    time: "09:12",
    note: "Separations",
    prompt: "Check that every spot plate has a unique label.",
    file: "plates.ts",
    intro: "The spot labels are unique after trimming trailing spaces.",
    code: "const labels = plates.map(p => p.name.trim());",
    rows: [
      ["Check", "Result"],
      ["Unique labels", "Pass"],
    ],
    end: "The four process plates are unchanged.",
  },
];
export type Session = (typeof sessions)[number];
export function blocks(s: Session) {
  const rows = s.rows.map((row) => "| " + row.join(" | ") + " |");
  return [
    s.intro,
    "```ts\n" + s.code + "\n```",
    [
      rows[0],
      "|" + s.rows[0].map(() => "---").join("|") + "|",
      ...rows.slice(1),
    ].join("\n"),
    s.end,
  ];
}
