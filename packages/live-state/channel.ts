import type { RpcStub } from "capnweb";
import type { Frame, Sink } from "./watch.ts";
type Delivery<T> = { frame: Frame<T>; more?: boolean };
export function channel<T>(
  cursor: number | null,
  borrowed: Pick<RpcStub<Sink<T>>, "dup">,
  read: (after: number | null) => Delivery<T> | PromiseLike<Delivery<T>>,
  arm: (due: number) => void,
  fail: () => void,
  retired: () => void,
) {
  const sink = borrowed.dup();
  let busy = false,
    dirty = false,
    closed = false,
    due = 0;
  function stop() {
    if (!closed) {
      closed = true;
      sink[Symbol.dispose]();
      if (!busy) retired();
    }
  }
  async function wake() {
    dirty = true;
    if (busy || closed) return;
    busy = true;
    try {
      while (dirty) {
        if (closed) break;
        dirty = false;
        due = Date.now() + 2000;
        arm(due);
        const { frame, more } = await read(cursor);
        if (closed) break;
        const ack = await sink(frame);
        due = 0;
        if (closed) return;
        if (ack !== (frame.kind === "reset" ? null : frame.at))
          throw Error("bad ack");
        cursor = ack;
        dirty ||= frame.kind === "reset" || !!more;
      }
    } catch {
      if (!closed) {
        stop();
        fail();
      }
    } finally {
      due = 0;
      busy = false;
      if (closed) retired();
    }
  }
  return {
    wake,
    stop,
    get due() {
      return due;
    },
  };
}
