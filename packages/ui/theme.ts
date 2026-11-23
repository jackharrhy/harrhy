import { createTheme } from "@pitlane/theme";
import * as s from "@pitlane/theme/schema";
import { css } from "remix/component";

/** Semantic values and part recipes. Surfaces and images are deliberately separate. */
export interface ThemeTokens {
  colorScheme: "light" | "dark";
  canvas: string;
  surface: string;
  elevated: string;
  ink: string;
  muted: string;
  border: string;
  controlBorder: string;
  hoverSurface: string;
  selectedSurface: string;
  selectedInk: string;
  disabledSurface: string;
  popupOffset: string;
  tableBorder: string;
  tableSurface: string;
  tableContainerSurface: string;
  tableStripe: string;
  tableTextSize: string;
  tableHeaderTextSize: string;
  tableCellPadding: string;
  tableColumnBorder: string;
  tableHeader: string;
  tableHeaderImage: string;
  tableHeaderShadow: string;
  popupRadius: string;
  popupPadding: string;
  optionRadius: string;
  optionGap: string;
  buttonBorder: string;
  buttonPrimaryBorder: string;
  buttonHeight: string;
  buttonPadding: string;
  buttonTextSize: string;
  controlTextSize: string;
  labelSize: string;
  labelWeight: string;
  labelTransform: string;
  labelTracking: string;
  fieldGap: string;
  accent: string;
  onAccent: string;
  focus: string;
  danger: string;
  onDanger: string;
  dangerSurface: string;
  success: string;
  successSurface: string;
  fontDisplay: string;
  fontUi: string;
  fontDetail: string;
  fontMono: string;
  fontDisplayVariation: string;
  fontDisplayOpticalSizing: string;
  textSize: string;
  lineHeight: string;
  space: string;
  controlHeight: string;
  controlPadding: string;
  controlRadius: string;
  borderWidth: string;
  panelRadius: string;
  panelPadding: string;
  panelImage: string;
  buttonImage: string;
  buttonShadow: string;
  buttonWeight: string;
  controlShadow: string;
  overlayShadow: string;
  motion: string;
}

export const cleanTheme: Readonly<ThemeTokens> = {
  colorScheme: "light",
  canvas: "#f6f7f8",
  surface: "#ffffff",
  elevated: "#ffffff",
  ink: "#192126",
  muted: "#536169",
  border: "#d8dfe2",
  controlBorder: "#7d8b94",
  hoverSurface: "#edf0f2",
  selectedSurface: "#dfe9ed",
  selectedInk: "#243f4d",
  disabledSurface: "#edf0f2",
  popupOffset: "6px",
  tableBorder: "var(--hui-border)",
  tableSurface: "var(--hui-surface)",
  tableContainerSurface: "var(--hui-table-surface)",
  tableStripe: "transparent",
  tableTextSize: "0.875rem",
  tableHeaderTextSize: "inherit",
  tableCellPadding: "0.625rem 0.75rem",
  tableColumnBorder: "0 solid transparent",
  tableHeader: "var(--hui-surface)",
  tableHeaderImage: "none",
  tableHeaderShadow: "none",
  popupRadius: "10px",
  popupPadding: "6px",
  optionRadius: "6px",
  optionGap: "2px",
  buttonBorder: "var(--hui-control-border)",
  buttonPrimaryBorder: "var(--hui-button-border)",
  buttonHeight: "var(--hui-control-height)",
  buttonPadding: "var(--hui-control-padding)",
  buttonTextSize: "inherit",
  controlTextSize: "inherit",
  labelSize: "inherit",
  labelWeight: "600",
  labelTransform: "none",
  labelTracking: "normal",
  fieldGap: "0.5rem",
  accent: "#243f4d",
  onAccent: "#ffffff",
  focus: "#006c9c",
  danger: "#a3202c",
  onDanger: "#ffffff",
  dangerSurface: "#fff0f1",
  success: "#17613c",
  successSurface: "#eaf6ee",
  fontDisplay: "var(--hui-font-ui)",
  fontUi: "system-ui, sans-serif",
  fontDetail: "var(--hui-font-ui)",
  fontMono: "ui-monospace, monospace",
  fontDisplayVariation: "normal",
  fontDisplayOpticalSizing: "auto",
  textSize: "1rem",
  lineHeight: "1.5",
  space: "0.75rem",
  controlHeight: "2.25rem",
  controlPadding: "0.375rem 0.625rem",
  controlRadius: "0.375rem",
  borderWidth: "1px",
  panelRadius: "0.5rem",
  panelPadding: "1rem",
  panelImage: "none",
  buttonImage: "none",
  buttonShadow: "none",
  buttonWeight: "600",
  controlShadow: "none",
  overlayShadow: "0 8px 24px rgb(25 33 38 / 0.14)",
  motion: "120ms",
};

