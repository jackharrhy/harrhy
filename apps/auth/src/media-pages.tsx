import { type Handle } from "remix/component";
import { renderToString } from "remix/component/server";
import { Document, type DocumentProps } from "./document.tsx";

type Context = Omit<DocumentProps, "title" | "children"> & { csrf: string };
type Instance = { service: string; instance: string; name: string };
type Account = {
  nativeId: string;
  name: string;
  disabled: boolean;
  administrator: boolean;
};
type Mapping = {
  service: string;
  instance: string;
  nativeId: string;
  issuer: string;
  subject: string;
};
type Person = {
  issuer: string;
  subject: string;
  name: string;
  active: boolean;
};
type Inventory = {
  state: string;
  observedAt: string | null;
  rows: { account: Account | null; mapping: Mapping | null; state: string }[];
};
type Review = {
  id: string;
  actor: string;
  created_at: string;
  state: string;
  body: {
    mapping: Mapping;
    account: Account;
    reason: string;
    observedAt: string;
  };
};
const base = (item: Instance | Mapping) =>
  `/manage/media/${item.service}/${item.instance}`;
const labels: Record<string, string> = {
  "native-only": "Native only · needs review",
  linked: "Linked identity · access is separate",
  orphaned: "Auth identity missing",
  "auth-inactive": "Auth account inactive",
  "native-disabled": "Native account disabled",
  "native-missing": "Native account missing",
  ambiguous: "Conflicting mappings",
};

