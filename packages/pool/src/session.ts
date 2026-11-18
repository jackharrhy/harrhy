import { chooseBotPlacement, chooseBotShot } from "./bot";
import { initializePoolPhysics, PoolPhysics } from "./engine-core";
import { createShotResult } from "./physics";
import { createMatch, resolveShot, startMatch } from "./rules";

/** A single ephemeral table. The host supplies player IDs and drives the clock. */
export async function createPoolSession() {
  await initializePoolPhysics();
  const physics = new PoolPhysics();
  let match = createMatch();
  let turnToken = 0;
  let result = createShotResult();
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
      if (disposed || match.phase !== "rolling") return false;
      if (physics.step(dt, result)) return false;
      resolveShot(match, physics.balls, result);
      turnToken++;
      return true;
    },
    snapshot() {
      const { phase, players, winner, message } = match;
      return {
        balls: physics.balls
          .filter((ball) => !ball.pocketed)
          .map(({ id, x, y, z }) => ({ id, x, y, z })),
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
      disposed = true;
    },
  };
  return session;
}
