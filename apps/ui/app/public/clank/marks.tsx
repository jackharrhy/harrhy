import type { Handle } from "remix/component";
// Lucide outlines; see the adjacent ISC/MIT notices.
export function Mark(h: Handle<{ name: "check" | "terminal" | "play" }>) {
  return () => (
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
      <path
        d={
          {
            terminal: "M12 19h8 M4 17l6-6-6-6",
            check: "M20 6 9 17l-5-5",
            play: "M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z",
          }[h.props.name]
        }
      />
    </svg>
  );
}
