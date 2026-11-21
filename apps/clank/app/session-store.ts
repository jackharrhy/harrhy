import { emptyIndex, type SessionIndex } from "./session-state.ts";

type State = SessionIndex & {
  status: "connecting" | "live" | "disconnected";
  pending: boolean;
  notice: string;
};
export function createSessionStore() {
  let state: State = {
    ...emptyIndex,
    status: "connecting",
    pending: false,
    notice: "",
  };
  const subscriptions = new Set<() => unknown>();
  function select<T>(pick: (s: Readonly<State>) => T) {
    return {
      get current() {
        return pick(state);
      },
      subscribe(
        listener: (value: T) => unknown,
        { signal }: { signal: AbortSignal },
      ) {
        let last = pick(state);
        function changed() {
          const next = pick(state);
          if (!Object.is(next, last)) {
            last = next;
            return listener(next);
          }
        }
        function stop() {
          subscriptions.delete(changed);
          signal.removeEventListener("abort", stop);
        }
        if (!signal.aborted) {
          subscriptions.add(changed);
          signal.addEventListener("abort", stop, { once: true });
        }
        return stop;
      },
    };
  }
  return {
    select,
    async publish(patch: Partial<State>) {
      state = { ...state, ...patch };
      // Listeners return their component's update promise. The watch waits for all affected renders.
      await Promise.all(Array.from(subscriptions, (changed) => changed()));
    },
  };
}
