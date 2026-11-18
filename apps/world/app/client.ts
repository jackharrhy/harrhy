import type { PoolCommand, PoolState } from "../shared/pool-wire";
import type { FloorPoint } from "./bsp-render";
import { loadBspCollision } from "../shared/bsp-collision";
import { createMotion } from "../shared/motion";
import {
  BSP_MAP_PATH,
  TICK_MS,
  type InputCommand,
  type Pose,
  type ServerMessage,
} from "../shared/protocol";

const movementKeys = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "Space",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
]);
const turn = Math.PI * 2;
const clampPitch = (n: number) => Math.max(-1.5, Math.min(1.5, n));

function noop() {}

export function mount(canvas: HTMLCanvasElement, lifetime: AbortSignal) {
  const root = canvas.closest<HTMLElement>("#hall")!;
  const status = root.querySelector<HTMLElement>("#status")!;
  const button = root.querySelector<HTMLButtonElement>("#enter")!;
  const controls = root.querySelector<HTMLElement>("#controls")!;
  const poolControls = root.querySelector<HTMLElement>("#pool-controls")!;
  const poolStatus = root.querySelector<HTMLElement>("#pool-status")!;
  const poolAction = root.querySelector<HTMLElement>("#pool-shot-controls")!;
  const poolJoin = root.querySelector<HTMLButtonElement>("#pool-join")!;
  const poolLeave = root.querySelector<HTMLButtonElement>("#pool-leave")!;
  const poolAim = root.querySelector<HTMLInputElement>("#pool-aim")!;
  const angle = () => (Number(poolAim.value) * Math.PI) / 180;
  const poolPower = root.querySelector<HTMLInputElement>("#pool-power")!;
  const poolShoot = root.querySelector<HTMLButtonElement>("#pool-shoot")!;
  const poolPlace = root.querySelector<HTMLButtonElement>("#pool-place")!;
  let stop = noop;
  function start() {
    stop();
    const scope = new AbortController();
    stop = () => scope.abort();
    void run(scope.signal).catch((error: unknown) => {
      if (scope.signal.aborted) return;
      console.error(error);
      status.textContent =
        "Cannot start the hall. Try a desktop browser with graphics acceleration enabled.";
      scope.abort();
    });
  }
  lifetime.addEventListener("abort", () => stop(), { once: true });
  window.addEventListener("pagehide", () => stop(), { signal: lifetime });
  window.addEventListener(
    "pageshow",
    (event) => {
      if (event.persisted) start();
    },
    { signal: lifetime },
  );
  start();

  async function run(signal: AbortSignal) {
    status.textContent = "Preparing the hall…";
    const health = await fetch("/healthz", { signal, cache: "no-store" });
    if (!health.ok) throw Error("The room is not ready");
    const { revision } = (await health.json()) as { revision: string };
    const mapResponse = await fetch(BSP_MAP_PATH, { signal });
    if (!mapResponse.ok) throw Error("Could not load the authored hall");
    const bytes = await mapResponse.arrayBuffer();
    const collision = await loadBspCollision(bytes);
    if (collision.revision !== revision)
      throw Error("The hall changed during loading; reload to join");
    if (signal.aborted) return;
    const { createBspView } = await import("./bsp-render");
    const view = await createBspView(canvas, bytes);
    if (signal.aborted) return view.dispose();
    let frame = 0,
      reconnect = 0;
    let ws: WebSocket | undefined;
    let me = "",
      seq = 0,
      yaw = 0,
      pitch = -0.28;
    let facing = 0;
    let orbitDistance = 3.6;
    let mode: "walk" | "fps" = "walk";
    let destination:
      | (FloorPoint & { best: number; progressAt: number })
      | undefined;
    let gesture:
      | {
          id: number;
          startX: number;
          startY: number;
          x: number;
          y: number;
          dragged: boolean;
          orbit: boolean;
        }
      | undefined;
    function setMode(next: typeof mode) {
      mode = next;
      root.dataset.mode = mode;
      controls.textContent =
        mode === "walk"
          ? matchMedia("(pointer: coarse)").matches
            ? "Drag to orbit · Tap to walk"
            : "Right-drag to orbit · Click to walk · Scroll to zoom"
          : "WASD to move · Hold Space to bhop · Scroll out for third person";
      destination = undefined;
      gesture = undefined;
      keys.clear();
      if (mode === "walk" && document.pointerLockElement === canvas)
        document.exitPointerLock();
    }
    let predicted: Awaited<ReturnType<typeof createMotion>> | undefined;
    let starting = false;
    let correction: Pose | undefined;
    let pending: InputCommand[] = [];
    const roster = new Set<string>();
    const samples: { at: number; players: Pose[] }[] = [];
    const keys = new Set<string>();
    const updateStatus = () => {
      if (!predicted) return;
      const value = `In the hall · ${roster.size} ${roster.size === 1 ? "player" : "players"}`;
      if (status.textContent !== value) status.textContent = value;
    };
    function reset() {
      predicted?.dispose();
      predicted = undefined;
      starting = false;
      me = "";
      seq = 0;
      correction = undefined;
      pending = [];
      roster.clear();
      samples.length = 0;
      keys.clear();
      button.disabled = true;
      destination = undefined;
      gesture = undefined;
    }
    setMode("walk");
    let tick: number | undefined;
    signal.addEventListener(
      "abort",
      () => {
        window.clearInterval(tick);
        window.clearTimeout(reconnect);
        cancelAnimationFrame(frame);
        reset();
        ws?.close();
        if (document.pointerLockElement === canvas) document.exitPointerLock();
        delete root.dataset.looking;
        view.dispose();
      },
      { once: true },
    );

    let pool: PoolState | undefined;
    const seated = () => pool?.seats.includes(me) ?? false;
    function sendPool(command: PoolCommand) {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(command));
    }
    function showPool() {
      const pose = predicted?.pose();
      const isSeated = seated();
      root.toggleAttribute("data-pool", isSeated);
      poolControls.hidden =
        !pool ||
        !pose ||
        (!isSeated &&
          Math.hypot(pose.x - pool.table.x, pose.z - pool.table.z) > 3);
      if (!pool || poolControls.hidden) return;
      const label =
        pool.phase === "waiting"
          ? "Waiting for another player"
          : pool.phase === "finished"
            ? pool.winner === me
              ? "You won the rack"
              : "Rack finished"
            : pool.phase === "rolling"
              ? "Balls rolling"
              : pool.turn === me
                ? "Your turn"
                : "Opponent’s turn";
      if (poolStatus.textContent !== label) poolStatus.textContent = label;
      poolJoin.hidden = isSeated || pool.seats.length === 2;
      poolLeave.hidden = !isSeated;
      poolAction.hidden =
        !isSeated ||
        pool.turn !== me ||
        !["aiming", "ball-in-hand"].includes(pool.phase);
      poolShoot.hidden = pool.phase !== "aiming";
      poolPlace.hidden = pool.phase !== "ball-in-hand";
    }
    poolJoin.addEventListener(
      "click",
      () => {
        if (pool) sendPool({ type: "pool-join", tableId: pool.table.id });
      },
      { signal },
    );
    poolLeave.addEventListener(
      "click",
      () => {
        if (pool) sendPool({ type: "pool-leave", tableId: pool.table.id });
      },
      { signal },
    );
    poolShoot.addEventListener(
      "click",
      () => {
        if (pool)
          sendPool({
            type: "pool-shot",
            turnToken: pool.turnToken,
            tableId: pool.table.id,
            yaw: angle(),
            power: Number(poolPower.value),
          });
      },
      { signal },
    );
    poolPlace.addEventListener(
      "click",
      () => {
        if (pool)
          sendPool({
            type: "pool-place",
            turnToken: pool.turnToken,
            tableId: pool.table.id,
            x: 0,
            z: 0.5,
          });
      },
      { signal },
    );
    function connect() {
      if (signal.aborted) return;
      status.textContent = "Connecting to the hall…";
      const socket = new WebSocket(
        `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/room?revision=${encodeURIComponent(revision)}`,
      );
      ws = socket;
      socket.addEventListener("message", (event) => {
        if (signal.aborted || ws !== socket || typeof event.data !== "string")
          return;
        const message = JSON.parse(event.data) as ServerMessage;
        switch (message.type) {
          case "welcome":
            me = message.id;
            break;
          case "roster":
            message.ids.forEach((id) => roster.add(id));
            break;
          case "joined":
            roster.add(message.id);
            updateStatus();
            break;
          case "left":
            roster.delete(message.id);
            updateStatus();
            break;
          case "pool":
            pool = message;
            if (seated()) {
              destination = undefined;
              keys.clear();
              if (document.pointerLockElement === canvas)
                document.exitPointerLock();
            }
            showPool();
            break;
          case "motion": {
            const self = message.players.find((p) => p.id === me);
            if (!self) break;
            samples.push({ at: performance.now(), players: message.players });
            if (samples.length > 8) samples.shift();
            correction = self;
            if (predicted || starting) break;
            starting = true;
            void createMotion(self, collision)
              .then((motion) => {
                if (
                  signal.aborted ||
                  ws !== socket ||
                  socket.readyState !== WebSocket.OPEN
                )
                  return motion.dispose();
                predicted = motion;
                yaw = self.yaw;
                pitch = mode === "walk" ? -0.28 : self.pitch;
                button.disabled = false;
                updateStatus();
              })
              .catch((error: unknown) => {
                if (signal.aborted || ws !== socket) return;
                console.error(error);
                status.textContent = "Could not initialize movement.";
                stop();
              });
            break;
          }
        }
      });
      socket.addEventListener("close", () => {
        if (signal.aborted || ws !== socket) return;
        reset();
        pool = undefined;
        poolControls.hidden = true;
        if (document.pointerLockElement === canvas) document.exitPointerLock();
        status.textContent = "Disconnected. Rejoining…";
        reconnect = window.setTimeout(connect, 1500);
      });
    }
    const focus = () => {
      if (!predicted || mode !== "fps") return;
      canvas.focus();
      void Promise.resolve(canvas.requestPointerLock?.()).catch(() => {});
    };
    button.addEventListener("click", focus, { signal });
    canvas.addEventListener(
      "click",
      (event) => {
        if (pool?.phase === "ball-in-hand" && pool.turn === me) {
          const point = view.pickPool(event.clientX, event.clientY);
          if (point)
            sendPool({
              type: "pool-place",
              tableId: pool.table.id,
              turnToken: pool.turnToken,
              ...point,
            });
          return;
        }
        if (mode === "fps" && !seated() && event.pointerType !== "touch")
          focus();
      },
      { signal },
    );
    canvas.addEventListener(
      "pointerdown",
      (event) => {
        if (
          !predicted ||
          !event.isPrimary ||
          (event.button !== 0 && !(mode === "walk" && event.button === 2)) ||
          document.pointerLockElement === canvas
        )
          return;
        if (mode === "fps" && !seated() && event.pointerType !== "touch")
          return;
        canvas.focus();
        canvas.setPointerCapture(event.pointerId);
        gesture = {
          id: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          x: event.clientX,
          y: event.clientY,
          dragged: false,
          orbit: event.button === 2 || event.pointerType === "touch",
        };
      },
      { signal },
    );
    canvas.addEventListener(
      "pointermove",
      (event) => {
        if (gesture?.id !== event.pointerId) return;
        if (
          !gesture.dragged &&
          Math.hypot(
            event.clientX - gesture.startX,
            event.clientY - gesture.startY,
          ) < 7
        )
          return;
        gesture.dragged = true;
        if (!gesture.orbit) return;
        yaw = (yaw - (event.clientX - gesture.x) * 0.005) % turn;
        pitch = clampPitch(pitch - (event.clientY - gesture.y) * 0.005);
        gesture.x = event.clientX;
        gesture.y = event.clientY;
      },
      { signal },
    );
    canvas.addEventListener(
      "pointerup",
      (event) => {
        if (gesture?.id !== event.pointerId) return;
        if (mode === "walk" && event.button === 0 && !gesture.dragged) {
          const point = view.pickFloor(event.clientX, event.clientY);
          destination = point && {
            ...point,
            best: Infinity,
            progressAt: performance.now(),
          };
        }
        gesture = undefined;
      },
      { signal },
    );
    canvas.addEventListener(
      "lostpointercapture",
      (event) => {
        if (gesture?.id === event.pointerId) gesture = undefined;
      },
      { signal },
    );
    canvas.addEventListener(
      "wheel",
      (event) => {
        if (!predicted || event.ctrlKey || !event.deltaY) return;
        event.preventDefault();
        const scale =
          event.deltaMode === 1
            ? 16
            : event.deltaMode === 2
              ? canvas.clientHeight
              : 1;
        const next = orbitDistance * Math.exp(event.deltaY * scale * 0.002);
        orbitDistance = Math.max(1.4, Math.min(6.5, next));
        if (mode === "walk" && next <= 1.4) {
          setMode("fps");
          canvas.focus();
        } else if (mode === "fps" && event.deltaY > 0) {
          setMode("walk");
        }
      },
      { signal, passive: false },
    );
    canvas.addEventListener(
      "contextmenu",
      (event) => {
        if (mode === "walk") event.preventDefault();
      },
      { signal },
    );
    document.addEventListener(
      "pointerlockchange",
      () => {
        if (document.pointerLockElement === canvas) root.dataset.looking = "";
        else {
          delete root.dataset.looking;
          keys.clear();
        }
      },
      { signal },
    );
    document.addEventListener(
      "mousemove",
      (e) => {
        if (mode !== "fps" || document.pointerLockElement !== canvas) return;
        yaw = (yaw - e.movementX * 0.0025) % turn;
        pitch = clampPitch(pitch - e.movementY * 0.0025);
      },
      { signal },
    );
    window.addEventListener(
      "keydown",
      (e) => {
        if (
          !predicted ||
          !movementKeys.has(e.code) ||
          (document.activeElement !== canvas &&
            document.pointerLockElement !== canvas)
        )
          return;
        e.preventDefault();
        if (!e.code.startsWith("Arrow")) destination = undefined;
        keys.add(e.code);
      },
      { signal },
    );
    window.addEventListener("keyup", (e) => keys.delete(e.code), { signal });
    canvas.addEventListener("blur", () => keys.clear(), { signal });
    window.addEventListener("blur", () => keys.clear(), { signal });
    tick = window.setInterval(() => {
      if (
        !predicted ||
        ws?.readyState !== WebSocket.OPEN ||
        ws.bufferedAmount > 4096
      )
        return;
      if (correction) {
        const authoritative = correction;
        correction = undefined;
        pending = pending.filter((input) => input.seq > authoritative.ack);
        predicted.reconcile(authoritative, pending);
      }
      yaw =
        (yaw +
          (Number(keys.has("ArrowLeft")) - Number(keys.has("ArrowRight"))) *
            0.026) %
        turn;
      pitch = clampPitch(
        pitch +
          (Number(keys.has("ArrowUp")) - Number(keys.has("ArrowDown"))) * 0.026,
      );
      let forward = Number(keys.has("KeyW")) - Number(keys.has("KeyS"));
      let strafe = Number(keys.has("KeyD")) - Number(keys.has("KeyA"));
      if (destination) {
        const pose = predicted.pose();
        const dx = destination.x - pose.x,
          dz = destination.z - pose.z;
        const distance = Math.hypot(dx, dz);
        const now = performance.now();
        if (destination.best - distance > 0.025) {
          destination.best = distance;
          destination.progressAt = now;
        }
        if (distance < 0.14 || now - destination.progressAt > 500)
          destination = undefined;
        else {
          const approach = Math.min(0.65, distance * 0.75);
          forward =
            approach *
            Math.max(
              -1,
              Math.min(
                1,
                (-dx * Math.sin(yaw) - dz * Math.cos(yaw)) / distance,
              ),
            );
          strafe =
            approach *
            Math.max(
              -1,
              Math.min(1, (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / distance),
            );
        }
      }
      if (mode === "fps") facing = yaw;
      else if (forward || strafe) {
        const length = Math.hypot(forward, strafe);
        facing = (yaw - Math.atan2(strafe, forward)) % turn;
        forward = Math.min(1, length);
        strafe = 0;
      }
      const input = {
        seq: ++seq,
        forward: seated() ? 0 : forward,
        strafe: seated() ? 0 : strafe,
        jump: !seated() && keys.has("Space"),
        yaw: facing,
        pitch,
      };
      ws.send(JSON.stringify(input));
      pending.push(input);
      if (pending.length > 120) pending.shift();
      predicted.step(input);
    }, TICK_MS);
    function paint() {
      if (signal.aborted) return;
      if (predicted) {
        const target = performance.now() - 110;
        const later = samples.findIndex((s) => s.at >= target);
        const a =
          samples[Math.max(0, later === -1 ? samples.length - 1 : later - 1)];
        const b = samples[later] ?? a;
        const weight =
          a && b && b.at > a.at
            ? Math.max(0, Math.min(1, (target - a.at) / (b.at - a.at)))
            : 0;
        const remotes = (b?.players ?? [])
          .filter((p) => p.id !== me && roster.has(p.id))
          .map((p) => {
            const older = a?.players.find((o) => o.id === p.id);
            if (!older) return p;
            const dy = p.yaw - older.yaw;
            return {
              ...p,
              x: older.x + (p.x - older.x) * weight,
              y: older.y + (p.y - older.y) * weight,
              z: older.z + (p.z - older.z) * weight,
              yaw: older.yaw + Math.atan2(Math.sin(dy), Math.cos(dy)) * weight,
            };
          });
        showPool();
        try {
          view.draw(
            { ...predicted.pose(), yaw, pitch },
            remotes,
            destination,
            mode === "walk" ? predicted.pose() : undefined,
            orbitDistance,
            pool,
            seated() ? { aim: angle() } : undefined,
          );
        } catch (error) {
          console.error(error);
          status.textContent = "Rendering stopped. Reload to retry.";
          stop();
          return;
        }
      }
      frame = requestAnimationFrame(paint);
    }
    frame = requestAnimationFrame(paint);
    connect();
  }
}
