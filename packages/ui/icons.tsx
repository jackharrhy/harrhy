import { type Handle, type RemixNode } from "remix/component";

const paths = {
  back: "m10 3-5 5 5 5M5 8h8",
  play: "m6 4 6 4-6 4Z",
  pause: "M6 4v8m4-8v8",
  power: "M8 2v6m-3.5-4a5 5 0 1 0 7 0",
  sync: "M13 6a5 5 0 0 0-8.5-2L3 6m0-3v3h3m-3 4a5 5 0 0 0 8.5 2l1.5-2m0 3v-3h-3",
} as const;

export type IconName = keyof typeof paths;
export type IconSet = Readonly<Partial<Record<IconName, () => RemixNode>>>;

/** Decorative glyph. The enclosing control owns the accessible name. */
export function Icon(handle: Handle<{ name: IconName; icons?: IconSet }>) {
  return () => {
    const { name, icons } = handle.props;
    const glyph = icons?.[name];
    return glyph ? (
      <span aria-hidden="true">{glyph()}</span>
    ) : (
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d={paths[name]} />
      </svg>
    );
  };
}
