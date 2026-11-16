import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

const fail = (message) => Object.assign(new Error(message), { status: 409 });
const required = (value) => {
  if (typeof value !== "string" || !value.trim() || value.length > 500)
    throw fail("Exact identifiers and a review reason are required.");
  return value;
};

// This ledger never authorizes issuer deletion or claims native session revocation.
export function createMediaServiceActions(db, { mappings, lifecycle }) {
  db.exec(`CREATE TABLE IF NOT EXISTS media_service_actions (
    id TEXT PRIMARY KEY, actor TEXT NOT NULL, state TEXT NOT NULL,
    created_at TEXT NOT NULL, body TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS media_service_action_events (
    action_id TEXT NOT NULL, at TEXT NOT NULL, state TEXT NOT NULL, actor TEXT NOT NULL
  );`);
  const get = (id) => {
    const row = db
      .prepare("SELECT * FROM media_service_actions WHERE id=?")
      .get(id);
    return row ? { ...row, body: JSON.parse(row.body) } : null;
  };
  const event = (id, actor, state, now) =>
    db
      .prepare("INSERT INTO media_service_action_events VALUES (?,?,?,?)")
      .run(id, new Date(now).toISOString(), state, actor);
  function transition(id, actor, from, to, now) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = db
        .prepare(
          "UPDATE media_service_actions SET state=? WHERE id=? AND state=?",
        )
        .run(to, id, from);
      if (result.changes !== 1)
        throw fail("Service action state changed; do not retry native writes.");
      event(id, actor, to, now);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  const exactMapping = (mapping) => {
    const exact = Object.fromEntries(
      ["service", "instance", "nativeId", "issuer", "subject"].map((key) => [
        key,
        required(mapping[key]),
      ]),
    );
    if (
      !mappings().some((item) =>
        Object.entries(exact).every(([key, value]) => item[key] === value),
      )
    )
      throw fail("An explicitly confirmed exact-ID mapping is required.");
    if (!["jellyfin", "seerr"].includes(exact.service))
      throw fail("This service requires manual offboarding.");
    return exact;
  };
  const owned = (id, actor) => {
    const action = get(id);
    if (!action || action.actor !== actor)
      throw fail("Service action review not found.");
    return action;
  };
  return {
    get,
    list: () =>
      db
        .prepare(
          "SELECT id FROM media_service_actions ORDER BY created_at DESC, rowid DESC LIMIT 100",
        )
        .all()
        .map(({ id }) => get(id)),
    events: (id) =>
      db
        .prepare(
          "SELECT * FROM media_service_action_events WHERE action_id=? ORDER BY rowid",
        )
        .all(id),
    async preview({
      actor,
      reason,
      mapping,
      operation = "disable",
      now = Date.now(),
    }) {
      required(actor);
      required(reason);
      const exact = exactMapping(mapping);
      if (
        !(
          (exact.service === "jellyfin" && operation === "disable") ||
          (exact.service === "seerr" &&
            operation === "remove-account-and-requests")
        )
      )
        throw fail("Select a supported explicit service operation.");
      const review = await lifecycle(exact).inspect(exact.nativeId);
      const id = randomUUID();
      const body = {
        action: operation,
        mapping: exact,
        reason,
        review,
        sessionRevocation: "manual-required",
      };
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare(
          "INSERT INTO media_service_actions VALUES (?,?,'review',?,?)",
        ).run(id, actor, new Date(now).toISOString(), JSON.stringify(body));
        event(id, actor, "review", now);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return get(id);
    },
    async confirm({ id, actor, destructiveConfirmation, now = Date.now() }) {
      const action = owned(id, actor);
      if (action.state !== "review") return action;
      const age = now - Date.parse(action.created_at);
      if (age < 0 || age > 300000) throw fail("Service action review expired.");
      const mapping = exactMapping(action.body.mapping);
      const adapter = lifecycle(mapping);
      const destructive = action.body.action === "remove-account-and-requests";
      if (
        destructive &&
        destructiveConfirmation !==
          `REMOVE ${mapping.nativeId} AND ${action.body.review.requestCount} REQUESTS`
      )
        throw fail(
          "Confirm the exact account and reviewed request count. Concurrent requests may also be removed.",
        );
      const perform = destructive
        ? adapter.removeAccountAndRequests
        : adapter.disable;
      const result = await perform(action.body.review, () => {
        // Reserve all overlapping reviews atomically, before crossing the write boundary.
        db.exec("BEGIN IMMEDIATE");
        try {
          const others = db
            .prepare(
              "SELECT id,body FROM media_service_actions WHERE state IN ('effect-unknown','disabled','already-disabled','recovered-disabled','removed')",
            )
            .all();
          if (
            others.some((other) => {
              const value = JSON.parse(other.body).mapping;
              return (
                value.service === mapping.service &&
                value.instance === mapping.instance &&
                value.nativeId === mapping.nativeId
              );
            })
          )
            throw fail(
              "This native account already has a claimed action. Inspect recovery; never replay.",
            );
          const updated = db
            .prepare(
              "UPDATE media_service_actions SET state='effect-unknown' WHERE id=? AND state='review'",
            )
            .run(id);
          if (updated.changes !== 1)
            throw fail("Service action already claimed.");
          event(id, actor, "effect-unknown", now);
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      });
      if (result.state === "already-disabled")
        transition(id, actor, "review", "already-disabled", now);
      else if (result.state === "disabled")
        transition(id, actor, "effect-unknown", "disabled", now);
      else if (result.state === "removed" && destructive)
        transition(id, actor, "effect-unknown", "removed", now);
      else if (result.state !== "effect-unknown")
        throw fail("Unsupported native action result.");
      return get(id);
    },
    async recover({ id, actor, now = Date.now() }) {
      const action = owned(id, actor);
      if (action.state !== "effect-unknown") return action;
      if (action.body.action !== "disable")
        throw fail(
          "Account removal may be partial. Manual investigation required; no destructive write will be retried.",
        );
      const mapping = exactMapping(action.body.mapping);
      const observed = await lifecycle(mapping).inspect(mapping.nativeId);
      if (!isDeepStrictEqual(observed.before, action.body.review.after))
        throw fail(
          "Native policy does not match the reviewed disabled policy; manual investigation required. No write was retried.",
        );
      transition(id, actor, "effect-unknown", "recovered-disabled", now);
      return get(id);
    },
  };
}
