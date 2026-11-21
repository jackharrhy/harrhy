import { Application, Container, Sprite, Texture } from "pixi.js";
import "pixi.js/unsafe-eval";

export function worldCamera(map, overlay, signal, onPan) {
  const app = new Application();
  const world = new Container({ sortableChildren: true });
  const sprites = new Map();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let pose = { x: 0, y: 0, scale: 1 },
    frame = 0,
    width = 0,
    height = 0;
  let texture,
    ready = false,
    scene,
    drag,
    suppressClick = false;
  function paint() {
    overlay.style.transform = `translate(${pose.x}px,${pose.y}px) scale(${pose.scale})`;
    overlay.style.setProperty("--label-scale", Math.min(1, 1 / pose.scale));
    if (!ready) return;
    world.position.set(pose.x, pose.y);
    world.scale.set(pose.scale);
    app.render();
  }
  function present() {
    if (!ready || !scene) return;
    const { tiles, boxes, color } = scene;
    const visible = new Set();
    for (const tile of tiles) {
      const box = boxes.get(tile.id);
      if (!box) continue;
      visible.add(tile.id);
      let sprite = sprites.get(tile.id);
      if (!sprite) {
        sprite = new Sprite(texture);
        sprites.set(tile.id, sprite);
        world.addChild(sprite);
      }
      sprite.position.set(box.x, box.y);
      sprite.width = Math.max(0, box.w - 0.55);
      sprite.height = Math.max(0, box.h - 0.55);
      sprite.zIndex = tile.depth;
      sprite.tint = color(tile);
    }
    for (const [id, sprite] of sprites)
      if (!visible.has(id)) {
        sprite.destroy();
        sprites.delete(id);
      }
    paint();
  }
  void app
    .init({
      preference: "webgl",
      autoStart: false,
      sharedTicker: false,
      antialias: false,
      resolution: Math.min(2, devicePixelRatio),
      autoDensity: true,
      backgroundAlpha: 0,
    })
    .then(() => {
      if (signal.aborted) {
        app.destroy(true);
        return;
      }
      const source = document.createElement("canvas");
      source.width = source.height = 64;
      const ctx = source.getContext("2d");
      const gradient = ctx.createRadialGradient(26, 23, 3, 32, 32, 44);
      gradient.addColorStop(0, "#fff");
      gradient.addColorStop(0.48, "#d9d9d9");
      gradient.addColorStop(1, "#616161");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 64, 64);
      texture = Texture.from(source);
      app.stage.addChild(world);
      app.canvas.className = "world-canvas";
      app.canvas.setAttribute("aria-hidden", "true");
      map.prepend(app.canvas);
      ready = true;
      map.dataset.renderer = "pixi-webgl";
      app.renderer.resize(Math.max(1, width), Math.max(1, height));
      present();
    })
    .catch(() => {
      map.dataset.renderer = "dom-fallback";
    });
  function clamp(next) {
    const pad = 48;
    return {
      scale: next.scale,
      x: Math.min(width - pad, Math.max(pad - width * next.scale, next.x)),
      y: Math.min(height - pad, Math.max(pad - height * next.scale, next.y)),
    };
  }
  function move(next, animate = true) {
    cancelAnimationFrame(frame);
    frame = 0;
    next = clamp(next);
    if (!animate || reduced.matches || document.hidden) {
      pose = next;
      paint();
      return;
    }
    const from = pose,
      start = performance.now();
    function tick(time) {
      const t = Math.min(1, (time - start) / 380),
        eased = 1 - (1 - t) ** 3;
      pose = {
        x: from.x + (next.x - from.x) * eased,
        y: from.y + (next.y - from.y) * eased,
        scale: from.scale + (next.scale - from.scale) * eased,
      };
      paint();
      frame = t < 1 ? requestAnimationFrame(tick) : 0;
    }
    frame = requestAnimationFrame(tick);
  }
  map.addEventListener(
    "pointerdown",
    (e) => {
      if (e.button !== 0 || drag) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, pose };
    },
    { signal },
  );
  map.addEventListener(
    "pointermove",
    (e) => {
      if (drag?.id !== e.pointerId) return;
      const dx = e.clientX - drag.x,
        dy = e.clientY - drag.y;
      if (!drag.moving && Math.hypot(dx, dy) < 5) return;
      if (!drag.moving) {
        drag.moving = true;
        map.setPointerCapture(e.pointerId);
        onPan();
      }
      move({ ...drag.pose, x: drag.pose.x + dx, y: drag.pose.y + dy }, false);
    },
    { signal },
  );
  function release(e) {
    if (drag?.id !== e.pointerId) return;
    suppressClick = !!drag.moving;
    drag = undefined;
    if (suppressClick)
      setTimeout(() => {
        suppressClick = false;
      }, 0);
  }
  map.addEventListener("pointerup", release, { signal });
  map.addEventListener("pointercancel", release, { signal });
  map.addEventListener(
    "click",
    (e) => {
      if (suppressClick) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    { signal, capture: true },
  );
  map.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      onPan();
      const r = map.getBoundingClientRect();
      const x = e.clientX - r.x,
        y = e.clientY - r.y;
      const scale = Math.max(
        0.5,
        Math.min(48, pose.scale * Math.exp(-e.deltaY * 0.002)),
      );
      move(
        {
          x: x - ((x - pose.x) * scale) / pose.scale,
          y: y - ((y - pose.y) * scale) / pose.scale,
          scale,
        },
        false,
      );
    },
    { signal, passive: false },
  );
  signal.addEventListener("abort", () => {
    cancelAnimationFrame(frame);
    if (ready) {
      app.destroy(true, { children: true });
      texture.destroy(true);
    }
  });
  return {
    move,
    get pose() {
      return pose;
    },
    scene(w, h, tiles, boxes, color) {
      if (width !== w || height !== h) {
        width = w;
        height = h;
        if (ready) app.renderer.resize(Math.max(1, w), Math.max(1, h));
      }
      scene = { tiles, boxes, color };
      present();
    },
    fit(box) {
      const scale = Math.min(
        48,
        Math.min((width - 24) / box.w, (height - 24) / box.h),
      );
      return {
        x: (width - box.w * scale) / 2 - box.x * scale,
        y: (height - box.h * scale) / 2 - box.y * scale,
        scale,
      };
    },
  };
}
