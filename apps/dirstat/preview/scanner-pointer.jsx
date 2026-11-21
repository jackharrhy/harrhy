import { css, ref } from "remix/component";

const overlay = css({
  position: "absolute",
  inset: 0,
  zIndex: 43,
  pointerEvents: "none",
  "& svg": {
    position: "absolute",
    left: 0,
    top: 0,
    overflow: "visible",
    pointerEvents: "none",
  },
  ".marker": { transformOrigin: "0 0" },
  ".spark": { opacity: 0 },
});

export function ScannerPointer(handle) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const signal = handle.signal;
  let layer, arrow, bolt, wake, target;
  let x,
    y,
    angle = 0,
    vx = 0,
    vy = 0;
  let raf = 0,
    previousTime = 0,
    lastZap = -Infinity,
    pending = false;
  let spark, pulse;
  let departing = false;
  let bounds;

  function paint() {
    // The SVG tip is the origin, so rotation never throws it off the target.
    const speed = Math.hypot(vx, vy);
    const extent = Math.min(24, speed * 0.026);
    wake.style.opacity = reduce.matches ? 0 : Math.min(0.6, speed / 650);
    wake.style.transform = `translate(${x}px,${y}px) rotate(${angle - Math.PI * 0.75}rad) scale(${extent / 24},1)`;
    arrow.style.transform = `translate(${x}px, ${y}px) rotate(${angle}rad)`;
  }
  function snap() {
    cancelAnimationFrame(raf);
    raf = previousTime = vx = vy = 0;
    pending = false;
    spark?.cancel();
    pulse?.cancel();
    if (!target || !arrow) return;
    ({ x, y } = target);
    angle = 0;
    paint();
  }
  function zap(time) {
    if (!pending) return;
    pending = false;
    if (time - lastZap < 440) return;
    lastZap = time;
    const tile = layer.parentElement.querySelector(
      `[data-tile="${target.tileId ?? target.id}"]`,
    );
    if (!tile) return;
    bolt.style.transform = `translate(${target.x}px, ${target.y}px)`;
    spark = bolt.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 200,
      easing: "ease-out",
    });
    pulse = tile.animate(
      [
        { boxShadow: "inset 0 0 0 2px #fff6b6" },
        { boxShadow: "inset 0 0 0 2px #fff6b600" },
      ],
      { duration: 240, easing: "ease-out" },
    );
  }
  function tick(time) {
    raf = 0;
    // Bound integration steps so a dropped frame cannot kick the pointer across the map.
    const dt = Math.min((time - (previousTime || time - 16)) / 1000, 0.032);
    previousTime = time;
    for (let step = dt; step > 0; step -= 0.008) {
      const h = Math.min(step, 0.008);
      vx += (520 * (target.x - x) - 37 * vx) * h;
      vy += (520 * (target.y - y) - 37 * vy) * h;
      x += vx * h;
      y += vy * h;
    }
    const dx = target.x - x,
      dy = target.y - y;
    const distance = Math.hypot(dx, dy),
      speed = Math.hypot(vx, vy);
    if (distance > 4 || speed > 45) {
      const heading =
        (speed > 45 ? Math.atan2(vy, vx) : Math.atan2(dy, dx)) + Math.PI * 0.75;
      const delta = heading - angle;
      angle +=
        Math.atan2(Math.sin(delta), Math.cos(delta)) * (1 - Math.exp(-16 * dt));
    }
    if (distance <= 6) zap(time);
    if (distance < 0.75 && speed < 10) {
      ({ x, y } = target);
      previousTime = vx = vy = 0;
    } else {
      raf = requestAnimationFrame(tick);
    }
    paint();
  }
  function hide() {
    cancelAnimationFrame(raf);
    raf = 0;
    bounds?.disconnect();
    layer.hidden = true;
  }
  function depart() {
    if (departing) return;
    departing = true;
    cancelAnimationFrame(raf);
    spark?.cancel();
    pulse?.cancel();
    if (reduce.matches || document.hidden || x === undefined) return hide();

    const start = performance.now();
    const originX = x,
      originY = y;
    const phase = angle - Math.PI * 1.25;
    let width = layer.clientWidth,
      height = layer.clientHeight;
    bounds = new ResizeObserver(
      ([entry]) => ({ width, height } = entry.contentRect),
    );
    bounds.observe(layer);
    signal.addEventListener("abort", () => bounds.disconnect(), { once: true });
    function spiral(time) {
      const t = Math.max(0, Math.min(1, (time - start) / 10000));
      if (t === 1) {
        hide();
        return;
      }
      const short = Math.min(width, height);
      const radius = short * 0.24 * t;
      const inset = radius + Math.min(38, short * 0.17) * t;
      const theta = phase + Math.PI * 6 * (1 - (1 - t) ** 1.25);
      const nextX =
        Math.min(width - inset, Math.max(inset, originX)) +
        radius * Math.cos(theta);
      const nextY =
        Math.min(height - inset, Math.max(inset, originY)) +
        radius * Math.sin(theta);
      const delta = Math.atan2(nextY - y, nextX - x) + Math.PI * 0.75 - angle;
      angle += Math.atan2(Math.sin(delta), Math.cos(delta)) * 0.16;
      x = nextX;
      y = nextY;
      paint();
      arrow.style.opacity = 1 - t;
      raf = requestAnimationFrame(spiral);
    }
    raf = requestAnimationFrame(spiral);
  }
  function retarget(props) {
    if (props.complete) return depart();
    const { id, box, tileId } = props;
    const next = { id, tileId, x: box.x + box.w / 2, y: box.y + box.h / 2 };
    if (target?.id === next.id && target.x === next.x && target.y === next.y)
      return;
    if (target?.id !== id) pending = true;
    target = next;
    if (reduce.matches || document.hidden) return snap();
    x ??= next.x + (next.x < 50 ? 35 : -35);
    y ??= next.y;
    paint();
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function interrupt() {
    if (departing) hide();
    else snap();
  }
  reduce.addEventListener("change", interrupt, { signal });
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) interrupt();
    },
    { signal },
  );
  signal.addEventListener("abort", () => {
    cancelAnimationFrame(raf);
    spark?.cancel();
    pulse?.cancel();
  });

  return () => {
    const props = handle.props;
    handle.queueTask((taskSignal) => {
      if (!taskSignal.aborted) retarget(props);
    });
    return (
      <div
        mix={[
          overlay,
          ref((element) => {
            layer = element;
            [wake, arrow, bolt] = element.children;
          }),
        ]}
        aria-hidden="true"
      >
        <svg
          class="wake"
          width="24"
          height="12"
          style={{ transformOrigin: "0 0", opacity: 0 }}
        >
          <path d="M-25 0 -3 -4 -3 4Z" fill="#76e0f1" />
          <path d="M-21 0h18" stroke="#e8fbff" stroke-width="1" />
        </svg>
        <svg
          class="marker"
          data-marker={props.id}
          viewBox="0 0 36 42"
          width="36"
          height="42"
        >
          <path
            d="M0 0 32 14 23 17 32 25 23 29 16 23 8 31 8 19 3 15Z"
            fill="#c9f4f8"
            stroke="#1f2a31"
            stroke-width="2.4"
            stroke-linejoin="round"
          />
          <path
            d="m5 6 18 8"
            stroke="#f8fbfb"
            stroke-width="2"
            stroke-linecap="round"
          />
          <circle cx="13" cy="15" r="1.4" fill="#1f2a31" />
          <circle cx="19" cy="17" r="1.4" fill="#1f2a31" />
        </svg>
        <svg
          class="spark"
          data-spark
          viewBox="0 0 24 24"
          width="24"
          height="24"
        >
          <path
            d="m0 0 10-12-1 8 7-3-7 11 1-7Z"
            fill="#fff6b6"
            stroke="#1f2a31"
            stroke-width="1.4"
            stroke-linejoin="round"
          />
        </svg>
      </div>
    );
  };
}
