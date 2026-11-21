import { fitCamera, type Camera, type Point, type Box } from "./geometry.ts";
import { wheelNavigation } from "./wheel.ts";

function overCanvasControl(event: Event) {
  return (
    event.target instanceof Element &&
    !!event.target.closest(
      "a, button, input, textarea, select, summary, video, [contenteditable]",
    )
  );
}

export function attachViewport(
  viewport: HTMLElement,
  world: HTMLElement,
  options: {
    wheelMode: () => "pan" | "zoom";
    onView?: () => void;
    signal?: AbortSignal;
  },
) {
  const { signal, wheelMode } = options;
  let camera: Camera = { scale: 1, offsetX: 0, offsetY: 0 };
  let frame = 0;
  function set(next: Camera) {
    camera = next;
    if (!frame)
      frame = requestAnimationFrame(() => {
        frame = 0;
        world.style.transform = `translate(${camera.offsetX}px,${camera.offsetY}px) scale(${camera.scale})`;
        options.onView?.();
      });
  }
  signal?.addEventListener("abort", () => cancelAnimationFrame(frame), {
    once: true,
  });
  function screenPoint(event: MouseEvent): Point {
    const rect = viewport.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  function worldPoint(point: Point): Point {
    return {
      x: (point.x - camera.offsetX) / camera.scale,
      y: (point.y - camera.offsetY) / camera.scale,
    };
  }
  function zoomAt(
    factor: number,
    point = { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 },
  ) {
    const at = worldPoint(point);
    const scale = Math.max(0.1, Math.min(5, camera.scale * factor));
    set({
      scale,
      offsetX: point.x - at.x * scale,
      offsetY: point.y - at.y * scale,
    });
  }
  function fit(boxes: Iterable<Box>, inset: number) {
    set(fitCamera(boxes, viewport.getBoundingClientRect(), inset));
  }
  function startPan(event: PointerEvent) {
    const start = camera,
      x = event.clientX,
      y = event.clientY;
    return (move: PointerEvent) =>
      set({
        ...camera,
        offsetX: start.offsetX + move.clientX - x,
        offsetY: start.offsetY + move.clientY - y,
      });
  }
  // Safari can send a cumulative GestureEvent.scale instead of Ctrl+wheel.
  let gestureStartScale: number | null = null;
  viewport.addEventListener(
    "gesturestart",
    (event) => {
      if (overCanvasControl(event)) return;
      event.preventDefault();
      gestureStartScale = camera.scale;
    },
    { passive: false, signal },
  );
  viewport.addEventListener(
    "gesturechange",
    (event) => {
      if (gestureStartScale === null) return;
      event.preventDefault();
      const gesture = event as MouseEvent & { scale: number };
      if (!Number.isFinite(gesture.scale) || gesture.scale <= 0) return;
      const anchor =
        Number.isFinite(gesture.clientX) && Number.isFinite(gesture.clientY)
          ? screenPoint(gesture)
          : { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 };
      zoomAt((gestureStartScale * gesture.scale) / camera.scale, anchor);
    },
    { passive: false, signal },
  );
  viewport.addEventListener(
    "gestureend",
    (event) => {
      if (gestureStartScale !== null) event.preventDefault();
      gestureStartScale = null;
    },
    { passive: false, signal },
  );
  window.addEventListener(
    "blur",
    () => {
      gestureStartScale = null;
    },
    { signal },
  );
  viewport.addEventListener(
    "wheel",
    (event) => {
      if (overCanvasControl(event)) return;
      event.preventDefault();
      if (gestureStartScale !== null) return;
      const navigation = wheelNavigation(
        event,
        {
          width: viewport.clientWidth,
          height: viewport.clientHeight,
        },
        wheelMode(),
      );
      if (navigation.kind === "zoom") {
        zoomAt(navigation.factor, screenPoint(event));
      } else {
        set({
          ...camera,
          offsetX: camera.offsetX - navigation.x,
          offsetY: camera.offsetY - navigation.y,
        });
      }
    },
    { passive: false, signal },
  );

  return {
    get camera(): Readonly<Camera> {
      return camera;
    },
    set,
    fit,
    zoomAt,
    worldPoint,
    screenPoint,
    startPan,
  };
}
