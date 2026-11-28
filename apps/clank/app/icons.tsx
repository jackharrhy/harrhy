import type { Handle } from "remix/component";

// Outline geometry follows the installed P2 web icons; labels belong to the buttons.
const paths = {
  close: "M6 6l12 12M18 6 6 18",
  bot: "M12 4v4M9 13h.01M15 13h.01M9 17h6",
  failed: "M12 8v5M12 17h.01",
  guest:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  peer: "M20 15a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z",
  sidebar: "M9 4v16",
  drawer: "M4 7h16M4 12h12M4 17h8",
  settings:
    "M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.3a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.7l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.3a2 2 0 0 1 1 1.7v.2a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.3a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.7v-.5a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.3a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2z",
  archive: "M3 4h18v5H3z M5 9v11h14V9 M10 13h4",
  pin: "m9 3 10 5-3 2-2 5-3-1-4 6 2-7-3-2 4-4z",
  send: "M12 19V5M5 12l7-7 7 7",
  search: "M20 20l-3.5-3.5",
  right: "m9 6 6 6-6 6",
  latest: "M12 5v14M5 12l7 7 7-7",
  down: "m6 9 6 6 6-6",
  plus: "M12 5v14M5 12h14",
  edit: "M4 20h4L19 9l-4-4L4 16z",
  copy: "M5 15V6a2 2 0 0 1 2-2h8",
  theme: "M12 4a8 8 0 0 1 0 16z",
  sun: "M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z",
  moon: "M20.9 13A9 9 0 1 1 11 3.1a7 7 0 0 0 9.9 9.9z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
};
export function Icon(handle: Handle<{ name: keyof typeof paths }>) {
  return () => {
    const { name } = handle.props;
    const size =
      name === "latest" ? 18 : name === "copy" || name === "edit" ? 15 : 16;
    return (
      <svg
        aria-hidden="true"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        {name === "bot" && <rect x="4" y="8" width="16" height="12" rx="3" />}
        {name === "failed" && <circle cx="12" cy="12" r="9" />}
        {name === "guest" && <circle cx="9" cy="7" r="4" />}
        {name === "sidebar" && (
          <rect x="3" y="4" width="18" height="16" rx="2" />
        )}
        {name === "search" && <circle cx="11" cy="11" r="7" />}
        {name === "copy" && <rect x="9" y="9" width="11" height="11" rx="2" />}
        {name === "settings" && <circle cx="12" cy="12" r="3" />}
        {name === "theme" && <circle cx="12" cy="12" r="8" />}
        <path
          d={paths[name]}
          fill={name === "theme" ? "currentColor" : "none"}
        />
      </svg>
    );
  };
}
