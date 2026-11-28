import { space } from "@harrhy/ui/theme";
import { DialogClose } from "../dialog-close.tsx";
import { Dialog } from "@harrhy/ui/interactive";
import { Input, Text } from "@harrhy/ui/native";
import { css, on, ref, type Handle } from "remix/component";

import type { Child } from "../../../pi/plugins/subagents/contract.ts";
import { presentMarks } from "../sidebar/rail-mark.tsx";
import {
  childMarks,
  sessionMarks,
  type RowMarks,
} from "../sidebar/sidebar-indicators.ts";
import type { Catalog, Row } from "../pi/catalog.ts";

type PaletteItem = {
  id: string;
  label: string;
  detail: string;
  parent?: PaletteItem;
  marks?: RowMarks;
  suggested?: boolean;
};
type Choice = PaletteItem & {
  target?: { session: string; conversation: number };
};
const historyKey = "clank:recent-conversations";
const limit = 16;
export const destinationKey = (session: string, conversation: number) =>
  `${session}:${conversation}`;

type Visit = { id: string; at?: number };
export function recentVisits(): Visit[] {
  try {
    const data: unknown = JSON.parse(
      sessionStorage.getItem(historyKey) ?? "[]",
    );
    if (Array.isArray(data))
      return data.slice(0, limit).flatMap((entry) => {
        // Older tabs saved destination IDs without visit times.
        const id = typeof entry === "string" ? entry : entry?.id;
        if (typeof id !== "string" || !/^[\da-f-]{36}:\d+$/.test(id)) return [];
        return [{ id, at: Number.isFinite(entry?.at) ? entry.at : undefined }];
      });
  } catch {}
  return [];
}
export function saveVisits(visits: Visit[]) {
  try {
    if (visits.length)
      sessionStorage.setItem(historyKey, JSON.stringify(visits));
    else sessionStorage.removeItem(historyKey);
  } catch {}
}
export function recordVisit(recent: Visit[], id: string, at?: number) {
  const next = [
    { id, at: at ?? recent.find((v) => v.id === id)?.at },
    ...recent.filter((v) => v.id !== id),
  ].slice(0, limit);
  saveVisits(next);
  return next;
}

export function paletteChoices(
  rows: readonly Row[],
  sessionLabel: (row: Row) => string,
  children: Readonly<Record<string, readonly Child[]>>,
  recent: Visit[],
  current?: string,
  indicators?: Catalog["indicators"],
) {
  const now = Date.now();
  const targets: Choice[] = [];
  for (const row of rows) {
    const name = sessionLabel(row);
    const agents = children[row.id] ?? [];
    const indicator = indicators?.[row.id];
    function add(
      conversation: number,
      label: string,
      detail: string,
      marks?: RowMarks,
      suggested = false,
      parent?: PaletteItem,
    ) {
      const id = destinationKey(row.id, conversation);
      const choice = {
        suggested: suggested && id !== current,
        parent,
        id,
        label,
        detail,
        marks,
        target: { session: row.id, conversation },
      };
      targets.push(choice);
      return choice;
    }
    const cutoff = now - 12 * 3_600_000;
    const visited = recent.some(
      (v) => v.id.startsWith(row.id + ":") && (v.at ?? 0) > cutoff,
    );
    const session = add(
      row.main,
      name,
      "Session",
      sessionMarks(indicator),
      visited || row.updatedAt > cutoff,
    );
    for (const branch of row.branches) {
      if (
        branch.conversation !== row.main &&
        !agents.some((agent) => agent.conversationId === branch.conversation)
      )
        add(
          branch.conversation,
          branch.label || `Conversation ${branch.conversation}`,
          "Branch",
          indicator?.busy?.includes(branch.conversation)
            ? { running: 1 }
            : undefined,
          false,
          session,
        );
    }
    for (const agent of agents) {
      if (
        !agent.archived &&
        agent.kind !== "agent" &&
        agent.conversationId !== row.main
      )
        add(
          agent.conversationId,
          agent.name,
          "Subagent",
          childMarks(agent, indicator?.busy),
          indicator?.busy?.includes(agent.conversationId) ||
            (agent.updatedAt ?? 0) > now - 30 * 60_000,
          session,
        );
    }
  }
  // History only orders live targets; it can never manufacture a result.
  const rank = (id: string) => {
    const i = recent.findIndex((v) => v.id === id);
    return i < 0 ? limit : i;
  };
  return [
    ...targets.toSorted((a, b) => rank(a.id) - rank(b.id)),
    { id: "new", label: "New session", detail: "Command" },
    { id: "list", label: "Search sessions and messages", detail: "Command" },
  ];
}

