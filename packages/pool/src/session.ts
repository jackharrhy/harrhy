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
  let result = createShotResult();
  let pendingSounds: PoolSound[] = [];
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
    playBot(id: string): boolean {
      if (canPlay(id, turnToken, "ball-in-hand")) {
        const { x, z } = chooseBotPlacement(physics.balls, match, match.turn);
        return session.place(id, turnToken, x, z);
      }
      if (canPlay(id, turnToken, "aiming")) {
        const { angle, power } = chooseBotShot(
          physics.balls,
          match,
          match.turn,
        );
        return session.shot(id, turnToken, angle, power);
      }
      return false;
    },
    step(dt: number): boolean {
      if (disposed) return false;
      const rolling = match.phase === "rolling";
      // The cabinet can still produce contacts after play passes to the next turn.
      if (!rolling && !physics.balls.some((ball) => ball.stage === "return"))
        return false;
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
        balls: physics.balls
          .filter((ball) => !ball.pocketed)
          .map(({ id, x, y, z, q }) => ({
            id,
            x,
            y,
            z,
            q: [...q] as typeof q,
          })),
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
