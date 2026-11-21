export type Frame<T> =
  | { kind: "reset" }
  | { kind: "same"; at: number }
  | { kind: "snapshot"; at: number; items: T[] }
  | { kind: "page"; from: number; at: number; items: T[] };
export type Sink<T> = (frame: Frame<T>) => Promise<number | null>;
export type Port<T> = {
  start(id: string, after: number | null, sink: Sink<T>): PromiseLike<void>;
  stop(id: string): PromiseLike<void>;
};

// One watch owns one cursor in one authorization scope. render is synchronous.
export function watch<T>(
  render: (items: readonly T[] | null) => void,
  ordered?: { seq: (x: T) => number; window: number },
) {
  let epoch = 0,
    dead = false,
    scope = "",
    at: number | null = null,
    items: T[] = [];
  let release: (() => Promise<void>) | undefined;
  function detach(forget = false) {
    ++epoch;
    const stop = release;
    release = undefined;
    if (forget) {
      scope = "";
      at = null;
      items = [];
    }
    render(null);
    return stop?.();
  }
  return {
    async reconnect(port: Port<T>, grant: string) {
      if (dead) return;
      void detach(grant !== scope);
      scope = grant;
      const e = epoch,
        id = crypto.randomUUID();
      release = async () => {
        try {
          await port.stop(id);
        } catch {
          /* transport gone */
        }
      };
      await port.start(id, at, async (f) => {
        if (e !== epoch) return null;
        if (f.kind === "reset") {
          at = null;
          items = [];
          render(null);
          return null;
        } // explicitly request fresh snapshot
        if (f.kind === "same") {
          if (at !== f.at) throw Error("unexpected cursor");
        } else if (f.kind === "snapshot") {
          if (at === null || f.at >= at) {
            at = f.at;
            items = f.items;
          }
        } else if (at !== null && f.at <= at) return at;
        else {
          if (
            at === null ||
            !ordered ||
            at !== f.from ||
            f.items.length !== f.at - f.from ||
            !f.items.every((x, i) => ordered.seq(x) === f.from + i + 1)
          )
            throw Error("noncontiguous page");
          items = [...items, ...f.items].slice(-ordered.window);
          at = f.at;
        }
        render(items);
        return at;
      });
    },
    disconnect: detach,
    async dispose() {
      dead = true;
      await detach(true);
    },
  };
}
