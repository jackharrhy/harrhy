import { randomUUID } from "node:crypto";

const fail = (status, message) => Object.assign(new Error(message), { status });
const text = (value, field) => {
  if (typeof value !== "string" || !value.trim() || value.length > 500)
    throw fail(400, `Invalid ${field}.`);
  return value;
};
const scopeKey = ({ service, instance }) => JSON.stringify([service, instance]);
const nativeKey = (value) =>
  JSON.stringify([value.service, value.instance, value.nativeId]);
const personKey = (value) =>
  JSON.stringify([value.service, value.instance, value.issuer, value.subject]);

export function accountDiscrepancies({
  snapshot,
  mappings,
  people,
  now = Date.now(),
  maxAgeMs = 300000,
}) {
  const scope = scopeKey(snapshot);
  const links = mappings.filter((item) => scopeKey(item) === scope);
  if (snapshot.state !== "available")
    return {
      state: "unavailable",
      observedAt: snapshot.observedAt || null,
      rows: [],
    };
  const observed = Date.parse(snapshot.observedAt);
  if (!Number.isFinite(observed) || observed > now || now - observed > maxAgeMs)
    return {
      state: "stale",
      observedAt: snapshot.observedAt || null,
      rows: [],
    };
  const accounts = snapshot.accounts;
  if (
    !Array.isArray(accounts) ||
    new Set(accounts.map((item) => item.nativeId)).size !== accounts.length
  )
    throw fail(502, "Native inventory contains duplicate or invalid accounts.");
  const rows = accounts.map((account) => {
    text(account.nativeId, "native immutable ID");
    const matches = links.filter((link) => link.nativeId === account.nativeId);
    const link = matches[0];
    const person =
      link &&
      people.find(
        (item) => item.issuer === link.issuer && item.subject === link.subject,
      );
    return {
      account,
      mapping: link || null,
      state:
        matches.length > 1
          ? "ambiguous"
          : !link
            ? "native-only"
            : !person
              ? "orphaned"
              : person.active !== true
                ? "auth-inactive"
                : account.disabled === true
                  ? "native-disabled"
                  : "linked",
    };
  });
  for (const link of links)
    if (!accounts.some((account) => account.nativeId === link.nativeId))
      rows.push({ account: null, mapping: link, state: "native-missing" });
  return { state: "available", observedAt: snapshot.observedAt, rows };
}

