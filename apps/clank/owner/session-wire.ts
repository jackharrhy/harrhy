import {
  Sessions as SessionsV9,
  SessionsV8,
} from "../../pi/plugins/sessions/contract.ts";
import type { Ctx } from "../../pi/src/runtime/chord.ts";
export async function ownerSessions(scope: Ctx) {
  const modern = await scope
    .get(SessionsV9, {}, { readyTimeout: 350 })
    .catch(() => undefined);
  if (modern?.variant === "owner") return { version: 9 as const, ref: modern };
  const old = await scope.get(SessionsV8, {});
  if (old.variant === "owner") return { version: 8 as const, ref: old };
  throw Error("Owner Sessions required");
}
