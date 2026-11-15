import { css, type Handle } from "remix/component";
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
type CreationHistory = {
  id: string;
  state: string;
  body: { review: { username: string } };
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
const accountHeadingStyles = css({
  flexWrap: "wrap",
  "& .actions": { flexWrap: "wrap", marginTop: 0 },
});
const accountFilterStyles = css({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) auto auto",
  alignItems: "end",
  maxWidth: "none",
  gap: "16px",
  "& a": { paddingBottom: "12px" },
  "@media (max-width: 640px)": {
    gridTemplateColumns: "1fr 1fr",
    "& label": { gridColumn: "1 / -1" },
  },
});
const accountListRowStyles = css({
  paddingBlock: "16px",
  "& > div": {
    gridColumn: "1 / -1",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)",
    alignItems: "center",
    width: "100%",
    gap: "12px",
  },
  "& h2, & p": { margin: 0 },
  "@media (max-width: 640px)": {
    "& > div": { gridTemplateColumns: "1fr", gap: "4px" },
  },
});
const base = (item: Instance | Mapping) =>
  `/manage/media/${item.service}/${item.instance}`;
const labels: Record<string, string> = {
  "native-only": "Not linked to Auth",
  linked: "Linked",
  orphaned: "Auth identity missing",
  "auth-inactive": "Auth account inactive",
  "native-disabled": "Service account disabled",
  "native-missing": "Linked account not found",
  ambiguous: "Conflicting mappings",
};

