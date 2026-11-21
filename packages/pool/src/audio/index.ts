import type { PoolSound } from "../physics";
import {
  impactMix,
  spatialMix,
  rollingMix,
  MAX_ROLLING_VOICES,
  MAX_IMPACT_VOICES,
  MAX_VOICES,
} from "./mix";

type Point = { x: number; y: number; z: number };
type Voice = {
  source: AudioBufferSourceNode;
  gain: GainNode;
  filter: BiquadFilterNode;
  pan: PannerNode;
  dry: GainNode;
  spatial: GainNode;
  point: Point;
  level: number;
  rolling: boolean;
};

type RollingSample = {
  key: string;
  ball: Parameters<typeof rollingMix>[0];
  point: Point;
};

export function createPoolAudio() {
  let enabled = false;
  let onError: ((message: string) => void) | null = null;
  let disposed = false;
  const abort = new AbortController();
  let audio: AudioContext | null = null;
  let master: GainNode | null = null;
  let loading: Promise<void> | null = null;
  let impact: AudioBuffer | null = null;
  let impactDry: AudioBuffer | null = null;
  let lastImpactDry = false;
  let cue: AudioBuffer | null = null;
  let cueCloth: AudioBuffer | null = null;
  let lastCueCloth = false;
  let cabinet: AudioBuffer | null = null;
  let pocket: AudioBuffer | null = null;
  let felt: AudioBuffer | null = null;
  let rolling: AudioBuffer | null = null;
  let feltRolling: AudioBuffer | null = null;
  const loops = new Map<string, Voice>();
  let lastObserve = -Infinity;
  let watchdog: ReturnType<typeof setInterval> | null = null;
  const voices = new Set<Voice>();
  let pose = {
    pos: { x: 0, y: 1.5, z: 0 },
    forward: { x: 0, y: 0, z: -1 },
    up: { x: 0, y: 1, z: 0 },
  };

  function toggle() {
    if (disposed) return false;
    enabled = !enabled;
    if (enabled) void resume();
    else stopAll();
    return enabled;
  }

  function report(error: unknown) {
    if (disposed) return;
    const message = `Audio unavailable: ${error instanceof Error ? error.message : String(error)}`;
    console.warn(message);
    onError?.(message);
  }

  async function resume() {
    if (!enabled || disposed) return;
    try {
      if (!audio) {
        audio = new AudioContext();
        master = audio.createGain();
        master.gain.value = 0.65;
        const compressor = audio.createDynamicsCompressor();
        compressor.threshold.value = -10;
        compressor.knee.value = 8;
        compressor.ratio.value = 8;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.12;
        master.connect(compressor).connect(audio.destination);
        updateListener(pose.pos, pose.forward, pose.up);
        watchdog = setInterval(() => {
          if (performance.now() - lastObserve > 500) stopLoops();
        }, 250);
      }
      // Call resume in the gesture stack, before waiting for fetch/decode.
      const resumed = audio.resume();
      if (!loading) {
        const context = audio;
        loading = Promise.all(
          [
            "impact.wav",
            "pocket.wav",
            "cue.wav",
            "return.wav",
            "felt.wav",
            "rolling-loop.wav",
            "felt-roll.wav",
            "impact-dry.wav",
            "cue-cloth.wav",
          ].map(async (name) => {
            const response = await fetch(`/audio/${name}`, {
              signal: abort.signal,
            });
            if (!response.ok)
              throw new Error(`${name}: HTTP ${response.status}`);
            return context.decodeAudioData(await response.arrayBuffer());
          }),
        )
          .then(
            ([
              loadedImpact,
              loadedPocket,
              loadedCue,
              loadedCabinet,
              loadedFelt,
              loadedRolling,
              loadedFeltRolling,
              loadedImpactDry,
              loadedCueCloth,
            ]) => {
              if (audio !== context) return;
              impact = loadedImpact;
              impactDry = loadedImpactDry;
              pocket = loadedPocket;
              felt = loadedFelt;
              rolling = loadedRolling;
              feltRolling = loadedFeltRolling;
              cue = loadedCue;
              cueCloth = loadedCueCloth;
              cabinet = loadedCabinet;
            },
          )
          .catch((error) => {
            if (audio === context) loading = null;
            throw error;
          });
      }
      await Promise.all([resumed, loading]);
    } catch (error) {
      if (disposed) return;
      stopAll();
      report(error);
    }
  }

  function preview() {
    if (!enabled) return;
    void resume().then(() => {
      if (!enabled) return;
      const { pos, forward } = pose;
      playImpact({
        kind: "ball",
        ballId: 0,
        x: pos.x + forward.x,
        y: pos.y,
        z: pos.z + forward.z,
        speed: 1.5,
      });
    });
  }

  function updateListener(
    pos: Point,
    forward: Point,
    up: Point = { x: 0, y: 1, z: 0 },
  ) {
    if (
      ![
        ...Object.values(pos),
        ...Object.values(forward),
        ...Object.values(up),
      ].every(Number.isFinite)
    )
      return;
    pose = { pos: { ...pos }, forward: { ...forward }, up: { ...up } };
    for (const voice of voices) updateDistance(voice);
    const listener = audio?.listener;
    if (!listener) return;
    if (listener.positionX) {
      const time = audio!.currentTime;
      for (const [parameter, value] of [
        [listener.positionX, pos.x],
        [listener.positionY, pos.y],
        [listener.positionZ, pos.z],
        [listener.forwardX, forward.x],
        [listener.forwardY, forward.y],
        [listener.forwardZ, forward.z],
        [listener.upX, up.x],
        [listener.upY, up.y],
        [listener.upZ, up.z],
      ] as const)
        parameter.setTargetAtTime(value, time, 0.015);
    } else {
      listener.setPosition(pos.x, pos.y, pos.z);
      listener.setOrientation(
        forward.x,
        forward.y,
        forward.z,
        up.x,
        up.y,
        up.z,
      );
    }
  }

  function updateRolling(samples: readonly RollingSample[]) {
    lastObserve = performance.now();
    const candidates = samples
      .flatMap(({ key, ball, point }) => {
        const mix = rollingMix(ball);
        if (!mix.gain || ![point.x, point.y, point.z].every(Number.isFinite))
          return [];
        const distance = Math.hypot(
          point.x - pose.pos.x,
          point.y - pose.pos.y,
          point.z - pose.pos.z,
        );
        return [
          { key, point, mix, priority: mix.gain * spatialMix(distance).dry },
        ];
      })
      .toSorted((a, b) => b.priority - a.priority)
      .slice(0, MAX_ROLLING_VOICES);
    const selected = new Set(candidates.map(({ key }) => key));
    for (const [key, voice] of loops) {
      if (selected.has(key)) continue;
      release(voice);
      loops.delete(key);
    }
    if (!ready() || !rolling) return;
    for (const { key, point, mix } of candidates) {
      let voice = loops.get(key);
      const buffer = mix.sample === "felt" ? feltRolling : rolling;
      if (!buffer) continue;
      if (voice && voice.source.buffer !== buffer) {
        release(voice);
        loops.delete(key);
        voice = undefined;
      }
      if (!voice && voices.size < MAX_VOICES) {
        voice = createVoice(buffer, point, mix, true);
        loops.set(key, voice);
      }
      if (!voice) continue;
      const time = audio!.currentTime;
      voice.point = point;
      voice.gain.gain.setTargetAtTime(mix.gain, time, 0.04);
      voice.source.playbackRate.setTargetAtTime(mix.rate, time, 0.1);
      voice.filter.frequency.setTargetAtTime(mix.cutoff, time, 0.08);
      voice.pan.positionX.setTargetAtTime(point.x, time, 0.015);
      voice.pan.positionY.setTargetAtTime(point.y, time, 0.015);
      voice.pan.positionZ.setTargetAtTime(point.z, time, 0.015);
      updateDistance(voice);
    }
  }

  function ready() {
    return enabled && audio?.state === "running" && impact !== null;
  }

  function updateDistance(voice: Voice) {
    const mix = spatialMix(
      Math.hypot(
        voice.point.x - pose.pos.x,
        voice.point.y - pose.pos.y,
        voice.point.z - pose.pos.z,
      ),
    );
    const time = audio!.currentTime;
    voice.dry.gain.setTargetAtTime(mix.dry, time, 0.015);
    voice.spatial.gain.setTargetAtTime(mix.spatial, time, 0.015);
  }

  function createVoice(
    buffer: AudioBuffer,
    point: Point,
    mix: { gain: number; rate: number; cutoff: number },
    looping = false,
  ) {
    const context = audio!;
    const source = context.createBufferSource(),
      gain = context.createGain(),
      filter = context.createBiquadFilter(),
      pan = context.createPanner(),
      dry = context.createGain(),
      spatial = context.createGain();
    source.buffer = buffer;
    source.loop = looping;
    source.playbackRate.value = mix.rate;
    gain.gain.value = looping ? 0 : mix.gain;
    filter.type = "lowpass";
    filter.frequency.value = mix.cutoff;
    filter.Q.value = 0.5;
    pan.panningModel = "HRTF";
    pan.distanceModel = "inverse";
    pan.refDistance = 1;
    pan.maxDistance = 30;
    // Distance is applied equally to the centered and HRTF branches below.
    pan.rolloffFactor = 0;
    pan.positionX.value = point.x;
    pan.positionY.value = point.y;
    pan.positionZ.value = point.z;
    const distance = spatialMix(
      Math.hypot(
        point.x - pose.pos.x,
        point.y - pose.pos.y,
        point.z - pose.pos.z,
      ),
    );
    dry.gain.value = distance.dry;
    spatial.gain.value = distance.spatial;
    source.connect(filter).connect(gain);
    gain.connect(dry).connect(master!);
    gain.connect(pan).connect(spatial).connect(master!);
    const offset = looping ? Math.random() * buffer.duration : 0;
    const voice = {
      source,
      gain,
      filter,
      pan,
      dry,
      spatial,
      point: { ...point },
      level: mix.gain,
      rolling: looping,
    };
    voices.add(voice);
    source.addEventListener("ended", () => disconnect(voice), {
      once: true,
    });
    source.start(0, offset);
    return voice;
  }

  function playImpact(sound: PoolSound, point: Point = sound) {
    if (!ready() || ![point.x, point.y, point.z].every(Number.isFinite))
      return false;
    const base = impactMix(sound);
    const pitchVariation = sound.kind === "cue" ? 0.04 : 0.025;
    const mix = {
      ...base,
      rate:
        base.rate * (1 - pitchVariation + Math.random() * pitchVariation * 2),
      gain: base.gain * (0.95 + Math.random() * 0.1),
    };
    if (!mix.gain) return false;
    const impacts = [...voices].filter((voice) => !voice.rolling);
    if (impacts.length >= MAX_IMPACT_VOICES || voices.size >= MAX_VOICES) {
      const weakest = impacts.toSorted((a, b) => a.level - b.level)[0];
      if (!weakest || weakest.level >= mix.gain) return false;
      weakest.source.stop();
      disconnect(weakest);
    }
    const buffer = {
      impact: lastImpactDry ? impact : impactDry,
      cushion: felt,
      cue: lastCueCloth ? cue : cueCloth,
      pocket: pocket,
      return: cabinet,
      felt: felt,
      floor: pocket,
    }[mix.sample];
    if (!buffer) return false;
    createVoice(buffer, point, mix);
    if (mix.sample === "impact") lastImpactDry = !lastImpactDry;
    if (mix.sample === "cue") lastCueCloth = !lastCueCloth;
    return true;
  }

  function disconnect(voice: Voice) {
    voices.delete(voice);
    voice.source.disconnect();
    voice.filter.disconnect();
    voice.gain.disconnect();
    voice.pan.disconnect();
    voice.dry.disconnect();
    voice.spatial.disconnect();
  }

  function release(voice: Voice) {
    const time = audio!.currentTime;
    voice.gain.gain.cancelScheduledValues(time);
    voice.gain.gain.setTargetAtTime(0, time, 0.04);
    voice.source.stop(time + 0.2);
  }

  function stopLoops() {
    for (const voice of loops.values()) release(voice);
    loops.clear();
  }

  function stopAll() {
    for (const voice of voices) {
      voice.source.stop();
      disconnect(voice);
    }
    loops.clear();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    abort.abort();
    enabled = false;
    stopAll();
    if (watchdog) clearInterval(watchdog);
    watchdog = null;
    void audio?.close().catch((error) => report(error));
    audio = null;
    master = null;
    loading = null;
    impactDry = cueCloth = null;
    impact = pocket = cue = cabinet = felt = rolling = feltRolling = null;
  }
  return {
    get enabled() {
      return enabled;
    },
    get onError() {
      return onError;
    },
    set onError(callback: ((message: string) => void) | null) {
      onError = callback;
    },
    toggle,
    resume,
    preview,
    updateListener,
    updateRolling,
    playImpact,
    reset: stopAll,
    dispose,
  };
}

export { impactMix, rollingMix, spatialMix, isFeltLanding } from "./mix";
export {
  RETURN_FLOOR,
  RETURN_FLOOR_POINT,
  isReturnFloorLanding,
} from "./surfaces";
