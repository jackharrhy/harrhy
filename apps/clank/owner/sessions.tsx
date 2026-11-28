import { validSlug, canonicalSessionRedirect } from "./routes.ts";
import {
  SESSION_LIST_PATH,
  sessionKey,
  findSession,
  sessionPath,
} from "./routes.ts";
import { ArchiveDialog } from "./archive-dialog.tsx";
import { RailRow } from "./rail-row.tsx";
import { SessionList } from "./session-list.tsx";
import { age, isRecent } from "./sidebar-time.ts";
import {
  Settings,
  defaultPreferences,
  readPreferences,
  savePreference,
} from "./settings.tsx";
import {
  Menu,
  MenuTrigger,
  MenuContent,
  MenuItem,
} from "@harrhy/ui/interactive";
import { BrandMark } from "./brand-mark.tsx";
import {
  documentBranding,
  hydratedTheme,
  modes,
  saveTheme,
  type Mode,
} from "./appearance.ts";
import { Icon } from "./icons.tsx";
import { Switcher, type PaletteItem } from "./switcher.tsx";
import {
  failureWords,
  runState,
} from "../../pi/plugins/sessions/sidebar/run-state.ts";
import {
  byRecentActivity,
  type Child,
} from "../../pi/plugins/subagents/contract.ts";
import { Conversation } from "./conversation.tsx";
import { Button, Heading, Input, Text } from "@harrhy/ui/native";
import { clientEntry, css, on, ref, type Handle } from "remix/component";
import {
  followCatalog,
  MAX_TITLE,
  type ArchiveTarget,
  type Catalog,
  type Row,
  type Snapshot,
} from "./catalog.ts";
import { mountRailSwipe, phoneWidth } from "./swipe.ts";

