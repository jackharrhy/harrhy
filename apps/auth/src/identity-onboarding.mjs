import { randomUUID } from "node:crypto";

const fail = (status, message) => Object.assign(new Error(message), { status });
const field = (value, max, name) => {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw fail(400, `Check ${name}.`);
  return value.trim();
};

// This ledger owns only newly reserved identities, never discovered native users.
export function createIdentityOnboardingLedger(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS identity_onboarding (
    id TEXT PRIMARY KEY, actor TEXT NOT NULL, state TEXT NOT NULL,
    created_at TEXT NOT NULL, body TEXT NOT NULL
  ); UPDATE identity_onboarding SET state=CASE state
    WHEN 'creating' THEN 'creation-unknown' ELSE 'invitation-unknown' END
    WHERE state IN ('creating','inviting');`);
  const get = (id) => {
    const row = db
      .prepare("SELECT * FROM identity_onboarding WHERE id=?")
      .get(id);
    return row ? { ...row, body: JSON.parse(row.body) } : null;
  };
  const owned = (id, actor) => {
    const row = get(id);
    if (!row || row.actor !== actor)
      throw fail(404, "Identity review not found.");
    return row;
  };
  function claim(id, from, to) {
    const result = db
      .prepare("UPDATE identity_onboarding SET state=? WHERE id=? AND state=?")
      .run(to, id, from);
    if (result.changes !== 1)
      throw fail(
        409,
        "Identity operation is already applying or needs review; do not repeat it.",
      );
  }
  function finish(id, from, to) {
    claim(id, from, to);
    return get(id);
  }
  return {
    get,
    recent() {
      return db
        .prepare(
          "SELECT id FROM identity_onboarding ORDER BY rowid DESC LIMIT 100",
        )
        .all()
        .map((row) => get(row.id));
    },
    preview({
      actor,
      issuer,
      organizationId,
      username,
      name,
      email,
      reason,
      now = Date.now(),
    }) {
      actor = field(actor, 200, "administrator");
      issuer = field(issuer, 500, "issuer");
      organizationId = field(organizationId, 200, "organization");
      username = field(username, 32, "username");
      if (!/^[a-z0-9_-]{2,32}$/.test(username))
        throw fail(400, "Check username.");
      name = field(name, 100, "display name");
      email = field(email, 200, "recipient email");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw fail(400, "Check recipient email.");
      reason = field(reason, 1000, "reason");
      const id = randomUUID();
      const body = {
        issuer,
        organizationId,
        subject: randomUUID(),
        username,
        name,
        email,
        reason,
      };
      db.prepare(
        "INSERT INTO identity_onboarding VALUES (?,?,'review',?,?)",
      ).run(id, actor, new Date(now).toISOString(), JSON.stringify(body));
      return get(id);
    },
    async create({
      id,
      actor,
      issuer,
      organizationId,
      confirmed,
      api,
      now = Date.now(),
    }) {
      const row = owned(id, actor);
      if (confirmed !== true)
        throw fail(400, "Confirm the new identity and recipient.");
      if (
        row.body.issuer !== issuer ||
        row.body.organizationId !== organizationId
      )
        throw fail(409, "Issuer configuration changed; start a new review.");
      if (["created", "invited"].includes(row.state)) return row;
      const age = now - Date.parse(row.created_at);
      if (age < 0 || age > 300000)
        throw fail(409, "Identity review expired; start a new review.");
      claim(id, "review", "creating");
      try {
        const { subject, username, name, email } = row.body;
        const result = await api("/v2/users/new", {
          method: "POST",
          management: true,
          body: {
            organizationId,
            userId: subject,
            username,
            human: {
              profile: {
                givenName: name.split(" ")[0],
                familyName: name.split(" ").slice(1).join(" ") || "User",
                displayName: name,
              },
              email: { email, returnCode: {} },
            },
          },
        });
        if (result.id !== subject)
          throw fail(502, "Issuer returned an unexpected identity.");
        // Email codes are deliberately discarded. Delivery is a separate reviewed action.
        return finish(id, "creating", "created");
      } catch {
        finish(id, "creating", "creation-unknown");
        throw fail(
          502,
          "Account creation outcome is uncertain. Inspect the reserved exact ID; do not create it again.",
        );
      }
    },
    async invite({
      id,
      actor,
      recipient,
      confirmed,
      issuer,
      organizationId,
      callbackUrl,
      api,
    }) {
      const row = owned(id, actor);
      if (confirmed !== true || recipient !== row.body.email)
        throw fail(400, "Confirm the exact invitation recipient.");
      if (
        row.body.issuer !== issuer ||
        row.body.organizationId !== organizationId
      )
        throw fail(409, "Issuer configuration changed; invitation is blocked.");
      if (row.state === "invited") return row;
      const callback = new URL(callbackUrl);
      if (
        callback.protocol !== "https:" ||
        callback.username ||
        callback.password ||
        callback.search ||
        callback.hash
      )
        throw fail(400, "Invitation callback must be a reviewed HTTPS URL.");
      // ZITADEL supports these native placeholders. No code is returned to the administrator.
      const urlTemplate = `${callback.href}?userID={{.UserID}}&code={{.Code}}&orgID={{.OrgID}}`;
      if (urlTemplate.length > 200)
        throw fail(400, "Invitation callback is too long.");
      claim(id, "created", "inviting");
      try {
        const { user } = await api(
          `/v2/users/${encodeURIComponent(row.body.subject)}`,
          { management: true },
        );
        if (
          user?.userId !== row.body.subject ||
          user.details?.resourceOwner !== organizationId ||
          user.human?.email?.email !== recipient
        )
          throw fail(
            409,
            "The exact issuer identity or recipient changed; invitation is blocked.",
          );
        await api(
          `/v2/users/${encodeURIComponent(row.body.subject)}/invite_code`,
          {
            method: "POST",
            management: true,
            body: { sendCode: { urlTemplate, applicationName: "Jack Auth" } },
          },
        );
        return finish(id, "inviting", "invited");
      } catch {
        finish(id, "inviting", "invitation-unknown");
        throw fail(
          502,
          "Invitation outcome is uncertain. Delivery is not confirmed; do not resend blindly.",
        );
      }
    },
  };
}
