import { arr, nul, obj, opt, str } from "@earendil-works/pi-schema";
import { evolve, propertiesOf } from "../../pi/src/api/v1/index.ts";
import {
  CreateArgsSchema,
  SessionIdSchema,
  SessionSchema,
  Sessions as SessionsV8,
} from "../../pi/plugins/sessions/contract.ts";
import type { Ctx } from "../../pi/src/runtime/chord.ts";

// Temporary client evolution from Pi ecd643b7; use Pi's export once integrated.
const Slug = str({
  maxLength: 64,
  pattern:
    "^(?![0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$)[a-z0-9]+(?:-[a-z0-9]+)*(?![\\s\\S])",
});
const OwnerSession = obj({ ...propertiesOf(SessionSchema), slug: opt(Slug) });
const SessionsV9 = evolve(SessionsV8, (e) =>
  e
    .state("owner", "sessions", arr(OwnerSession))
    .args("create", obj({ ...propertiesOf(CreateArgsSchema), slug: opt(Slug) }))
    .result("create", OwnerSession)
    .addMethod(
      "owner",
      "assignSlug",
      obj({ id: SessionIdSchema, slug: Slug }),
      nul(),
    ),
);

export async function ownerSessions(scope: Ctx) {
  const modern = await scope
    .get(SessionsV9, {}, { readyTimeout: 350 })
    .catch(() => undefined);
  if (modern?.variant === "owner") return { version: 9 as const, ref: modern };
  const old = await scope.get(SessionsV8, {});
  if (old.variant === "owner") return { version: 8 as const, ref: old };
  throw Error("Owner Sessions required");
}
