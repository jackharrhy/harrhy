import { type Handle } from "remix/component";
import { renderToString } from "remix/component/server";
import { Document, type DocumentProps } from "./document.tsx";

type Context = Omit<DocumentProps, "title" | "children"> & { csrf: string };
type Instance = { service: string; instance: string; name: string };
type Person = { subject: string; name: string; active: boolean };
type Folder = { id: string; name: string };
type Creation = {
  id: string;
  actor: string;
  state: string;
  created_at: string;
  native_id?: string;
  body: {
    target: {
      service: string;
      instance: string;
      issuer: string;
      subject: string;
      sourceInstance?: string;
      sourceNativeId?: string;
    };
    reason: string;
    review: { username: string; folders?: Folder[] };
  };
};
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
      people,
      libraries,
      actions,
      context,
    } = handle.props;
    return (
      <Document {...context} title="Create native account" active="services">
        <h1>Create native account</h1>
        <p>
          Create a new Jellyfin account for an existing active Auth identity.
          Existing native accounts are never replaced or matched by name.
        </p>
        <form
          method="get"
          action="/manage/media/provisioning"
          class="form-stack"
        >
          <label>
            Jellyfin instance
            <select name="instance" required aria-label="Jellyfin instance">
              <option value="">Choose an instance</option>
              {instances.map((item) => (
                <option
                  value={item.instance}
                  selected={item.instance === selected?.instance}
                >
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <button>Load available libraries</button>
        </form>
        {selected && (
          <section>
            <h2>{selected.name}</h2>
            {libraries.length === 0 ? (
              <p>
                No libraries are available. Creation requires an explicit
                library selection.
              </p>
            ) : (
              <form
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
                  Existing Auth identity
                  <select
                    name="subject"
                    required
                    aria-label="Existing Auth identity"
                  >
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
                  New native username
                  <input
                    name="username"
                    required
                    maxLength={64}
                    pattern="[A-Za-z0-9][A-Za-z0-9._-]{0,63}"
                    aria-describedby="username-help"
                  />
                </label>
                <p id="username-help" class="muted">
                  1–64 ASCII letters, digits, dots, underscores or hyphens;
                  start with a letter or digit. Existing usernames are rejected,
                  never linked automatically.
                </p>
                <fieldset>
                  <legend>Libraries available for playback</legend>
                  {libraries.map((folder) => (
                    <label class="check">
                      <input
                        type="checkbox"
                        name="folderId"
                        value={folder.id}
                      />
                      {folder.name}
                    </label>
                  ))}
                </fieldset>
                <label>
                  Reason
                  <textarea name="reason" required maxLength={500} />
                </label>
                <button>Review new native account</button>
              </form>
            )}
          </section>
        )}
        <section>
          <h2>Import one Jellyfin account into Seerr</h2>
          <p>
            Requires a separately confirmed exact-ID Jellyfin mapping and an
            active Auth identity. No existing Seerr account is changed or
            automatically linked.
          </p>
          {seerrInstances.length && sourceMappings.length ? (
            <form
              method="post"
              action="/manage/media/provisioning/seerr-preview"
              class="form-stack"
            >
              <input type="hidden" name="csrf" value={context.csrf} />
              <label>
                Seerr instance
                <select name="instance" required aria-label="Seerr instance">
                  <option value="">Choose an instance</option>
                  {seerrInstances.map((item) => (
                    <option value={item.instance}>{item.name}</option>
                  ))}
                </select>
              </label>
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
                <textarea name="reason" required maxLength={500} />
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
        <section>
          <h2>Your creation reviews</h2>
          {actions.length ? (
            <ul>
              {actions.map((action) => (
                <li>
                  <a href={`/manage/media/provisioning/${action.id}`}>
                    {action.body.review.username} · {action.state}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p>No creation reviews yet.</p>
          )}
        </section>
        <a class="text-link" href="/manage/media">
          Return to media identities
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
    const { target, review, reason } = action.body;
    return (
      <Document {...context} title="Review native creation" active="services">
        <h1>Review native creation</h1>
        <p role="status">Creation status: {action.state}</p>
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
        {target.service === "seerr" ? (
          <section>
            <h2>Seerr request and auto-approve · 160</h2>
            <p>
              Import only the exact Jellyfin account from{" "}
              {target.sourceInstance}: <code>{target.sourceNativeId}</code>. Its
              existence is checked through Seerr’s own configured Jellyfin
              server; existing Seerr associations are rejected.
            </p>
            <p>
              Native permission 160 means REQUEST (32) and AUTO_APPROVE (128).
              Ordinary movie and TV requests are automatically approved; no
              administrator, management or 4K request permission is added.
              Import uses Jellyfin account type, not a local password account.
            </p>
            <p>
              Seerr applies its global defaults during import, without an atomic
              conditional-create API. Defaults are checked before import and
              returned permissions are verified after creation. A race or
              unexpected response requires manual investigation, never automatic
              permission repair or deletion. No requests, Arr, download clients
              or files are changed by this import.
            </p>
          </section>
        ) : (
          <>
            <h2>Selected-library playback</h2>
            <ul>
              {review.folders?.map((folder) => (
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
          grant, automatic identity link or other service change is made. No
          incumbent password, history or watch state is changed.
        </p>
        {action.state === "review" && action.actor === context.user && (
          <form
            method="post"
            action={`/manage/media/provisioning/${action.id}/confirm`}
            class="form-stack"
          >
            <input type="hidden" name="csrf" value={context.csrf} />
            {target.service === "jellyfin" && (
              <>
                <label>
                  Separate native password
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
                  16–256 characters. Kept in memory only for this request, never
                  stored in the review or displayed. Deliver it privately to the
                  intended recipient.
                </p>
              </>
            )}
            <label class="check">
              <input type="checkbox" name="confirmed" value="true" required />I
              intend this new native account and reviewed the exact Auth
              subject, exact native source or selected libraries and full
              permission profile.
            </label>
            <p class="muted">
              Review expires after five minutes. The exact native review, active
              identity and required mappings are checked again before creation.
            </p>
            <button class="primary">Create native account</button>
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
          Return to creation reviews
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
