import type { PoolSound } from "@harrhy/pool";

export type PredictionContext = { tableId: string; rack: number; turn: number };
export type HeardSound = PredictionContext & {
  sound: PoolSound;
  heardAt: number;
  source: "predicted" | "server";
};
export type SoundEvent = PoolSound & { id: number; time: number; turn: number };

const EVENT_MAX_AGE = 250;
const HEARD_RETENTION_MS = 3000;
function pair(sound: PoolSound) {
  return sound.kind === "ball" && sound.otherBallId !== undefined
    ? [
        Math.min(sound.ballId, sound.otherBallId),
        Math.max(sound.ballId, sound.otherBallId),
      ].join(":")
    : `${sound.ballId}:${sound.otherBallId ?? ""}`;
}

// Consume one heard occurrence, never a whole turn: prediction can miss collisions.
export function consumeHeard(
  heard: HeardSound[],
  context: PredictionContext,
  sound: PoolSound,
  now: number,
  source: HeardSound["source"] = "predicted",
) {
  let index = -1,
    nearest = 0.3;
  for (let i = 0; i < heard.length; i++) {
    const entry = heard[i]!;
    if (
      entry.source !== source ||
      now - entry.heardAt > HEARD_RETENTION_MS ||
      now < entry.heardAt ||
      entry.tableId !== context.tableId ||
      entry.rack !== context.rack ||
      entry.turn !== context.turn ||
      entry.sound.kind !== sound.kind ||
      pair(entry.sound) !== pair(sound)
    )
      continue;
    const distance = Math.hypot(
      entry.sound.x - sound.x,
      entry.sound.y - sound.y,
      entry.sound.z - sound.z,
    );
    if (distance < nearest) {
      nearest = distance;
      index = i;
    }
  }
  if (index < 0) return false;
  heard.splice(index, 1);
  return true;
}

export class AudioEventGate {
  private tables = new Map<string, { rack: number; id: number }>();
  private time = -Infinity;
  readonly heard: HeardSound[] = [];

  reset() {
    this.tables.clear();
    this.heard.length = 0;
    this.time = -Infinity;
  }

  begin(time: number, now: number) {
    if (time < this.time) this.reset();
    this.time = time;
    for (let i = this.heard.length - 1; i >= 0; i--)
      if (now - this.heard[i].heardAt > HEARD_RETENTION_MS)
        this.heard.splice(i, 1);
  }

  events(
    tableId: string,
    rack: number,
    sounds: readonly SoundEvent[],
    time: number,
  ) {
    const previous = this.tables.get(tableId);
    const id = Math.max(
      previous?.rack === rack ? previous.id : -1,
      ...sounds.map((sound) => sound.id),
    );
    this.tables.set(tableId, { rack, id });
    if (!previous || previous.rack !== rack) return [];
    return sounds.filter(
      (sound) =>
        sound.id > previous.id &&
        time - sound.time >= 0 &&
        time - sound.time <= EVENT_MAX_AGE,
    );
  }

  retain(tableIds: Set<string>) {
    for (const id of this.tables.keys())
      if (!tableIds.has(id)) this.tables.delete(id);
  }
}
