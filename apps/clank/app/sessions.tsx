import {
  Badge,
  Button,
  Heading,
  Input,
  Notice,
  Panel,
  Stack,
  Text,
} from "@harrhy/ui/native";
import { clientEntry, css, on, type Handle } from "remix/component";
import type { Row } from "./session-state.ts";
import { ClankProvider } from "./clank-provider.tsx";

import { Overview } from "./overview.tsx";

function ConnectionPane(handle: Handle) {
  const { sessions } = handle.context.get(ClankProvider);
  const status = sessions.select((s) => s.status),
    notice = sessions.select((s) => s.notice);
  status.subscribe(() => handle.update(), handle);
  notice.subscribe(() => handle.update(), handle);
  return () => (
    <>
      <Badge role="status" aria-label="Fixture connection">
        {status.current === "live"
          ? "Live"
          : status.current === "connecting"
            ? "Connecting…"
            : "Disconnected. Reconnecting…"}
      </Badge>
      {notice.current && <Notice role="alert">{notice.current}</Notice>}
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
            <Input name="title" required maxLength={120} />
          </label>{" "}
          <Button type="submit" variant="primary" disabled={disabled}>
            {id ? "Rename" : "Create"}
          </Button>
        </form>
        {id && (
          <Button
            disabled={disabled}
            mix={on("click", () => app.sessions.archive(id))}
          >
            Archive
          </Button>
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
        <Panel>
          <Stack>
            <Heading level={3}>{row.title || "Untitled session"}</Heading>
            <Text tone="muted">
              {row.pinned ? "Pinned · " : ""}
              {row.model.provider}/{row.model.modelId} · {row.thinkingLevel}
            </Text>
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
          </Stack>
        </Panel>
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
      <ul
        aria-label="Sessions in activity order"
        mix={css({
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "grid",
          gap: "0.75rem",
        })}
      >
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
      <Heading level={2}>{archived ? "Archive" : "Active sessions"}</Heading>
      <Button
        mix={on("click", () => {
          archived = !archived;
          handle.update();
        })}
      >
        {archived ? "Show active" : "Show archive"}
      </Button>
      <OrderedList
        key={archived ? "archive" : "active"}
        archived={archived}
        disabled={disabled.current}
      />
    </>
  );
}
function CatalogViews(handle: Handle) {
  let overview = false;
  return () => (
    <>
      <Button
        aria-expanded={overview}
        mix={on("click", () => {
          overview = !overview;
          handle.update();
        })}
      >
        {overview ? "Show session list" : "Show overview"}
      </Button>
      {overview && <Overview />}
      <div hidden={overview}>
        <Stack>
          <CatalogPane />
        </Stack>
      </div>
    </>
  );
}
export const SessionList = clientEntry(
  "/sessions.js#SessionList",
  function SessionList() {
    return () => (
      <ClankProvider>
        <Stack>
          <ConnectionPane />
          <CatalogViews />
        </Stack>
      </ClankProvider>
    );
  },
);
