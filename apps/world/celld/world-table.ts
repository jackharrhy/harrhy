import { tableStand } from "../shared/table-placement.ts";
import { createPoolSession } from "@harrhy/pool/session";
import type { PoolCommand, PoolTable, PoolState } from "../shared/pool-wire.ts";
const botId = "house-bot";
const botThinkMs = 650;
export async function createWorldTable(table: PoolTable) {
  const session = await createPoolSession();
  let readyAt: number | undefined;
  function snapshot(): PoolState {
    const state: PoolState = {
      type: "pool",
      sampledAt: performance.now(),
      table,
      ...session.snapshot(),
    };
    if (table.houseBot) {
      // Stand just beyond the long rail, facing the table.
      state.bot = {
        id: botId,
        ...tableStand(table, "pool", 1),
      };
    }
    return state;
  }

  function update(sounds?: PoolState["sounds"]) {
    const state = snapshot();
    state.strike = session.drainStrike();
    if (sounds?.length) state.sounds = sounds;
    return state;
  }
  function command(id: string, action: PoolCommand) {
    let changed: boolean;
    switch (action.type) {
      case "pool-join": {
        if (action.withBot && !table.houseBot) return;
        if (table.houseBot) {
          if (session.phase !== "waiting") return;
          const waiting = session.waitingPlayer;
          if (waiting !== null && waiting !== id) return;
          if (waiting === null && !session.join(id)) return;
          changed = session.join(botId);
        } else changed = session.join(id);
        break;
      }
      case "pool-leave":
        return leave(id);
      case "pool-cue":
        changed = session.aim(id, action.turnToken, action.yaw, action.power);
        break;
      case "pool-rematch":
        changed = session.rematch(id, action.turnToken);
        break;
      case "pool-shot":
        changed = session.shot(id, action.turnToken, action.yaw, action.power);
        break;
      case "pool-place":
        changed = session.place(id, action.turnToken, action.x, action.z);
        break;
    }
    if (changed) return update();
  }

  function leave(id: string) {
    if (!session.leave(id)) return;
    if (table.houseBot) session.leave(botId);
    readyAt = undefined;
    return update();
  }
  function stepBot(now: number) {
    if (!table.houseBot) return false;
    if (session.turn !== botId || session.phase === "rolling") {
      readyAt = undefined;
      return false;
    }
    if (readyAt === undefined) {
      readyAt = now + botThinkMs;
      return session.aimBot(botId);
    }
    if (now < readyAt) return false;
    readyAt = undefined;
    return session.playBot(botId);
  }

  function tick(now: number, dt: number) {
    const settled = session.step(dt);
    const sounds = session.drainSounds();
    const acted = stepBot(now);
    if (settled || acted || sounds.length || session.phase === "rolling")
      return update(sounds);
  }

  return {
    kind: "pool" as const,
    table,
    command,
    tick,
    snapshot,
    leave,
    hasSeat: session.hasSeat,
    dispose: session.dispose,
    clearAim(id: string) {
      if (session.clearAim(id)) return update();
    },
  };
}
