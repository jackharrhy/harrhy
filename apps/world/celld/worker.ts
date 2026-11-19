import { DurableObject } from "cloudflare:workers";
import { createWorldTable } from "./world-table";
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
  parseResumeToken,
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
type Table = Awaited<ReturnType<typeof createWorldTable>>;
type Peer = {
  token: string;
  socket: WebSocket;
  rateStart: number;
  messages: number;
  lastInput: number;
};
const timingPath = "/__bench/timing";
const noStore = { "Cache-Control": "no-store" };
const encoder = new TextEncoder();
const snapshotEvery = 3;
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
  private pools = new Map<string, Table>();
  private loading?: Promise<void>;
  private pending = new Map<WebSocket, ReturnType<typeof setTimeout>>();
  private retained = new Map<
    string,
    { id: string; until: number; timer: ReturnType<typeof setTimeout> }
  >();
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
    const { revision, tables } = await getCollision();
    const requested = url.searchParams.getAll("revision");
    if (requested.length !== 1 || requested[0] !== revision)
      return new Response("World map revision mismatch", { status: 409 });
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
      return new Response(null, { status: 426 });
    if (this.pending.size >= 12)
      return new Response("Handshake capacity", { status: 503 });
    await (this.loading ??= this.loadTables(tables));
    if (this.pending.size >= 12)
      return new Response("Handshake capacity", { status: 503 });
    const { 0: client, 1: socket } = new WebSocketPair();
    this.ctx.acceptWebSocket(socket);
    this.pending.set(
      socket,
      setTimeout(() => {
        this.pending.delete(socket);
        socket.close(4003, "Hello timeout");
        this.releaseEmptyRoom();
      }, 5000),
    );
    return new Response(null, { status: 101, webSocket: client });
  }

  private async loadTables(tables: PoolTable[]) {
    const pools = new Map<string, Table>();
    try {
      for (const table of tables)
        pools.set(table.id, await createWorldTable(table));
      this.pools = pools;
    } catch (error) {
      for (const pool of pools.values()) pool.dispose();
      this.loading = undefined;
      throw error;
    }
  }

  private releaseEmptyRoom() {
    if (this.peers.size || this.pending.size || this.retained.size) return;
    for (const pool of this.pools.values()) pool.dispose();
    this.pools.clear();
    this.loading = undefined;
  }

  private admit(
    room: Room,
    socket: WebSocket,
    token: string,
    revision: string,
  ) {
    const now = performance.now();
    const retained = this.retained.get(token);
    if (retained && now >= retained.until) this.expire(token, false);
    const previous = [...this.peers].find(([, p]) => p.token === token);
    const reservation = this.retained.get(token);
    if (
      !previous &&
      !reservation &&
      this.peers.size + this.retained.size >= 12
    ) {
      socket.close(4012, "Room full");
      return;
    }
    const id = previous?.[0] ?? reservation?.id ?? crypto.randomUUID();
    if (previous) {
      previous[1].socket.close(4002, "Connection replaced");
      room.leave(id); // Reset motion input sequence for the new socket.
      for (const pool of this.pools.values())
        this.broadcastPool(pool.clearAim(id));
    }
    if (reservation) {
      clearTimeout(reservation.timer);
      this.retained.delete(token);
    }
    socket.serializeAttachment(id);
    room.join(id);
    this.peers.set(id, {
      token,
      socket,
      rateStart: now,
      messages: 0,
      lastInput: now,
    });
    this.send(socket, { type: "welcome", id, revision });
    for (const [peerId, peer] of this.peers) {
      if (!previous && peerId !== id)
        this.send(peer.socket, { type: "joined", id });
    }
    this.send(socket, { type: "roster", ids: [...this.peers.keys()] });
    this.send(socket, { type: "motion", ...room.snapshot() });
    for (const pool of this.pools.values()) this.send(socket, pool.snapshot());
    if (this.timer === undefined) {
      this.deadline = now + TICK_MS;
      this.schedule(room);
    }
  }

  async webSocketMessage(socket: WebSocket, payload: string | ArrayBuffer) {
    const room = await this.room;
    const timer = this.pending.get(socket);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.pending.delete(socket);
      const token =
        typeof payload === "string" && payload.length <= 512
          ? parseResumeToken(payload)
          : null;
      if (!token) {
        socket.close(4003, "Invalid hello");
        this.releaseEmptyRoom();
        return;
      }
      this.admit(room, socket, token, (await getCollision()).revision);
      return;
    }
    const id = socket.deserializeAttachment() as string;
    const peer = this.peers.get(id);
    if (peer?.socket !== socket) return;
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
    else {
      const command = parsePoolCommand(payload);
      if (command) this.poolCommand(room, id, command);
    }
  }

  private poolCommand(room: Room, id: string, command: PoolCommand) {
    const pool = this.pools.get(command.tableId);
    if (!pool) return;
    const { table } = pool;
    if (command.type === "pool-join") {
      const pose = room.snapshot().players.find((player) => player.id === id);
      if (
        !pose ||
        Math.hypot(pose.x - table.x, pose.z - table.z) > 3 ||
        Math.abs(pose.y - table.y) > 1.5
      )
        return;
      if (
        [...this.pools.values()].some(
          (other) => other !== pool && other.hasSeat(id),
        )
      )
        return;
    }
    const update = pool.command(id, command);
    if (command.type === "pool-shot")
      this.send(this.peers.get(id)!.socket, {
        type: "pool-shot-ack",
        tableId: table.id,
        turnToken: command.turnToken,
        accepted: update !== undefined,
      });
    this.broadcastPool(update);
  }
  private broadcastPool(state: PoolState | undefined) {
    if (!state) return;
    const message = JSON.stringify(state);
    for (const { socket } of this.peers.values()) {
      if (socket.readyState === WebSocket.OPEN) socket.send(message);
    }
  }

  async webSocketClose(socket: WebSocket) {
    this.disconnect(await this.room, socket);
    socket.close();
  }

  async webSocketError(socket: WebSocket) {
    this.disconnect(await this.room, socket);
  }

  private disconnect(room: Room, socket: WebSocket) {
    const timer = this.pending.get(socket);
    if (timer !== undefined) clearTimeout(timer);
    this.pending.delete(socket);
    const id = socket.deserializeAttachment() as string;
    if (this.peers.get(id)?.socket === socket) this.leave(room, id);
    this.releaseEmptyRoom();
  }

  private leave(room: Room, id: string) {
    const peer = this.peers.get(id);
    if (!peer) return;
    this.peers.delete(id);
    room.leave(id);
    for (const { socket } of this.peers.values())
      this.send(socket, { type: "left", id });
    if ([...this.pools.values()].some((pool) => pool.hasSeat(id))) {
      this.retained.set(peer.token, {
        id,
        until: performance.now() + 30000,
        timer: setTimeout(() => this.expire(peer.token), 30000),
      });
    }
    for (const pool of this.pools.values())
      this.broadcastPool(pool.clearAim(id));
    if (this.peers.size) return;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.lastTick = this.lastSnapshot = undefined;
    this.releaseEmptyRoom();
  }

  private expire(token: string, release = true) {
    const reservation = this.retained.get(token);
    if (!reservation) return;
    clearTimeout(reservation.timer);
    this.retained.delete(token);
    for (const pool of this.pools.values())
      this.broadcastPool(pool.leave(reservation.id));
    if (release) this.releaseEmptyRoom();
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
    for (const pool of this.pools.values()) {
      this.broadcastPool(pool.tick(now, 1 / TICK_HZ));
    }
    this.timing.ticks++;
    const snapshotDue = ++this.frame % snapshotEvery === 0;
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