function ConnectedAccountsPage(
  handle: Handle<{
    instances: Instance[];
    selected?: Instance;
    inventory?: Inventory;
    people: Person[];
    reviews: Review[];
    actions: ServiceAction[];
    context: Context;
    creations: CreationHistory[];
    screen: { nativeId?: string; mode?: string; q?: string; state?: string };
  }>,
) {
  return () => {
    const {
      instances,
      selected,
      inventory,
      people,
      reviews,
      actions,
      creations,
      context,
      screen,
    } = handle.props;
    const selectedRow = inventory?.rows.find(
      (row) =>
        (row.account?.nativeId ?? row.mapping?.nativeId) === screen.nativeId,
    );
    const rows =
      inventory?.rows.filter((row) =>
        screen.nativeId
          ? (row.account?.nativeId ?? row.mapping?.nativeId) === screen.nativeId
          : (!screen.q ||
              (row.account?.name || "Missing native account")
                .toLowerCase()
                .includes(screen.q.toLowerCase())) &&
            (!screen.state || row.state === screen.state),
      ) || [];
    const detailUrl = (id: string) =>
      `${base(selected!)}/accounts/${encodeURIComponent(id)}`;
    return (
      <Document {...context} title="Service accounts" active="services">
        <nav aria-label="Breadcrumb">
          <a href="/manage/services">Services</a> /{" "}
          <a href="/manage/media">Service accounts</a>
          {selected && (
            <>
              {" "}
              / <a href={base(selected)}>{selected.name}</a>
            </>
          )}
          {selectedRow && screen.mode !== "detail" && (
            <>
              {" "}
              /{" "}
              <a href={detailUrl(screen.nativeId!)}>
                {selectedRow.account?.name || "Missing native account"}
              </a>
            </>
          )}
        </nav>
        <div class="page-heading" mix={accountHeadingStyles}>
          <h1>
            {!selected
              ? "Service accounts"
              : selectedRow
                ? `${screen.mode === "link" ? "Link " : screen.mode === "action" ? "Change " : ""}${selectedRow.account?.name || "Missing native account"}`
                : `${selected.name} users`}
          </h1>
          {selected &&
            !screen.nativeId &&
            ["jellyfin", "seerr"].includes(selected.service) && (
              <a
                class="button primary"
                href={`/manage/media/provisioning?service=${selected.service}&instance=${selected.instance}`}
              >
                {selected.service === "seerr"
                  ? "Import account"
                  : "Create account"}
              </a>
            )}
        </div>
        {!selected && screen.mode !== "history" && (
          <p class="muted">Choose a service to view its accounts.</p>
        )}
        {!selected && screen.mode !== "history" && (
          <>
            {instances.length === 0 ? (
              <p>
                No service account connections are configured. Ask the operator
                to connect a read-only account list.
              </p>
            ) : (
              <nav aria-label="Service instances">
                {instances.map((item) => (
                  <div class="settings-row">
                    <div>
                      <h2>
                        <a href={base(item)}>{item.name}</a>
                      </h2>
                      <p class="muted">{item.service}</p>
                    </div>
                    <a class="text-link" href={base(item)}>
                      View accounts
                    </a>
                  </div>
                ))}
              </nav>
            )}
          </>
        )}
        {!selected && (
          <a
            href={
              screen.mode === "history"
                ? "/manage/media"
                : "/manage/media/history"
            }
          >
            {screen.mode === "history" ? "Back to services" : "Review history"}
          </a>
        )}
        {screen.mode === "history" && (
          <section>
            <h2>Review history</h2>
            {reviews.map((review) => (
              <p>
                <a href={`/manage/media/reviews/${review.id}`}>
                  {review.body.account.name} · {review.state}
                </a>
              </p>
            ))}
            {creations.map((action) => (
              <p>
                <a href={`/manage/media/provisioning/${action.id}`}>
                  {action.body.review.username} · {action.state}
                </a>
              </p>
            ))}
            {actions.map((action) => (
              <p>
                <a href={`/manage/media/actions/${action.id}`}>
                  {action.body.action} · {action.state}
                </a>
              </p>
            ))}
          </section>
        )}
        {selected && (
          <p>
            <a
              href={
                screen.nativeId && screen.mode !== "detail"
                  ? detailUrl(screen.nativeId)
                  : "/manage/media"
              }
            >
              {screen.nativeId && screen.mode !== "detail"
                ? "Back to account"
                : "Back to services"}
            </a>
            {screen.nativeId && screen.mode === "detail" && (
              <>
                {" "}
                · <a href={base(selected)}>Back to users</a>
              </>
            )}
          </p>
        )}
        {selected && inventory && (
          <>
            {!screen.nativeId && (
              <form
                method="get"
                action={base(selected)}
                class="form-stack"
                mix={accountFilterStyles}
              >
                <label>
                  Find account
                  <input name="q" value={screen.q || ""} maxLength={200} />
                </label>
                <label>
                  Status
                  <select name="state">
                    <option value="">All accounts</option>
                    {Object.entries(labels).map(([value, label]) => (
                      <option value={value} selected={screen.state === value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <button>Filter</button>
                <a href={base(selected)}>Reset filters</a>
              </form>
            )}
            <p class="muted">
              {inventory.observedAt ? (
                <>
                  Last checked{" "}
                  <time dateTime={inventory.observedAt}>
                    {inventory.observedAt}
                  </time>
                  .{" "}
                </>
              ) : null}
              <a
                href={
                  screen.nativeId
                    ? `${detailUrl(screen.nativeId)}${screen.mode !== "detail" ? `/${screen.mode}` : ""}`
                    : base(selected)
                }
              >
                Check again
              </a>
            </p>
            {inventory.state !== "available" ? (
              <p role="status">
                {inventory.state === "stale"
                  ? "Account list is out of date."
                  : "Account list is unavailable."}{" "}
                Ask the operator to update the service connection before linking
                or changing accounts.
              </p>
            ) : rows.length === 0 ? (
              <p>
                {inventory.rows.length
                  ? "No accounts match these filters. Try another name or reset the filters."
                  : "No native accounts or saved mappings in this instance."}
              </p>
            ) : (
              rows.map((row) => (
                <section
                  class="settings-row"
                  mix={!screen.nativeId ? accountListRowStyles : undefined}
                >
                  <div>
                    {screen.mode !== "detail" && (
                      <h2>
                        {screen.nativeId ? (
                          row.account?.name || "Missing native account"
                        ) : (
                          <a
                            href={detailUrl(
                              (row.account?.nativeId ?? row.mapping?.nativeId)!,
                            )}
                          >
                            {row.account?.name || "Missing native account"}
                          </a>
                        )}
                      </h2>
                    )}
                    <p>{labels[row.state] || row.state}</p>
                    {row.account && (
                      <p class="muted">
                        {row.account.administrator
                          ? "Native administrator"
                          : "Native non-administrator"}{" "}
                        · {row.account.disabled ? "Disabled" : "Enabled"}
                      </p>
                    )}
                    {screen.mode === "detail" && (
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
                    )}
                  </div>
                  {screen.nativeId && (
                    <div>
                      {screen.mode === "detail" ? (
                        <>
                          <p>
                            {row.mapping
                              ? `Linked Auth identity: ${people.find((person) => person.issuer === row.mapping!.issuer && person.subject === row.mapping!.subject)?.name || "Unavailable"}`
                              : "No Auth identity linked."}
                          </p>
                          {row.state === "native-only" && row.account ? (
                            <a
                              class="button primary"
                              href={`${detailUrl(screen.nativeId)}/link`}
                            >
                              Link Auth identity
                            </a>
                          ) : row.mapping &&
                            row.account &&
                            !row.account.administrator &&
                            [
                              "linked",
                              "auth-inactive",
                              "native-disabled",
                            ].includes(row.state) &&
                            ["jellyfin", "seerr"].includes(selected.service) ? (
                            <a
                              class="button"
                              href={`${detailUrl(screen.nativeId)}/action`}
                            >
                              {selected.service === "seerr"
                                ? "Remove account and requests"
                                : "Disable account"}
                            </a>
                          ) : (
                            <p>No automatic changes are available.</p>
                          )}
                        </>
                      ) : screen.mode === "link" &&
                        row.state === "native-only" &&
                        row.account ? (
                        <form
                          method="post"
                          action={`${base(selected)}/preview`}
                          class="form-stack"
                        >
                          <input
                            type="hidden"
                            name="csrf"
                            value={context.csrf}
                          />
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
                            Accounts stay unchanged until you explicitly review
                            a link.
                          </p>
                        </form>
                      ) : screen.mode === "action" &&
                        row.mapping &&
                        row.account &&
                        !row.account.administrator &&
                        ["linked", "auth-inactive", "native-disabled"].includes(
                          row.state,
                        ) &&
                        ["jellyfin", "seerr"].includes(selected.service) ? (
                        <form
                          method="post"
                          action="/manage/media/actions/preview"
                          class="form-stack"
                        >
                          <input
                            type="hidden"
                            name="csrf"
                            value={context.csrf}
                          />
                          {(
                            [
                              "service",
                              "instance",
                              "nativeId",
                              "issuer",
                              "subject",
                            ] as const
                          ).map((key) => (
                            <input
                              type="hidden"
                              name={key}
                              value={row.mapping![key]}
                            />
                          ))}
                          <input
                            type="hidden"
                            name="operation"
                            value={
                              selected.service === "seerr"
                                ? "remove-account-and-requests"
                                : "disable"
                            }
                          />
                          <label>
                            Reason
                            <textarea
                              name="reason"
                              required
                              maxLength={500}
                              rows={2}
                            ></textarea>
                          </label>
                          <button>
                            {selected.service === "seerr"
                              ? "Review account and request removal"
                              : "Review native account disable"}
                          </button>
                          <p class="muted">
                            Separate from Auth access and session revocation.
                            Review reads the live native account; writes require
                            separately configured operator capability.
                          </p>
                        </form>
                      ) : (
                        <p class="muted">
                          No automatic repair, reassignment or deletion. Review
                          native accounts, eligibility and sessions
                          independently.
                        </p>
                      )}
                    </div>
                  )}
                </section>
              ))
            )}
          </>
        )}
      </Document>
    );
  };
}
function AccountLinkReviewPage(
  handle: Handle<{ review: Review; context: Context }>,
) {
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
        <a
          class="text-link"
          href={`${base(mapping)}/accounts/${encodeURIComponent(mapping.nativeId)}`}
        >
          Back to account
        </a>
      </Document>
    );
  };
}
export const renderConnectedAccounts = (
  instances: Instance[],
  selected: Instance | undefined,
  inventory: Inventory | undefined,
  people: Person[],
  context: Context,
  nonce: string,
  reviews: Review[] = [],
  actions: ServiceAction[] = [],
  screen: { nativeId?: string; mode?: string; q?: string; state?: string } = {},
  creations: CreationHistory[] = [],
) =>
  renderToString(
    <ConnectedAccountsPage
      creations={creations}
      screen={screen}
      instances={instances}
      selected={selected}
      inventory={inventory}
      people={people}
      reviews={reviews}
      actions={actions}
      context={context}
    />,
    { nonce },
  );
export const renderAccountLinkReview = (
  review: Review,
  context: Context,
  nonce: string,
) =>
  renderToString(<AccountLinkReviewPage review={review} context={context} />, {
    nonce,
  });

type ServiceAction = {
  id: string;
  actor: string;
  state: string;
  created_at: string;
  body: {
    action: string;
    mapping: Mapping;
    reason: string;
    review: { requestCount?: number };
  };
};
function AccountActionPage(
  handle: Handle<{ action: ServiceAction; context: Context }>,
) {
  return () => {
    const { action, context } = handle.props;
    const { mapping, reason, review } = action.body;
    const destructive = action.body.action === "remove-account-and-requests";
    const title = destructive
      ? "Remove account and requests"
      : "Disable native account";
    const phrase = `REMOVE ${mapping.nativeId} AND ${review.requestCount} REQUESTS`;
    return (
      <Document {...context} title={title} active="services">
        <h1>{title}</h1>
        <p role="status">Action status: {action.state}</p>
        <dl>
          <dt>Service / instance</dt>
          <dd>
            {mapping.service} / {mapping.instance}
          </dd>
          <dt>Exact native ID</dt>
          <dd>
            <code>{mapping.nativeId}</code>
          </dd>
          <dt>Auth subject</dt>
          <dd>
            <code>{mapping.subject}</code>
          </dd>
          <dt>Auth issuer</dt>
          <dd>
            <code>{mapping.issuer}</code>
          </dd>
          <dt>Reason</dt>
          <dd>{reason}</dd>
          <dt>Reviewer</dt>
          <dd>{action.actor}</dd>
          <dt>Reviewed at</dt>
          <dd>
            <time dateTime={action.created_at}>{action.created_at}</time>
          </dd>
          {destructive && (
            <>
              <dt>Reviewed requests to remove</dt>
              <dd>{review.requestCount}</dd>
            </>
          )}
        </dl>
        {destructive ? (
          <p>
            This intentionally deletes this Seerr account and its requests. It
            cannot be undone here. The request set is checked again before
            deletion, but Seerr has no conditional delete: concurrent new
            requests may also be deleted. No Arr, download-client or filesystem
            cleanup is performed.
          </p>
        ) : (
          <p>
            This disables only the reviewed Jellyfin native account, preserving
            its identity, password and history.
          </p>
        )}
        <p>
          Auth identity, service eligibility and other native services are
          unchanged. Native session revocation is manual-required; this action
          does not prove existing sessions ended.
        </p>
        {action.state === "review" && action.actor === context.user && (
          <form
            method="post"
            action={`/manage/media/actions/${action.id}/confirm`}
            class="form-stack"
          >
            <input type="hidden" name="csrf" value={context.csrf} />
            {destructive && (
              <label>
                Type <code>{phrase}</code> to confirm destructive removal
                <input
                  name="destructiveConfirmation"
                  required
                  autoComplete="off"
                />
              </label>
            )}
            <label class="check">
              <input type="checkbox" name="confirmed" value="true" required />I
              reviewed this exact native account and intend the stated effect.
            </label>
            <p class="muted">
              Review expires after five minutes. Changed native state requires a
              new review.
            </p>
            <button class="primary">{title}</button>
          </form>
        )}
        {action.state === "effect-unknown" && (
          <section>
            <h2>Manual investigation required</h2>
            <p>
              The native operation may have completed or partially completed.
              Never retry it blindly.
            </p>
            {!destructive && (
              <form
                method="post"
                action={`/manage/media/actions/${action.id}/recover`}
              >
                <input type="hidden" name="csrf" value={context.csrf} />
                <input type="hidden" name="confirmed" value="true" />
                <button>Read native policy to reconcile · no write</button>
              </form>
            )}
          </section>
        )}
        <a
          class="text-link"
          href={`${base(mapping)}/accounts/${encodeURIComponent(mapping.nativeId)}`}
        >
          Back to account
        </a>
      </Document>
    );
  };
}
export const renderAccountAction = (
  action: ServiceAction,
  context: Context,
  nonce: string,
) =>
  renderToString(<AccountActionPage action={action} context={context} />, {
    nonce,
  });