export function createConnectedAccountLedger(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS media_identity_links (
    service TEXT NOT NULL, instance TEXT NOT NULL, native_id TEXT NOT NULL,
    issuer TEXT NOT NULL, subject TEXT NOT NULL, actor TEXT NOT NULL,
    reason TEXT NOT NULL, created_at TEXT NOT NULL,
    PRIMARY KEY(service,instance,native_id), UNIQUE(service,instance,issuer,subject)
  );
  CREATE TABLE IF NOT EXISTS media_identity_reviews (
    id TEXT PRIMARY KEY, actor TEXT NOT NULL, state TEXT NOT NULL,
    created_at TEXT NOT NULL, body TEXT NOT NULL
  );`);
  const mappings = () =>
    db
      .prepare(
        `SELECT service,instance,native_id AS nativeId,issuer,subject,actor,reason,created_at AS createdAt FROM media_identity_links`,
      )
      .all();
  const review = (id) => {
    const row = db
      .prepare("SELECT * FROM media_identity_reviews WHERE id=?")
      .get(id);
    return row ? { ...row, body: JSON.parse(row.body) } : null;
  };
  return {
    mappings,
    // Runs inside the provisioning transaction after exact native readback.
    recordCreated({ target, nativeId, actor, reason, now }) {
      const mapping = { ...target, nativeId };
      if (
        mappings().some(
          (item) =>
            nativeKey(item) === nativeKey(mapping) ||
            personKey(item) === personKey(mapping),
        )
      )
        throw fail(
          409,
          "An account link already exists. Review the recorded account; do not create again.",
        );
      db.prepare(
        "INSERT INTO media_identity_links VALUES (?,?,?,?,?,?,?,?)",
      ).run(
        target.service,
        target.instance,
        nativeId,
        target.issuer,
        target.subject,
        actor,
        reason,
        new Date(now).toISOString(),
      );
    },
    review,
    reviews: () =>
      db
        .prepare(
          "SELECT id FROM media_identity_reviews ORDER BY created_at DESC LIMIT 100",
        )
        .all()
        .map(({ id }) => review(id)),
    preview({ actor, reason, mapping, inventory, people, now = Date.now() }) {
      text(actor, "actor");
      text(reason, "review reason");
      const exact = Object.fromEntries(
        ["service", "instance", "nativeId", "issuer", "subject"].map(
          (field) => [field, text(mapping[field], field)],
        ),
      );
      if (scopeKey(exact) !== scopeKey(inventory))
        throw fail(409, "Inventory scope changed.");
      const result = accountDiscrepancies({
        snapshot: inventory,
        mappings: mappings(),
        people,
        now,
      });
      if (result.state !== "available")
        throw fail(409, "Refresh native inventory before linking.");
      const row = result.rows.find(
        (item) => item.account?.nativeId === exact.nativeId,
      );
      if (!row || row.state !== "native-only")
        throw fail(
          409,
          "Choose an unlinked native account from the current inventory.",
        );
      if (
        !people.some(
          (person) =>
            person.issuer === exact.issuer &&
            person.subject === exact.subject &&
            person.active === true,
        )
      )
        throw fail(409, "Choose an active, verified issuer subject.");
      if (mappings().some((item) => personKey(item) === personKey(exact)))
        throw fail(
          409,
          "This subject already has an account in this service instance.",
        );
      const id = randomUUID();
      const body = {
        mapping: exact,
        reason,
        observedAt: inventory.observedAt,
        account: row.account,
      };
      db.prepare(
        "INSERT INTO media_identity_reviews VALUES (?,?,'review',?,?)",
      ).run(id, actor, new Date(now).toISOString(), JSON.stringify(body));
      return review(id);
    },
    confirm({ id, actor, inventory, people, now = Date.now() }) {
      const operation = review(id);
      if (!operation || operation.actor !== actor)
        throw fail(404, "Mapping review not found.");
      if (operation.state === "complete") return operation;
      if (
        now < Date.parse(operation.created_at) ||
        now - Date.parse(operation.created_at) > 300000
      )
        throw fail(409, "Mapping review expired. Review again.");
      const mapping = operation.body.mapping;
      if (scopeKey(mapping) !== scopeKey(inventory))
        throw fail(409, "Inventory scope changed.");
      const result = accountDiscrepancies({
        snapshot: inventory,
        mappings: mappings(),
        people,
        now,
      });
      if (
        result.state !== "available" ||
        !result.rows.some(
          (item) =>
            item.state === "native-only" &&
            item.account.nativeId === mapping.nativeId,
        )
      )
        throw fail(409, "Native inventory changed. Review again.");
      const account = result.rows.find(
        (item) => item.account?.nativeId === mapping.nativeId,
      )?.account;
      if (JSON.stringify(account) !== JSON.stringify(operation.body.account))
        throw fail(409, "Native account changed. Review again.");
      if (
        !people.some(
          (person) =>
            person.issuer === mapping.issuer &&
            person.subject === mapping.subject &&
            person.active === true,
        )
      )
        throw fail(409, "Auth identity changed. Review again.");
      db.exec("BEGIN IMMEDIATE");
      try {
        if (
          mappings().some(
            (item) =>
              nativeKey(item) === nativeKey(mapping) ||
              personKey(item) === personKey(mapping),
          )
        )
          throw fail(409, "Mapping changed. Review again.");
        db.prepare(
          "INSERT INTO media_identity_links VALUES (?,?,?,?,?,?,?,?)",
        ).run(
          mapping.service,
          mapping.instance,
          mapping.nativeId,
          mapping.issuer,
          mapping.subject,
          actor,
          operation.body.reason,
          new Date(now).toISOString(),
        );
        db.prepare(
          "UPDATE media_identity_reviews SET state='complete' WHERE id=?",
        ).run(id);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return review(id);
    },
  };
}
