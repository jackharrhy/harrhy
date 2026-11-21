import type { Session } from "../../pi/plugins/sessions/contract.ts";

// The user-facing Sessions row, never the underlying table or a worker document.
export type Row = Pick<
  Session,
  | "id"
  | "title"
  | "env"
  | "cwd"
  | "model"
  | "thinkingLevel"
  | "main"
  | "branches"
  | "createdAt"
  | "updatedAt"
  | "archivedAt"
  | "pinned"
>;
export const MAX_ROWS = 256;
export const MAX_BYTES = 192 * 1024;
export type Frame = { epoch: string; seq: number } & (
  | { kind: "snapshot"; rows: Row[] }
  | { kind: "change"; put: Row[]; remove: string[] }
);
export interface Sink {
  deliver(frame: Frame): Promise<void>;
}
export type Command =
  | { kind: "create"; title: string }
  | { kind: "rename"; id: string; title: string }
  | { kind: "archive"; id: string };
export interface Commands {
  execute(command: Command): Promise<void>;
}

export function parseCommand(value: unknown): Command {
  if (!value || typeof value !== "object") throw Error("Invalid command");
  const v = value as Record<string, unknown>;
  const title = typeof v.title === "string" ? v.title.trim() : "";
  const id =
    typeof v.id === "string" &&
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v.id)
      ? v.id
      : "";
  if (v.kind === "archive" && id) return { kind: "archive", id };
  if (title && title.length <= 120) {
    if (v.kind === "create") return { kind: "create", title };
    if (v.kind === "rename" && id) return { kind: "rename", id, title };
  }
  throw Error("Invalid fixture command");
}

export function project(rows: readonly Session[]): Row[] {
  if (rows.length > MAX_ROWS) throw Error("Fixture session limit exceeded");
  let bytes = 0;
  return rows.map(
    ({
      id,
      title,
      cwd,
      env,
      model,
      thinkingLevel,
      main,
      branches,
      pinned,
      createdAt,
      updatedAt,
      archivedAt,
    }) => {
      if (branches.length > 128) throw Error("Fixture branch limit exceeded");
      const row = {
        id,
        title,
        cwd,
        env: env ?? null,
        model: { provider: model.provider, modelId: model.modelId },
        thinkingLevel,
        main,
        branches: branches.map(({ conversation, parent, label }) => ({
          conversation,
          ...(parent === undefined ? {} : { parent }),
          label,
        })),
        pinned,
        createdAt,
        updatedAt,
        archivedAt,
      };
      bytes += new TextEncoder().encode(JSON.stringify(row)).length;
      if (bytes > MAX_BYTES) throw Error("Fixture snapshot limit exceeded");
      return row;
    },
  );
}

export function diff(previous: Row[], rows: Row[]) {
  const before = new Map(previous.map((row) => [row.id, row]));
  const put = rows.filter((row) => {
    const changed = JSON.stringify(before.get(row.id)) !== JSON.stringify(row);
    before.delete(row.id);
    return changed;
  });
  return { put, remove: [...before.keys()] };
}

export type View = { epoch: string; seq: number; rows: Map<string, Row> };
export function apply(view: View | undefined, frame: Frame): View {
  if (frame.kind === "snapshot" && frame.seq === 0 && !view)
    return {
      epoch: frame.epoch,
      seq: 0,
      rows: new Map(frame.rows.map((row) => [row.id, row])),
    };
  if (
    frame.kind !== "change" ||
    !view ||
    frame.epoch !== view.epoch ||
    frame.seq !== view.seq + 1
  )
    throw Error("Session state out of sequence");
  const rows = new Map(view.rows);
  for (const id of frame.remove) rows.delete(id);
  for (const row of frame.put) rows.set(row.id, row);
  return { epoch: view.epoch, seq: frame.seq, rows };
}