/** Composition happens in data, not by relying on mix array cascade order. */
export function composeTheme(
  base: Readonly<ThemeTokens>,
  ...overrides: Partial<ThemeTokens>[]
): ThemeTokens {
  return Object.assign({}, base, ...overrides);
}

const contract = {
  colorScheme: ["colorScheme", s.any()],
  canvas: ["canvas", s.color()],
  surface: ["surface", s.color()],
  elevated: ["elevated", s.color()],
  ink: ["ink", s.color()],
  muted: ["muted", s.color()],
  border: ["border", s.color()],
  control: {
    border: ["controlBorder", s.color()],
    textSize: ["controlTextSize", s.dimension()],
    height: ["controlHeight", s.dimension()],
    padding: ["controlPadding", s.any()],
    radius: ["controlRadius", s.dimension()],
    shadow: ["controlShadow", s.any()],
  },
  hoverSurface: ["hoverSurface", s.color()],
  selectedSurface: ["selectedSurface", s.color()],
  selectedInk: ["selectedInk", s.color()],
  disabledSurface: ["disabledSurface", s.color()],
  popup: {
    offset: ["popupOffset", s.dimension()],
    radius: ["popupRadius", s.dimension()],
    padding: ["popupPadding", s.any()],
  },
  table: {
    border: ["tableBorder", s.color()],
    surface: ["tableSurface", s.color()],
    containerSurface: ["tableContainerSurface", s.color()],
    stripe: ["tableStripe", s.color()],
    textSize: ["tableTextSize", s.any()],
    headerTextSize: ["tableHeaderTextSize", s.any()],
    cellPadding: ["tableCellPadding", s.any()],
    columnBorder: ["tableColumnBorder", s.any()],
    header: ["tableHeader", s.color()],
    headerImage: ["tableHeaderImage", s.any()],
    headerShadow: ["tableHeaderShadow", s.any()],
  },
  option: {
    radius: ["optionRadius", s.dimension()],
    gap: ["optionGap", s.dimension()],
  },
  button: {
    border: ["buttonBorder", s.color()],
    primaryBorder: ["buttonPrimaryBorder", s.color()],
    height: ["buttonHeight", s.dimension()],
    padding: ["buttonPadding", s.any()],
    textSize: ["buttonTextSize", s.dimension()],
    image: ["buttonImage", s.any()],
    shadow: ["buttonShadow", s.any()],
    weight: ["buttonWeight", s.any()],
  },
  label: {
    size: ["labelSize", s.dimension()],
    weight: ["labelWeight", s.any()],
    transform: ["labelTransform", s.any()],
    tracking: ["labelTracking", s.any()],
  },
  field: {
    gap: ["fieldGap", s.dimension()],
  },
  accent: ["accent", s.color()],
  onAccent: ["onAccent", s.color()],
  focus: ["focus", s.color()],
  danger: ["danger", s.color()],
  onDanger: ["onDanger", s.color()],
  dangerSurface: ["dangerSurface", s.color()],
  success: ["success", s.color()],
  successSurface: ["successSurface", s.color()],
  font: {
    display: ["fontDisplay", s.any()],
    ui: ["fontUi", s.any()],
    detail: ["fontDetail", s.any()],
    mono: ["fontMono", s.any()],
    displayVariation: ["fontDisplayVariation", s.any()],
    displayOpticalSizing: ["fontDisplayOpticalSizing", s.any()],
  },
  textSize: ["textSize", s.dimension()],
  lineHeight: ["lineHeight", s.any()],
  space: ["space", s.dimension()],
  borderWidth: ["borderWidth", s.dimension()],
  panel: {
    radius: ["panelRadius", s.dimension()],
    padding: ["panelPadding", s.any()],
    image: ["panelImage", s.any()],
  },
  overlayShadow: ["overlayShadow", s.any()],
  motion: ["motion", s.duration()],
} as const;

type Leaf = readonly [keyof ThemeTokens, s.TokenSchema];
type Contract = { readonly [key: string]: Leaf | Contract };
type Schema<C> = {
  [K in keyof C]: C[K] extends Leaf ? C[K][1] : Schema<C[K]>;
};
type Values<C> = {
  [K in keyof C]: C[K] extends Leaf ? ThemeTokens[C[K][0]] : Values<C[K]>;
};
type Patch<C> = {
  [K in keyof C]?: C[K] extends Leaf ? ThemeTokens[C[K][0]] : Patch<C[K]>;
};

function isLeaf(node: Leaf | Contract): node is Leaf {
  return Array.isArray(node);
}

function mapContract(branch: Contract, leaf: (entry: Leaf) => unknown): object {
  return Object.fromEntries(
    Object.entries(branch).map(([key, node]) => [
      key,
      isLeaf(node) ? leaf(node) : mapContract(node, leaf),
    ]),
  );
}

