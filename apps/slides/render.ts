import { space } from "@harrhy/ui/styles";
import { css as styles, unsafeHTML, type RemixNode } from "remix/component";
import { Button, ButtonLink } from "@harrhy/ui/native";
import { jelloTheme, themeRoot, themeStyles } from "@harrhy/ui/theme";
import { jsx } from "remix/component/jsx-runtime";
import { renderToString } from "remix/component/server";
import { fontUrl } from "./dist/assets.ts";
import { actions, type Slide } from "./deck.ts";
import { Window } from "./window.ts";
const documentStyle = [themeStyles(jelloTheme), themeRoot];
const poster = styles({
  "&[data-poster-ready]": {
    padding: 0,
    "& .copy": { padding: 0 },
    "& h1, & h2": {
      position: "absolute",
      clipPath: "inset(50%)",
      width: 1,
      height: 1,
      overflow: "hidden",
    },
    "& svg": {
      display: "block",
      width: "100%",
      height: "100cqh",
      fill: "currentColor",
    },
    "& .poster-caret": {
      fill: "#005fcb",
      animation: "poster-blink 1.05s step-end infinite",
    },
    "@media (prefers-reduced-motion: reduce)": {
      "& .poster-caret": { animation: "none" },
    },
  },
});

function renderSlide(
  s: Slide,
  index: number,
  hidden: boolean,
  alternate: boolean,
) {
  const src = s.media && `/media/${s.media}`;
  const titleId = `title-${index}`;
  const isPoster = s.kind === "poster" || s.kind === "stretch";
  const media =
    src &&
    jsx("img", {
      src,
      alt: s.title,
      mix: styles({ maxHeight: "65cqh", objectFit: "contain" }),
    });
  let content: RemixNode;
  if (isPoster) {
    const text = jsx("text", {
      fontFamily: "Allo, sans-serif",
      fontSize: 100,
      fontWeight: 800,
      children: s.title,
    });
    content = jsx("div", {
      class: "poster-frame",
      children: jsx("svg", {
        "aria-hidden": "true",
        "data-poster": "",
        "data-typing-poster": s.kind === "poster" ? "" : undefined,
        hidden: true,
        viewBox: "0 0 1000 1000",
        preserveAspectRatio: "none",
        children:
          s.kind === "poster"
            ? [
                text,
                jsx("rect", {
                  class: "poster-caret",
                  y: 100,
                  width: 8,
                  height: 800,
                }),
              ]
            : jsx("g", { class: "stretch-poster-line", children: text }),
      }),
    });
  } else if (s.kind === "image") {
    content = src
      ? jsx("img", {
          src,
          alt: s.title,
          mix: styles({
            position: "absolute",
            maxHeight: "78cqh",
            objectFit: "contain",
          }),
          style: `left:${s.x}%;top:${s.y}%;width:${s.width}%`,
        })
      : jsx("p", { children: "No screenshot yet" });
  } else if (s.kind === "video") {
    content = jsx("video", {
      src,
      muted: true,
      playsInline: true,
      preload: "metadata",
      "aria-label": s.title,
      mix: styles({ maxHeight: "75cqh", maxWidth: "100%" }),
    });
  } else if (s.kind === "windows") {
    content = jsx("div", {
      "data-window-stack": "",
      mix: styles({
        display: "grid",
        "& > div": { gridArea: "1 / 1", minHeight: "36cqh", width: "72%" },
        "& > div:first-child": { margin: "5cqh 0 0 20%" },
      }),
      children: [
        jsx(Window, {
          theme: "browser",
          title: s.title,
          focus: { front: alternate, label: "Show browser" },
          children: media,
        }),
        jsx(Window, {
          theme: "terminal",
          title: "Terminal",
          focus: { front: !alternate, label: "Show terminal" },
          children: jsx("pre", { children: s.body }),
        }),
      ],
    });
  }
  const labels = {
    poster: "Type / erase title",
    stretch: "Stretch the words",
    video: "Play / pause video",
    windows: "Swap windows",
    image: "",
    text: "",
  };
  return jsx("section", {
    class: `slide ${s.kind === "poster" ? "cover" : s.kind}`,
    hidden,
    "aria-labelledby": titleId,
    "data-slide-id": s.id,
    "data-action": actions[s.kind],
    "data-action-label": labels[s.kind],
    mix: isPoster ? poster : undefined,
    children: jsx("div", {
      class: "copy",
      children: [
        jsx(index === 0 ? "h1" : "h2", { id: titleId, children: s.title }),
        content,
        s.body && !isPoster && s.kind !== "windows"
          ? jsx("p", {
              mix: styles({ whiteSpace: "pre-line" }),
              children: s.body,
            })
          : null,
      ],
    }),
  });
}

