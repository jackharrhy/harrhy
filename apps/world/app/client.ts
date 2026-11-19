import { squareAt } from "./chess-model";
import {
  chessBot,
  type ChessState,
  type ChessCommand,
} from "../shared/chess-wire";
import { createWorldShotPrediction } from "./pool-prediction";
import { observePoolRolling } from "./pool-rolling";
import { createPoolAudio } from "@harrhy/pool/audio";
import { createPoolInterpolation } from "../shared/pool-interpolation";
import { CueDrag } from "@harrhy/pool/cue-drag";
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
  const poolBot = root.querySelector<HTMLButtonElement>("#pool-bot")!;
  const poolLeave = root.querySelector<HTMLButtonElement>("#pool-leave")!;
  const poolRematch = root.querySelector<HTMLButtonElement>("#pool-rematch")!;
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
    let chess: ChessState | undefined;
    const chessGames = new Map<string, ChessState>();
    let selectedSquare: string | undefined;
    const chessControls = root.querySelector<HTMLElement>("#chess-controls")!;
    const chessStatus = root.querySelector<HTMLElement>("#chess-status")!;
    const promotion =
      root.querySelector<HTMLSelectElement>("#promotion-piece")!;
    const promotionLabel = root.querySelector<HTMLElement>("#chess-promotion")!;
    const chessButtons = (
      ["chess-join", "chess-bot", "chess-rematch", "chess-leave"] as const
    ).map((type) => {
      const button = root.querySelector<HTMLButtonElement>("#" + type)!;
      button.addEventListener(
        "click",
        () => {
          if (chess)
            sendCommand({
              type,
              tableId: chess.table.id,
              turnToken: chess.turnToken,
            });
        },
        { signal },
      );
      return { type, button };
    });
    const shotPrediction = createWorldShotPrediction();
    signal.addEventListener("abort", () => shotPrediction.cancel(), {
      once: true,
    });
    const pools = new Map<string, PoolState>();
    const poolMotion = new Map<
      string,
      ReturnType<typeof createPoolInterpolation>
    >();
    const resumeToken =
      sessionStorage.getItem("world-room-resume") ?? crypto.randomUUID();
    sessionStorage.setItem("world-room-resume", resumeToken);
    function chooseTable(pose: Pick<Pose, "x" | "z">) {
      const states = [...pools.values(), ...chessGames.values()];
      const chosen =
        states.find((state) => state.seats.includes(me)) ??
        states.toSorted(
          (a, b) =>
            Math.hypot(pose.x - a.table.x, pose.z - a.table.z) -
            Math.hypot(pose.x - b.table.x, pose.z - b.table.z),
        )[0];
      pool = chosen?.type === "pool" ? chosen : undefined;
      chess = chosen?.type === "chess" ? chosen : undefined;
    }
    let joiningTable: string | undefined;
    let keyboardCharge: { at: number; token: number } | undefined;
    let lastCuePacket = -Infinity;
    let tablePan:
      | { id: number; x: number; y: number; orbit: boolean }
      | undefined;
    const audio = createPoolAudio();
    signal.addEventListener("abort", () => audio.dispose(), { once: true });
    const enableAudio = () => {
      if (!audio.enabled) audio.toggle();
      else void audio.resume();
    };
    root.addEventListener("pointerdown", enableAudio, { signal });
    let shotCharge: { id: number; drag: CueDrag; power: number } | undefined;
    const seated = () => (pool ?? chess)?.seats.includes(me) ?? false;
    function sendCommand(command: PoolCommand | ChessCommand) {
      if (
        command.type === "pool-shot" &&
        pool &&
        ws?.readyState === WebSocket.OPEN
      )
        shotPrediction.start(pool, command, performance.now());
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(command));
    }
    function showTables() {
      const pose = predicted?.pose();
      const isSeated = seated();
      root.toggleAttribute("data-pool", isSeated);
      chessControls.hidden =
        !chess ||
        !pose ||
        (!isSeated &&
          Math.hypot(pose.x - chess.table.x, pose.z - chess.table.z) > 3);
      if (chess && !chessControls.hidden) {
        const color = chess.seats[0] === me ? "White" : "Black";
        const label =
          chess.result ??
          (chess.seats.length < 2
            ? "Waiting for a player"
            : chess.turn === me
              ? "Your move"
              : "Opponent’s move");
        const status =
          "Chess · " +
          (isSeated ? color + " · " : "") +
          label +
          (chess.check && !chess.result ? " · Check" : "") +
          (chess.turn === me
            ? " · " +
              (selectedSquare
                ? selectedSquare + " → choose a destination"
                : "Select a piece")
            : "") +
          (chess.seats.includes(chessBot) ? " · Random bot" : "");
        if (chessStatus.textContent !== status)
          chessStatus.textContent = status;
        for (const { type, button } of chessButtons)
          button.hidden =
            type === "chess-join"
              ? isSeated || chess.seats.length === 2
              : type === "chess-bot"
                ? !isSeated || chess.seats.length !== 1
                : type === "chess-rematch"
                  ? !isSeated || !chess.result
                  : !isSeated;
        promotionLabel.hidden =
          !selectedSquare ||
          !chess.legal.some(
            (m) => m.length === 5 && m.startsWith(selectedSquare!),
          );
      }
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
                : pool.bot?.id === pool.turn
                  ? "Moss is aiming"
                  : "Opponent’s turn";
      const group = pool.groups[pool.seats.indexOf(me)];
      const score = group
        ? ` · ${group === "solid" ? "Solids" : "Stripes"}: ${pool.remaining[group]} left`
        : isSeated && pool.phase !== "finished"
          ? " · Groups open"
          : "";
      const description = `${label}${score}${pool.message ? ` · ${pool.message}` : ""}`;
      if (poolStatus.textContent !== description)
        poolStatus.textContent = description;
      poolJoin.hidden = isSeated || pool.seats.length === 2;
      poolBot.hidden = true;
      poolLeave.hidden = !isSeated;
      poolRematch.hidden = !isSeated || pool.phase !== "finished";
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
        if (pool) sendCommand({ type: "pool-join", tableId: pool.table.id });
      },
      { signal },
    );
    poolBot.addEventListener(
      "click",
      () => {
        if (pool)
          sendCommand({
            type: "pool-join",
            tableId: pool.table.id,
            withBot: true,
          });
      },
      { signal },
    );
    poolRematch.addEventListener(
      "click",
      () => {
        if (pool)
          sendCommand({
            type: "pool-rematch",
            tableId: pool.table.id,
            turnToken: pool.turnToken,
          });
      },
      { signal },
    );
    poolLeave.addEventListener(
      "click",
      () => {
        if (pool) sendCommand({ type: "pool-leave", tableId: pool.table.id });
      },
      { signal },
    );
    poolShoot.addEventListener(
      "click",
      () => {
        if (pool)
          sendCommand({
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
          sendCommand({
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
      socket.addEventListener("open", () =>
        socket.send(JSON.stringify({ type: "hello", resumeToken })),
      );
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
          case "chess":
            chessGames.set(message.table.id, message);
            if (chess?.table.id === message.table.id)
              selectedSquare = undefined;
            if (predicted) chooseTable(predicted.pose());
            if (message.seats.includes(me)) {
              destination = undefined;
              keys.clear();
              joiningTable = undefined;
              if (document.pointerLockElement === canvas)
                document.exitPointerLock();
            }
            showTables();
            break;
          case "pool":
            pools.set(message.table.id, message);
            shotPrediction.ingest(message, performance.now());
            audio.updateRolling(
              [...pools.values()].flatMap(observePoolRolling),
            );
            let interpolation = poolMotion.get(message.table.id);
            if (!interpolation)
              poolMotion.set(
                message.table.id,
                (interpolation = createPoolInterpolation()),
              );
            interpolation.push(message, performance.now());
            if (predicted) chooseTable(predicted.pose());
            for (const sound of message.sounds ?? []) {
              const { x, y, z, yaw: tableYaw } = message.table;
              audio.playImpact(sound, {
                x:
                  x +
                  sound.x * Math.cos(tableYaw) +
                  sound.z * Math.sin(tableYaw),
                y: y + sound.y,
                z:
                  z -
                  sound.x * Math.sin(tableYaw) +
                  sound.z * Math.cos(tableYaw),
              });
            }
            if (seated()) {
              destination = undefined;
              keys.clear();
              joiningTable = undefined;
              if (document.pointerLockElement === canvas)
                document.exitPointerLock();
            }
            showTables();
            break;
          case "pool-shot-ack":
            shotPrediction.acknowledge(message);
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
      socket.addEventListener("close", (event) => {
        if (signal.aborted || ws !== socket) return;
        reset();
        pool = undefined;
        poolMotion.clear();
        shotPrediction.cancel();
        pools.clear();
        chessGames.clear();
        chess = undefined;
        selectedSquare = undefined;
        chessControls.hidden = true;
        root.removeAttribute("data-pool");
        audio.reset();
        poolControls.hidden = true;
        if (document.pointerLockElement === canvas) document.exitPointerLock();
        status.textContent = "Disconnected. Rejoining…";
        if (event.code === 4002) {
          status.textContent = "This seat moved to another tab.";
          return;
        }
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
        if (event.shiftKey) return;
        if (chess && chess.turn === me) {
          const point = view.pickTable(
            chess.table.id,
            event.clientX,
            event.clientY,
          );
          const square = point && squareAt(point.x, point.z);
          const move =
            selectedSquare &&
            square &&
            chess.legal.find(
              (m) =>
                m.startsWith(selectedSquare! + square) &&
                (m.length === 4 || m[4] === promotion.value),
            );
          if (move) {
            sendCommand({
              type: "chess-move",
              tableId: chess.table.id,
              turnToken: chess.turnToken,
              move,
            });
            selectedSquare = undefined;
          } else
            selectedSquare =
              square &&
              square !== selectedSquare &&
              chess.legal.some((m) => m.startsWith(square))
                ? square
                : undefined;
          showTables();
          return;
        }
        if (pool?.phase === "ball-in-hand" && pool.turn === me) {
          const point = view.pickTable(
            pool.table.id,
            event.clientX,
            event.clientY,
          );
          if (point)
            sendCommand({
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
          !seated() ||
          (event.button !== 1 &&
            event.button !== 2 &&
            !(event.shiftKey && event.button === 0))
        )
          return;
        event.preventDefault();
        canvas.setPointerCapture(event.pointerId);
        tablePan = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          orbit: event.button === 2 && !event.shiftKey,
        };
      },
      { signal },
    );
    function aimAt(x: number, y: number) {
      const cue = pool?.balls.find((ball) => ball.id === 0);
      const point = pool && view.pickTable(pool.table.id, x, y);
      if (!cue || !point) return false;
      poolAim.value = String(
        (Math.atan2(point.z - cue.z, point.x - cue.x) * 180) / Math.PI,
      );
      return true;
    }
    canvas.addEventListener(
      "pointerdown",
      (event) => {
        if (
          event.shiftKey ||
          !pool ||
          !seated() ||
          pool.turn !== me ||
          pool.phase !== "aiming" ||
          event.button !== 0
        )
          return;
        if (!aimAt(event.clientX, event.clientY)) return;
        canvas.setPointerCapture(event.pointerId);
        const cue = pool.balls.find((ball) => ball.id === 0);
        if (!cue) return;
        const a = angle();
        const cueScreen = view.projectPool(pool.table.id, cue.x, cue.z);
        const end = view.projectPool(
          pool.table.id,
          cue.x + Math.cos(a) * 0.3,
          cue.z + Math.sin(a) * 0.3,
        );
        if (
          !cueScreen ||
          !end ||
          Math.hypot(end.x - cueScreen.x, end.y - cueScreen.y) < 0.01
        )
          return;
        shotCharge = {
          id: event.pointerId,
          power: 0,
          drag: new CueDrag(
            { x: event.clientX, y: event.clientY },
            { x: end.x - cueScreen.x, y: end.y - cueScreen.y },
            { table: pool.table.id, turn: pool.turnToken, angle: a },
            canvas.clientHeight * 0.2,
          ),
        };
      },
      { signal },
    );
    canvas.addEventListener(
      "pointermove",
      (event) => {
        if (tablePan?.id === event.pointerId) {
          if (tablePan.orbit)
            view.orbitTable(
              event.clientX - tablePan.x,
              event.clientY - tablePan.y,
            );
          else
            view.panTable(
              event.clientX - tablePan.x,
              event.clientY - tablePan.y,
            );
          tablePan.x = event.clientX;
          tablePan.y = event.clientY;
          return;
        }
        if (shotCharge?.id === event.pointerId)
          shotCharge.power = shotCharge.drag.update({
            x: event.clientX,
            y: event.clientY,
          });
        if (
          seated() &&
          pool?.turn === me &&
          pool.phase === "aiming" &&
          !shotCharge
        )
          aimAt(event.clientX, event.clientY);
      },
      { signal },
    );
    canvas.addEventListener(
      "pointerup",
      (event) => {
        if (tablePan?.id === event.pointerId) tablePan = undefined;
        if (shotCharge?.id !== event.pointerId) return;
        const shot = shotCharge.drag.release({
          x: event.clientX,
          y: event.clientY,
        });
        shotCharge = undefined;
        if (
          pool?.phase !== "aiming" ||
          pool.turn !== me ||
          !shot ||
          pool.turnToken !== shot.turn
        )
          return;
        sendCommand({
          type: "pool-shot",
          tableId: pool.table.id,
          yaw: shot.angle,
          power: shot.power,
          turnToken: shot.turn,
        });
      },
      { signal },
    );
    canvas.addEventListener(
      "lostpointercapture",
      () => {
        shotCharge = undefined;
        tablePan = undefined;
      },
      { signal },
    );
    canvas.addEventListener(
      "pointerdown",
      (event) => {
        if (
          seated() ||
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
          const hitTable = view.hitTable(event.clientX, event.clientY);
          const selected = hitTable
            ? (pools.get(hitTable) ?? chessGames.get(hitTable))
            : undefined;
          if (selected && !seated()) {
            const pose = predicted!.pose();
            const dx = pose.x - selected.table.x,
              dz = pose.z - selected.table.z;
            const distance = Math.hypot(dx, dz);
            if (distance < 2.8)
              sendCommand({
                type: selected.type === "pool" ? "pool-join" : "chess-join",
                tableId: selected.table.id,
              });
            else {
              joiningTable = selected.table.id;
              destination = {
                x: selected.table.x + (dx / distance) * 2.45,
                z: selected.table.z + (dz / distance) * 2.45,
                best: Infinity,
                progressAt: performance.now(),
              };
            }
            gesture = undefined;
            return;
          }
          joiningTable = undefined;
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
        if (seated()) {
          view.zoomTable(event.deltaY * scale);
          return;
        }
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
        if (mode === "walk" || seated()) event.preventDefault();
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
        if (seated()) {
          if (pool?.turn === me && pool.phase === "aiming") {
            if (e.code === "Space" && !e.repeat)
              keyboardCharge = { at: performance.now(), token: pool.turnToken };
            if (e.code === "ArrowLeft" || e.code === "ArrowRight")
              poolAim.value = String(
                ((Number(poolAim.value) +
                  (e.code === "ArrowLeft" ? -2 : 2) +
                  540) %
                  360) -
                  180,
              );
          }
          return;
        }
        if (!e.code.startsWith("Arrow")) destination = undefined;
        keys.add(e.code);
      },
      { signal },
    );
    window.addEventListener(
      "keyup",
      (e) => {
        keys.delete(e.code);
        if (e.code !== "Space" || !keyboardCharge) return;
        const charge = keyboardCharge;
        keyboardCharge = undefined;
        if (
          pool?.turn === me &&
          pool.phase === "aiming" &&
          pool.turnToken === charge.token
        )
          sendCommand({
            type: "pool-shot",
            tableId: pool.table.id,
            turnToken: charge.token,
            yaw: angle(),
            power: Math.min(
              1,
              Math.max(0.05, (performance.now() - charge.at) / 1200),
            ),
          });
      },
      { signal },
    );
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
      if (
        pool &&
        seated() &&
        pool.turn === me &&
        pool.phase === "aiming" &&
        performance.now() - lastCuePacket > 50
      ) {
        lastCuePacket = performance.now();
        sendCommand({
          type: "pool-cue",
          tableId: pool.table.id,
          turnToken: pool.turnToken,
          yaw: angle(),
          power: shotCharge?.power ?? 0,
        });
      }
      const approachTable = joiningTable
        ? (pools.get(joiningTable) ?? chessGames.get(joiningTable))?.table
        : undefined;
      if (approachTable) {
        const pose = predicted.pose();
        if (
          destination &&
          Math.hypot(pose.x - approachTable.x, pose.z - approachTable.z) < 2.8
        ) {
          destination = undefined;
          sendCommand({
            type: chessGames.has(approachTable.id) ? "chess-join" : "pool-join",
            tableId: approachTable.id,
          });
          joiningTable = undefined;
        } else if (!destination) joiningTable = undefined;
      }
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
        chooseTable(predicted.pose());
        showTables();
        const listener =
          seated() && pool
            ? { x: pool.table.x, y: pool.table.y + 1.6, z: pool.table.z + 1.4 }
            : { ...predicted.pose(), y: predicted.pose().y + 1.65 };
        audio.updateListener(listener, {
          x: -Math.sin(yaw),
          y: 0,
          z: -Math.cos(yaw),
        });
        try {
          view.draw(
            { ...predicted.pose(), yaw, pitch },
            remotes,
            destination,
            mode === "walk" || seated() ? predicted.pose() : undefined,
            orbitDistance,
            [...pools.values()].map((state) => ({
              ...state,
              balls:
                (state.seats.includes(me)
                  ? shotPrediction.sample(performance.now())
                  : undefined) ??
                poolMotion.get(state.table.id)?.sample(performance.now()) ??
                state.balls,
            })),
            seated() && pool
              ? {
                  tableId: pool.table.id,
                  aim:
                    pool?.turn === me && pool.phase === "aiming"
                      ? angle()
                      : undefined,
                  power:
                    shotCharge?.power ??
                    (keyboardCharge
                      ? Math.min(
                          1,
                          (performance.now() - keyboardCharge.at) / 1200,
                        )
                      : 0),
                }
              : seated() && chess
                ? { tableId: chess.table.id, blackSide: chess.seats[1] === me }
                : undefined,
            [...chessGames.values()],
            selectedSquare,
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