const schema = mapContract(contract, ([, validator]) => validator) as Schema<
  typeof contract
>;

function toValues(theme: Readonly<ThemeTokens>) {
  return mapContract(contract, ([key]) => theme[key]) as Values<
    typeof contract
  >;
}

const base = createTheme({
  schema: { hui: schema },
  tokens: { hui: toValues(cleanTheme) },
});

/** Nested references shared by all Harrhy presets. */
export const tokens = base.token.hui;

/** Extend a preset with a nested patch. References stay live in CSS. */
export function extendTheme(
  preset: Readonly<ThemeTokens>,
  patch:
    | Patch<typeof contract>
    | ((token: typeof tokens) => Patch<typeof contract>),
): ThemeTokens {
  const next = { ...preset };
  function apply(branch: Contract, values: object) {
    for (const [key, node] of Object.entries(branch)) {
      const value = Reflect.get(values, key);
      if (value === undefined) continue;
      if (isLeaf(node)) Object.assign(next, { [node[0]]: value });
      else apply(node, value);
    }
  }
  apply(contract, typeof patch === "function" ? patch(tokens) : patch);
  return next;
}

function declarations(refs: object, values: object): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, ref] of Object.entries(refs)) {
    const value = Reflect.get(values, key);
    if (typeof ref === "string") result[ref.slice(4, -1)] = value;
    else Object.assign(result, declarations(ref, value));
  }
  return result;
}

export function themeStyles(theme: Readonly<ThemeTokens>) {
  const hui = toValues(theme);
  const compiled = base.extend({ tokens: { hui } });
  // Keep aliases live in the nearest Remix scope instead of resolving them with raw().
  return css(declarations(compiled.token.hui, hui));
}

export const graphiteTheme = extendTheme(cleanTheme, {
  font: {
    ui: "Inter, system-ui, sans-serif",
  },
  canvas: "#f5f3f0",
  surface: "#fbfaf8",
  ink: "#1d1b19",
  muted: "#6c665f",
  border: "#e7e4df",
  hoverSurface: "#f1eee9",
  selectedSurface: "#f0ede8",
  selectedInk: "#1d1b19",
  accent: "#1d1b19",
  focus: "#1d1b19",
  success: "#1f754d",
  control: {
    border: "#77716a",
    radius: "4px",
  },
  panel: {
    radius: "4px",
  },
  textSize: "15px",
});

/** Standard preserves the base theme. Compact changes spacing, not typography or hit targets. */
export const densityOverrides = {
  standard: {},
  compact: {
    space: "0.5rem",
    fieldGap: "0.375rem",
    tableCellPadding: "0.375rem 0.625rem",
  },
} as const satisfies Record<string, Partial<ThemeTokens>>;

// Table treatment follows Radio room utility headers and fine desktop list rules.
export const dialTheme = extendTheme(cleanTheme, {
  table: {
    border: "#7b878c",
    surface: "#f8fbfb",
    stripe: "#edf2f4",
    textSize: "13px",
    cellPadding: "0.4375rem 0.625rem",
    columnBorder: "1px solid #dce4e7",
    header: "#dce4e7",
    headerImage: "linear-gradient(#f8fbfb, #dce4e7)",
    headerShadow: "inset 0 1px #fff",
  },
  canvas: "#edf5f5",
  surface: "#f9fdfb",
  elevated: "#ffffff",
  ink: "#203a3c",
  muted: "#466367",
  border: "#98b6b7",
  control: {
    border: "#587c81",
    radius: "3px",
    shadow: "inset 0 1px 2px rgb(0 45 58 / 0.15)",
  },
  hoverSurface: "#e2f1ee",
  selectedSurface: "#c7e9e7",
  selectedInk: "#173c42",
  disabledSurface: "#e7efed",
  popup: {
    radius: "5px",
    padding: "3px",
  },
  option: {
    radius: "2px",
  },
  accent: "#b5eff2",
  onAccent: "#173c42",
  focus: "#006579",
  panel: {
    radius: "5px",
    image:
      "repeating-linear-gradient(0deg, transparent 0 3px, rgb(35 94 99 / 0.045) 3px 4px)",
  },
  borderWidth: "1px",
  button: {
    weight: "700",
    image:
      "linear-gradient(180deg, rgb(255 255 255 / 0.65), transparent 55%, rgb(0 45 58 / 0.08))",
    shadow: "inset 0 1px 0 #fff, 0 2px 0 #79989a",
  },
});

