import { DatabaseSync } from "node:sqlite";
import { check, type Route, type Access, type Principal } from "./access.ts";
type Excerpt = { source: Route; excerpt: string };
type Citation = Excerpt & { id: string; destination: Route };
export type TranscriptEvent =
  | { speaker: "agent" | "terminal"; text: string }
  | { speaker: Principal; text: string; citation: Excerpt | null };
export type Receipt = { id: string; route: Route; seq: number };
type RoomState = {
  marty: Access;
  events: TranscriptEvent[];
  receipts: {
    p: Principal;
    id: string;
    body: string;
    citationId: string | null;
    receipt: Receipt;
  }[];
};
type State = { citations: Citation[]; rooms: Record<Route, RoomState> };

function initialRoom(route: Route): RoomState {
  return {
    marty: { read: route === "home/familiar", send: false, epoch: 0 },
    events: [
      {
        speaker: "agent",
        text: `Mock notes for ${route}. Selected sample. Private remainder.`,
      },
      { speaker: "terminal", text: "[mock terminal: idle; no execution]" },
    ],
    receipts: [],
  };
}
const initial = (): State => ({
  citations: [],
  rooms: {
    "home/familiar": initialRoom("home/familiar"),
    "home/scoped": initialRoom("home/scoped"),
    "away/familiar": initialRoom("away/familiar"),
    "away/scoped": initialRoom("away/scoped"),
  },
});

export function openStore(dbPath: string) {
  const db = new DatabaseSync(dbPath);
  db.exec(
    "PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY, body TEXT NOT NULL)",
  );
  db.prepare("INSERT OR IGNORE INTO state VALUES (1, ?)").run(
    JSON.stringify(initial()),
  );
  const stored = db.prepare("SELECT body FROM state WHERE id=1").get()?.body;
  check(typeof stored === "string", "MISSING_STATE");
  // The private fixture database is only written by this module.
  let state = JSON.parse(stored) as State;
  // SQLite is the ordering point. Never expose an updated ACL, transcript,
  // or receipt in memory until its write has committed.
  const update = <T>(edit: (next: State) => T): T => {
    const next = structuredClone(state);
    const result = edit(next);
    db.prepare("UPDATE state SET body=? WHERE id=1").run(JSON.stringify(next));
    state = next;
    return result;
  };
  return {
    get state() {
      return state;
    },
    update,
    close: () => db.close(),
  };
}
export type Store = ReturnType<typeof openStore>;
