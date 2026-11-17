import {
  isJellyfinCreation,
  type Creation,
  type Folder,
} from "./media-contracts.ts";
import { css, type Handle } from "remix/component";
import { renderToString } from "remix/component/server";
import { Document, type DocumentProps } from "./document.tsx";

const receiptDetailsStyles = css({
  marginBlock: "24px",
  maxWidth: "70ch",
});

type Context = Omit<DocumentProps, "title" | "children"> & { csrf: string };
type Instance = { service: string; instance: string; name: string };
type Person = { subject: string; name: string; active: boolean };
function ProvisioningPage(
  handle: Handle<{
    instances: Instance[];
    seerrInstances: Instance[];
    sourceMappings: {
      instance: string;
      nativeId: string;
      issuer: string;
      subject: string;
    }[];
    selected?: Instance;
    selectedSubject?: string;
    values?: {
      subject: string;
      username: string;
      reason: string;
      folderIds: string[];
    };
    error?: string;
    enabled: boolean;
    people: Person[];
    libraries: Folder[];
    actions: Creation[];
    context: Context;
  }>,
) {
  return () => {
    const {
      instances,
      seerrInstances,
      sourceMappings,
      selected,
      selectedSubject,
      values,
      error,
      enabled,
      people,
      libraries,
      context,
    } = handle.props;
    return (
      <Document {...context} title="Set up Jellyfin" active="services">
        <nav aria-label="Breadcrumb">
          <a href="/manage/media">Service accounts</a>
          {selected && (
            <>
              {" "}
              /{" "}
              <a
                href={`/manage/media/${selected.service}/${selected.instance}`}
              >
                {selected.name} users
              </a>
            </>
          )}
        </nav>
        <h1>
          {selected?.service === "seerr"
            ? "Import account into Seerr"
            : selected
              ? "Set up Jellyfin"
              : "Choose a service"}
        </h1>
        {error && (
          <section role="alert" tabIndex={-1} autoFocus>
            <h2>Check the account details</h2>
            <p>{error}</p>
            <p>No account was created. Your selections are kept below.</p>
          </section>
        )}
        {!selected && (
          <nav aria-label="Creation service">
            {instances.map((item) => (
              <p>
                <a
                  href={`/manage/media/provisioning?service=${item.service}&instance=${item.instance}${selectedSubject ? `&subject=${encodeURIComponent(selectedSubject)}` : ""}`}
                >
                  {item.name}
                </a>
              </p>
            ))}
          </nav>
        )}
        {selected && !enabled && (
          <section>
            <h2>Account creation is not enabled for {selected.name}</h2>
            <p>
              Creation is unavailable. You can still view and link existing
              accounts; no action was attempted.
            </p>
          </section>
        )}
        {enabled && selected?.service === "jellyfin" && (
          <section>
            <p class="muted">
              {selected.name} · Create an account and link it to one person.
            </p>
            {selectedSubject &&
              !people.some(
                (person) => person.subject === selectedSubject && person.active,
              ) && (
                <p role="status">
                  This person is not active in Auth. Finish their account setup
                  before setting up Jellyfin, or choose another active person.
                </p>
              )}
            {libraries.length === 0 ? (
              <p>
                No libraries are available. Creation requires an explicit
                library selection.
              </p>
            ) : (
              <form
                data-rmx-document
                method="post"
                action="/manage/media/provisioning/preview"
                class="form-stack"
              >
                <input type="hidden" name="csrf" value={context.csrf} />
                <input
                  type="hidden"
                  name="instance"
                  value={selected.instance}
                />
                <label>
                  Person
                  <select name="subject" required aria-label="Person">
                    <option value="">Choose a person</option>
                    {people
                      .filter((person) => person.active)
                      .map((person) => (
                        <option
                          value={person.subject}
                          selected={person.subject === selectedSubject}
                        >
                          {person.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Jellyfin username
                  <input
                    name="username"
                    value={values?.username || ""}
                    title="Use 1–64 letters, digits, dots, underscores or hyphens; start with a letter or digit."
                    required
                    maxLength={64}
                    pattern="[A-Za-z0-9][A-Za-z0-9._-]{0,63}"
                    aria-describedby="username-help"
                  />
                </label>
                <p id="username-help" class="muted">
                  Choose a new username. To use an existing account, link it
                  from the account list instead.
                </p>
                <fieldset>
                  <legend>Libraries</legend>
                  {libraries.map((folder) => (
                    <label class="check">
                      <input
                        type="checkbox"
                        name="folderId"
                        value={folder.id}
                        checked={values?.folderIds.includes(folder.id) || false}
                      />
                      {folder.name}
                    </label>
                  ))}
                </fieldset>
                <label>
                  Note for activity log
                  <textarea
                    aria-label="Note for activity log"
                    name="reason"
                    required
                    maxLength={500}
                    value={values?.reason || ""}
                  />
                </label>
                <button>Review setup</button>
              </form>
            )}
          </section>
        )}
        {enabled && selected?.service === "seerr" && (
          <section>
            <h2>Import one Jellyfin account into Seerr</h2>
            <p>
              Requires a separately confirmed exact-ID Jellyfin mapping and an
              active Auth identity. No existing Seerr account is changed or
              automatically linked.
            </p>
            {seerrInstances.length && sourceMappings.length ? (
              <form
                data-rmx-document
                method="post"
                action="/manage/media/provisioning/seerr-preview"
                class="form-stack"
              >
                <input type="hidden" name="csrf" value={context.csrf} />
                <input
                  type="hidden"
                  name="instance"
                  value={selected.instance}
                />
                <label>
                  Confirmed Jellyfin mapping
                  <select
                    name="sourceMapping"
                    required
                    aria-label="Confirmed Jellyfin mapping"
                  >
                    <option value="">
                      Choose exact native ID and Auth subject
                    </option>
                    {sourceMappings.map((item) => (
                      <option
                        value={JSON.stringify([
                          item.instance,
                          item.nativeId,
                          item.issuer,
                          item.subject,
                        ])}
                      >
                        {item.instance} · {item.nativeId} · {item.subject}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Import reason
                  <textarea
                    name="reason"
                    required
                    maxLength={500}
                    value={values?.reason || ""}
                  />
                </label>
                <button>Review Seerr exact-ID import</button>
              </form>
            ) : (
              <p>
                Configure a Seerr instance and confirm an explicit Jellyfin
                mapping before importing.
              </p>
            )}
          </section>
        )}
        <a
          class="text-link"
          href={
            selected
              ? `/manage/media/${selected.service}/${selected.instance}`
              : "/manage/media"
          }
        >
          Back to users
        </a>
      </Document>
    );
  };
}
function ProvisioningReviewPage(
  handle: Handle<{ action: Creation; context: Context }>,
) {
  return () => {
    const { action, context } = handle.props;
    const body = action.body;
    const { target, review, reason } = body;
    const combined = body.approval?.kind === "create-and-link-v1";
    const title =
      action.state === "linked"
        ? "Account created and linked"
        : action.state === "link-pending"
          ? "Account created · linking not finished"
          : action.state === "effect-unknown"
            ? "Creation needs investigation"
            : combined
              ? "Review Jellyfin setup"
              : "Review native creation";
    return (
      <Document {...context} title={title} active="services">
        <h1>{title}</h1>
        {combined && action.state === "review" && (
          <>
            <dl>
              <dt>Person</dt>
              <dd>{body.approval?.person}</dd>
              <dt>Jellyfin username</dt>
              <dd>{review.username}</dd>
              <dt>Libraries</dt>
              <dd>
                {isJellyfinCreation(body)
                  ? body.review.folders.map((folder) => folder.name).join(", ")
                  : ""}
              </dd>
              <dt>Activity note</dt>
              <dd>{reason}</dd>
            </dl>
            <p>
              Can watch the selected libraries, without administration, deletion
              or downloading. The account will be linked to this person in Auth.
            </p>
            <p class="muted">
              This link records who owns the account. It does not enable single
              sign-on or grant access to other services.
            </p>
          </>
        )}
        {action.state === "linked" && (
          <section role="status">
            <p>
              Jellyfin account {review.username} is linked to{" "}
              {body.approval?.person}. Share the separate Jellyfin password
              privately. Sign-in has not been checked.
            </p>
            <a href={`/manage/people/${target.subject}`}>Return to person</a>
          </section>
        )}
        {action.state === "link-pending" && (
          <section role="status">
            <p>
              Jellyfin account {review.username} was created, but its link to{" "}
              {body.approval?.person} is not confirmed. Do not create another
              account. You can safely finish only the local link; the account
              and password will not be created again.
            </p>
            {action.actor === context.user && (
              <form
                data-rmx-document
                method="post"
                action={`/manage/media/provisioning/${action.id}/confirm`}
                class="form-stack"
              >
                <input type="hidden" name="csrf" value={context.csrf} />
                <input type="hidden" name="confirmed" value="true" />
                <button>Finish linking account</button>
              </form>
            )}
          </section>
        )}
        <details mix={receiptDetailsStyles}>
          <summary>Technical details</summary>
          <p>Creation status: {action.state}</p>
          <dl>
            <dt>Service / instance</dt>
            <dd>
              {target.service} / {target.instance}
            </dd>
            <dt>New username</dt>
            <dd>{review.username}</dd>
            <dt>Auth subject</dt>
            <dd>
              <code>{target.subject}</code>
            </dd>
            <dt>Auth issuer</dt>
            <dd>
              <code>{target.issuer}</code>
            </dd>
            <dt>Reason</dt>
            <dd>{reason}</dd>
            <dt>Reviewer</dt>
            <dd>{action.actor}</dd>
            <dt>Reviewed at</dt>
            <dd>
              <time dateTime={action.created_at}>{action.created_at}</time>
            </dd>
            {action.native_id && (
              <>
                <dt>Returned exact native ID</dt>
                <dd>
                  <code>{action.native_id}</code>
                </dd>
              </>
            )}
          </dl>
          {!isJellyfinCreation(body) ? (
            <section>
              <h2>Seerr request and auto-approve · 160</h2>
              <p>
                Import only the exact Jellyfin account from{" "}
                {body.target.sourceInstance}:{" "}
                <code>{body.target.sourceNativeId}</code>. Its existence is
                checked through Seerr’s own configured Jellyfin server; existing
                Seerr associations are rejected.
              </p>
              <p>
                Native permission 160 means REQUEST (32) and AUTO_APPROVE (128).
                Ordinary movie and TV requests are automatically approved; no
                administrator, management or 4K request permission is added.
                Import uses Jellyfin account type, not a local password account.
              </p>
              <p>
                Seerr applies its global defaults during import, without an
                atomic conditional-create API. Defaults are checked before
                import and returned permissions are verified after creation. A
                race or unexpected response requires manual investigation, never
                automatic permission repair or deletion. No requests, Arr,
                download clients or files are changed by this import.
              </p>
            </section>
          ) : (
            <>
              <h2>Selected-library playback</h2>
              <ul>
                {body.review.folders.map((folder) => (
                  <li>
                    {folder.name} · {folder.id}
                  </li>
                ))}
              </ul>
              <p>
                New non-administrator account, hidden from the login list.
                Playback, audio/video transcoding, remuxing, preferences, remote
                access and ordinary devices are allowed only within the selected
                libraries. No rating, tag, time, session-count or bitrate
                restriction is added.
              </p>
              <p>
                No library management, subtitle or lyric management, deletion,
                downloading, sync transcoding, conversion, live TV, public
                sharing, shared-device control, other-user control or SyncPlay.
                Five failed logins lock the account.
              </p>
            </>
          )}
          <p>
            The native password is separate from Auth. No invitation, service
            grant or other service change is made.{" "}
            {combined
              ? "Only the newly returned native ID is linked to the approved Auth subject."
              : "Identity linking is a separate review."}{" "}
            No incumbent password, history or watch state is changed.
          </p>
        </details>
        {action.state === "review" && action.actor === context.user && (
          <form
            data-rmx-document
            method="post"
            action={`/manage/media/provisioning/${action.id}/confirm`}
            class="form-stack"
          >
            <input type="hidden" name="csrf" value={context.csrf} />
            {target.service === "jellyfin" && (
              <>
                <label>
                  Jellyfin password
                  <input
                    type="password"
                    name="password"
                    autoComplete="new-password"
                    required
                    minLength={16}
                    maxLength={256}
                    aria-describedby="native-password-help"
                  />
                </label>
                <p id="native-password-help" class="muted">
                  16–256 characters, separate from Auth. Share it privately; it
                  is not saved in this review.
                </p>
              </>
            )}
            <label class="check">
              <input type="checkbox" name="confirmed" value="true" required />
              {combined
                ? `Create this Jellyfin account and link it to ${body.approval?.person}.`
                : "Create this native account with the reviewed permissions."}
            </label>
            <p class="muted">
              Confirm within five minutes. The person and account settings are
              checked again before creation.
            </p>
            <button class="primary">
              {combined ? "Create and link account" : "Create native account"}
            </button>
          </form>
        )}
        {action.state === "created" && (
          <section>
            <h2>Account created · link separately</h2>
            <p>
              Use the returned exact native ID in a separate identity mapping
              review. This creation did not establish a link or grant service
              eligibility.
            </p>
            <a href={`/manage/media/${target.service}/${target.instance}`}>
              Open native inventory for exact-ID mapping
            </a>
          </section>
        )}
        {action.state === "effect-unknown" && (
          <section>
            <h2>Manual investigation required</h2>
            <p>
              A native account may exist or be partially configured. No
              automatic retry, password delivery, account deletion or identity
              matching is permitted. Preserve this receipt and investigate the
              exact returned ID if available.
            </p>
          </section>
        )}
        <a class="text-link" href="/manage/media/provisioning">
          Return to service setup
        </a>
      </Document>
    );
  };
}
export const renderMediaProvisioning = (
  props: Parameters<typeof ProvisioningPage>[0]["props"],
  nonce: string,
) => renderToString(<ProvisioningPage {...props} />, { nonce });
export const renderMediaProvisioningReview = (
  action: Creation,
  context: Context,
  nonce: string,
) =>
  renderToString(<ProvisioningReviewPage action={action} context={context} />, {
    nonce,
  });
