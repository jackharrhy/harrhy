import { randomUUID } from "node:crypto";

const fail = () =>
  Object.assign(
    new Error(
      "Provisioning review changed or is unavailable. No automatic retry is permitted.",
    ),
    { status: 409 },
  );
const text = (value) => {
  if (typeof value !== "string" || !value.trim() || value.length > 500)
    throw fail();
  return value;
};

// A native creation is never retried after its durable claim, even without a returned ID.
export function createMediaProvisioningLedger(
  db,
  { people, mappings, provisioning },
) {
  db.exec(`CREATE TABLE IF NOT EXISTS media_provisioning (
    id TEXT PRIMARY KEY, actor TEXT NOT NULL, state TEXT NOT NULL,
    created_at TEXT NOT NULL, body TEXT NOT NULL, native_id TEXT,
    claim_person TEXT UNIQUE, claim_username TEXT UNIQUE
  );
  CREATE TABLE IF NOT EXISTS media_provisioning_events (
    id TEXT NOT NULL, at TEXT NOT NULL, actor TEXT NOT NULL, state TEXT NOT NULL
  );`);
  const get = (id) => {
    const row = db
      .prepare("SELECT * FROM media_provisioning WHERE id=?")
      .get(id);
    return row ? { ...row, body: JSON.parse(row.body) } : null;
  };
  const event = (id, actor, state, now) =>
    db
      .prepare("INSERT INTO media_provisioning_events VALUES (?,?,?,?)")
      .run(id, new Date(now).toISOString(), actor, state);
  function transaction(operation) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      if (error?.code?.startsWith("ERR_SQLITE")) throw fail();
      throw error;
    }
  }
  const validateTarget = async (target) => {
    const exact = Object.fromEntries(
      ["service", "instance", "issuer", "subject"].map((key) => [
        key,
        text(target[key]),
      ]),
    );
    if (!["jellyfin", "seerr"].includes(exact.service)) throw fail();
    if (exact.service === "seerr") {
      exact.sourceInstance = text(target.sourceInstance);
      exact.sourceNativeId = text(target.sourceNativeId);
      if (
        !mappings().some(
          (item) =>
            item.service === "jellyfin" &&
            item.instance === exact.sourceInstance &&
            item.nativeId === exact.sourceNativeId &&
            item.issuer === exact.issuer &&
            item.subject === exact.subject,
        )
      )
        throw fail();
    }
    if (
      !(await people()).some(
        (person) =>
          person.issuer === exact.issuer &&
          person.subject === exact.subject &&
          person.active === true,
      )
    )
      throw fail();
    if (
      mappings().some(
        (item) =>
          item.service === exact.service &&
          item.instance === exact.instance &&
          item.issuer === exact.issuer &&
          item.subject === exact.subject,
      )
    )
      throw fail();
    return exact;
  };
  return {
    libraries: (target) =>
      provisioning({
        service: text(target.service),
        instance: text(target.instance),
      }).libraries(),
    get,
    list: () =>
      db
        .prepare(
          "SELECT id FROM media_provisioning ORDER BY created_at DESC, rowid DESC LIMIT 100",
        )
        .all()
        .map(({ id }) => get(id)),
    events: (id) =>
      db
        .prepare(
          "SELECT * FROM media_provisioning_events WHERE id=? ORDER BY rowid",
        )
        .all(id),
    async preview({
      actor,
      reason,
      target,
      username,
      folderIds,
      now = Date.now(),
    }) {
      text(actor);
      text(reason);
      const exact = await validateTarget(target);
      const review = await provisioning(exact).preview({
        username,
        folderIds,
        ...(exact.service === "seerr"
          ? { jellyfinNativeId: exact.sourceNativeId }
          : {}),
      });
      const id = randomUUID();
      transaction(() => {
        db.prepare(
          "INSERT INTO media_provisioning (id,actor,state,created_at,body) VALUES (?,?,'review',?,?)",
        ).run(
          id,
          actor,
          new Date(now).toISOString(),
          JSON.stringify({ target: exact, reason, review }),
        );
        event(id, actor, "review", now);
      });
      return get(id);
    },
    async confirm({ id, actor, password, now = Date.now() }) {
      const action = get(id);
      if (!action || action.actor !== actor) throw fail();
      if (action.state !== "review") return action;
      const age = now - Date.parse(action.created_at);
      if (age < 0 || age > 300000) throw fail();
      const target = await validateTarget(action.body.target);
      const adapter = provisioning(target);
      const result = await adapter.provision(action.body.review, {
        password,
        claimEffect: async () =>
          transaction(() => {
            const changed = db
              .prepare(
                "UPDATE media_provisioning SET state='effect-unknown',claim_person=?,claim_username=? WHERE id=? AND state='review'",
              )
              .run(
                JSON.stringify([
                  target.service,
                  target.instance,
                  target.issuer,
                  target.subject,
                ]),
                JSON.stringify([
                  target.service,
                  target.instance,
                  target.service === "seerr"
                    ? target.sourceNativeId.replaceAll("-", "").toLowerCase()
                    : action.body.review.username.toLowerCase(),
                ]),
                id,
              );
            if (changed.changes !== 1) throw fail();
            event(id, actor, "effect-unknown", now);
          }),
        recordNativeId: async (nativeId) =>
          transaction(() => {
            text(nativeId);
            const changed = db
              .prepare(
                "UPDATE media_provisioning SET native_id=? WHERE id=? AND state='effect-unknown' AND native_id IS NULL",
              )
              .run(nativeId, id);
            if (changed.changes !== 1) throw fail();
            event(id, actor, "native-id-recorded", now);
          }),
      });
      if (result.state === "created")
        transaction(() => {
          const changed = db
            .prepare(
              "UPDATE media_provisioning SET state='created' WHERE id=? AND state='effect-unknown' AND native_id=?",
            )
            .run(id, result.nativeId);
          if (changed.changes !== 1) throw fail();
          event(id, actor, "created", now);
        });
      else if (result.state !== "effect-unknown") throw fail();
      return get(id);
    },
  };
}
