export interface Track {
  id: string;
  title: string;
  url: string;
  addedAt: number;
  upload?: {
    status: "uploading" | "failed";
    bytesReceived: number;
    sizeBytes: number;
  };
}
export interface RadioDemoState {
  connected: boolean;
  synced: boolean;
  offsetMs: number;
  rttMs: number;
  clockSkewPpm: number;
  syncUncertaintyMs: number;
  outputLatencyMs: number;
  playbackErrorMs: number;
  playbackRate: number;
  deviceCompensationMs: number;
  tracks: Track[];
  clients: { clientId: string; name: string; rtt: number }[];
  currentTrackId: string | null;
  bufferingTrackId: string | null;
  readyClientCount: number;
  totalClientCount: number;
  bufferedSeconds: number;
  playing: boolean;
  positionSeconds: number;
  durationSeconds: number;
  volume: number;
  status: string;
}
export interface RadioDemoActions {
  play(trackId?: string): void;
  pause(): void;
  seek(seconds: number): void;
  setVolume(volume: number): void;
  setDeviceCompensation(ms: number): void;
  wakeAudio(): void;
  syncNow(): void;
  removeTrack(id: string): void;
  renameTrack(id: string, title: string): void;
  reorderTracks(ids: string[]): void;
}
export const scenarios = [
  "paused",
  "playing",
  "empty",
  "offline",
  "syncing",
  "uploading",
  "failed",
  "buffering",
  "calibrated",
] as const;
export type Scenario = (typeof scenarios)[number];
const titles = [
  "Midnight on the harbour",
  "A small room with the windows open",
  "Tape loop no. 4",
  "Last train through the valley",
  "Rain against the studio roof",
  "Soft signal, distant station",
  "Morning light on the platform",
  "After the last ferry",
];

function createScenario(scenario: Scenario): RadioDemoState {
  const empty = scenario === "empty";
  const tracks: Track[] = empty
    ? []
    : titles.map((title, index) => ({
        id: `fixture-${index + 1}`,
        title,
        url: `about:blank#fixture-${index + 1}`,
        addedAt: index,
      }));
  if (scenario === "uploading" || scenario === "failed")
    tracks.push({
      id: "fixture-upload",
      title: "Field recording.webm",
      url: "about:blank#fixture-upload",
      addedAt: 9,
      upload: {
        status: scenario === "failed" ? "failed" : "uploading",
        bytesReceived: 31,
        sizeBytes: 100,
      },
    });
  return {
    connected: scenario !== "offline",
    synced: scenario !== "syncing" && scenario !== "offline",
    offsetMs: 2,
    rttMs: 24,
    clockSkewPpm: 3,
    syncUncertaintyMs: 4,
    outputLatencyMs: 12,
    playbackErrorMs: 1,
    playbackRate: 1,
    deviceCompensationMs: scenario === "calibrated" ? -20 : 0,
    tracks,
    clients: empty
      ? []
      : [
          { clientId: "listener-a", name: "Robin", rtt: 24 },
          { clientId: "listener-b", name: "Mika", rtt: 31 },
          { clientId: "listener-c", name: "Jules", rtt: 18 },
          { clientId: "listener-d", name: "You", rtt: 22 },
        ],
    currentTrackId: tracks[0]?.id ?? null,
    bufferingTrackId: scenario === "buffering" ? tracks[0]!.id : null,
    readyClientCount: scenario === "buffering" ? 1 : 4,
    totalClientCount: empty ? 0 : 4,
    bufferedSeconds: 38,
    playing: scenario === "playing",
    positionSeconds: empty ? 0 : 42,
    durationSeconds: empty ? 0 : 246,
    volume: 0.65,
    status:
      scenario === "buffering"
        ? "Buffering 1/4 ready"
        : scenario === "syncing"
          ? "Synchronizing"
          : scenario === "offline"
            ? "Disconnected"
            : "Ready",
  };
}

export function createRadioDemo(onChange: () => void) {
  let state = createScenario("paused");
  let nextTrack = 0;
  let announcement = "";
  function update(patch: Partial<RadioDemoState>, message: string) {
    state = { ...state, ...patch };
    announcement = message;
    onChange();
  }
  const actions: RadioDemoActions = {
    play(id) {
      const track =
        state.tracks.find((item) => item.id === (id ?? state.currentTrackId)) ??
        state.tracks.find((item) => !item.upload);
      if (!track || track.upload) return;
      update(
        {
          currentTrackId: track.id,
          playing: true,
          durationSeconds: 246,
          positionSeconds:
            track.id === state.currentTrackId ? state.positionSeconds : 0,
          status: "Playing locally",
          bufferingTrackId: null,
        },
        `Playing ${track.title}. No audio is loaded.`,
      );
    },
    pause() {
      update({ playing: false, status: "Paused" }, "Paused locally.");
    },
    seek(seconds) {
      update(
        {
          positionSeconds: Math.max(
            0,
            Math.min(state.durationSeconds, seconds),
          ),
        },
        `Position ${Math.round(seconds)} seconds.`,
      );
    },
    setVolume(volume) {
      update(
        { volume: Math.max(0, Math.min(1, volume)) },
        "Volume adjusted locally.",
      );
    },
    setDeviceCompensation(ms) {
      update(
        { deviceCompensationMs: Math.max(-500, Math.min(500, ms)) },
        "Playback offset adjusted locally.",
      );
    },
    wakeAudio() {
      update({}, "Audio wake simulated. No audio context is created.");
    },
    syncNow() {
      update(
        { synced: true, status: "Ready" },
        "Synchronization simulated. No server contacted.",
      );
    },
    removeTrack(id) {
      const tracks = state.tracks.filter((track) => track.id !== id);
      update(
        {
          tracks,
          ...(state.currentTrackId === id
            ? {
                currentTrackId:
                  tracks.find((track) => !track.upload)?.id ?? null,
                playing: false,
                positionSeconds: 0,
                durationSeconds: tracks.length ? 246 : 0,
              }
            : {}),
        },
        "Track removed locally. Reset to restore.",
      );
    },
    renameTrack(id, title) {
      const next = title.trim();
      if (!next) return;
      update(
        {
          tracks: state.tracks.map((track) =>
            track.id === id ? { ...track, title: next } : track,
          ),
        },
        `Renamed to ${next}.`,
      );
    },
    reorderTracks(ids) {
      if (
        ids.length !== state.tracks.length ||
        new Set(ids).size !== ids.length ||
        ids.some((id) => !state.tracks.some((track) => track.id === id))
      )
        return;
      const byId = new Map(state.tracks.map((track) => [track.id, track]));
      update(
        { tracks: ids.map((id) => byId.get(id)!) },
        "Playlist reordered locally.",
      );
    },
  };
  return {
    get state() {
      return state;
    },
    get announcement() {
      return announcement;
    },
    actions,
    reset(scenario: Scenario) {
      state = createScenario(scenario);
      announcement = "Scenario reset. All data is synthetic.";
      onChange();
    },
    addTrack() {
      const id = `fixture-added-${++nextTrack}`;
      update(
        {
          tracks: [
            ...state.tracks,
            {
              id,
              title: "New field recording",
              url: "about:blank#fixture-added",
              addedAt: state.tracks.length,
            },
          ],
        },
        "Synthetic track added. No file selected or uploaded.",
      );
    },
  };
}
