import { clientEntry, on, type Handle } from "remix/component";
import type { Row } from "./session-state.ts";
import { ClankProvider } from "./clank-provider.tsx";

function ConnectionPane(handle: Handle) {
  const { sessions } = handle.context.get(ClankProvider);
  const status = sessions.select((s) => s.status),
    notice = sessions.select((s) => s.notice);
  status.subscribe(() => handle.update(), handle);
  notice.subscribe(() => handle.update(), handle);
  return () => (
    <>
      <p role="status" aria-label="Fixture connection">
        {status.current === "live"
          ? "Live"
          : status.current === "connecting"
            ? "Connecting…"
            : "Disconnected. Reconnecting…"}
      </p>
      {notice.current && <p role="alert">{notice.current}</p>}
    </>
  );
}

function Commands(handle: Handle<{ id?: string; disabled: boolean }>) {
  const app = handle.context.get(ClankProvider);
  return () => {
    const { id, disabled } = handle.props;
    return (
      <>
        <form
          mix={on("submit", (e) => {
            e.preventDefault();
            const title = String(
              new FormData(e.currentTarget).get("title") ?? "",
            ).trim();
            if (title)
              void (id
                ? app.sessions.rename(id, title)
                : app.sessions.create(title));
          })}
        >
          <label>
            {id ? "New title" : "Session title"}{" "}
            <input name="title" required maxLength={120} />
          </label>{" "}
          <button disabled={disabled}>{id ? "Rename" : "Create"}</button>
        </form>
        {id && (
          <button
            disabled={disabled}
            mix={on("click", () => app.sessions.archive(id))}
          >
            Archive
          </button>
        )}
      </>
    );
  };
}

function SessionRow(handle: Handle<{ row: Row; disabled: boolean }>) {
  return () => {
    const { row, disabled } = handle.props;
    return (
      <li>
        <h3>{row.title || "Untitled session"}</h3>
        <p>
          {row.pinned ? "Pinned · " : ""}
          {row.model.provider}/{row.model.modelId} · {row.thinkingLevel}
        </p>
        <details>
          <summary>Session details</summary>
          <p>
            {row.env ?? "Local"} · {row.cwd}
          </p>
          <p>
            Created {new Date(row.createdAt).toISOString()} · Updated{" "}
            {new Date(row.updatedAt).toISOString()}
          </p>
          <p>Main conversation {row.main}</p>
          <ul>
            {row.branches.map((b) => (
              <li key={b.conversation}>
                {b.conversation}: {b.label ?? row.title}
                {b.parent ? ` (from ${b.parent})` : ""}
              </li>
            ))}
          </ul>
          {row.archivedAt !== null && (
            <p>Archived {new Date(row.archivedAt).toISOString()}</p>
          )}
        </details>

        {row.archivedAt === null && (
          <Commands id={row.id} disabled={disabled} />
        )}
      </li>
    );
  };
}

function OrderedList(handle: Handle<{ archived: boolean; disabled: boolean }>) {
  const { sessions } = handle.context.get(ClankProvider);
  const rows = sessions.select((s) =>
    s.status === "live"
      ? handle.props.archived
        ? s.archivedRows
        : s.activeRows
      : null,
  );
  rows.subscribe(() => handle.update(), handle);
  return () => (
    <>
      {rows.current?.length === 0 && (
        <p>No {handle.props.archived ? "archived" : "active"} sessions.</p>
      )}
      <ul aria-label="Sessions in activity order">
        {rows.current?.map((row) => (
          <SessionRow key={row.id} row={row} disabled={handle.props.disabled} />
        ))}
      </ul>
    </>
  );
}

function CatalogPane(handle: Handle) {
  const { sessions } = handle.context.get(ClankProvider);
  const disabled = sessions.select((s) => s.status !== "live" || s.pending);
  disabled.subscribe(() => handle.update(), handle);
  let archived = false;
  return () => (
    <>
      <Commands disabled={disabled.current} />
      <h2>{archived ? "Archive" : "Active sessions"}</h2>
      <button
        mix={on("click", () => {
          archived = !archived;
          handle.update();
        })}
      >
        {archived ? "Show active" : "Show archive"}
      </button>
      <OrderedList
        key={archived ? "archive" : "active"}
        archived={archived}
        disabled={disabled.current}
      />
    </>
  );
}
export const SessionList = clientEntry(
  "/sessions.js#SessionList",
  function SessionList() {
    return () => (
      <ClankProvider>
        <section>
          <ConnectionPane />
          <CatalogPane />
        </section>
      </ClankProvider>
    );
  },
);
