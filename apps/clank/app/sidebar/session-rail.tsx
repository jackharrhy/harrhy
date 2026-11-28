import { Button } from "@harrhy/ui/native";
import { css, on, ref, type Handle } from "remix/component";
import { childMarks, sessionMarks } from "./sidebar-indicators.ts";
import { byRecentActivity } from "../../../pi/plugins/subagents/contract.ts";
import { BrandMark } from "../brand-mark.tsx";
import type { ArchiveTarget, Catalog, Row } from "../pi/catalog.ts";
import { Icon } from "../icons.tsx";
import { RailRow } from "./rail-row.tsx";
import { SESSION_LIST_PATH } from "../routes.ts";
import { age, isRecent, type Recency } from "./sidebar-time.ts";
import { phoneWidth } from "./swipe.ts";

const sessionButton = css({
  width: "100%",
  fontWeight: 400,
  "&[data-variant=quiet]:hover": { background: "var(--hui-hover-surface)" },
  minHeight: "1.75rem",
  justifyContent: "flex-start",
  fontSize: "0.875rem",
  textAlign: "left",
  padding: "0.25rem 0.625rem",
  "& > svg": { flex: "none", color: "var(--hui-muted)" },
  "& span": {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  "&[data-variant=quiet][aria-pressed=true]": {
    backgroundColor: "var(--hui-selected-surface)",
    color: "var(--hui-selected-ink)",
    fontWeight: 600,
  },
  [`@media ${phoneWidth}`]: { minHeight: "2.75rem" },
});

// The palette uses the same ordering and the search page uses the same age cutoff.
export function railEntries(
  catalog: Pick<Catalog, "rows" | "children" | "indicators"> | undefined,
  {
    familiarId,
    activeIds,
    selectedId,
    recency,
    now,
  }: {
    familiarId?: string;
    activeIds?: string[];
    selectedId?: string;
    recency: Recency;
    now: number;
  },
) {
  const familiar = catalog?.rows.find((row) => row.id === familiarId);
  const rows = [
    ...(familiar ? [familiar] : []),
    null,
    ...(catalog?.rows.filter((row) => row !== familiar) ?? []),
  ];
  const active = new Set(activeIds);
  const older = rows.filter((row): row is Row =>
    Boolean(
      row &&
      row !== familiar &&
      !active.has(row.id) &&
      !isRecent(row, selectedId, now, recency),
    ),
  );
  const olderIds = new Set(older.map((row) => row.id));
  const children = (id: string) =>
    (catalog?.children[id] ?? [])
      .filter((child) => child.kind !== "agent" && !child.archived)
      .toSorted(byRecentActivity);
  return {
    rows,
    familiar,
    children,
    olderIds,
    indicators: catalog?.indicators,
    now,
  };
}

type Selection = {
  selectedId?: string;
  agentId?: number;
  newOpen: boolean;
  listPage: boolean;
};

export function createSessionRail(
  handle: Pick<Handle, "update" | "queueTask">,
  {
    open,
    startNew,
    showList,
    archiveAction,
  }: {
    open(
      session: string,
      destination: number | undefined,
      from: HTMLButtonElement,
    ): void;
    startNew(from: HTMLButtonElement): void;
    showList(from: HTMLAnchorElement): void;
    archiveAction(
      target: ArchiveTarget,
    ): ((from: HTMLButtonElement) => void) | undefined;
  },
) {
  const expanded = new Set<string>();
  let sidebarList: HTMLUListElement | undefined;
  const sidebarListRef = ref<HTMLUListElement>((node) => {
    sidebarList = node;
  });
  function toggleSubagents(id: string, button: HTMLButtonElement) {
    if (expanded.delete(id)) {
      const list = button.ownerDocument.getElementById(`agents-${id}`);
      if (list?.contains(button.ownerDocument.activeElement)) button.focus();
    } else {
      expanded.add(id);
    }
    void handle.update();
  }
  function render(
    {
      rows,
      familiar,
      children,
      olderIds,
      indicators,
      now,
    }: ReturnType<typeof railEntries>,
    { selectedId, agentId, listPage, newOpen }: Selection,
    logo?: string | null,
  ) {
    const doc = sidebarList?.ownerDocument;
    const focused = doc?.activeElement;
    if (
      doc &&
      focused instanceof HTMLElement &&
      sidebarList?.contains(focused)
    ) {
      // A keyed row survives a move, but moving it can drop DOM focus.
      handle.queueTask(() => {
        if (doc.activeElement !== doc.body) return;
        const next = focused.isConnected
          ? focused
          : sidebarList?.querySelector<HTMLButtonElement>(
              "button[aria-pressed=true], [data-new-session]",
            );
        if (next?.getClientRects().length) next.focus({ preventScroll: true });
      });
    }
    const sidebarRows = rows.filter((row) => !row || !olderIds.has(row.id));
    return (
      <ul
        mix={[
          sidebarListRef,
          css({
            listStyle: "none",
            margin: 0,
            padding: "0.5rem",
            display: "grid",
            gap: "0.25rem",
          }),
        ]}
      >
        {sidebarRows.flatMap((row) => {
          if (row) {
            const agents = children(row.id);
            const marks = indicators?.[row.id];
            const isOpen = expanded.has(row.id);
            const title = row.title || "Untitled session";
            const label = row === familiar ? "Familiar" : title;
            const listId = `agents-${row.id}`;
            return [
              <li key={row.id}>
                <RailRow
                  label={label}
                  title={title}
                  familiarLogo={
                    row === familiar ? <BrandMark logo={logo} /> : undefined
                  }
                  pinned={row !== familiar && row.pinned}
                  {...sessionMarks(marks)}
                  selected={
                    !newOpen &&
                    !listPage &&
                    row.id === selectedId &&
                    agentId === undefined
                  }
                  age={row === familiar ? undefined : age(row.updatedAt, now)}
                  open={(from) => open(row.id, undefined, from)}
                  disclosure={
                    agents.length
                      ? {
                          controls: listId,
                          expanded: isOpen,
                          toggle: (from) => toggleSubagents(row.id, from),
                        }
                      : undefined
                  }
                  archive={archiveAction({
                    session: row.id,
                    name: title,
                  })}
                />
                {agents.length > 0 && (
                  <ul
                    id={listId}
                    hidden={!isOpen}
                    mix={[
                      css({
                        listStyle: "none",
                        margin: "0.25rem 0",
                        paddingInlineStart: "calc(16px + 0.5rem)",
                      }),
                      on("keydown", (event) => {
                        if (event.key !== "Escape" || event.defaultPrevented)
                          return;
                        const button =
                          event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(
                            "button[aria-controls]",
                          );
                        if (!button) return;
                        event.preventDefault();
                        toggleSubagents(row.id, button);
                      }),
                    ]}
                  >
                    {agents.map((child) => (
                      <li key={child.conversationId}>
                        <RailRow
                          child
                          label={child.name}
                          {...childMarks(child, marks?.busy)}
                          selected={
                            row.id === selectedId &&
                            agentId === child.conversationId &&
                            !listPage &&
                            !newOpen
                          }
                          age={
                            child.updatedAt === undefined
                              ? undefined
                              : age(child.updatedAt, now)
                          }
                          open={(from) =>
                            open(row.id, child.conversationId, from)
                          }
                          archive={archiveAction({
                            session: row.id,
                            conversation: child.conversationId,
                            name: child.name,
                          })}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </li>,
            ];
          }
          return (
            <li
              key="new"
              mix={css({
                marginBlockEnd: "0.625rem",
              })}
            >
              <Button
                variant="quiet"
                data-new-session=""
                aria-pressed={newOpen}
                mix={[
                  sessionButton,
                  on("click", (event) => startNew(event.currentTarget)),
                ]}
              >
                <Icon name="plus" /> New session
              </Button>
            </li>
          );
        })}
        {olderIds.size > 0 && (
          <li>
            <a
              href={SESSION_LIST_PATH}
              aria-current={listPage ? "page" : undefined}
              mix={[
                css({
                  display: "block",
                  // Match the row label: fixed marker, scalable padding and gap.
                  padding: "0.375rem calc(16px + 1.125rem)",
                  color: "var(--hui-muted)",
                  textDecoration: "none",
                  borderRadius: "0.25rem",
                  fontSize: "0.875rem",
                  "&[aria-current]": {
                    background: "var(--hui-selected-surface)",
                  },
                  "&:hover": {
                    background: "var(--hui-hover-surface)",
                  },
                }),
                on("click", (event) => {
                  if (
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.altKey ||
                    event.shiftKey
                  )
                    return;
                  event.preventDefault();
                  showList(event.currentTarget);
                }),
              ]}
            >
              {olderIds.size} older
            </a>
          </li>
        )}
      </ul>
    );
  }

  return {
    render,
    expand(id: string) {
      expanded.add(id);
    },
    archiveFallback() {
      return (
        sidebarList?.querySelector<HTMLButtonElement>(
          "button[aria-pressed=true]",
        ) ?? sidebarList?.querySelector<HTMLButtonElement>("[data-new-session]")
      );
    },
  };
}
