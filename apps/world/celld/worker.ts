import { DurableObject } from "cloudflare:workers";
import { createPoolSession } from "@harrhy/pool/session";
import hall from "../content/hall.bsp";
import { loadBspCollision } from "../shared/bsp-collision";
import { createRoom } from "../shared/room";
import {
  parsePoolCommand,
  type PoolCommand,
  type PoolState,
  type PoolTable,
} from "../shared/pool-wire";
import {
  BSP_MAP_PATH,
  parseInput,
  TICK_HZ,
  TICK_MS,
  type MapReady,
  type ServerMessage,
} from "../shared/protocol";

interface Env {
  WORLD_ROOM: DurableObjectNamespace<WorldRoomCell>;
  HARRHY_WORLD_ORIGIN?: string;
}

type Room = Awaited<ReturnType<typeof createRoom>>;
type PoolSession = Awaited<ReturnType<typeof createPoolSession>>;
type Peer = {
  socket: WebSocket;
  rateStart: number;
  messages: number;
  lastInput: number;
};
const timingPath = "/__bench/timing";
const noStore = { "Cache-Control": "no-store" };
const encoder = new TextEncoder();
const snapshotEvery = 3;
const botId = "house-bot";
const botThinkMs = 650;
const sampleLimit = 36_000;
let collision: ReturnType<typeof loadBspCollision> | undefined;

function getCollision() {
  return (collision ??= loadBspCollision(
    hall.buffer.slice(hall.byteOffset, hall.byteOffset + hall.byteLength),
  ));
}

