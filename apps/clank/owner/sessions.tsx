import { validSlug, canonicalSessionRedirect } from "./routes.ts";
import {
  SESSION_LIST_PATH,
  sessionKey,
  findSession,
  sessionPath,
} from "./routes.ts";
import { SessionList } from "./session-list.tsx";
import { age, isRecent } from "./sidebar-time.ts";
import { Dialog } from "@harrhy/ui/interactive";
import {
  Menu,
  MenuTrigger,
  MenuContent,
  MenuItem,
} from "@harrhy/ui/interactive";
import { BrandMark } from "./brand-mark.tsx";
import { documentBranding, modes, themeKey, type Mode } from "./appearance.ts";
import { Icon } from "./icons.tsx";
import { Switcher, type PaletteItem } from "./switcher.tsx";
import { byRecentActivity } from "../../pi/plugins/subagents/contract.ts";
import { Conversation } from "./conversation.tsx";
import { Button, Checkbox, Heading, Input, Text } from "@harrhy/ui/native";
import {
  clientEntry,
  css,
  on,
  ref,
  type Handle,
  type RemixNode,
} from "remix/component";
import {
  followCatalog,
  MAX_TITLE,
  type Catalog,
  type Row,
  type Snapshot,
} from "./catalog.ts";

const phone = "@media (max-width: 40rem)";
const line = "1px solid var(--hui-border)";
const shell = css({
  height: "100dvh",
  overflow: "hidden",
  display: "grid",
  gridTemplateColumns: "clamp(220px, 22vw, 300px) minmax(0, 1fr)",
  "& .session-list, & .session-detail": { display: "grid" },
  "& .sessions-back": { display: "none" },
  "@media (min-width: 40.001rem)": {
    "&[data-sidebar=hidden]": {
      gridTemplateColumns: "minmax(0,1fr)",
      "& .session-list": { display: "none" },
    },
  },
  [phone]: {
    "& .sessions-back": { display: "inline-flex" },
    "& .desktop-sidebar": { display: "none" },
    gridTemplateColumns: "minmax(0, 1fr)",
    "&[data-pane=list] .session-detail, &[data-pane=detail] .session-list": {
      display: "none",
    },
  },
});
const pane = css({
  gridTemplateColumns: "minmax(0, 1fr)",
  gridTemplateRows: "auto minmax(0, 1fr)",
  minWidth: 0,
  minHeight: 0,
});
const bar = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.5rem",
  minHeight: "52px",
  boxSizing: "border-box",
  paddingInline: "16px",
  borderBottom: line,
});
const scroll = css({ overflow: "auto", overscrollBehavior: "contain" });
const measure = css({
  maxWidth: "72ch",
  marginInline: "auto",
  padding: "24px 16px",
  overflowWrap: "anywhere",
});
const action = css({
  "--hui-control-height": "2rem",
  [phone]: { "--hui-control-height": "2.75rem" },
});
const titleStyle = css({
  margin: 0,
  fontSize: "15px",
  fontWeight: 600,
  overflowWrap: "anywhere",
});
const ageStyle = css({
  flexShrink: 0,
  marginInlineStart: "auto",
  paddingInlineEnd: "8px",
  color: "var(--hui-muted)",
  fontSize: "12px",
  fontWeight: 400,
  textAlign: "end",
  fontVariantNumeric: "tabular-nums",
});
const sessionButton = css({
  width: "var(--clank-session-row-width, 100%)",
  minHeight: "28px",
  justifyContent: "flex-start",
  fontSize: "14px",
  textAlign: "left",
  padding: "4px 10px",
  "& span": {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  "&[aria-pressed=true]": {
    backgroundColor: "var(--hui-selected-surface)",
    color: "var(--hui-selected-ink)",
    fontWeight: 600,
  },
  [phone]: { minHeight: "44px" },
});
const iconAction = css({
  width: "2rem",
  padding: 0,
  minHeight: "2rem",
  flex: "none",
  [phone]: { width: "2.75rem", minHeight: "2.75rem" },
});
const sessionTitle = (row: Row) => row.title || "Untitled session";

function SessionTitle(
  handle: Handle<{ row: Row; rename?: Catalog["rename"]; controls: RemixNode }>,
) {
  let edit: { draft: string; saving: boolean; error?: string } | undefined;
  let editButton: HTMLButtonElement | undefined;
  const focusButton = ref<HTMLButtonElement>((node) => {
    editButton = node;
  });
  const focusInput = ref<HTMLInputElement>((node) => {
    node.focus();
    node.select();
  });
  async function finish() {
    edit = undefined;
    await handle.update();
    editButton?.focus();
  }
  async function save() {
    if (!edit || edit.saving) return;
    const title = edit.draft.trim();
    if (!title || title.length > MAX_TITLE) {
      edit.error = `Enter a title between 1 and ${MAX_TITLE} characters.`;
      await handle.update();
      return;
    }
    if (title === handle.props.row.title) return finish();
    edit.saving = true;
    edit.error = undefined;
    void handle.update();
    try {
      if (!handle.props.rename) return;
      await handle.props.rename(handle.props.row.id, title);
    } catch {
      if (handle.signal.aborted) return;
      edit.saving = false;
      edit.error = "Could not rename this session. Try again.";
      await handle.update();
      return;
    }
    if (!handle.signal.aborted) await finish();
  }
  return () => {
    const { row } = handle.props;
    const title = sessionTitle(row);
    return (
      <>
        {edit ? (
          <form
            mix={[
              css({ width: "100%", paddingBlock: "0.25rem" }),
              on("submit", (event) => {
                event.preventDefault();
                void save();
              }),
              on("keydown", (event) => {
                if (event.key === "Escape" && !edit?.saving) {
                  event.preventDefault();
                  void finish();
                }
              }),
            ]}
          >
            <div
              mix={css({
                display: "flex",
                alignItems: "center",
                gap: "0.375rem",
              })}
            >
              <Input
                aria-label="Session title"
                defaultValue={edit.draft}
                maxLength={MAX_TITLE}
                readOnly={edit.saving}
                aria-invalid={edit.error ? true : undefined}
                mix={[
                  action,
                  css({ minWidth: 0, flex: 1 }),
                  focusInput,
                  on("input", (event) => {
                    if (edit) edit.draft = event.currentTarget.value;
                  }),
                ]}
              />
              <Button
                type="submit"
                variant="primary"
                disabled={edit.saving}
                mix={action}
              >
                {edit.saving ? "Saving…" : "Save"}
              </Button>
              <Button
                variant="quiet"
                disabled={edit.saving}
                mix={[action, on("click", finish)]}
              >
                Cancel
              </Button>
            </div>
            {edit.error && <Text role="alert">{edit.error}</Text>}
          </form>
        ) : (
          <>
            <Heading level={2} mix={titleStyle}>
              {title}
            </Heading>
            <div
              mix={css({
                display: "flex",
                alignItems: "center",
                gap: "4px",
                marginInlineStart: "auto",
                flex: "none",
              })}
            >
              {handle.props.controls}
              <Menu label="Session tools">
                <MenuTrigger
                  aria-label="Session tools"
                  disabled={!handle.props.rename}
                  mix={[iconAction, focusButton]}
                >
                  <Icon name="more" />
                </MenuTrigger>
                <MenuContent
                  onSelect={() => {
                    edit = { draft: row.title, saving: false };
                    void handle.update();
                  }}
                >
                  <MenuItem name="rename">Rename</MenuItem>
                </MenuContent>
              </Menu>
            </div>
          </>
        )}
      </>
    );
  };
}

type View =
  | { kind: "loading" | "sign-in" | "offline" }
  | { kind: "ready"; catalog: Catalog };

export const OwnerSessions = clientEntry(
  "/owner-sessions.js#OwnerSessions",
  function OwnerSessions(
    handle: Handle<{
      familiarId?: string;
      snapshot?: string;
      renderedAt: number;
      listPage?: boolean;
      target?: string;
    }>,
  ) {
    let seed = handle.props.snapshot
      ? (JSON.parse(handle.props.snapshot) as Snapshot)
      : undefined;
    let now = handle.props.renderedAt;
    let listPage = Boolean(handle.props.listPage);
    let target = handle.props.target;
    function canonicalize(row: Row | undefined) {
      const path = canonicalSessionRedirect(target, row);
      if (!path) return;
      history.replaceState(history.state, "", path + location.hash);
      target = sessionKey(path);
    }
    let listQuery = "";
    let listScroll = 0;
    function showList() {
      if (!listPage) {
        history.replaceState(
          { clankSession: selectedId, branch, agentId, detailOpen },
          "",
        );
        history.pushState(null, "", SESSION_LIST_PATH);
      }
      listPage = true;
      target = undefined;
      detailOpen = true;
      newOpen = false;
      void handle.update();
    }
    let sidebar = true;
    let switching = false;
    let switchFrom: HTMLElement | undefined;
    let settings = false;
    let mode: Mode = "system";
    function setMode(next: Mode) {
      mode = next;
      if (next === "system") delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem(themeKey, next);
      } catch {}
      void handle.update();
    }
    let showMetadata = true;
    let sidebarButton: HTMLButtonElement | undefined;
    const sidebarRef = ref<HTMLButtonElement>((node) => {
      sidebarButton = node;
    });
    async function toggleSidebar() {
      sidebar = !sidebar;
      await handle.update();
      sidebarButton?.focus();
    }
    function startSwitch() {
      switchFrom =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : undefined;
      switching = true;
      void handle.update();
    }
    function closeSwitch() {
      switching = false;
      void handle.update().then(() => {
        if (switchFrom?.isConnected) switchFrom.focus();
        switchFrom = undefined;
      });
    }
    let branch: number | undefined;
    let editDraft:
      | { session: string; conversation: number; text: string }
      | undefined;
    let agentId: number | undefined;
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
    async function open(id: string, child?: number, from?: HTMLButtonElement) {
      const row = (
        view.kind === "ready" ? view.catalog.rows : cached?.rows
      )?.find((item) => item.id === id);
      if (!row) return;
      const path = sessionPath(row);
      if (location.pathname !== path || history.state?.agentId !== child) {
        history.replaceState(
          { clankSession: selectedId, branch, agentId, detailOpen },
          "",
        );
        history.pushState(
          { clankSession: id, agentId: child, detailOpen: true },
          "",
          path,
        );
      }
      listPage = false;
      target = sessionKey(path);
      if (id !== seed?.selectedId || child !== undefined) seed = undefined;
      trigger = from;
      switchFrom = undefined;
      if (child !== undefined) expanded.add(id);
      switching = false;
      selectedId = id;
      branch = undefined;
      agentId = child;
      newOpen = false;
      detailOpen = true;
      await handle.update();
      if (!from || matchMedia("(max-width: 40rem)").matches)
        detailHeader?.focus();
    }
    const conversationSelect = [
      css({
        minWidth: 0,
        "& select": {
          maxWidth: "min(36vw, 13rem)",
          minHeight: "2rem",
          font: "inherit",
          color: "inherit",
          background: "var(--hui-surface)",
          border: line,
          borderRadius: "4px",
          paddingInline: "6px",
        },
      }),
      ref<HTMLLabelElement>((node, signal) => {
        node.addEventListener(
          "change",
          (event) => {
            if (
              !(event.target instanceof HTMLSelectElement) ||
              view.kind !== "ready"
            )
              return;
            const id = Number(event.target.value);
            const row = view.catalog.rows.find(
              (item) => item.id === selectedId,
            );
            if (!row) return;
            const child = view.catalog.children[row.id]?.find(
              (candidate) =>
                candidate.conversationId === id &&
                !candidate.archived &&
                candidate.kind !== "agent",
            );
            agentId = child?.conversationId;
            branch =
              !child &&
              row.branches.some((item) => item.conversation === id) &&
              id !== row.main
                ? id
                : undefined;
            if (child) expanded.add(row.id);
            void handle.update();
          },
          { signal },
        );
      }),
    ];
    let creating = false;
    let newOpen = false;
    let createError = "";
    let createSlug = "";
    let newTitle: HTMLInputElement | undefined;
    const captureNewTitle = ref<HTMLInputElement>((node) => {
      newTitle = node;
    });
    async function startNew(from?: HTMLButtonElement) {
      trigger = from;
      switchFrom = undefined;
      switching = false;
      newOpen = true;
      createSlug = "";
      createError = "";
      await handle.update();
      newTitle?.focus();
    }
    let selectedId = seed?.selectedId;
    let detailOpen = listPage || Boolean(target);
    let detailHeader: HTMLDivElement | undefined;
    let trigger: HTMLButtonElement | undefined;
    const captureDetail = ref<HTMLDivElement>((node) => {
      detailHeader = node;
    });
    async function back() {
      detailOpen = false;
      newOpen = false;
      await handle.update();
      trigger?.focus();
    }
    let cached: Snapshot | undefined = seed;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let retryDelay = 500;
    let view: View = { kind: "loading" };
    let signingIn = false;
    let signInError = "";
    let attempt: AbortController | undefined;
    async function connect() {
      clearTimeout(retry);
      attempt?.abort();
      const current = new AbortController();
      attempt = current;
      const signal = current.signal;
      const applyBranding = documentBranding(document);
      signal.addEventListener(
        "abort",
        () => {
          applyBranding();
          if (view.kind === "ready" && view.catalog.branding) {
            view.catalog.branding = undefined;
            if (!handle.signal.aborted) void handle.update();
          }
        },
        { once: true },
      );
      async function show(next: View) {
        if (signal.aborted) return;
        applyBranding(
          next.kind === "ready" ? next.catalog.branding : undefined,
        );
        if (next.kind === "sign-in") {
          cached = seed = undefined;
          switching = settings = newOpen = false;
          createSlug = "";
        }
        if (next.kind === "ready") {
          retryDelay = 500;
          const catalog = next.catalog;
          if (!catalog.childrenReady && cached)
            catalog.children = cached.children;
          if (catalog.activeIds === undefined)
            catalog.activeIds = cached?.activeIds;
          cached = {
            rows: catalog.rows,
            children: catalog.children,
            activeIds: catalog.activeIds,
          };
        }
        view = next;
        if (next.kind === "ready" && target) {
          const row = findSession(next.catalog.rows, target);
          selectedId = row?.id;
          canonicalize(row);
        } else if (
          next.kind === "ready" &&
          !next.catalog.rows.some((row) => row.id === selectedId)
        ) {
          selectedId =
            next.catalog.rows.find((row) => row.id === handle.props.familiarId)
              ?.id ?? next.catalog.rows[0]?.id;
          branch = undefined;
          agentId = undefined;
          detailOpen = listPage;
          trigger = undefined;
        }
        await handle.update();
      }
      if (view.kind !== "offline") void show({ kind: "loading" });
      try {
        const response = await fetch("/owner/check", {
          cache: "no-store",
          credentials: "same-origin",
          redirect: "error",
          signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
        });
        if (response.status === 401 || response.status === 403)
          return await show({ kind: "sign-in" });
        if (!response.ok) throw Error("Pi unavailable");
        const status = (await response.json()) as { owner?: unknown } | null;
        if (status?.owner !== true) throw Error("Pi owner check failed");
        if (signal.aborted) return;
        await followCatalog(signal, (catalog) =>
          show({ kind: "ready", catalog }),
        );
      } catch {
        // A failed upgrade and an unreachable Pi look the same to the browser.
      }
      await show({ kind: "offline" });
      if (!signal.aborted) {
        retry = setTimeout(() => void connect(), retryDelay);
        retryDelay = Math.min(8000, retryDelay * 2);
      }
    }
    const mount = ref((_node, signal) => {
      const initial = document.documentElement.dataset.theme;
      if (initial === "light" || initial === "dark") {
        mode = initial;
        void handle.update();
      }
      try {
        listQuery = sessionStorage.getItem("clank:session-list-query") ?? "";
      } catch {}
      if (listPage) void handle.update();
      window.addEventListener(
        "popstate",
        (event) => {
          listPage = location.pathname === SESSION_LIST_PATH;
          target = sessionKey(location.pathname);
          const state = event.state;
          const catalog = view.kind === "ready" ? view.catalog : cached;
          const match =
            target && catalog ? findSession(catalog.rows, target) : undefined;
          if (view.kind === "ready") canonicalize(match);
          selectedId = target
            ? match?.id
            : (catalog?.rows.find((row) => row.id === state?.clankSession)
                ?.id ??
              catalog?.rows.find((row) => row.id === handle.props.familiarId)
                ?.id ??
              catalog?.rows[0]?.id);
          branch =
            selectedId && selectedId === state?.clankSession
              ? state.branch
              : undefined;
          agentId =
            selectedId && selectedId === state?.clankSession
              ? state.agentId
              : undefined;
          detailOpen =
            listPage || Boolean(target) || Boolean(state?.detailOpen);
          newOpen = false;
          void handle.update();
        },
        { signal },
      );
      const clock = setInterval(() => {
        now = Date.now();
        void handle.update();
      }, 60_000);
      signal.addEventListener("abort", () => clearInterval(clock), {
        once: true,
      });
      try {
        showMetadata =
          localStorage.getItem("clank:composer-metadata") !== "hidden";
      } catch {}
      void connect();
      window.addEventListener(
        "keydown",
        (event) => {
          if (
            view.kind !== "ready" ||
            event.defaultPrevented ||
            event.isComposing ||
            event.repeat ||
            event.altKey ||
            event.shiftKey ||
            event.ctrlKey === event.metaKey ||
            event.key.toLowerCase() !== "k"
          )
            return;
          event.preventDefault();
          if (settings) return;
          if (switching) closeSwitch();
          else startSwitch();
        },
        { signal },
      );
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(retry);
          attempt?.abort();
        },
        { once: true },
      );
      window.addEventListener(
        "pagehide",
        () => {
          clearTimeout(retry);
          attempt?.abort();
        },
        { signal },
      );
      window.addEventListener(
        "pageshow",
        (event) => {
          if (event.persisted) void connect();
        },
        { signal },
      );
    });
    return () => {
      const doc = sidebarList?.ownerDocument;
      const focused = doc?.activeElement;
      if (
        doc &&
        focused instanceof HTMLElement &&
        sidebarList?.contains(focused)
      ) {
        // A keyed row survives a move, but moving it can drop DOM focus.
        handle.queueTask(() => {
          if (
            doc.activeElement === doc.body &&
            focused.isConnected &&
            focused.getClientRects().length
          ) {
            focused.focus({ preventScroll: true });
          }
        });
      }
      const live = view.kind === "ready" ? view.catalog : undefined;
      const catalog = live ?? cached;
      const selected = catalog?.rows.find((item) => item.id === selectedId);
      const familiar = catalog?.rows.find(
        (row) => row.id === handle.props.familiarId,
      );
      const rows = [
        ...(familiar ? [familiar] : []),
        null,
        ...(catalog?.rows.filter((row) => row !== familiar) ?? []),
      ];
      const activeIds = new Set(catalog?.activeIds ?? seed?.activeIds);
      const older = rows.filter((row): row is Row =>
        Boolean(
          row &&
          row !== familiar &&
          !activeIds.has(row.id) &&
          !isRecent(row, selectedId, now),
        ),
      );
      const olderIds = new Set(older.map((row) => row.id));
      const sidebarRows = rows.filter((row) => !row || !olderIds.has(row.id));
      const children = (id: string) =>
        (catalog?.children[id] ?? [])
          .filter((child) => child.kind !== "agent" && !child.archived)
          .toSorted(byRecentActivity);
      const choices: (PaletteItem & {
        target?: { session: string; conversation?: number };
      })[] = [
        { id: "new", label: "New session", detail: "Command" },
        ...rows.flatMap((row) => {
          if (!row) return [];
          const label = row === familiar ? "Familiar" : sessionTitle(row);
          return [
            {
              id: `session:${row.id}`,
              label,
              detail: "Session",
              target: { session: row.id },
            },
            ...children(row.id).map((child) => ({
              id: `subagent:${row.id}:${child.conversationId}`,
              label: child.name,
              detail: `${label} · Subagent`,
              target: { session: row.id, conversation: child.conversationId },
            })),
          ];
        }),
      ];
      const selectedChild =
        selected &&
        children(selected.id).find((child) => child.conversationId === agentId);
      const conversation =
        selected &&
        (agentId === undefined
          ? (branch ?? selected.main)
          : selectedChild?.conversationId);
      return (
        <main
          aria-label="Clank"
          data-sidebar={sidebar ? "shown" : "hidden"}
          data-pane={
            (!catalog && view.kind !== "loading") ||
            newOpen ||
            (detailOpen && (selected || listPage || target))
              ? "detail"
              : "list"
          }
          mix={[mount, shell]}
        >
          {catalog && (
            <Switcher
              open={switching}
              items={choices}
              close={closeSwitch}
              select={(id) => {
                const choice = choices.find((item) => item.id === id);
                if (!choice || !live) return;
                if (choice.target)
                  void open(choice.target.session, choice.target.conversation);
                else void startNew();
              }}
            />
          )}
          {catalog && (
            <Dialog
              open={settings}
              title="Settings"
              description="Preferences for Clank on this browser."
              mix={css({
                width: "min(28rem, calc(100% - 2rem))",
                boxSizing: "border-box",
              })}
              onClose={() => {
                settings = false;
                void handle.update();
              }}
            >
              <fieldset
                mix={css({ margin: "0 0 1.25rem", padding: 0, border: 0 })}
              >
                <legend mix={css({ fontWeight: 600, marginBottom: "8px" })}>
                  Appearance
                </legend>
                <div
                  mix={css({
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "8px 16px",
                  })}
                >
                  {modes.map((choice) => (
                    <label
                      key={choice}
                      mix={css({
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                        minHeight: "32px",
                      })}
                    >
                      <input
                        type="radio"
                        name="clank-theme"
                        checked={mode === choice}
                        mix={on("change", () => setMode(choice))}
                      />
                      {choice[0].toUpperCase() + choice.slice(1)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset
                mix={css({
                  margin: "0 0 1rem",
                  padding: "12px 0 0",
                  border: 0,
                  borderTop: line,
                })}
              >
                <legend mix={css({ fontWeight: 600, paddingInlineEnd: "8px" })}>
                  Display
                </legend>
                <label
                  mix={css({
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  })}
                >
                  <Checkbox
                    checked={showMetadata}
                    mix={on("change", (event) => {
                      showMetadata = event.currentTarget.checked;
                      try {
                        localStorage.setItem(
                          "clank:composer-metadata",
                          showMetadata ? "shown" : "hidden",
                        );
                      } catch {}
                      void handle.update();
                    })}
                  />{" "}
                  Show composer metadata
                </label>
              </fieldset>
              <Button
                variant="quiet"
                mix={on("click", () => {
                  settings = false;
                  void handle.update();
                })}
              >
                Done
              </Button>
            </Dialog>
          )}
          <aside
            id="clank-sidebar"
            class="session-list"
            aria-label="Session list"
            mix={[
              pane,
              css({
                borderRight: line,
                gridTemplateRows: "auto minmax(0, 1fr) auto",
                [phone]: { borderRight: 0 },
              }),
            ]}
          >
            <div mix={bar}>
              <BrandMark logo={live?.branding?.logo} />
              <div mix={css({ display: "flex", gap: "2px" })}>
                {catalog && (
                  <Button
                    variant="quiet"
                    aria-label="Switch session"
                    title="Switch session (⌘/Ctrl+K)"
                    mix={[iconAction, on("click", startSwitch)]}
                  >
                    <Icon name="search" />
                  </Button>
                )}
                <span class="desktop-sidebar">
                  <Button
                    variant="quiet"
                    aria-label="Hide sidebar"
                    aria-expanded={true}
                    aria-controls="clank-sidebar"
                    mix={[iconAction, sidebarRef, on("click", toggleSidebar)]}
                  >
                    <Icon name="sidebar" />
                  </Button>
                </span>
              </div>
            </div>
            <div mix={scroll}>
              {view.kind === "loading" && !catalog && !detailOpen && (
                <Text tone="muted" role="status" mix={measure}>
                  Connecting to Pi…
                </Text>
              )}
              {catalog?.rows.length === 0 && (
                <Text tone="muted" mix={measure}>
                  No active sessions.
                </Text>
              )}
              {catalog && (
                <ul
                  mix={[
                    sidebarListRef,
                    css({
                      listStyle: "none",
                      margin: 0,
                      padding: "6px 6px",
                      display: "grid",
                      gap: "2px",
                    }),
                  ]}
                >
                  {sidebarRows.flatMap((row) => {
                    if (row) {
                      const agents = children(row.id);
                      const isOpen = expanded.has(row.id);
                      const label =
                        row === familiar ? "Familiar" : sessionTitle(row);
                      const listId = `agents-${row.id}`;
                      return [
                        <li key={row.id}>
                          <div
                            mix={css({
                              display: "flex",
                              alignItems: "center",
                              borderRadius: "var(--hui-control-radius)",
                              "&:has(> button[aria-pressed=true])": {
                                background: "var(--hui-selected-surface)",
                              },
                              "& > button[aria-pressed]": {
                                "--clank-session-row-width": "auto",
                                minWidth: 0,
                                paddingInlineEnd: "4px",
                              },
                            })}
                          >
                            <Button
                              variant="quiet"
                              aria-pressed={
                                row.id === selectedId && agentId === undefined
                              }
                              title={sessionTitle(row)}
                              mix={[
                                sessionButton,
                                on("click", (event) =>
                                  open(row.id, undefined, event.currentTarget),
                                ),
                              ]}
                            >
                              <span>{label}</span>
                            </Button>
                            {agents.length > 0 && (
                              <Button
                                variant="quiet"
                                aria-label={`Subagents for ${label}`}
                                aria-expanded={isOpen}
                                aria-controls={listId}
                                mix={[
                                  iconAction,
                                  css({ color: "var(--hui-muted)" }),
                                  on("click", (event) =>
                                    toggleSubagents(
                                      row.id,
                                      event.currentTarget,
                                    ),
                                  ),
                                ]}
                              >
                                <Icon name={isOpen ? "down" : "right"} />
                              </Button>
                            )}
                            <span aria-hidden="true" mix={ageStyle}>
                              {age(row.updatedAt, now)}
                            </span>
                          </div>
                          {agents.length > 0 && (
                            <ul
                              id={listId}
                              hidden={!isOpen}
                              mix={[
                                css({
                                  listStyle: "none",
                                  margin: "4px 0",
                                  paddingInlineStart: "24px",
                                }),
                                on("keydown", (event) => {
                                  if (
                                    event.key !== "Escape" ||
                                    event.defaultPrevented
                                  )
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
                                  <Button
                                    variant="quiet"
                                    aria-pressed={
                                      row.id === selectedId &&
                                      agentId === child.conversationId
                                    }
                                    mix={[
                                      sessionButton,
                                      css({
                                        color: "var(--hui-muted)",
                                        fontSize: "13px",
                                      }),
                                      on("click", (event) =>
                                        open(
                                          row.id,
                                          child.conversationId,
                                          event.currentTarget,
                                        ),
                                      ),
                                    ]}
                                  >
                                    <span>
                                      {child.name}
                                      {child.archived ? " · Archived" : ""}
                                    </span>
                                    {child.updatedAt !== undefined && (
                                      <span aria-hidden="true" mix={ageStyle}>
                                        {age(child.updatedAt, now)}
                                      </span>
                                    )}
                                  </Button>
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
                          marginBlockEnd: "6px",
                          paddingBlockEnd: "4px",
                          borderBottom: line,
                        })}
                      >
                        <Button
                          variant="quiet"
                          mix={[
                            sessionButton,
                            on("click", (event) =>
                              startNew(event.currentTarget),
                            ),
                          ]}
                        >
                          <Icon name="plus" /> New session
                        </Button>
                      </li>
                    );
                  })}
                  {older.length > 0 && (
                    <li>
                      <a
                        href={SESSION_LIST_PATH}
                        aria-current={listPage ? "page" : undefined}
                        mix={[
                          css({
                            display: "block",
                            padding: "6px 10px",
                            color: "var(--hui-muted)",
                            textDecoration: "none",
                            borderRadius: "4px",
                            fontSize: "14px",
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
                            showList();
                          }),
                        ]}
                      >
                        {older.length} older
                      </a>
                    </li>
                  )}
                </ul>
              )}
            </div>
            {catalog && (
              <footer
                mix={css({
                  borderTop: line,
                  padding: "4px 8px",
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "4px",
                })}
              >
                <Button
                  variant="quiet"
                  aria-label="Settings"
                  title="Settings"
                  mix={[
                    iconAction,
                    on("click", () => {
                      settings = true;
                      void handle.update();
                    }),
                  ]}
                >
                  <Icon name="settings" />
                </Button>
                <Button
                  variant="quiet"
                  aria-label="Cycle color theme"
                  title={`Theme: ${mode}`}
                  mix={[
                    iconAction,
                    on("click", () =>
                      setMode(modes[(modes.indexOf(mode) + 1) % modes.length]),
                    ),
                  ]}
                >
                  <Icon
                    name={
                      mode === "system"
                        ? "theme"
                        : mode === "light"
                          ? "sun"
                          : "moon"
                    }
                  />
                </Button>
              </footer>
            )}
          </aside>
          <section
            class="session-detail"
            aria-label="Session detail"
            mix={pane}
          >
            <div
              tabindex={-1}
              mix={[
                bar,
                captureDetail,
                css({
                  justifyContent: "flex-start",
                  gap: "4px",
                  "& h2": {
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  },
                  paddingBlock: "4px",
                  "&:focus-visible": { outlineOffset: "-2px" },
                }),
              ]}
            >
              {view.kind === "offline" && (
                <span
                  role="status"
                  mix={css({
                    fontSize: "12px",
                    color: "var(--hui-danger, #9c3030)",
                  })}
                >
                  Offline
                </span>
              )}
              {(selected || newOpen || listPage || target) && (
                <span class="sessions-back">
                  <Button
                    variant="quiet"
                    aria-label="Show sessions"
                    aria-controls="clank-sidebar"
                    mix={[iconAction, on("click", back)]}
                  >
                    <Icon name="drawer" />
                  </Button>
                </span>
              )}
              {catalog && !sidebar && (
                <span class="desktop-sidebar">
                  <Button
                    variant="quiet"
                    aria-label="Show sidebar"
                    aria-expanded={false}
                    aria-controls="clank-sidebar"
                    mix={[iconAction, sidebarRef, on("click", toggleSidebar)]}
                  >
                    <Icon name="sidebar" />
                  </Button>
                </span>
              )}
              {listPage && !newOpen && catalog ? (
                <div>
                  <Heading level={2} mix={titleStyle}>
                    Sessions
                  </Heading>
                  <Text tone="muted" mix={css({ margin: 0, fontSize: "12px" })}>
                    Sessions without activity in the last 3 days are dimmed; the
                    sidebar shows the others.
                  </Text>
                </div>
              ) : newOpen ? (
                <Heading level={2} mix={titleStyle}>
                  New session
                </Heading>
              ) : selected && catalog ? (
                <SessionTitle
                  key={selected.id}
                  row={selected}
                  rename={live?.rename}
                  controls={
                    conversation && (
                      <label mix={conversationSelect}>
                        <select aria-label="Conversation">
                          <option
                            value={String(selected.main)}
                            selected={conversation === selected.main}
                          >
                            Main
                          </option>
                          {selected.branches
                            .filter(
                              (item) => item.conversation !== selected.main,
                            )
                            .map((item) => (
                              <option
                                key={item.conversation}
                                value={String(item.conversation)}
                                selected={conversation === item.conversation}
                              >
                                {item.label ??
                                  `Conversation ${item.conversation}`}
                              </option>
                            ))}
                          {children(selected.id).map((child) => (
                            <option
                              key={child.conversationId}
                              value={String(child.conversationId)}
                              selected={conversation === child.conversationId}
                            >
                              {child.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )
                  }
                />
              ) : (
                <Heading level={2} mix={titleStyle}>
                  {view.kind === "sign-in" ? "Sign in to Pi" : "Sessions"}
                </Heading>
              )}
            </div>
            {newOpen && catalog ? (
              <div mix={scroll}>
                <div mix={measure}>
                  <form
                    mix={[
                      css({
                        display: "grid",
                        gap: "12px",
                        maxWidth: "30rem",
                        "& label": { display: "grid", gap: "4px" },
                        "& button": { justifySelf: "start" },
                      }),
                      on("submit", async (event) => {
                        event.preventDefault();
                        if (creating || !live) return;
                        const form = new FormData(event.currentTarget);
                        const cwd = String(form.get("cwd") ?? "").trim();
                        const title = String(form.get("title") ?? "").trim();
                        if (!cwd || !title) return;
                        const slug =
                          String(form.get("slug") ?? createSlug) || undefined;
                        if (slug && (!live.canCreateSlug || !validSlug(slug))) {
                          createError = live.canCreateSlug
                            ? "Use lowercase letters, numbers, and single hyphens. UUIDs are reserved."
                            : "This Pi does not support URL names.";
                          void handle.update();
                          return;
                        }
                        creating = true;
                        createError = "";
                        void handle.update();
                        try {
                          const row = await live.create(cwd, title, slug);
                          const path = sessionPath(row);
                          history.pushState(
                            { clankSession: row.id, detailOpen: true },
                            "",
                            path,
                          );
                          target = sessionKey(path);
                          listPage = false;
                          selectedId = row.id;
                          branch = undefined;
                          agentId = undefined;
                          newOpen = false;
                          detailOpen = true;
                        } catch (error) {
                          createError =
                            error &&
                            typeof error === "object" &&
                            "code" in error &&
                            error.code === "session_slug_taken"
                              ? "That URL name is already taken."
                              : "Could not confirm session creation. Check the working directory and session list before retrying.";
                        } finally {
                          creating = false;
                          if (!handle.signal.aborted) void handle.update();
                        }
                      }),
                    ]}
                  >
                    <label>
                      Title{" "}
                      <Input
                        name="title"
                        required
                        maxLength={MAX_TITLE}
                        mix={captureNewTitle}
                      />
                    </label>
                    <label>
                      Working directory{" "}
                      <Input name="cwd" required defaultValue={selected?.cwd} />
                    </label>
                    {(live?.canCreateSlug || createSlug) && (
                      <label>
                        URL name (optional)
                        <Input
                          name="slug"
                          maxLength={64}
                          value={createSlug}
                          autoComplete="off"
                          spellCheck={false}
                          mix={on("input", (event) => {
                            createSlug = event.currentTarget.value;
                            void handle.update();
                          })}
                        />
                        <Text tone="muted">
                          Fixed once created. Leave blank to use the session ID.
                        </Text>
                      </label>
                    )}
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={creating || !live}
                    >
                      {creating ? "Creating…" : "Create session"}
                    </Button>
                    {createError && <Text role="alert">{createError}</Text>}
                  </form>
                </div>
              </div>
            ) : listPage && catalog ? (
              <SessionList
                rows={catalog.rows}
                aged={olderIds}
                now={now}
                search={live?.search}
                initialQuery={listQuery}
                scrollTop={listScroll}
                saveScroll={(value) => {
                  listScroll = value;
                }}
                saveQuery={(query) => {
                  listQuery = query;
                  try {
                    sessionStorage.setItem("clank:session-list-query", query);
                  } catch {}
                }}
                open={(id, child) => {
                  const row = catalog.rows.find((item) => item.id === id);
                  if (child === undefined || child === row?.main) {
                    void open(id);
                    return;
                  }
                  if (
                    children(id).some((agent) => agent.conversationId === child)
                  ) {
                    void open(id, child);
                    return;
                  }
                  void open(id);
                  branch = child;
                  void handle.update();
                }}
              />
            ) : selected && catalog && conversation ? (
              <Conversation
                key={`${selected.id}:${conversation}`}
                session={selected.id}
                conversation={conversation}
                chat={live?.chat}
                initialDraft={
                  editDraft?.session === selected.id &&
                  editDraft.conversation === conversation
                    ? editDraft.text
                    : undefined
                }
                consumeDraft={() => {
                  editDraft = undefined;
                }}
                canEdit={!selectedChild && conversation === selected.main}
                editMessage={
                  live && !selectedChild && conversation === selected.main
                    ? async (entry) => {
                        const result = await live.editMessage(
                          selected.id,
                          entry,
                        );
                        if (selectedId !== selected.id || agentId !== undefined)
                          return;
                        if (result.text !== null)
                          editDraft = {
                            session: selected.id,
                            conversation: result.conversation,
                            text: result.text,
                          };
                        branch = result.conversation;
                        await handle.update();
                      }
                    : undefined
                }
                seed={
                  selected.id === seed?.selectedId &&
                  conversation ===
                    seed?.rows.find((row) => row.id === seed?.selectedId)?.main
                    ? seed?.chat
                    : undefined
                }
                showMetadata={showMetadata}
              />
            ) : (
              <div mix={scroll}>
                <div mix={measure}>
                  {catalog && target && !selected && (
                    <Text role="status">Session not found.</Text>
                  )}
                  {catalog && agentId !== undefined && !selectedChild && (
                    <>
                      <Text role="status">
                        This subagent is no longer listed.
                      </Text>
                      <Button
                        mix={on("click", () => {
                          agentId = undefined;
                          void handle.update();
                        })}
                      >
                        Back to main
                      </Button>
                    </>
                  )}
                  {view.kind === "loading" && !catalog && detailOpen && (
                    <Text tone="muted" role="status">
                      {target ? "Opening conversation…" : "Connecting to Pi…"}
                    </Text>
                  )}
                  {view.kind === "sign-in" && (
                    <form
                      data-rmx-document
                      method="post"
                      action="/owner/claim"
                      mix={on("submit", async (event) => {
                        event.preventDefault();
                        const form = event.currentTarget;
                        const token = String(
                          new FormData(form).get("token") ?? "",
                        ).trim();
                        if (!token || signingIn) return;
                        signingIn = true;
                        signInError = "";
                        void handle.update();
                        try {
                          const response = await fetch("/owner/claim", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ token }),
                            redirect: "error",
                            signal: AbortSignal.any([
                              handle.signal,
                              AbortSignal.timeout(8000),
                            ]),
                          });
                          if (response.ok) {
                            form.reset();
                            void connect();
                          } else {
                            signInError = "Token invalid or expired.";
                          }
                        } catch {
                          signInError = "Could not reach Pi. Try again.";
                        } finally {
                          signingIn = false;
                          if (!handle.signal.aborted) void handle.update();
                        }
                      })}
                    >
                      <label
                        mix={css({
                          display: "grid",
                          gap: "0.25rem",
                          maxWidth: "24rem",
                        })}
                      >
                        One-time token
                        <Input
                          name="token"
                          type="password"
                          autoComplete="off"
                          spellCheck={false}
                          required
                        />
                      </label>
                      <Button
                        type="submit"
                        variant="primary"
                        disabled={signingIn}
                        mix={css({ marginTop: "0.5rem" })}
                      >
                        {signingIn ? "Signing in…" : "Sign in"}
                      </Button>
                      {signInError && <Text role="alert">{signInError}</Text>}
                      <Text tone="muted">
                        Generate a one-time owner link for this origin on the Pi
                        host, then open it or paste its token here.
                      </Text>
                    </form>
                  )}
                  {view.kind === "offline" && !catalog && (
                    <>
                      <Text role="status">Disconnected from Pi.</Text>
                      <Button mix={on("click", connect)}>Retry</Button>
                    </>
                  )}
                  {catalog?.rows.length === 0 && (
                    <Text tone="muted">Session details will appear here.</Text>
                  )}
                </div>
              </div>
            )}
          </section>
        </main>
      );
    };
  },
);