function MediaPage(
  handle: Handle<{
    instances: Instance[];
    selected?: Instance;
    inventory?: Inventory;
    people: Person[];
    reviews: Review[];
    context: Context;
  }>,
) {
  return () => {
    const { instances, selected, inventory, people, reviews, context } =
      handle.props;
    return (
      <Document {...context} title="Media identities" active="services">
        <div class="page-heading">
          <div>
            <h1>Media identities</h1>
            <p class="muted">
              Native accounts and Auth identities. Linking does not grant access
              or change native accounts.
            </p>
          </div>
          <a class="button" href="/manage/services">
            Services
          </a>
        </div>
        {instances.length === 0 ? (
          <p>
            No media inventory instances are configured. Ask the operator to
            connect a read-only roster.
          </p>
        ) : (
          <nav aria-label="Media instances" class="actions">
            {instances.map((item) => (
              <a
                href={base(item)}
                aria-current={
                  selected?.service === item.service &&
                  selected.instance === item.instance
                    ? "page"
                    : undefined
                }
              >
                {item.name}
              </a>
            ))}
          </nav>
        )}
        {!selected && (
          <section>
            <h2>Recent identity reviews</h2>
            {reviews.length === 0 ? (
              <p>No identity links have been reviewed.</p>
            ) : (
              <ul>
                {reviews.map((review) => (
                  <li>
                    <a href={`/manage/media/reviews/${review.id}`}>
                      {review.body.reason}
                    </a>{" "}
                    · {review.state} ·{" "}
                    <time dateTime={review.created_at}>
                      {review.created_at}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        {selected && inventory && (
          <>
            <h2>{selected.name}</h2>
            <p class="muted">
              {inventory.observedAt ? (
                <>
                  Native snapshot observed{" "}
                  <time dateTime={inventory.observedAt}>
                    {inventory.observedAt}
                  </time>
                  .{" "}
                </>
              ) : null}
              Snapshots are not proof of live convergence.{" "}
              <a href={base(selected)}>Refresh inventory</a>
            </p>
            {inventory.state !== "available" ? (
              <p role="status">
                {inventory.state === "stale"
                  ? "Inventory is stale."
                  : "Inventory is unavailable."}{" "}
                No native absence or readiness can be established. Ask the
                operator to refresh the read-only source.
              </p>
            ) : inventory.rows.length === 0 ? (
              <p>No native accounts or saved mappings in this instance.</p>
            ) : (
              inventory.rows.map((row) => (
                <section class="settings-row">
                  <div>
                    <h3>{row.account?.name || "Missing native account"}</h3>
                    <p>{labels[row.state] || row.state}</p>
                    {row.account && (
                      <p class="muted">
                        {row.account.administrator
                          ? "Native administrator"
                          : "Native non-administrator"}{" "}
                        · {row.account.disabled ? "Disabled" : "Enabled"}
                      </p>
                    )}
                    <details>
                      <summary>Exact identity identifiers</summary>
                      <p>
                        Native ID:{" "}
                        <code>
                          {row.account?.nativeId || row.mapping?.nativeId}
                        </code>
                      </p>
                      {row.mapping && (
                        <>
                          <p>
                            Issuer: <code>{row.mapping.issuer}</code>
                          </p>
                          <p>
                            Auth subject: <code>{row.mapping.subject}</code>
                          </p>
                        </>
                      )}
                    </details>
                  </div>
                  <div>
                    {row.state === "native-only" && row.account ? (
                      <form
                        method="post"
                        action={`${base(selected)}/preview`}
                        class="form-stack"
                      >
                        <input type="hidden" name="csrf" value={context.csrf} />
                        <input
                          type="hidden"
                          name="nativeId"
                          value={row.account.nativeId}
                        />
                        <label>
                          Existing Auth identity
                          <select name="subject" required>
                            <option value="">Choose an exact identity</option>
                            {people
                              .filter((person) => person.active)
                              .map((person) => (
                                <option value={person.subject}>
                                  {person.name} · {person.subject}
                                </option>
                              ))}
                          </select>
                        </label>
                        <label>
                          Reason
                          <textarea
                            name="reason"
                            required
                            maxLength={500}
                            rows={2}
                          ></textarea>
                        </label>
                        <button>Review identity link</button>
                        <p class="muted">
                          Leave native-only accounts unchanged unless an
                          explicit manual decision has been made. Names and
                          email are not matching keys.
                        </p>
                      </form>
                    ) : (
                      <p class="muted">
                        No automatic repair, reassignment or deletion. Review
                        native accounts, eligibility and sessions independently.
                      </p>
                    )}
                  </div>
                </section>
              ))
            )}
          </>
        )}
      </Document>
    );
  };
}
function MediaReviewPage(handle: Handle<{ review: Review; context: Context }>) {
  return () => {
    const { review, context } = handle.props;
    const { mapping, account, reason, observedAt } = review.body;
    return (
      <Document {...context} title="Review identity link" active="services">
        <h1>
          {review.state === "complete"
            ? "Identity link recorded"
            : "Review identity link"}
        </h1>
        <p>
          {account.name} ·{" "}
          {account.administrator
            ? "Native administrator"
            : "Native non-administrator"}
        </p>
        <dl>
          <dt>Service / instance</dt>
          <dd>
            {mapping.service} / {mapping.instance}
          </dd>
          <dt>Native immutable ID</dt>
          <dd>
            <code>{mapping.nativeId}</code>
          </dd>
          <dt>Auth issuer</dt>
          <dd>
            <code>{mapping.issuer}</code>
          </dd>
          <dt>Auth subject</dt>
          <dd>
            <code>{mapping.subject}</code>
          </dd>
          <dt>Native observation</dt>
          <dd>{observedAt}</dd>
          <dt>Reason</dt>
          <dd>{reason}</dd>
        </dl>
        <p>
          This records identity correspondence only. It creates no account,
          sends no invitation, grants no role and changes no native permissions
          or sessions. Navidrome admission remains owner-only.
        </p>
        <p class="muted">
          Reviewed by <code>{review.actor}</code> ·{" "}
          <time dateTime={review.created_at}>{review.created_at}</time>
        </p>
        {review.state === "review" && review.actor === context.user && (
          <form method="post" action="/manage/media/confirm" class="form-stack">
            <input type="hidden" name="csrf" value={context.csrf} />
            <input type="hidden" name="operation" value={review.id} />
            <label class="check">
              <input type="checkbox" name="confirmed" value="true" required />I
              verified these exact immutable identifiers and intend this
              identity correspondence.
            </label>
            <button class="primary">Record reviewed identity link</button>
          </form>
        )}
        <a class="text-link" href={base(mapping)}>
          Return to native inventory
        </a>
      </Document>
    );
  };
}
export const renderMedia = (
  instances: Instance[],
  selected: Instance | undefined,
  inventory: Inventory | undefined,
  people: Person[],
  context: Context,
  nonce: string,
  reviews: Review[] = [],
) =>
  renderToString(
    <MediaPage
      instances={instances}
      selected={selected}
      inventory={inventory}
      people={people}
      reviews={reviews}
      context={context}
    />,
    { nonce },
  );
export const renderMediaReview = (
  review: Review,
  context: Context,
  nonce: string,
) =>
  renderToString(<MediaReviewPage review={review} context={context} />, {
    nonce,
  });