function timingSamples() {
  return {
    ticks: 0,
    snapshots: 0,
    droppedDeadlines: 0,
    droppedTimingSamples: 0,
    tickIntervalsMs: [] as number[],
    snapshotIntervalsMs: [] as number[],
    tickLatenessMs: [] as number[],
  };
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === "/room" || pathname === timingPath)
      return env.WORLD_ROOM.getByName("hall").fetch(request);
    if (pathname !== "/healthz" && pathname !== BSP_MAP_PATH)
      return new Response(null, { status: 404 });
    const head = request.method === "HEAD";
    if (request.method !== "GET" && !head)
      return new Response(null, { status: 405 });
    const { revision } = await getCollision();
    if (pathname === "/healthz") {
      const ready: MapReady = { status: "ready", map: "bsp", revision };
      return new Response(head ? null : JSON.stringify(ready), {
        headers: { ...noStore, "Content-Type": "application/json" },
      });
    }
    return new Response(head ? null : hall, {
      headers: {
        ...noStore,
        "Content-Type": "application/octet-stream",
        "Content-Length": String(hall.byteLength),
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
} satisfies ExportedHandler<Env>;

export class WorldRoomCell extends DurableObject<Env> {
  private readonly peers = new Map<string, Peer>();
  private readonly room: Promise<Room>;
  private pool?: {
    table: PoolTable;
    session: PoolSession;
    bot?: { readyAt?: number };
  };
  private loadingPool?: Promise<PoolSession>;
  private timing = timingSamples();
  private timer?: ReturnType<typeof setTimeout>;
  private deadline = 0;
  private lastTick?: number;
  private lastSnapshot?: number;
  private frame = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // A replacement cell cannot resume the discarded simulation.
    for (const socket of ctx.getWebSockets()) socket.close(4001, "Room reset");
    this.room = getCollision().then(createRoom);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === timingPath) {
      if (request.method === "POST") {
        if (this.peers.size)
          return new Response("Room is active", { status: 409 });
        this.timing = timingSamples();
        return new Response(null, { status: 204, headers: noStore });
      }
      if (request.method !== "GET") return new Response(null, { status: 405 });
      return Response.json(
        {
          tickHz: TICK_HZ,
          snapshotHz: TICK_HZ / snapshotEvery,
          activePeers: this.peers.size,
          ...this.timing,
        },
        { headers: noStore },
      );
    }
    if (request.method !== "GET" || url.pathname !== "/room")
      return new Response(null, { status: 405 });
    if (!this.env.HARRHY_WORLD_ORIGIN)
      return new Response("World origin is not configured", { status: 503 });
    if (request.headers.get("Origin") !== this.env.HARRHY_WORLD_ORIGIN)
      return new Response(null, { status: 403 });
    const { revision, table } = await getCollision();
    const requested = url.searchParams.getAll("revision");
    if (requested.length !== 1 || requested[0] !== revision)
      return new Response("World map revision mismatch", { status: 409 });
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
      return new Response(null, { status: 426 });
    const room = await this.room;
    if (table && !this.pool) {
      const session = await (this.loadingPool ??= createPoolSession());
      this.pool ??= { table, session };
    }
    if (this.peers.size >= 12)
      return new Response("Room is full", { status: 503 });

    const { 0: client, 1: socket } = new WebSocketPair();
    const id = crypto.randomUUID();
    const now = performance.now();
    this.ctx.acceptWebSocket(socket);
    socket.serializeAttachment(id);
    room.join(id);
    this.peers.set(id, { socket, rateStart: now, messages: 0, lastInput: now });
    this.send(socket, { type: "welcome", id, revision });
    for (const [peerId, peer] of this.peers) {
      if (peerId !== id) this.send(peer.socket, { type: "joined", id });
    }
    this.send(socket, { type: "roster", ids: [...this.peers.keys()] });
    this.send(socket, { type: "motion", ...room.snapshot() });
    const pool = this.poolSnapshot();
    if (pool) this.send(socket, pool);
    if (this.peers.size === 1) {
      this.deadline = now + TICK_MS;
      this.schedule(room);
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, payload: string | ArrayBuffer) {
    const room = await this.room;
    const id = socket.deserializeAttachment() as string;
    const peer = this.peers.get(id);
    if (!peer) return;
    const now = performance.now();
    peer.lastInput = now;
    if (now - peer.rateStart >= 1000) {
      peer.rateStart = now;
      peer.messages = 0;
    }
    if (++peer.messages > 120) {
      socket.close(4008, "Input rate limit");
      this.leave(room, id);
      return;
    }
    const size =
      typeof payload === "string"
        ? payload.length > 512
          ? payload.length
          : encoder.encode(payload).byteLength
        : payload.byteLength;
    if (size > 512) {
      socket.close(4009, "Input too large");
      this.leave(room, id);
      return;
    }
    if (typeof payload !== "string") return;
    const input = parseInput(payload);
    if (input) room.input(id, input);
    else if (this.pool) {
      const command = parsePoolCommand(payload);
      if (command) this.poolCommand(room, id, command);
    }
  }

  private poolCommand(room: Room, id: string, command: PoolCommand) {
    const pool = this.pool;
    if (!pool || command.tableId !== pool.table.id) return;
    const { table, session } = pool;
    let changed: boolean;
    switch (command.type) {
      case "pool-join": {
        const pose = room.snapshot().players.find((player) => player.id === id);
        if (
          !pose ||
          Math.hypot(pose.x - table.x, pose.z - table.z) > 3 ||
          Math.abs(pose.y - table.y) > 1.5
        )
          return;
        if (command.withBot) {
          if (session.phase !== "waiting") return;
          const waiting = session.waitingPlayer;
          if (waiting !== null && waiting !== id) return;
          if (waiting === null) session.join(id);
          changed = session.join(botId);
          if (changed) pool.bot = {};
        } else changed = session.join(id);
        break;
      }
      case "pool-leave":
        changed = this.leavePool(id);
        break;
      case "pool-shot":
        changed = session.shot(
          id,
          command.turnToken,
          command.yaw,
          command.power,
        );
        break;
      case "pool-place":
        changed = session.place(id, command.turnToken, command.x, command.z);
        break;
    }
    if (changed) this.broadcastPool();
  }

  private poolSnapshot(): PoolState | undefined {
    const pool = this.pool;
    if (!pool) return;
    const { table, session } = pool;
    const state: PoolState = { type: "pool", table, ...session.snapshot() };
    if (pool.bot) {
      // Stand just beyond the long rail, facing the table.
      state.bot = {
        id: botId,
        x: table.x + 1.25 * Math.cos(table.yaw),
        y: table.y,
        z: table.z - 1.25 * Math.sin(table.yaw),
        yaw: table.yaw + Math.PI / 2,
      };
    }
    return state;
  }

  private broadcastPool() {
    const state = this.poolSnapshot();
    if (!state) return;
    const message = JSON.stringify(state);
    for (const { socket } of this.peers.values()) {
      if (socket.readyState === WebSocket.OPEN) socket.send(message);
    }
  }

  async webSocketClose(socket: WebSocket) {
    this.leave(await this.room, socket.deserializeAttachment() as string);
    socket.close();
  }

  async webSocketError(socket: WebSocket) {
    this.leave(await this.room, socket.deserializeAttachment() as string);
  }

  private leavePool(id: string): boolean {
    const pool = this.pool;
    if (!pool || !pool.session.leave(id)) return false;
    if (pool.bot) {
      pool.session.leave(botId);
      pool.bot = undefined;
    }
    return true;
  }

  private stepBot(now: number): boolean {
    const pool = this.pool;
    if (!pool?.bot) return false;
    const { bot, session } = pool;
    if (session.turn !== botId || session.phase === "rolling") {
      bot.readyAt = undefined;
      return false;
    }
    bot.readyAt ??= now + botThinkMs;
    if (now < bot.readyAt) return false;
    bot.readyAt = now + botThinkMs;
    return session.playBot(botId);
  }

  private leave(room: Room, id: string) {
    if (!this.peers.delete(id)) return;
    room.leave(id);
    for (const { socket } of this.peers.values())
      this.send(socket, { type: "left", id });
    if (this.leavePool(id) && this.peers.size) this.broadcastPool();
    if (this.peers.size) return;
    this.pool?.session.dispose();
    this.pool = this.loadingPool = undefined;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.lastTick = this.lastSnapshot = undefined;
  }

  private send(socket: WebSocket, message: ServerMessage) {
    if (socket.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify(message));
  }

  private sample(samples: number[], value: number) {
    if (samples.length < sampleLimit) samples.push(value);
    else this.timing.droppedTimingSamples++;
  }

  private schedule(room: Room) {
    this.timer = setTimeout(
      () => this.step(room),
      Math.max(1, Math.ceil(this.deadline - performance.now())),
    );
  }

  private step(room: Room) {
    this.timer = undefined;
    const now = performance.now();
    for (const [id, peer] of this.peers) {
      if (now - peer.lastInput < 60_000) continue;
      peer.socket.close(4000, "Input idle timeout");
      this.leave(room, id);
    }
    if (!this.peers.size) return;
    // Keep phase without bursting simulation steps after a stalled turn.
    const late = Math.max(0, now - this.deadline);
    const missed = Math.floor(late / TICK_MS);
    this.timing.droppedDeadlines += missed;
    this.deadline += (1 + missed) * TICK_MS;
    this.sample(this.timing.tickLatenessMs, late);
    if (this.lastTick !== undefined)
      this.sample(this.timing.tickIntervalsMs, now - this.lastTick);
    this.lastTick = now;
    room.step();
    const settled = this.pool?.session.step(1 / TICK_HZ);
    const botActed = this.stepBot(now);
    this.timing.ticks++;
    const snapshotDue = ++this.frame % snapshotEvery === 0;
    if (
      settled ||
      botActed ||
      (snapshotDue && this.pool?.session.phase === "rolling")
    )
      this.broadcastPool();
    if (snapshotDue) {
      this.timing.snapshots++;
      if (this.lastSnapshot !== undefined)
        this.sample(this.timing.snapshotIntervalsMs, now - this.lastSnapshot);
      this.lastSnapshot = now;
      const message = JSON.stringify({
        type: "motion",
        ...room.snapshot(),
      } satisfies ServerMessage);
      for (const { socket } of this.peers.values()) {
        if (socket.readyState === WebSocket.OPEN) socket.send(message);
      }
    }
    this.schedule(room);
  }
}
