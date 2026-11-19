import { chooseBotPlacement, chooseBotShot } from "./bot";
import { initializePoolPhysics, PoolPhysics } from "./engine-core";
import { createShotResult, type PoolSound } from "./physics";

const MAX_PENDING_SOUNDS = 96;
import { createMatch, resolveShot, startMatch } from "./rules";

/** A single ephemeral table. The host supplies player IDs and drives the clock. */
export async function createPoolSession() {
  await initializePoolPhysics();
  const physics = new PoolPhysics();
  let match = createMatch();
  let turnToken = 0;
  let shotTick = 0;
  let result = createShotResult();
  let pendingSounds: PoolSound[] = [];
  type Cue = { id: string; yaw: number; power: number };
  let cue: Cue | undefined;
  let strike: (Cue & { turnToken: number }) | undefined;
  let disposed = false;

  function canPlay(
    id: string,
    token: number,
    phase: "aiming" | "ball-in-hand",
  ) {
    return (
      !disposed &&
      match.phase === phase &&
      match.players[match.turn] === id &&
      token === turnToken
    );
  }

  const session = {
    get turn() {
      return match.phase === "waiting" || match.phase === "finished"
        ? null
        : match.players[match.turn];
    },
    get waitingPlayer() {
      return match.phase === "waiting" ? match.players[0] : null;
    },
    get phase() {
      return match.phase;
    },
    hasSeat(id: string) {
      return match.players.includes(id);
    },
    rematch(id: string, token: number) {
      const [a, b] = match.players;
      if (
        disposed ||
        !a ||
        !b ||
        token !== turnToken ||
        match.phase !== "finished" ||
        !match.players.includes(id)
      )
        return false;
      startMatch(match, [a, b]);
      physics.reset();
      result = createShotResult();
      pendingSounds.length = 0;
      cue = strike = undefined;
      turnToken++;
      return true;
    },
    aim(id: string, token: number, yaw: number, power: number) {
      if (
        !canPlay(id, token, "aiming") ||
        !Number.isFinite(yaw) ||
        !Number.isFinite(power) ||
        power < 0 ||
        power > 1
      )
        return false;
      cue = { id, yaw, power };
      return true;
    },
    clearAim(id: string) {
      if (cue?.id !== id) return false;
      cue = undefined;
      return true;
    },
    drainStrike() {
      const value = strike;
      strike = undefined;
      return value;
    },
    join(id: string): boolean {
      if (disposed || !id || match.players.includes(id)) return false;
      const [first, second] = match.players;
      if (first && second) return false;
      if (first) startMatch(match, [first, id]);
      else match.players[0] = id;
      turnToken++;
      return true;
    },
    leave(id: string): boolean {
      if (disposed || !match.players.includes(id)) return false;
      const remaining = match.players.find((player) => player && player !== id);
      cue = strike = undefined;
      match = createMatch();
      match.players[0] = remaining ?? null;
      physics.reset();
      pendingSounds.length = 0;
      result = createShotResult();
      turnToken++;
      return true;
    },
    shot(id: string, token: number, yaw: number, power: number): boolean {
      if (
        !canPlay(id, token, "aiming") ||
        !Number.isFinite(yaw) ||
        !Number.isFinite(power) ||
        power <= 0 ||
        power > 1
      )
        return false;
      result = createShotResult();
      cue = undefined;
      strike = { id, yaw, power, turnToken };
      shotTick = 0;
      physics.strike(yaw, power);
      match.phase = "rolling";
      match.message = "Balls rolling.";
      turnToken++;
      return true;
    },
    place(id: string, token: number, x: number, z: number): boolean {
      if (!canPlay(id, token, "ball-in-hand") || !physics.placeCue(x, z))
        return false;
      match.phase = "aiming";
      match.message = "Cue ball placed. Take your shot.";
      turnToken++;
      return true;
    },
    aimBot(id: string) {
      if (!canPlay(id, turnToken, "aiming")) return false;
      const { angle, power } = chooseBotShot(physics.balls, match, match.turn);
      return session.aim(id, turnToken, angle, power);
    },
    playBot(id: string): boolean {
      if (canPlay(id, turnToken, "ball-in-hand")) {
        const { x, z } = chooseBotPlacement(physics.balls, match, match.turn);
        return session.place(id, turnToken, x, z);
      }
      if (canPlay(id, turnToken, "aiming")) {
        if (cue?.id !== id && !session.aimBot(id)) return false;
        return session.shot(id, turnToken, cue!.yaw, cue!.power);
      }
      return false;
    },
    step(dt: number): boolean {
      if (disposed) return false;
      const rolling = match.phase === "rolling";
      // The cabinet can still produce contacts after play passes to the next turn.
      if (!rolling && !physics.balls.some((ball) => ball.stage === "return"))
        return false;
      if (rolling) shotTick++;
      const moving = physics.step(dt, result);
      pendingSounds.push(...physics.sounds);
      if (pendingSounds.length > MAX_PENDING_SOUNDS)
        pendingSounds.splice(0, pendingSounds.length - MAX_PENDING_SOUNDS);
      if (!rolling || moving) return false;
      resolveShot(match, physics.balls, result);
      turnToken++;
      return true;
    },
    drainSounds(): PoolSound[] {
      const sounds = pendingSounds;
      pendingSounds = [];
      return sounds;
    },
    snapshot() {
      const { phase, players, winner, message } = match;
      return {
        shotTick: phase === "rolling" ? shotTick : undefined,
        balls: physics.balls
          .filter((ball) => !ball.pocketed)
          .map(({ id, x, y, z, q, vx, vy, vz, stage }) => ({
            vx,
            vy,
            vz,
            stage,
            id,
            x,
            y,
            z,
            q: [...q] as typeof q,
          })),
        cue,
        groups: [...match.groups] as typeof match.groups,
        remaining: {
          solid: physics.balls.filter(
            (b) => b.id >= 1 && b.id <= 7 && !b.pocketed,
          ).length,
          stripe: physics.balls.filter(
            (b) => b.id >= 9 && b.id <= 15 && !b.pocketed,
          ).length,
        },
        seats: players.filter((id): id is string => id !== null),
        turn: session.turn,
        phase,
        winner,
        message,
        turnToken,
      };
    },
    dispose() {
      physics.dispose();
      pendingSounds.length = 0;
      disposed = true;
    },
  };
  return session;
}
