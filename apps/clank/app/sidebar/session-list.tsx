import { space } from "@harrhy/ui/theme";
import { Button, Input, Text } from "@harrhy/ui/native";
import { css, on, ref, type Handle } from "remix/component";
import type { SearchResults } from "../../../pi/plugins/search/contract.ts";
import type { Catalog, Row } from "../pi/catalog.ts";
import { Icon } from "../icons.tsx";
import { age } from "./sidebar-time.ts";

const line = "1px solid var(--hui-border)";
const rowStyle = css({
  width: "100%",
  display: "flex",
  justifyContent: "space-between",
  gap: space(1),
  textAlign: "start",
  overflowWrap: "anywhere",
  "&[data-aged]": { color: "var(--hui-muted)" },
  "@media (max-width: 40rem)": { minHeight: "2.75rem" },
});
export function SessionList(
  handle: Handle<{
    rows: Row[];
    aged: Set<string>;
    now: number;
    search?: Catalog["search"];
    initialQuery: string;
    scrollTop: number;
    saveScroll(value: number): void;
    saveQuery(value: string): void;
    open(id: string, conversation?: number): void;
  }>,
) {
  let query = handle.props.initialQuery;
  let results: SearchResults | undefined;
  let error = false;
  let last: string | undefined;
  let lastSearch: Catalog["search"] | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  function refresh() {
    const { rows, search } = handle.props;
    const ids = rows.map((row) => row.id).toSorted();
    const trimmed = query.trim();
    const key = JSON.stringify([trimmed, ids]);
    if (last === key && lastSearch === search) return;
    last = key;
    lastSearch = search;
    const revision = ++generation;
    clearTimeout(timer);
    if (!trimmed || !search) {
      if (results || error) {
        results = undefined;
        error = false;
        void handle.update();
      }
      return;
    }
    timer = setTimeout(async () => {
      try {
        const value = await search(trimmed, ids);
        if (handle.signal.aborted || revision !== generation) return;
        results = value;
        error = false;
      } catch {
        if (handle.signal.aborted || revision !== generation) return;
        error = true;
      }
      await handle.update();
    }, 200);
  }
  const mount = ref<HTMLDivElement>((node, signal) => {
    node.scrollTop = handle.props.scrollTop;
    node.addEventListener(
      "scroll",
      () => handle.props.saveScroll(node.scrollTop),
      { signal },
    );
    signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
  });
  return () => {
    const { aged, now, open, saveQuery } = handle.props;
    const rows = handle.props.rows
      .filter((row) => !results || results.sessions.includes(row.id))
      .toSorted((a, b) => Number(aged.has(a.id)) - Number(aged.has(b.id)));
    handle.queueTask(refresh);
    return (
      <div
        mix={[mount, css({ overflow: "auto", overscrollBehavior: "contain" })]}
      >
        <div
          mix={css({
            maxWidth: "50rem",
            padding: `${space(2.5)} ${space(2)}`,
            marginInline: "auto",
          })}
        >
          <label
            mix={css({
              display: "flex",
              alignItems: "center",
              gap: space(1),
              paddingInline: space(0.5),
              borderBottom: line,
              marginBottom: space(1),
            })}
          >
            <Icon name="search" />
            <Input
              type="search"
              maxLength={500}
              value={query}
              placeholder="Search Sessions"
              aria-label="Search sessions and messages"
              mix={[
                css({
                  flex: "1",
                  minWidth: 0,
                  border: "none",
                  background: "transparent",
                }),
                on("input", (event) => {
                  query = event.currentTarget.value;
                  saveQuery(query);
                  refresh();
                  void handle.update();
                }),
              ]}
            />
          </label>
          <ul mix={css({ listStyle: "none", margin: 0, padding: 0 })}>
            {rows.map((row) => (
              <li key={row.id}>
                <Button
                  variant="quiet"
                  data-aged={aged.has(row.id) ? "" : undefined}
                  mix={[rowStyle, on("click", () => open(row.id))]}
                >
                  <span>{row.title || "Untitled session"}</span>
                  <span
                    aria-hidden="true"
                    mix={css({
                      fontSize: "0.75rem",
                      color: "var(--hui-muted)",
                      flexShrink: 0,
                    })}
                  >
                    {age(row.updatedAt, now)}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
          {results?.messages.length ? (
            <section aria-label="Messages">
              <h3>Messages</h3>
              {results.messages.slice(0, 40).map((hit) => (
                <Button
                  key={`${hit.session}:${hit.conversationId}:${hit.entryId}`}
                  variant="quiet"
                  mix={[
                    rowStyle,
                    on("click", () => open(hit.session, hit.conversationId)),
                  ]}
                >
                  <strong>{hit.title}</strong>
                  <span>{hit.text.slice(0, 160)}</span>
                </Button>
              ))}
            </section>
          ) : null}
          {error && <Text role="status">Search unavailable.</Text>}
          {!rows.length && !results?.messages.length && (
            <Text tone="muted">
              {results ? "Nothing found" : "No sessions"}
            </Text>
          )}
        </div>
      </div>
    );
  };
}