function clicker() {
  return jsx("dialog", {
    id: "clicker",
    "aria-label": "Slide clicker",
    children: [
      jsx("form", {
        method: "dialog",
        children: jsx(Button, { type: "submit", children: "Close" }),
      }),
      jsx("div", {
        class: "clicker-arrows",
        children: [
          jsx(Button, {
            id: "clicker-prev",
            "aria-label": "Previous slide",
            children: "←",
          }),
          jsx(Button, {
            id: "clicker-next",
            "aria-label": "Next slide",
            children: "→",
          }),
        ],
      }),
      jsx(Button, { id: "clicker-action", hidden: true }),
      jsx("section", {
        "aria-label": "Presentation timer",
        mix: styles({
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: space(1),
          marginBlockStart: space(1.5),
          paddingBlockStart: space(1.5),
          borderBlockStart: "1px solid var(--hui-border)",
          "& time": {
            fontSize: "1.5rem",
            fontVariantNumeric: "tabular-nums",
            minInlineSize: "5ch",
          },
        }),
        children: [
          jsx("time", {
            id: "clicker-time",
            "aria-label": "Elapsed time",
            children: "00:00",
          }),
          jsx(Button, { id: "clicker-timer-toggle", children: "Start" }),
          jsx(Button, { id: "clicker-timer-reset", children: "Reset" }),
        ],
      }),
    ],
  });
}

function account({
  signIn,
  signedIn,
  presenter,
}: {
  signIn: boolean;
  signedIn: boolean;
  presenter: boolean;
}) {
  if (!signIn && !signedIn) return null;
  return jsx("nav", {
    class: "account",
    "aria-label": "Presenter account",
    children: [
      presenter
        ? [
            jsx(Button, {
              id: "open-clicker",
              mix: styles({
                "&#open-clicker": { display: "inline-flex !important" },
              }),
              children: "Open clicker",
            }),
            jsx(ButtonLink, { href: "/edit", children: "Edit deck" }),
          ]
        : null,
      signedIn
        ? jsx("form", {
            action: "/auth/logout",
            method: "post",
            "data-rmx-document": "",
            children: jsx(Button, { type: "submit", children: "Sign out" }),
          })
        : jsx(ButtonLink, {
            href: "/auth/login",
            "data-rmx-document": "",
            children: "Sign in",
          }),
    ],
  });
}

interface RenderDeckOptions {
  css?: string;
  player?: string;
  presenter?: boolean;
  signedIn?: boolean;
  position?: number;
  alternate?: boolean;
  signIn?: boolean;
  slides: Slide[];
  revision: number;
  scope?: string;
  cursor?: number;
}
export async function renderDeck({
  css = "",
  player = "",
  presenter = false,
  signedIn = presenter,
  position = 0,
  alternate = false,
  signIn = false,
  slides,
  revision,
  scope,
  cursor,
}: RenderDeckOptions) {
  const current = Number.isInteger(position)
    ? Math.max(0, Math.min(slides.length - 1, position))
    : 0;
  const document = await renderToString(
    jsx("html", {
      lang: "en",
      mix: documentStyle,
      children: [
        jsx("head", {
          children: [
            jsx("meta", { charset: "utf-8" }),
            jsx("meta", {
              name: "viewport",
              content: "width=device-width,initial-scale=1",
            }),
            jsx("title", {
              children: `@harrhy/slides - ${current + 1}/${slides.length}`,
            }),
            jsx("link", {
              rel: "icon",
              type: "image/svg+xml",
              href: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><text x="16" y="25" text-anchor="middle" font-size="27">🎞️</text></svg>')}`,
            }),
            jsx("link", {
              rel: "preload",
              as: "font",
              href: fontUrl,
              type: "font/woff2",
              crossorigin: "anonymous",
            }),
            jsx("style", { innerHTML: unsafeHTML(css) }),
          ],
        }),
        jsx("body", {
          "data-mode": presenter ? "presenter" : "audience",
          "data-revision": revision,
          "data-scope": scope,
          "data-cursor": cursor,
          "data-position": String(current),
          "data-alternate": String(alternate),
          children: [
            jsx("main", {
              "aria-label": "Talk slides",
              children: slides.map((slide, index) =>
                renderSlide(
                  slide,
                  index,
                  index !== current,
                  index === current && alternate,
                ),
              ),
            }),
            account({ signIn, signedIn, presenter }),
            presenter ? clicker() : null,
            jsx("span", { id: "status", role: "status" }),
            jsx("script", { children: player }),
          ],
        }),
      ],
    }),
  );
  return `<!doctype html>${document}`;
}
