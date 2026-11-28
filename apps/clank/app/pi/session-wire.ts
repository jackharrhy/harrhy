import { ChordError, isChordError, type RefState } from "@earendil-works/chord";
import {
  Sessions as SessionsV9,
  SessionsV8,
} from "../../../pi/plugins/sessions/contract.ts";
import type { Ctx } from "../../../pi/src/runtime/chord.ts";
export function permissionDenied(state: RefState) {
  return (
    (state.kind === "ended" && isChordError(state.error, "forbidden")) ||
    (state.kind === "failed" &&
      (state.cause.kind === "denied" ||
        isChordError(state.cause.error, "forbidden")))
  );
}
export const ownerDenied = () =>
  new ChordError({ code: "forbidden", message: "Owner Sessions required" });
export async function ownerSessions(scope: Ctx) {
  const modern = await scope
    .get(SessionsV9, {}, { readyTimeout: 350 })
    .catch((error) => {
      if (isChordError(error, "forbidden")) throw error;
      return undefined;
    });
  if (modern?.variant === "owner") return { version: 9 as const, ref: modern };
  if (modern?.state.value.kind === "live") throw ownerDenied();
  const old = await scope.get(SessionsV8, {});
  if (old.variant === "owner") return { version: 8 as const, ref: old };
  if (old.state.value.kind === "live" || permissionDenied(old.state.value))
    throw ownerDenied();
  throw Error("Owner Sessions ended");
}
