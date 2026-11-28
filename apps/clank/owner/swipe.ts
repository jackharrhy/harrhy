export const phoneWidth = "(max-width: 40rem)";

// A nested panner owns the sequence, including its edges: scrolling a code
// sample to its end must not turn into navigation under the same finger.
function ownsDrag(target: Element, pane: Element) {
  if (
    target.closest(
      "input, textarea, select, [contenteditable], pre, code, [data-markdown=code-block], [role=slider], [draggable=true]",
    )
  )
    return true;
  for (
    let el: Element | null = target;
    el && el !== pane;
    el = el.parentElement
  ) {
    const style = getComputedStyle(el);
    if (
      style.touchAction === "none" ||
      (el.scrollWidth > el.clientWidth + 1 &&
        /^(auto|scroll)$/.test(style.overflowX))
    )
      return true;
  }
  return false;
}

type Drag = {
  id: number;
  open: boolean;
  sign: number;
  x: number;
  y: number;
  width: number;
  offset: number;
  taken: boolean;
  samples: { x: number; time: number }[];
};

/** Only previews the rail. Remix owns the pane, routing and focus. Native
 * pan-y / pinch-zoom arbitrate scrolling; pointercancel never commits. */
export function mountRailSwipe(
  shell: HTMLElement,
  signal: AbortSignal,
  showRail: (open: boolean) => Promise<void>,
) {
  const rail = shell.querySelector<HTMLElement>(".session-list")!;
  const detail = shell.querySelector<HTMLElement>(".session-detail")!;
  const phone = matchMedia(phoneWidth);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const capture = { capture: true, signal };
  let drag: Drag | undefined;
  let settle: Animation | undefined;
  let swallowClick = false;

  function reset() {
    if (!drag && !settle && !shell.hasAttribute("data-sliding")) return;
    if (settle) settle.onfinish = null;
    settle?.cancel();
    settle = undefined;
    drag = undefined;
    delete shell.dataset.sliding;
    rail.style.removeProperty("transform");
    rail.inert = detail.inert = false;
  }
  function eligible() {
    return (
      phone.matches &&
      shell.hasAttribute("data-can-slide") &&
      document.getSelection()?.isCollapsed !== false &&
      !document.querySelector("dialog[open], :popover-open")
    );
  }
  const transform = (offset: number) => `translateX(${offset}px)`;
  function down(e: PointerEvent) {
    const interrupted = Boolean(drag);
    reset();
    // A distinct tap/mouse press is not the compatibility click from a drag.
    if (e.isPrimary) swallowClick = false;
    else if (interrupted) swallowClick = true;
    if (
      interrupted ||
      e.pointerType !== "touch" ||
      !e.isPrimary ||
      !eligible() ||
      !(e.target instanceof Element)
    )
      return;
    const open = shell.dataset.pane === "list";
    const pane = open ? rail : detail;
    if (!pane.contains(e.target) || ownsDrag(e.target, pane)) return;
    const sign = getComputedStyle(shell).direction === "rtl" ? -1 : 1;
    const width = pane.getBoundingClientRect().width;
    if (!width) return;
    drag = {
      id: e.pointerId,
      open,
      sign,
      width,
      x: e.clientX,
      y: e.clientY,
      taken: false,
      offset: open ? 0 : -width * sign,
      samples: [{ x: e.clientX, time: e.timeStamp }],
    };
  }
  function move(e: PointerEvent) {
    const d = drag;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    if (!d.taken) {
      const dy = e.clientY - d.y;
      if (Math.hypot(dx, dy) < 6) return;
      // Once past slop, even a rejected gesture is no longer a tap.
      swallowClick = true;
      // Native P2 decides the axis once, within 35° of horizontal. A held
      // touch is left to selection and the row's long-press interaction.
      const towardEnd = dx * d.sign > 0;
      if (
        Math.abs(dy) > Math.abs(dx) * 0.7 ||
        towardEnd === d.open ||
        e.timeStamp - d.samples[0]!.time > 350 ||
        !eligible()
      )
        return reset();
      d.taken = true;
      if (!reduced.matches) {
        (d.open ? detail : rail).inert = true;
        shell.dataset.sliding = "";
      }
    }
    const distance = (d.open ? d.width : 0) + dx * d.sign;
    d.offset = (Math.max(0, Math.min(d.width, distance)) - d.width) * d.sign;
    if (!reduced.matches) rail.style.transform = transform(d.offset);
    d.samples.push({ x: e.clientX, time: e.timeStamp });
    while (d.samples.length > 1 && e.timeStamp - d.samples[0]!.time > 100)
      d.samples.shift();
  }
  function up(e: PointerEvent) {
    const d = drag;
    if (!d || d.id !== e.pointerId) return;
    drag = undefined;
    if (!d.taken || !eligible()) return reset();
    const first = d.samples.find((s) => e.timeStamp - s.time <= 100);
    const speed =
      first && e.timeStamp > first.time
        ? ((e.clientX - first.x) * d.sign) / (e.timeStamp - first.time)
        : 0;
    const open =
      Math.abs(speed) > 0.3 ? speed > 0 : Math.abs(d.offset) < d.width / 2;
    const destination = open ? 0 : -d.width * d.sign;
    const finish = async () => {
      const animation = settle;
      if (
        open !== d.open &&
        (shell.dataset.pane === "list") === d.open &&
        eligible()
      ) {
        // Keep the terminal frame painted until Remix renders the matching pane.
        rail.inert = detail.inert = false;
        await showRail(open);
      }
      if (settle === animation && !drag) reset();
    };
    const remaining = Math.abs(destination - d.offset);
    if (!remaining || reduced.matches) return finish();
    const duration = Math.min(
      120 + (200 * remaining) / d.width,
      Math.max(120, (4 * remaining) / Math.abs(speed)),
    );
    settle = rail.animate(
      [
        { transform: transform(d.offset) },
        { transform: transform(destination) },
      ],
      { duration, easing: "cubic-bezier(.2,.8,.4,1)", fill: "forwards" },
    );
    settle.onfinish = finish;
  }
  window.addEventListener("pointerdown", down, capture);
  window.addEventListener("pointermove", move, capture);
  window.addEventListener("pointerup", up, capture);
  window.addEventListener("pointercancel", reset, capture);
  window.addEventListener("contextmenu", reset, capture);
  window.addEventListener("keydown", reset, capture);
  window.addEventListener("pagehide", reset, capture);
  window.addEventListener("popstate", reset, capture);
  document.addEventListener("visibilitychange", reset, { signal });
  phone.addEventListener("change", reset, { signal });
  reduced.addEventListener("change", reset, { signal });
  window.addEventListener(
    "mousedown",
    (e) => {
      if (swallowClick) e.preventDefault();
    },
    capture,
  );
  window.addEventListener(
    "click",
    (e) => {
      if (!swallowClick || e.detail === 0) return;
      swallowClick = false;
      e.preventDefault();
      e.stopImmediatePropagation();
    },
    capture,
  );
  signal.addEventListener("abort", reset, { once: true });
}
