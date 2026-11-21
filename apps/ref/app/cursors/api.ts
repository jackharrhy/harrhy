import type { Sink } from "@harrhy/live-state/watch";

export type Position = { x: number; y: number };
export type Cursor = Position & { id: string };
export interface LiveBoardApi {
  start(id: string, after: number | null, sink: Sink<Cursor>): Promise<void>;
  stop(id: string): void;
  rename(title: string): Promise<string | null>;
  move(position: Position | null): Promise<void>;
}
