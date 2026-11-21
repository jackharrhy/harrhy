import type { Frame } from "./session-state.ts";

/** One authenticated /live binding. Close the socket to release its watch. */
export type ReceiveFrame = (frame: Frame) => Promise<void>;
export interface SessionApi {
  watch(receive: ReceiveFrame): Promise<void>;
  create(epoch: string, title: string): Promise<void>;
  rename(epoch: string, id: string, title: string): Promise<void>;
  archive(epoch: string, id: string): Promise<void>;
}