// Parents join the display after ranking; Enter still acts on the first match.
function groupMatches(matches: PaletteItem[]) {
  type Group = { root: PaletteItem; children: PaletteItem[] };
  const groups = new Map<string, Group>();
  for (const item of matches) {
    const root = item.parent ?? item;
    const group: Group = groups.get(root.id) ?? { root, children: [] };
    if (item.parent) group.children.push(item);
    groups.set(root.id, group);
  }
  return groups.values();
}

const resultStyle = css({
  font: "inherit",
  color: "inherit",
  border: 0,
  background: "transparent",
  width: "100%",
  textAlign: "start",
  display: "grid",
  gridTemplateColumns: "minmax(0,1fr) auto 3rem",
  alignItems: "center",
  columnGap: space(1),
  minHeight: "2.75rem",
  paddingInline: space(2),
  overflowWrap: "anywhere",
  cursor: "pointer",
  "&[data-child]": { paddingInlineStart: space(4) },
  "&:hover, &:focus-visible": {
    background: "var(--hui-selected-surface)",
    "& > :first-child": { fontWeight: 600 },
    outlineOffset: "-2px",
    "@media (forced-colors: active)": {
      outline: "2px solid Highlight",
      outlineOffset: "-2px",
    },
  },
});

function resultButton(
  item: PaletteItem,
  id: string,
  isDefault: boolean,
  select: (id: string) => void,
) {
  const marks = item.marks && presentMarks(item.marks);
  return (
    <button
      id={id}
      type="button"
      data-child={item.parent ? "" : undefined}
      data-default={isDefault ? "" : undefined}
      aria-describedby={marks?.status ? `${id}-status` : undefined}
      mix={[resultStyle, on("click", () => select(item.id))]}
    >
      <span>{item.label}</span>
      <span
        mix={css({
          textAlign: "end",
          fontSize: "0.8125rem",
          color: "var(--hui-muted)",
        })}
      >
        {item.detail}
      </span>
      <span
        title={marks?.status}
        mix={css({
          display: "flex",
          alignItems: "center",
          justifyContent: "end",
          gap: space(0.5),
        })}
      >
        {marks?.primary}
        {marks?.secondary}
        {marks?.status && (
          <span id={`${id}-status`} hidden>
            {marks.status}
          </span>
        )}
      </span>
    </button>
  );
}

