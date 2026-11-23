import { watch, type Port } from "@harrhy/live-state/watch";
import type { Position } from "./deck.ts";
import { newWebSocketRpcSession, newHttpBatchRpcSession } from "capnweb";
import { clickerPreview } from "./clicker-preview.ts";
import { clickerTimer } from "./player-controls.ts";

interface PresenterRpc {
  goTo(position: number, revision: number): Promise<Position>;
  runAction(
    position: number,
    action: string,
    alternate: boolean | undefined,
    revision: number,
  ): Promise<Position>;
}

interface Command {
  position: number;
  alternate?: boolean;
  action?: string;
}

(() => {
  const slides = [...document.querySelectorAll<HTMLElement>(".slide")];
  const statusElement = document.querySelector<HTMLElement>("#status");
  if (!statusElement || !slides.length) return;
  const status = statusElement;
  const revision = Number(document.body.dataset.revision);
  const { mode, position } = document.body.dataset;
  const canNavigate = mode === "presenter";
  let current = Number(position ?? 0);
  let writing = false;
  let reading = false;
  let writeVersion = 0;
  let live = false;
  let socket: WebSocket | undefined;
  let reconnectTimer: number | undefined;
  let retries = 0;

  const scope = document.body.dataset.scope!;
  let cursor = Number(document.body.dataset.cursor);
  function sameDocument(state: Position) {
    if (state.scope === scope && state.cursor < cursor) return false;
    if (state.scope === scope && state.revision === revision) {
      cursor = state.cursor;
      return true;
    }
    location.reload();
    return false;
  }
  const view = watch<Position>((items) => {
    live = !!items?.length;
    if (!items?.length) return; // keep displaying last known slide; polling resumes
    retries = 0;
    const state = items[0];
    if (
      sameDocument(state) &&
      (state.position !== current || state.alternate !== alternate)
    )
      show(state.position, state.alternate);
  });
  function connect() {
    const url = new URL("/watch", location.href);
    url.searchParams.set("scope", scope);
    url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(url);
    socket = ws;
    const api = newWebSocketRpcSession<Port<Position>>(ws);
    void view.reconnect(api, scope).catch(() => ws.close());
    ws.addEventListener("close", () => {
      api[Symbol.dispose]();
      if (socket !== ws) return;
      socket = undefined;
      void view.disconnect();
      if (!suspended) {
        void follow();
        reconnectTimer = window.setTimeout(
          connect,
          Math.min(15000, 800 * 2 ** retries++),
        );
      }
    });
  }

  let suspended = false;
  window.addEventListener("pagehide", () => {
    suspended = true;
    clearTimeout(reconnectTimer);
    void view.disconnect();
    socket?.close();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      suspended = false;
      live = false;
      clearTimeout(reconnectTimer);
      connect();
    }
  });

  let alternate = document.body.dataset.alternate === "true";

  const clicker = document.querySelector<HTMLDialogElement>("#clicker");
  const prev = document.querySelector<HTMLButtonElement>("#clicker-prev");
  const next = document.querySelector<HTMLButtonElement>("#clicker-next");
  const actionButton =
    document.querySelector<HTMLButtonElement>("#clicker-action");
  const updateTimer = clicker && clickerTimer(clicker);
  const updatePreview = clicker && clickerPreview(clicker, slides);
  document.querySelector("#open-clicker")?.addEventListener("click", () => {
    updateTimer?.();
    clicker?.showModal();
    updatePreview?.(current);
  });
  prev?.addEventListener("click", () => void navigate(current - 1));
  next?.addEventListener("click", () => void navigate(current + 1));
  actionButton?.addEventListener("click", () => void runAction());

  function showWindows(slide: HTMLElement, second: boolean) {
    const windows = [...slide.querySelectorAll("[data-window]")];
    for (const [index, window] of windows.entries()) {
      const front = index === (second ? 0 : 1);
      window.toggleAttribute("data-front", front);
      const control = window.matches("[data-window-control]")
        ? window
        : window.querySelector("[data-window-control]");
      control?.setAttribute("aria-pressed", String(front));
    }
  }

  for (const stack of document.querySelectorAll("[data-window-stack]")) {
    stack.addEventListener("click", (event) => {
      const selected =
        event.target instanceof Element &&
        event.target.closest("[data-window]");
      if (!selected) return;
      const second = selected === stack.querySelector("[data-window]");
      if (canNavigate) {
        if (second !== alternate) void runAction(second);
      } else {
        showWindows(slides[current], second);
      }
    });
  }

  function runAction(nextAlternate?: boolean) {
    const action = slides[current].dataset.action;
    if (canNavigate && action)
      return send({ position: current, action, alternate: nextAlternate });
  }

  let titleAnimation:
    | {
        line: SVGTextElement;
        caret: SVGRectElement;
        full: string;
        context: CanvasRenderingContext2D;
        x: number;
      }
    | undefined;
  let titleTimer: number | undefined;
  let titleTarget: string | undefined;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

  function updateTitle(animate: boolean) {
    if (!titleAnimation) return;
    const { line, caret, full, context, x } = titleAnimation;
    const target = alternate ? full : full.slice(0, 2);
    if (target === titleTarget && animate) return;
    titleTarget = target;
    clearTimeout(titleTimer);
    const draw = (value: string) => {
      line.textContent = value;
      caret.setAttribute(
        "x",
        String(Math.min(992, 17 + context.measureText(value).width * x)),
      );
    };
    if (!animate || reducedMotion.matches) {
      draw(target);
      return;
    }
    function tick() {
      const value = line.textContent ?? "";
      const length = value.length + (target.length > value.length ? 1 : -1);
      draw(full.slice(0, length));
      if (length !== target.length)
        titleTimer = window.setTimeout(tick, target === full ? 75 : 42);
    }
    if (line.textContent !== target) titleTimer = window.setTimeout(tick, 65);
  }

  function fitPoster(slide: HTMLElement) {
    const poster = slide.querySelector("[data-poster]");
    if (!poster || slide.hasAttribute("data-poster-ready")) return;
    const font = "800 100px Allo";
    void document.fonts
      .load(font)
      .then(() => {
        const context = document.createElement("canvas").getContext("2d");
        if (!context) return;
        context.font = font;
        const lines = [...poster.querySelectorAll("text")];
        const gap = 12;
        const height = (1000 - gap * (lines.length + 1)) / lines.length;
        for (const [index, line] of lines.entries()) {
          const {
            actualBoundingBoxLeft: left,
            actualBoundingBoxRight: right,
            actualBoundingBoxAscent: ascent,
            actualBoundingBoxDescent: descent,
          } = context.measureText(line.textContent ?? "");
          if (left + right <= 0 || ascent + descent <= 0) return;
          const x =
            (poster.hasAttribute("data-typing-poster") ? 956 : 976) /
            (left + right);
          const y = height / (ascent + descent);
          line.setAttribute(
            "transform",
            `translate(${12 + left * x} ${gap + index * (height + gap) + ascent * y}) scale(${x} ${y})`,
          );
        }
        if (poster.hasAttribute("data-typing-poster")) {
          const line = lines[0];
          const caret = poster.querySelector<SVGRectElement>(".poster-caret");
          if (!line || !caret) return;
          const metrics = context.measureText(line.textContent ?? "");
          titleAnimation = {
            line,
            caret,
            full: line.textContent ?? "",
            context,
            x:
              956 /
              (metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight),
          };
          if (slides[current] === slide) updateTitle(false);
        }
        poster.removeAttribute("hidden");
        slide.setAttribute("data-poster-ready", "");
      })
      .catch(() => {}); // Keep the plain heading if the font cannot load.
  }

  function show(index: number, nextAlternate = false) {
    if (!Number.isInteger(index)) return;
    const previous = current;
    const previousAlternate = alternate;
    alternate = nextAlternate;
    current = Math.max(0, Math.min(slides.length - 1, index));
    document.title = `@harrhy/slides - ${current + 1}/${slides.length}`;
    slides.forEach((slide, i) => {
      slide.hidden = i !== current;
    });
    const slide = slides[current];
    if (previous !== current) {
      const video = slides[previous]?.querySelector("video");
      if (video) {
        video.pause();
        video.currentTime = 0;
      }
    }
    const video = slide.querySelector("video");
    if (video) {
      if (alternate) {
        if (video.ended) video.currentTime = 0;
        void video.play().catch(() => {
          status.textContent = "Could not play the recording.";
        });
      } else video.pause();
    }
    fitPoster(slide);
    if (previous !== current)
      slides[previous]?.removeAttribute("data-stretch-poster");
    if (
      slide.dataset.action === "stretch-poster" &&
      (previous === current ? previousAlternate !== alternate : alternate)
    ) {
      slide.removeAttribute("data-stretch-poster");
      void slide.offsetWidth;
      slide.setAttribute("data-stretch-poster", "");
    }
    if (slide.dataset.action === "type-title")
      updateTitle(previous === current);
    else {
      clearTimeout(titleTimer);
      titleTarget = undefined;
    }
    showWindows(slide, alternate);
    if (actionButton) {
      actionButton.hidden = !slide.dataset.action;
      actionButton.textContent = slide.dataset.actionLabel ?? "";
      if (prev) prev.disabled = current === 0;
      if (next) next.disabled = current === slides.length - 1;
    }
    status.textContent = `Slide ${current + 1} of ${slides.length}: ${slide.querySelector("h1, h2")?.textContent ?? ""}`;
    updatePreview?.(current);
    window.scrollTo(0, 0);
  }

  async function navigate(index: number) {
    if (
      !canNavigate ||
      writing ||
      index < 0 ||
      index >= slides.length ||
      index === current
    )
      return;
    await send({ position: index });
  }

  async function send(command: Command) {
    if (writing) return;
    writing = true;
    writeVersion += 1;
    try {
      const target = new Request(new URL("/position", location.href), {
        signal: AbortSignal.timeout(5000),
      });
      const presenter = newHttpBatchRpcSession<PresenterRpc>(target);
      const state = command.action
        ? await presenter.runAction(
            command.position,
            command.action,
            command.alternate,
            revision,
          )
        : await presenter.goTo(command.position, revision);
      if (!live && sameDocument(state)) {
        show(state.position, state.alternate);
      }
    } catch {
      status.textContent = "Could not change the shared slide. Try again.";
    } finally {
      writing = false;
    }
  }

  async function follow() {
    if (live || reading || writing || document.hidden) return;
    reading = true;
    const version = writeVersion;
    try {
      const response = await fetch("/position", {
        cache: "no-store",
        signal: AbortSignal.timeout(3500),
      });
      if (!response.ok || writing) return;
      const state = (await response.json()) as Position;
      if (!live && !writing && version === writeVersion && !sameDocument(state))
        return;
      if (
        (state.position !== current || state.alternate !== alternate) &&
        !live &&
        !writing &&
        version === writeVersion
      )
        show(state.position, state.alternate);
    } catch {
      // Keep showing the last known slide until the next successful read.
    } finally {
      reading = false;
    }
  }

  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      status.textContent =
        "Fullscreen unavailable. Try your browser’s fullscreen command.";
    }
  }

  document.addEventListener("keydown", (event) => {
    if (
      event.defaultPrevented ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey
    )
      return;
    const target = event.target instanceof Element ? event.target : null;
    if (
      event.key === " " &&
      target?.closest("button, a, input, textarea, select, [contenteditable]")
    )
      return;
    if (!canNavigate && event.key !== "f") return;
    switch (event.key) {
      case "ArrowRight":
      case "PageDown":
      case " ":
        void navigate(current + 1);
        break;
      case "ArrowLeft":
      case "PageUp":
        void navigate(current - 1);
        break;
      case "Home":
        void navigate(0);
        break;
      case "End":
        void navigate(slides.length - 1);
        break;
      case "Enter":
        if (
          !["type-title", "play-video", "stretch-poster"].includes(
            slides[current].dataset.action ?? "",
          ) ||
          target?.closest("button, a")
        )
          return;
        void runAction();
        break;
      case "f":
        if (!event.repeat) void fullscreen();
        break;
      default:
        return;
    }
    event.preventDefault();
  });
  show(current, alternate);
  connect();
  setInterval(follow, 850);
  document.addEventListener("visibilitychange", follow);
})();
