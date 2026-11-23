import {
  css,
  type Handle,
  type MixInput,
  type RemixNode,
} from "remix/component";
import { jsx } from "remix/component/jsx-runtime";

const frame = css({
  minWidth: 0,
  overflow: "hidden",
  border: "1px solid var(--window-border, var(--hui-border))",
  borderRadius: "1cqw",
  background: "var(--window-surface, var(--hui-surface))",
  color: "var(--window-ink, var(--hui-ink))",
  boxShadow: "0 2cqh 5cqh #13182b26",
  textAlign: "left",
  "&[data-front]": { zIndex: 2 },
  "& > .window-bar": {
    display: "flex",
    alignItems: "center",
    gap: "1.2cqw",
    width: "100%",
    padding: ".72cqw 1.1cqw",
    border: 0,
    borderBlockEnd: "1px solid var(--window-border, var(--hui-border))",
    background: "var(--window-chrome, var(--hui-hover-surface))",
    color: "inherit",
    font: "600 1.2cqw var(--hui-font-ui)",
    textAlign: "left",
  },
  "& > button.window-bar": { cursor: "pointer" },
  "& > button.window-bar:focus-visible": {
    outline: "2px solid currentColor",
    outlineOffset: "-3px",
  },
  "& .window-lights": { display: "inline-flex", flexShrink: 0, gap: ".45cqw" },
  "& .window-lights span": {
    width: ".7cqw",
    height: ".7cqw",
    borderRadius: "50%",
    background: "#ff5f57",
  },
  "& .window-lights span:nth-child(2)": { background: "#febc2e" },
  "& .window-lights span:nth-child(3)": { background: "#28c840" },
  "& .window-title": {
    padding: ".25cqh .75cqw",
    borderRadius: ".3cqw",
    background: "var(--window-tab, transparent)",
  },
});

const themes = {
  light: css({ "--window-chrome": "#f1f0ef" }),
  browser: css({
    "--window-chrome": "#dee3eb",
    "--window-tab": "#f7f9fc",
    "--window-border": "#cbd2de",
    "& > .window-bar": {
      alignItems: "end",
      padding: ".45cqw .8cqw 0",
      borderBlockEnd: 0,
      font: "500 .91cqw system-ui",
    },
    "& .window-lights": { alignSelf: "center", marginInlineEnd: ".5cqw" },
    "& .window-title": {
      display: "flex",
      alignItems: "center",
      gap: ".65cqw",
      width: "min(54%, 16cqw)",
      position: "relative",
      padding: ".38cqw .66cqw",
      borderRadius: ".8cqw .8cqw 0 0",
    },
    "& .window-tab-caption": {
      flex: 1,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
    "& .window-title::after": {
      content: '""',
      position: "absolute",
      bottom: 0,
      left: "100%",
      width: ".65cqw",
      height: ".65cqw",
      borderRadius: "0 0 0 .65cqw",
      boxShadow: "-.26cqw .26cqw 0 .18cqw var(--window-tab)",
      pointerEvents: "none",
    },
    "& .window-tab-icon": {
      width: "1cqw",
      height: "1cqw",
      objectFit: "contain",
    },
    "& .browser-toolbar": {
      display: "flex",
      alignItems: "center",
      gap: ".85cqw",
      background: "var(--window-tab)",
      padding: ".38cqw .75cqw",
      color: "#465261",
      font: "500 .8cqw system-ui",
    },
    "& .browser-address": {
      flex: 1,
      background: "#e8edf5",
      borderRadius: "1cqw",
      padding: ".3cqw .65cqw",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      margin: 0,
    },

    "& .window-tab-add": { alignSelf: "center", color: "#475569" },
  }),
  editor: css({
    "--window-chrome": "#333",
    "--window-surface": "#1e1e1e",
    "--window-ink": "#eceef4",
    "--window-tab": "#393d4c",
    "--window-border": "#393b46",
  }),
  terminal: css({
    "--window-chrome": "#272a35",
    "--window-surface": "#171921",
    "--window-ink": "#eceef4",
    "--window-border": "#393b46",
  }),
};

interface WindowProps {
  title?: string;
  detail?: string;
  favicon?: string;
  address?: string;
  theme?: keyof typeof themes;
  mix?: MixInput;
  focus?: { front: boolean; label: string };
  children?: RemixNode;
  placement?: Record<string, string | number>;
}

export function Window(handle: Handle<WindowProps>) {
  return () => renderWindow(handle.props);
}

function renderWindow({
  title,
  detail,
  favicon,
  address,
  theme = "light",
  mix,
  focus,
  children,
  placement,
}: WindowProps) {
  return jsx("div", {
    ...placement,
    class: "slide-window",
    role: focus ? "group" : undefined,
    "aria-label": focus?.label,
    "data-window": focus ? "" : undefined,
    "data-front": focus?.front ? "" : undefined,
    mix: [frame, themes[theme], mix],
    children: [
      jsx(focus ? "button" : "div", {
        class: "window-bar",
        ...(focus && {
          type: "button",
          "data-window-control": "",
          "aria-label": focus.label,
          "aria-pressed": String(focus.front),
        }),
        children: [
          jsx("span", {
            class: "window-lights",
            "aria-hidden": "true",
            children: [jsx("span", {}), jsx("span", {}), jsx("span", {})],
          }),
          title
            ? jsx("span", {
                class: "window-title",
                children:
                  theme === "browser"
                    ? [
                        favicon
                          ? jsx("img", {
                              class: "window-tab-icon",
                              src: favicon,
                              alt: "",
                            })
                          : null,
                        jsx("span", {
                          class: "window-tab-caption",
                          children: title,
                        }),
                        jsx("span", { "aria-hidden": "true", children: "×" }),
                      ]
                    : title,
              })
            : null,
          theme === "browser"
            ? jsx("span", {
                class: "window-tab-add",
                "aria-hidden": "true",
                children: "+",
              })
            : null,
          detail ? jsx("span", { children: detail }) : null,
        ],
      }),
      address
        ? jsx("div", {
            class: "browser-toolbar",
            children: [
              jsx("span", { "aria-hidden": "true", children: "‹　›　↻" }),
              jsx("span", { class: "browser-address", children: address }),
              jsx("span", { "aria-hidden": "true", children: "⋮" }),
            ],
          })
        : null,
      children,
    ],
  });
}