export function Switcher(
  handle: Handle<{
    open: boolean;
    items: PaletteItem[];
    close(): void;
    select(id: string): void;
  }>,
) {
  let query = "";
  const listId = `${handle.id}-results`;
  let dialog: HTMLDialogElement | undefined;
  const bindDialog = ref<HTMLDialogElement>((node) => {
    dialog = node;
  });
  return () => {
    const { open, items, close, select } = handle.props;
    if (!open) {
      query = "";
      return null;
    }
    const search = query.trim().toLowerCase();
    const terms = search.split(/\s+/);
    const matches = search
      ? items.filter((item) =>
          terms.every((term) =>
            `${item.label} ${item.parent?.label ?? ""} ${item.detail}`
              .toLowerCase()
              .includes(term),
          ),
        )
      : items.filter((item) => item.suggested);
    const renderResult = (item: PaletteItem) =>
      resultButton(
        item,
        `${listId}-${encodeURIComponent(item.id)}`,
        item === matches[0],
        select,
      );
    // A catalog update can remove or move the button the reader is using.
    const focused = dialog?.querySelector<HTMLButtonElement>("li button:focus");
    if (focused)
      handle.queueTask(() => {
        if (dialog?.open && document.activeElement === document.body)
          (focused.isConnected
            ? focused
            : dialog.querySelector("input")
          )?.focus({ preventScroll: true });
      });
    return (
      <Dialog
        open
        title="Command palette"
        initialFocus="input"
        onClose={close}
        mix={[
          bindDialog,
          css({
            "&:has(input:focus) button[data-default]": {
              background: "var(--hui-selected-surface)",
            },
            insetBlockStart: `min(12dvh, ${space(12)})`,
            marginBlockStart: 0,
            width: `min(40rem, calc(100% - ${space(3)}))`,
            padding: 0,
            boxShadow: "none",
            "&::backdrop": { background: "rgb(0 0 0 / 0.16)" },
            // aria-labelledby still names the dialog from its hidden title.
            "& > h2": { display: "none" },
            "& > div": {
              marginTop: 0,
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) 3rem",
            },
            "@media (max-width: 42rem)": {
              insetBlockStart: `max(${space(1.5)}, env(safe-area-inset-top))`,
            },
          }),
          on("keydown", (event) => {
            if (
              event.defaultPrevented ||
              event.isComposing ||
              event.keyCode === 229 ||
              event.altKey ||
              event.ctrlKey ||
              event.metaKey
            )
              return;
            const { key, target, currentTarget } = event;
            if (key !== "Tab" && key !== "ArrowDown" && key !== "ArrowUp")
              return;
            const input = currentTarget.querySelector("input")!;
            const buttons = Array.from(
              currentTarget.querySelectorAll<HTMLButtonElement>("li button"),
            );
            const index = buttons.findIndex((button) => button === target);
            const last = buttons.at(-1) ?? input;
            if (key === "Tab" && target !== input && index < 0) {
              // Pointer or assistive technology may have focused the close button.
              event.preventDefault();
              input.focus();
            } else if (key === "Tab") {
              // The native modal makes the page inert, but Chrome can still tab to its toolbar.
              if (event.shiftKey ? target !== input : target !== last) return;
              event.preventDefault();
              (event.shiftKey ? last : input).focus();
            } else if (target === input || index >= 0) {
              event.preventDefault();
              const next =
                key === "ArrowDown"
                  ? index + 1
                  : (index < 0 ? buttons.length : index) - 1;
              if (buttons.length)
                buttons[(next + buttons.length) % buttons.length].focus();
            }
          }),
        ]}
      >
        <Input
          aria-label="Find a command or conversation"
          placeholder="Search conversations…"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="go"
          role="searchbox"
          aria-controls={listId}
          value={query}
          mix={[
            css({
              minHeight: "3rem",
              fontSize: "1rem",
              paddingInline: space(2),
              border: 0,
              borderRadius: 0,
              boxShadow: "none",
              background: "transparent",
              "&[role=searchbox]:focus-visible": {
                outline: "2px solid transparent",
                outlineOffset: "-2px",
                backgroundImage:
                  "linear-gradient(var(--hui-focus), var(--hui-focus))",
                backgroundRepeat: "no-repeat",
                backgroundSize: "2px 1.1em",
                backgroundPosition: "0.375rem center",
                "@media (forced-colors: active)": { outlineColor: "Highlight" },
              },
            }),
            on("input", (event) => {
              query = event.currentTarget.value;
              void handle.update();
            }),
            on("keydown", (event) => {
              if (
                event.key !== "Enter" ||
                event.isComposing ||
                event.keyCode === 229
              )
                return;
              event.preventDefault();
              if (!event.repeat && matches[0]) select(matches[0].id);
            }),
          ]}
        />
        <DialogClose
          label="Close command palette"
          close={close}
          tabIndex={-1}
        />
        <ul
          id={listId}
          aria-label="Commands and conversations"
          tabIndex={-1}
          mix={css({
            gridColumn: "1 / -1",
            borderBlockStart: "1px solid var(--hui-border)",
            listStyle: "none",
            margin: 0,
            padding: 0,
            maxHeight: "min(60dvh, 29rem)",
            overflow: "auto",
            overscrollBehavior: "contain",
          })}
        >
          {Array.from(groupMatches(matches), (group) => (
            <li key={group.root.id}>
              {renderResult(group.root)}
              {group.children.length > 0 && (
                <ul
                  aria-label={`Conversations in ${group.root.label}`}
                  mix={css({ listStyle: "none", margin: 0, padding: 0 })}
                >
                  {group.children.map((item) => (
                    <li key={item.id}>{renderResult(item)}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
        {!matches.length && (
          <Text
            role="status"
            tone="muted"
            mix={css({ gridColumn: "1 / -1", margin: 0, padding: space(2) })}
          >
            {search
              ? "No matching commands or conversations."
              : "No recent conversations. Type to search all sessions."}
          </Text>
        )}
      </Dialog>
    );
  };
}
