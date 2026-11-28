import type { Handle } from "remix/component";

// Outline geometry follows the installed P2 web icons; labels belong to the buttons.
const paths = {
  sidebar: "M9 4v16",
  drawer: "M4 7h16M4 12h12M4 17h8",
  settings: "M4 7h16M4 12h16M4 17h16M8 5v4m8 1v4m-6 1v4",
  send: "M12 19V5M5 12l7-7 7 7",
  search: "M20 20l-3.5-3.5",
  right: "m9 6 6 6-6 6",
  down: "m6 9 6 6 6-6",
  plus: "M12 5v14M5 12h14",
  edit: "M4 20h4L19 9l-4-4L4 16z",
  copy: "M5 15V6a2 2 0 0 1 2-2h8",
  theme: "M12 3a9 9 0 1 0 0 18V3zM12 3a9 9 0 0 1 0 18",
  sun: "M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z",
  moon: "M20.9 13A9 9 0 1 1 11 3.1a7 7 0 0 0 9.9 9.9z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
};
export function Icon(handle: Handle<{ name: keyof typeof paths }>) {
  return () => {
    const { name } = handle.props;
    return (
      <svg
        aria-hidden="true"
        width={name === "copy" || name === "edit" ? 15 : 16}
        height={name === "copy" || name === "edit" ? 15 : 16}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        {name === "sidebar" && (
          <rect x="3" y="4" width="18" height="16" rx="2" />
        )}
        {name === "search" && <circle cx="11" cy="11" r="7" />}
        {name === "copy" && <rect x="9" y="9" width="11" height="11" rx="2" />}
        <path d={paths[name]} />
      </svg>
    );
  };
}