const phone = `@media ${phoneWidth}`;
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
    "& .session-list, & .session-detail": {
      gridArea: "1 / 1",
      touchAction: "pan-y pinch-zoom",
    },
    "& [aria-label=Transcript]": { touchAction: "pan-y pinch-zoom" },
    "&[data-sliding] .session-list, &[data-sliding] .session-detail": {
      pointerEvents: "none",
    },
    // Keep floating transcript controls behind the moving drawer.
    "&[data-sliding] .session-detail": { zIndex: 0 },
    "&[data-sliding] .session-list": {
      zIndex: 1,
      backgroundColor: "var(--hui-surface)",
    },
    "&:not([data-sliding])[data-pane=list] .session-detail, &:not([data-sliding])[data-pane=detail] .session-list":
      {
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
const scroll = css({
  overflow: "auto",
  overscrollBehavior: "contain",
  [phone]: { touchAction: "pan-y pinch-zoom" },
});
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
const sessionButton = css({
  width: "100%",
  fontWeight: 400,
  "&[data-variant=quiet]:hover": { background: "var(--hui-hover-surface)" },
  minHeight: "28px",
  justifyContent: "flex-start",
  fontSize: "14px",
  textAlign: "left",
  padding: "4px 10px",
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
  handle: Handle<{
    row: Row;
    rename?: Catalog["rename"];
    subtitle: string;
    switchConversation?: (from?: HTMLElement) => void;
  }>,
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
            <div
              mix={[
                css({
                  minWidth: 0,
                  flex: 1,
                }),
                on("dblclick", () =>
                  handle.props.switchConversation?.(editButton),
                ),
              ]}
            >
              <Heading level={1} mix={titleStyle}>
                <span
                  title={title}
                  mix={css({
                    display: "block",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    lineHeight: 1.3,
                  })}
                >
                  {title}
                </span>
              </Heading>
              <div
                title={handle.props.subtitle}
                mix={css({
                  fontSize: "11px",
                  lineHeight: 1.4,
                  color: "var(--hui-muted)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                })}
              >
                {handle.props.subtitle}
              </div>
            </div>
            <div
              mix={css({
                display: "flex",
                alignItems: "center",
                gap: "4px",
                marginInlineStart: "auto",
                flex: "none",
              })}
            >
              <Menu label="Session tools">
                <MenuTrigger
                  aria-label="Session tools"
                  disabled={!handle.props.rename}
                  mix={[
                    iconAction,
                    focusButton,
                    css({
                      "&[aria-haspopup]": {
                        background: "transparent",
                        borderColor: "transparent",
                        color: "var(--hui-muted)",
                      },
                      "&[aria-haspopup]:hover": {
                        background: "var(--hui-hover-surface)",
                      },
                    }),
                  ]}
                >
                  <Icon name="more" />
                </MenuTrigger>
                <MenuContent
                  onSelect={(item) => {
                    if (item.name === "conversations") {
                      handle.props.switchConversation?.(editButton);
                      return;
                    }
                    edit = { draft: row.title, saving: false };
                    void handle.update();
                  }}
                >
                  {handle.props.switchConversation && (
                    <MenuItem name="conversations">
                      Switch conversation…
                    </MenuItem>
                  )}
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

function childMarks(child: Child, busy: number[] | undefined) {
  const run = runState(
    child.failure,
    busy?.includes(child.conversationId) ?? false,
    undefined,
  );
  if (run.kind === "busy") return { running: 1 };
  if (run.kind === "failed")
    return { failure: run.detail ?? failureWords(run.reason) };
  return {};
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
      initialMode?: Mode;
      renderedAt: number;
      listPage?: boolean;
      target?: string;
    }>,
  ) {
    let seed = handle.props.snapshot
      ? (JSON.parse(handle.props.snapshot) as Snapshot)
      : undefined;
    // Seed this presentation once; reconnects must never replay old branding.
    let branding = seed?.branding;
    if (seed) delete seed.branding;
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
    let scopedSwitch = false;
    let switchFrom: HTMLElement | undefined;
    let settings = false;
    let mode = handle.props.initialMode ?? "system";
    function applyMode(next: Mode) {
      mode = next;
      if (next === "system") delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = next;
      void handle.update();
    }
    function setMode(next: Mode) {
      applyMode(next);
      saveTheme(next);
    }
    let preferences = defaultPreferences;
    let sidebarButton: HTMLButtonElement | undefined;
    const sidebarRef = ref<HTMLButtonElement>((node) => {
      sidebarButton = node;
    });
    async function toggleSidebar() {
      sidebar = !sidebar;
      await handle.update();
      sidebarButton?.focus();
    }
    function startConversationSwitch(from?: HTMLElement) {
      if (from) switchFrom = from;
      scopedSwitch = true;
      switching = true;
      void handle.update();
    }
    function startSwitch() {
      scopedSwitch = false;
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
    async function open(
      id: string,
      destination?: number,
      from?: HTMLButtonElement,
    ) {
      const catalog = view.kind === "ready" ? view.catalog : cached;
      const row = catalog?.rows.find((item) => item.id === id);
      const child = catalog?.children[id]?.some(
        (agent) =>
          agent.conversationId === destination &&
          !agent.archived &&
          agent.kind !== "agent",
      )
        ? destination
        : undefined;
      const nextBranch =
        !child && destination !== row?.main ? destination : undefined;
      if (!row) return;
      const path = sessionPath(row);
      if (
        location.pathname !== path ||
        agentId !== child ||
        branch !== nextBranch
      ) {
        history.replaceState(
          { clankSession: selectedId, branch, agentId, detailOpen },
          "",
        );
        history.pushState(
          {
            clankSession: id,
            agentId: child,
            branch: nextBranch,
            detailOpen: true,
          },
          "",
          path,
        );
      }
      listPage = false;
      target = sessionKey(path);
      if (
        id !== seed?.selectedId ||
        child !== undefined ||
        nextBranch !== undefined
      )
        seed = undefined;
      trigger = from;
      switchFrom = undefined;
      if (child !== undefined) expanded.add(id);
      switching = false;
      selectedId = id;
      branch = nextBranch;
      agentId = child;
      newOpen = false;
      detailOpen = true;
      await handle.update();
      if (!from || matchMedia(phoneWidth).matches) detailHeader?.focus();
    }
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
    let trigger: HTMLElement | undefined;
    const captureDetail = ref<HTMLDivElement>((node) => {
      detailHeader = node;
    });
    let rail: HTMLElement | undefined;
    const captureRail = ref<HTMLElement>((node) => {
      rail = node;
    });
    async function showDetail() {
      detailOpen = true;
      await handle.update();
      detailHeader?.focus({ preventScroll: true });
    }
    async function back() {
      detailOpen = false;
      newOpen = false;
      if (!trigger?.isConnected || !rail?.contains(trigger)) trigger = rail;
      await handle.update();
      trigger?.focus();
    }
    let archiving:
      | {
          target: ArchiveTarget;
          archive: Catalog["archive"];
          from: HTMLButtonElement;
        }
      | undefined;
    function archiveAction(item: ArchiveTarget) {
      if (view.kind !== "ready" || !view.catalog.canArchive(item)) return;
      return (from: HTMLButtonElement) => {
        if (
          archiving ||
          view.kind !== "ready" ||
          !view.catalog.canArchive(item)
        )
          return;
        archiving = { target: item, archive: view.catalog.archive, from };
        void handle.update();
      };
    }
    async function closeArchive() {
      if (!archiving) return;
      const { from } = archiving;
      archiving = undefined;
      await handle.update();
      const next = from.isConnected
        ? from
        : (sidebarList?.querySelector<HTMLButtonElement>(
            "button[aria-pressed=true]",
          ) ??
          sidebarList?.querySelector<HTMLButtonElement>("[data-new-session]"));
      if (next?.getClientRects().length) next.focus();
      else detailHeader?.focus();
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
      const applyBranding = documentBranding(document, branding);
      signal.addEventListener(
        "abort",
        () => {
          applyBranding();
          if (branding) {
            branding = undefined;
            if (!handle.signal.aborted) void handle.update();
          }
        },
        { once: true },
      );
      async function show(next: View) {
        if (signal.aborted) return;
        if (next.kind === "ready" && next.catalog.brandingReady)
          branding = next.catalog.branding;
        else if (next.kind === "offline" || next.kind === "sign-in")
          branding = undefined;
        applyBranding(branding);
        if (next.kind === "sign-in") {
          archiving = undefined;
          cached = seed = undefined;
          switching = settings = newOpen = false;
          createSlug = "";
        }
        const previous = cached;
        if (next.kind === "ready") {
          retryDelay = 500;
          const catalog = next.catalog;
          if (!catalog.childrenReady && cached)
            catalog.children = cached.children;
          if (catalog.activeIds === undefined)
            catalog.activeIds = cached?.activeIds;
          // Undefined is not yet hydrated. A published empty map clears all marks.
          if (catalog.indicators === undefined)
            catalog.indicators = cached?.indicators;
          cached = {
            rows: catalog.rows,
            children: catalog.children,
            activeIds: catalog.activeIds,
            indicators: catalog.indicators,
          };
        }
        view = next;
        // A resolved selection disappearing is different from an unknown deep link.
        if (
          next.kind === "ready" &&
          selectedId &&
          previous?.rows.some((row) => row.id === selectedId) &&
          !next.catalog.rows.some((row) => row.id === selectedId)
        ) {
          selectedId = target = undefined;
          branch = agentId = undefined;
          trigger = undefined;
          if (!listPage) {
            newOpen = detailOpen = true;
            history.replaceState({ detailOpen }, "", "/");
          }
        } else if (next.kind === "ready" && target) {
          const row = findSession(next.catalog.rows, target);
          selectedId = row?.id;
          canonicalize(row);
        } else if (
          next.kind === "ready" &&
          !newOpen &&
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
        if (
          next.kind === "ready" &&
          next.catalog.childrenReady &&
          selectedId &&
          agentId !== undefined &&
          !next.catalog.children[selectedId]?.some(
            (child) => child.conversationId === agentId && !child.archived,
          )
        ) {
          agentId = branch = undefined;
          history.replaceState({ clankSession: selectedId, detailOpen }, "");
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
        await followCatalog(
          signal,
          (catalog) => show({ kind: "ready", catalog }),
          handle.props.familiarId,
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
    const mount = ref<HTMLElement>((node, signal) => {
      const updateVisibility = () => {
        void handle.update();
      };
      document.addEventListener("visibilitychange", updateVisibility, {
        signal,
      });
      matchMedia(phoneWidth).addEventListener("change", updateVisibility, {
        signal,
      });
      mountRailSwipe(node, signal, (open) => (open ? back() : showDetail()));
      const restored = hydratedTheme(handle.props.initialMode);
      if (restored !== mode) applyMode(restored);
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
            selectedId &&
            selectedId === state?.clankSession &&
            catalog?.children[selectedId]?.some(
              (child) =>
                child.conversationId === state.agentId && !child.archived,
            )
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
      preferences = readPreferences();
      void handle.update();
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
          if (settings || archiving) return;
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
          if (doc.activeElement !== doc.body) return;
          const next = focused.isConnected
            ? focused
            : sidebarList?.querySelector<HTMLButtonElement>(
                "button[aria-pressed=true], [data-new-session]",
              );
          if (next?.getClientRects().length)
            next.focus({ preventScroll: true });
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
          !isRecent(row, selectedId, now, preferences.recency),
        ),
      );
      const olderIds = new Set(older.map((row) => row.id));
      const sidebarRows = rows.filter((row) => !row || !olderIds.has(row.id));
      const children = (id: string) =>
        (catalog?.children[id] ?? [])
          .filter((child) => child.kind !== "agent" && !child.archived)
          .toSorted(byRecentActivity);
      const selectedChild =
        selected &&
        children(selected.id).find((child) => child.conversationId === agentId);
      const conversation =
        selected &&
        (agentId === undefined
          ? (branch ?? selected.main)
          : selectedChild?.conversationId);
      // Pi advances the owner read cursor only for the visible main conversation.
      // A selected row behind the phone rail is not a visible conversation.
      if (
        live &&
        selected &&
        conversation === selected.main &&
        agentId === undefined &&
        !listPage &&
        !newOpen
      ) {
        handle.queueTask(() => {
          if (
            view.kind === "ready" &&
            view.catalog === live &&
            selectedId === selected.id &&
            !listPage &&
            !newOpen &&
            agentId === undefined &&
            (branch ?? selected.main) === selected.main &&
            document.visibilityState === "visible" &&
            (!matchMedia(phoneWidth).matches || detailOpen)
          )
            live.markMainRead(selected.id);
        });
      }
      const destinations = (row: Row) => {
        const agents = children(row.id);
        return [
          { id: row.main, label: "Main conversation", kind: "Main" },
          ...row.branches
            .filter(
              (item) =>
                item.conversation !== row.main &&
                !agents.some(
                  (child) => child.conversationId === item.conversation,
                ),
            )
            .map((item) => ({
              id: item.conversation,
              label: item.label || `Conversation ${item.conversation}`,
              kind: "Branch",
            })),
          ...agents.map((child) => ({
            id: child.conversationId,
            label: child.name,
            kind: "Subagent",
          })),
        ];
      };
      const currentDestinations = selected ? destinations(selected) : [];
      const canSwitch = Boolean(
        live && !newOpen && !listPage && currentDestinations.length > 1,
      );
      const current = currentDestinations.find((d) => d.id === conversation);
      type Choice = PaletteItem & {
        target?: { session: string; conversation?: number };
      };
      const choices: Choice[] =
        scopedSwitch && switching && selected
          ? currentDestinations.map((d) => ({
              id: `conversation:${selected.id}:${d.id}`,
              label: d.label,
              detail: d.id === conversation ? "Current" : d.kind,
              target: { session: selected.id, conversation: d.id },
            }))
          : [
              { id: "new", label: "New session", detail: "Command" },
              {
                id: "list",
                label: "Search sessions and messages",
                detail: "Command",
              },
              ...(canSwitch
                ? [
                    {
                      id: "conversations",
                      label: "Switch conversation…",
                      detail: "This session",
                    },
                  ]
                : []),
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
                  ...destinations(row)
                    .slice(1)
                    .map((d) => ({
                      id: `conversation:${row.id}:${d.id}`,
                      label: d.label,
                      detail: `${label} · ${d.kind}`,
                      target: { session: row.id, conversation: d.id },
                    })),
                ];
              }),
            ];
      return (
        <main
          aria-label="Clank"
          data-can-slide={
            catalog &&
            !newOpen &&
            !settings &&
            !switching &&
            (selected || target || listPage)
              ? ""
              : undefined
          }
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
          {archiving && (
            <ArchiveDialog
              live={live}
              target={archiving.target}
              archive={archiving.archive}
              close={closeArchive}
            />
          )}
          {catalog && (
            <Switcher
              key={scopedSwitch ? "conversations" : "commands"}
              scoped={scopedSwitch}
              open={switching}
              items={choices}
              close={closeSwitch}
              select={(id) => {
                const choice = choices.find((item) => item.id === id);
                if (!choice || !live) return;
                if (choice.target)
                  void open(choice.target.session, choice.target.conversation);
                else if (choice.id === "conversations")
                  startConversationSwitch();
                else if (choice.id === "list") {
                  switching = false;
                  switchFrom = undefined;
                  showList();
                  void handle.update().then(() => detailHeader?.focus());
                } else void startNew();
              }}
            />
          )}
          {catalog && (
            <Settings
              open={settings}
              mode={mode}
              setMode={setMode}
              preferences={preferences}
              change={(change) => {
                preferences = { ...preferences, ...change };
                savePreference(change);
                void handle.update();
              }}
              close={() => {
                settings = false;
                void handle.update();
              }}
            />
          )}
          <aside
            id="clank-sidebar"
            tabindex={-1}
            class="session-list"
            aria-label="Session list"
            mix={[
              captureRail,
              pane,
              css({
                borderRight: line,
                gridTemplateRows: "auto minmax(0, 1fr) auto",
                [phone]: { borderRight: 0 },
              }),
            ]}
          >
            <div mix={bar}>
              <BrandMark logo={branding?.logo} />
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
                {catalog && (selected || listPage || target) && (
                  <span class="sessions-back">
                    <Button
                      variant="quiet"
                      aria-label="Show detail"
                      aria-controls="clank-detail"
                      mix={[iconAction, on("click", showDetail)]}
                    >
                      <Icon name="sidebar" />
                    </Button>
                  </span>
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
                      padding: "8px",
                      display: "grid",
                      gap: "4px",
                    }),
                  ]}
                >
                  {sidebarRows.flatMap((row) => {
                    if (row) {
                      const agents = children(row.id);
                      const marks = catalog.indicators?.[row.id];
                      const isOpen = expanded.has(row.id);
                      const label =
                        row === familiar ? "Familiar" : sessionTitle(row);
                      const listId = `agents-${row.id}`;
                      return [
                        <li key={row.id}>
                          <RailRow
                            label={label}
                            title={sessionTitle(row)}
                            familiarLogo={
                              row === familiar ? (
                                <BrandMark logo={branding?.logo} />
                              ) : undefined
                            }
                            pinned={row !== familiar && row.pinned}
                            unread={marks?.unread}
                            failure={marks?.failure}
                            running={marks?.busy?.length}
                            selected={
                              !newOpen &&
                              !listPage &&
                              row.id === selectedId &&
                              agentId === undefined
                            }
                            age={
                              row === familiar
                                ? undefined
                                : age(row.updatedAt, now)
                            }
                            open={(from) => open(row.id, undefined, from)}
                            disclosure={
                              agents.length
                                ? {
                                    controls: listId,
                                    expanded: isOpen,
                                    toggle: (from) =>
                                      toggleSubagents(row.id, from),
                                  }
                                : undefined
                            }
                            archive={archiveAction({
                              session: row.id,
                              name: sessionTitle(row),
                            })}
                          />
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
                          marginBlockEnd: "10px",
                        })}
                      >
                        <Button
                          variant="quiet"
                          data-new-session=""
                          aria-pressed={newOpen}
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
                            padding: "6px 34px",
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
            id="clank-detail"
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
                  "& h1, & h2": {
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  },
                  paddingBlock: "4px",
                  [phone]: { paddingInline: "6px" },
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
                    {preferences.recency === "forever"
                      ? "The sidebar shows all sessions."
                      : `Dimmed sessions are outside the ${preferences.recency}-day window and hidden from the sidebar.`}
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
                  subtitle={
                    conversation && conversation !== selected.main
                      ? `${current?.kind ?? "Branch"} · ${current?.label ?? `Conversation ${conversation}`}`
                      : selected.cwd
                  }
                  switchConversation={
                    canSwitch ? startConversationSwitch : undefined
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
                open={open}
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
                showMetadata={preferences.showMetadata}
                enterToSend={preferences.enterToSend}
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
