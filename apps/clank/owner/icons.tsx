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
  more: "M5 12h.01M12 12h.01M19 12h.01",
};
export function Icon(handle: Handle<{ name: keyof typeof paths }>) {
  return () => {
    const { name } = handle.props;
    return (
      <svg
        aria-hidden="true"
        width="16"
        height="16"
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
        <path d={paths[name]} />
      </svg>
    );
  };
}