/** Artbin app/ui/styles.ts: flat archive-catalog surfaces, not neobrutalism. */
export const brutalistTheme = extendTheme(cleanTheme, {
  canvas: "#f0f0f0",
  surface: "#ffffff",
  elevated: "#ffffff",
  ink: "#111111",
  muted: "#666666",
  border: "#cccccc",
  control: {
    border: "#888888",
    height: "2.125rem",
    padding: "0.4375rem 0.625rem",
    textSize: "0.875rem",
    radius: "0",
  },
  hoverSurface: "#eeeeee",
  selectedSurface: "#dddddd",
  selectedInk: "#111111",
  disabledSurface: "#f0f0f0",
  popup: {
    radius: "0",
    padding: "4px",
  },
  option: {
    radius: "0",
  },
  button: {
    border: "#222222",
    primaryBorder: "#111111",
    height: "2rem",
    padding: "0.375rem 0.75rem",
    textSize: "0.875rem",
    weight: "400",
    shadow: "none",
  },
  accent: "#111111",
  onAccent: "#ffffff",
  focus: "#222222",
  danger: "#cc0000",
  dangerSurface: "#fff0f0",
  success: "#008700",
  successSurface: "#f0fff0",
  font: {
    display: '"Fraunces", Georgia, serif',
    ui: '"IBM Plex Sans", Arial, sans-serif',
    mono: '"IBM Plex Mono", "Courier New", monospace',
    detail: "var(--hui-font-mono)",
    displayVariation: '"SOFT" 30, "WONK" 1',
    displayOpticalSizing: "auto",
  },
  lineHeight: "1.45",
  space: "0.625rem",
  label: {
    size: "0.75rem",
    weight: "500",
    transform: "uppercase",
    tracking: "0.025em",
  },
  field: {
    gap: "0.375rem",
  },
  panel: {
    radius: "0",
    padding: "1rem",
  },
  borderWidth: "1px",
  overlayShadow: "none",
});

/** Allo specimen paper, ink, and pink, with dark ink on the vivid accent. */
export const jelloTheme = extendTheme(cleanTheme, {
  canvas: "#fcfcfc",
  surface: "#fcfcfc",
  ink: "#111111",
  accent: "color(display-p3 1 0.1765 0.3333)",
  onAccent: "#111111",
  focus: "#a51139",
  font: {
    display: '"Allo", system-ui, sans-serif',
    ui: '"Allo", system-ui, sans-serif',
    displayVariation: '"ROND" 100',
  },
});

/** Sluggers blue scorebook palette; private font assets are host-owned and opt-in. */
export const sluggersTheme: Readonly<ThemeTokens> = extendTheme(cleanTheme, {
  colorScheme: "dark",
  canvas: "oklch(48.197% 0.17551 261.35)",
  surface: "#3b64a8",
  elevated: "#416aac",
  ink: "#ffffff",
  muted: "#d6e3fa",
  border: "rgb(155 181 225 / 0.55)",
  control: {
    border: "#bacfed",
    height: "36px",
    textSize: "16px",
    radius: "6px",
  },
  hoverSurface: "rgb(142 170 215 / 0.2)",
  selectedSurface: "#486fb0",
  selectedInk: "#ffffff",
  disabledSurface: "#41629b",
  accent: "#fff1a1",
  onAccent: "#173866",
  focus: "#ffe77d",
  danger: "#ffc1c6",
  onDanger: "#173866",
  dangerSurface: "#58374d",
  success: "#a6f0c2",
  successSurface: "#234f53",
  font: {
    ui: '"SluggersCezanne", Arial, sans-serif',
    display: '"SluggersRodin", Arial, sans-serif',
    detail: '"SluggersCezanne", Arial, sans-serif',
  },
  textSize: "14px",
  lineHeight: "1.45",
  button: {
    height: "36px",
    textSize: "14px",
  },
  panel: {
    radius: "12px",
  },
  table: {
    cellPadding: "10px 12px",
    header: "#3b64a8",
    surface: "#3b64a8",
    containerSurface: "transparent",
    textSize: "14px",
    headerTextSize: "12px",
  },
  space: "10px",
});

const displayTypography = {
  fontFamily: "var(--hui-font-display)",
  fontVariationSettings: "var(--hui-font-display-variation)",
  fontOpticalSizing: "var(--hui-font-display-optical-sizing)",
};
/** Short expressive headings/callouts, never a long-reading body default. */
export const displayStyles = css(displayTypography);

export const themeRoot = css({
  colorScheme: "var(--hui-color-scheme)",
  color: "var(--hui-ink)",
  backgroundColor: "var(--hui-canvas)",
  fontFamily: "var(--hui-font-ui)",
  fontSize: "var(--hui-text-size)",
  fontOpticalSizing: "auto",
  fontVariationSettings: "normal",
  "& h1, & h2, & h3": displayTypography,
  lineHeight: "var(--hui-line-height)",
  accentColor: "var(--hui-accent)",
  caretColor: "var(--hui-ink)",
  "& ::selection": {
    background: "var(--hui-accent)",
    color: "var(--hui-on-accent)",
  },
  "@media (prefers-reduced-motion: reduce)": { "--hui-motion": "0ms" },
});
