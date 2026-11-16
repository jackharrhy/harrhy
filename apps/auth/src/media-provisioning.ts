import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { isJellyfinCreation } from "./media-contracts.ts";
import type {
  Creation,
  CreationBody,
  CreationEffects,
  JellyfinTarget,
  SeerrTarget,
  ProvisioningEventState,
  ProvisioningResolver,
} from "./media-contracts.ts";

interface Mapping {
  service: string;
  instance: string;
  nativeId: string;
  issuer: string;
  subject: string;
}
interface LedgerDependencies {
  people(): Promise<{ issuer: string; subject: string; active: unknown }[]>;
  mappings(): Mapping[];
  provisioning: ProvisioningResolver;
}
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw fail();
  return value as Record<string, unknown>;
};
function parseTarget(value: unknown): JellyfinTarget | SeerrTarget {
  const target = record(value);
  const base = {
    instance: text(target.instance),
    issuer: text(target.issuer),
    subject: text(target.subject),
  };
  if (target.service === "jellyfin") return { ...base, service: "jellyfin" };
  if (target.service === "seerr")
    return {
      ...base,
      service: "seerr",
      sourceInstance: text(target.sourceInstance),
      sourceNativeId: text(target.sourceNativeId),
    };
  throw fail();
}
function assertCreationBody(value: unknown): asserts value is CreationBody {
  const body = record(value);
  const target = parseTarget(body.target);
  text(body.reason);
  const review = record(body.review);
  displayText(review.username);
  if (review.mapping !== "separate-exact-id-review") throw fail();
  if (target.service === "jellyfin") {
    if (
      review.profile !== "selected-library-playback-v1" ||
      review.nativePassword !== "separate-from-auth" ||
      !Array.isArray(review.folders) ||
      !review.folders.length ||
      review.folders.length > 100
    )
      throw fail();
    for (const entry of review.folders) {
      const folder = record(entry);
      text(folder.id);
      displayText(folder.name);
    }
    return;
  }
  if (
    review.profile !== "exact-jellyfin-import-v1" ||
    review.permissions !== 160 ||
    review.permissionMeaning !== "request-and-auto-approve" ||
    review.userType !== 3 ||
    review.jellyfinNativeId !== target.sourceNativeId
  )
    throw fail();
}
function displayText(value: unknown) {
  if (typeof value !== "string" || !value.length || value.length > 500)
    throw fail();
}
function decodeCreation(value: unknown): Creation {
  const row = record(value);
  const body: unknown = JSON.parse(textBody(row.body));
  assertCreationBody(body);
  const base = {
    ...row,
    id: text(row.id),
    actor: text(row.actor),
    created_at: text(row.created_at),
    body,
  };
  if (!Number.isFinite(Date.parse(base.created_at))) throw fail();
  if (row.state === "created")
    return { ...base, state: row.state, native_id: text(row.native_id) };
  if (row.state === "review" && row.native_id === null)
    return { ...base, state: row.state, native_id: null };
  if (row.state === "effect-unknown")
    return {
      ...base,
      state: row.state,
      native_id: row.native_id === null ? null : text(row.native_id),
    };
  throw fail();
}
function textBody(value: unknown): string {
  if (typeof value !== "string") throw fail();
  return value;
}
const fail = () =>
  Object.assign(
    new Error(
      "Provisioning review changed or is unavailable. No automatic retry is permitted.",
    ),
    { status: 409 },
  );
const text = (value: unknown) => {
  if (typeof value !== "string" || !value.trim() || value.length > 500)
    throw fail();
  return value;
};

// A native creation is never retried after its durable claim, even without a returned ID.
export function createMediaProvisioningLedger(
  db: DatabaseSync,
  { people, mappings, provisioning }: LedgerDependencies,
) {
  db.exec(`CREATE TABLE IF NOT EXISTS media_provisioning (
    id TEXT PRIMARY KEY, actor TEXT NOT NULL, state TEXT NOT NULL,
    created_at TEXT NOT NULL, body TEXT NOT NULL, native_id TEXT,
    claim_person TEXT UNIQUE, claim_username TEXT UNIQUE
  );
  CREATE TABLE IF NOT EXISTS media_provisioning_events (
    id TEXT NOT NULL, at TEXT NOT NULL, actor TEXT NOT NULL, state TEXT NOT NULL
  );`);
  const get = (id: string): Creation | null => {
    const row = db
      .prepare("SELECT * FROM media_provisioning WHERE id=?")
      .get(id);
    return row ? decodeCreation(row) : null;
  };
  const event = (
    id: string,
    actor: string,
    state: ProvisioningEventState,
    now: number,
  ) =>
    db
      .prepare("INSERT INTO media_provisioning_events VALUES (?,?,?,?)")
      .run(id, new Date(now).toISOString(), actor, state);
  function transaction<T>(operation: () => T): T {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      if (
        error instanceof Error &&
        "code" in error &&
        typeof error.code === "string" &&
        error.code.startsWith("ERR_SQLITE")
      )
        throw fail();
      throw error;
    }
  }
  const validateTarget = async (target: unknown) => {
    const exact = parseTarget(target);
    if (
      exact.service === "seerr" &&
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
    libraries: (target: { service: string; instance: string }) => {
      if (target.service !== "jellyfin") throw fail();
      return provisioning({
        service: "jellyfin",
        instance: text(target.instance),
      }).libraries();
    },
    get,
    list: () =>
      db
        .prepare(
          "SELECT * FROM media_provisioning ORDER BY created_at DESC, rowid DESC LIMIT 100",
        )
        .all()
        .map(decodeCreation),
    events: (id: string) =>
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
    }: {
      actor: string;
      reason: string;
      target: unknown;
      username?: string;
      folderIds?: string[];
      now?: number;
    }) {
      text(actor);
      text(reason);
      const exact = await validateTarget(target);
      const body: CreationBody =
        exact.service === "jellyfin"
          ? {
              target: exact,
              reason,
              review: await provisioning(exact).preview({
                username: text(username),
                folderIds: folderIds ?? [],
              }),
            }
          : {
              target: exact,
              reason,
              review: await provisioning(exact).preview({
                jellyfinNativeId: exact.sourceNativeId,
              }),
            };
      const id = randomUUID();
      transaction(() => {
        db.prepare(
          "INSERT INTO media_provisioning (id,actor,state,created_at,body) VALUES (?,?,'review',?,?)",
        ).run(id, actor, new Date(now).toISOString(), JSON.stringify(body));
        event(id, actor, "review", now);
      });
      return get(id);
    },
    async confirm({
      id,
      actor,
      password,
      now = Date.now(),
    }: {
      id: string;
      actor: string;
      password?: string;
      now?: number;
    }) {
      const action = get(id);
      if (!action || action.actor !== actor) throw fail();
      if (action.state !== "review") return action;
      const age = now - Date.parse(action.created_at);
      if (age < 0 || age > 300000) throw fail();
      const target = await validateTarget(action.body.target);
      const effects: CreationEffects = {
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
      };
      const body = action.body;
      const result = isJellyfinCreation(body)
        ? await provisioning(body.target).provision(body.review, {
            ...effects,
            password: password ?? "",
          })
        : await provisioning(body.target).provision(body.review, effects);
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
