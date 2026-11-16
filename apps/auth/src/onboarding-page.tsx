import { css, type Handle } from "remix/component";
import { renderToString } from "remix/component/server";
import { uiPrimaryActionStyles } from "@harrhy/ui";
import { Document, type DocumentProps } from "./document.tsx";

type Context = Omit<DocumentProps, "title" | "children"> & {
  csrf: string;
  onboardingEnabled?: boolean;
};
type Review = {
  id: string;
  actor: string;
  state: string;
  created_at: string;
  body: {
    subject: string;
    issuer: string;
    organizationId: string;
    username: string;
    name: string;
    email: string;
    reason: string;
  };
};
const reviewFormStyles = css({
  marginTop: "24px",
  marginBottom: "32px",
  "& label.confirmation": {
    display: "flex",
    alignItems: "flex-start",
    gap: "12px",
  },
  "& label.confirmation input": { flexShrink: 0, marginTop: "3px" },
});
const states: Record<string, string> = {
  review: "Awaiting creation review",
  creating: "Creating identity",
  created: "Identity created; invitation not sent",
  inviting: "Requesting invitation delivery",
  invited: "Invitation requested; recipient setup pending",
  completed: "Recipient password set",
  "creation-unknown": "Creation outcome uncertain",
  "invitation-unknown": "Invitation delivery uncertain",
  "verifying-invitation": "Verifying recipient proof",
  "recipient-proof-unknown": "Recipient verification uncertain",
  "setting-password": "Setting recipient password",
  "password-setup-unknown": "Password setup uncertain",
};
function OnboardingPage(
  handle: Handle<{ row: Review | null; recent: Review[]; context: Context }>,
) {
  return () => {
    const { row, recent, context } = handle.props;
    const actionable = context.onboardingEnabled && row?.actor === context.user;
    return (
      <Document {...context} title="Identity reviews" active="people">
        <div class="page-heading">
          <div>
            <h1>Identity reviews</h1>
            <p class="muted">
              Creation, invitation delivery and recipient setup are separate
              steps. None grants service access.
            </p>
          </div>
        </div>
        {!context.onboardingEnabled ? (
          <p role="status">
            Identity provisioning is not configured. History remains available;
            native actions are disabled.
          </p>
        ) : null}
        <p>
          <a href="/manage/people/new">Add person</a> ·{" "}
          <a href="/manage/people">People</a>
        </p>
        {row ? (
          <>
            <h2>{row.body.name}</h2>
            <p role="status">
              {states[row.state] || "Administrator review required"}
            </p>
            <dl>
              <dt>Username</dt>
              <dd>{row.body.username}</dd>
              <dt>Invitation recipient</dt>
              <dd>{row.body.email}</dd>
              <dt>Reason</dt>
              <dd>{row.body.reason}</dd>
            </dl>
            <details>
              <summary>Exact identity and audit details</summary>
              <dl>
                <dt>Review</dt>
                <dd>
                  <code>{row.id}</code>
                </dd>
                <dt>Subject</dt>
                <dd>
                  <code>{row.body.subject}</code>
                </dd>
                <dt>Issuer</dt>
                <dd>
                  <code>{row.body.issuer}</code>
                </dd>
                <dt>Organization</dt>
                <dd>
                  <code>{row.body.organizationId}</code>
                </dd>
                <dt>Administrator</dt>
                <dd>
                  <code>{row.actor}</code>
                </dd>
                <dt>Reviewed at</dt>
                <dd>{row.created_at}</dd>
              </dl>
            </details>
            {row.state.endsWith("-unknown") ? (
              <p role="alert">
                Do not repeat this operation or create a replacement. The
                operator must inspect the exact identity and delivery outcome.
                No automatic retry is available.
              </p>
            ) : null}
            {actionable &&
            (row.state === "review" || row.state === "created") ? (
              <form
                class="form-stack"
                mix={reviewFormStyles}
                method="post"
                action={`/manage/onboarding/${row.id}/${row.state === "review" ? "create" : "invite"}`}
              >
                <input type="hidden" name="csrf" value={context.csrf} />
                {row.state === "created" ? (
                  <label>
                    Retype the exact invitation recipient
                    <input
                      type="email"
                      name="recipient"
                      required
                      maxLength={200}
                      autoComplete="off"
                    />
                  </label>
                ) : null}
                <label class="confirmation">
                  <input
                    type="checkbox"
                    name="confirmed"
                    value="yes"
                    required
                  />
                  {row.state === "review"
                    ? "Create this new identity without a password, invitation or service access."
                    : `Request a native invitation email to ${row.body.email}. Delivery is not guaranteed.`}
                </label>
                <button class="primary" mix={uiPrimaryActionStyles}>
                  {row.state === "review"
                    ? "Create identity"
                    : "Send invitation"}
                </button>
              </form>
            ) : null}
            {context.onboardingEnabled &&
            !actionable &&
            ["review", "created"].includes(row.state) ? (
              <p>
                Only the administrator who reviewed this identity may confirm
                it.
              </p>
            ) : null}
          </>
        ) : null}
        {!row && (
          <>
            <h2>Recent reviews</h2>
            {recent.length ? (
              <ul>
                {recent.map((item) => (
                  <li>
                    <a href={`/manage/onboarding/${item.id}`}>
                      {item.body.name}
                    </a>{" "}
                    — {states[item.state] || "Administrator review required"}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No identities have been reviewed.</p>
            )}
          </>
        )}
      </Document>
    );
  };
}
export function renderOnboarding(
  row: Review | null,
  recent: Review[],
  context: Context,
  nonce: string,
) {
  return renderToString(
    <OnboardingPage row={row} recent={recent} context={context} />,
    { nonce },
  );
}
