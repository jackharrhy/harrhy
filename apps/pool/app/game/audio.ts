import type { Snapshot } from "@harrhy/pool-protocol";
import type { PoolSound } from "@harrhy/pool";
import { createPoolAudio } from "@harrhy/pool/audio";
import { TABLES } from "@harrhy/pool-simulation/geometry";
import {
  AudioEventGate,
  consumeHeard,
  type PredictionContext,
  type HeardSound,
} from "./audio-mix";

export function createGameAudio() {
  const audio = createPoolAudio();
  const events = new AudioEventGate();
  let prediction: PredictionContext | null = null;

  function setPrediction(context: PredictionContext | null) {
    prediction = context;
    // Ending prediction retains heard occurrences for delayed server confirmation.
  }

  function predicted(
    tableId: string,
    rack: number,
    turn: number,
    sound: PoolSound,
  ) {
    const context = { tableId, rack, turn };
    if (
      prediction &&
      (prediction.tableId !== tableId ||
        prediction.rack !== rack ||
        prediction.turn !== turn)
    )
      return;
    const now = performance.now();
    if (consumeHeard(events.heard, context, sound, now, "server")) return;
    const spot = TABLES.find((table) => table.id === tableId);
    if (
      !spot ||
      !audio.playImpact(sound, {
        ...sound,
        x: sound.x + spot.x,
        z: sound.z + spot.z,
      })
    )
      return;
    remember(context, sound, now, "predicted");
  }

  function remember(
    context: PredictionContext,
    sound: PoolSound,
    now: number,
    source: HeardSound["source"],
  ) {
    events.heard.push({
      ...context,
      sound: { ...sound },
      heardAt: now,
      source,
    });
    if (events.heard.length > 96) events.heard.shift();
  }

  function observe(snapshot: Snapshot, _focusTable: string | null) {
    const now = performance.now();
    events.begin(snapshot.time, now);
    events.retain(new Set(snapshot.tables.map((table) => table.id)));
    for (const table of snapshot.tables) {
      const sounds = events.events(
        table.id,
        table.rack,
        table.sounds ?? [],
        snapshot.time,
      );
      const spot = TABLES.find(
        (candidateSpot) => candidateSpot.id === table.id,
      );
      if (!spot) continue;
      for (const sound of sounds) {
        if (
          consumeHeard(
            events.heard,
            { tableId: table.id, rack: table.rack, turn: sound.turn },
            sound,
            now,
          )
        )
          continue;
        if (
          audio.playImpact(sound, {
            ...sound,
            x: sound.x + spot.x,
            z: sound.z + spot.z,
          })
        )
          remember(
            { tableId: table.id, rack: table.rack, turn: sound.turn },
            sound,
            now,
            "server",
          );
      }
    }
    audio.updateRolling(
      snapshot.tables.flatMap((table) => {
        const spot = TABLES.find((candidate) => candidate.id === table.id);
        if (!spot) return [];
        return table.balls.map((ball) => ({
          key: `${table.id}:${table.rack}:${ball.id}`,
          ball,
          point: { x: ball.x + spot.x, y: ball.y, z: ball.z + spot.z },
        }));
      }),
    );
  }

  const { toggle, reset, dispose } = audio;
  return Object.assign(audio, {
    setPrediction,
    predicted,
    observe,
    toggle() {
      const enabled = toggle();
      if (!enabled) events.heard.length = 0;
      return enabled;
    },
    reset() {
      reset();
      events.reset();
      prediction = null;
    },
    dispose() {
      dispose();
      events.reset();
      prediction = null;
    },
  });
}

export type GameAudio = ReturnType<typeof createGameAudio>;
