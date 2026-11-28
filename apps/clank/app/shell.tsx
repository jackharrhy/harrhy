import { space } from "@harrhy/ui/theme";
import { isChordError } from "@earendil-works/chord";
import { validSlug, canonicalSessionRedirect } from "./routes.ts";
import {
  SESSION_LIST_PATH,
  sessionKey,
  findSession,
  sessionPath,
} from "./routes.ts";
import { ArchiveDialog } from "./sidebar/archive-dialog.tsx";
import { createSessionRail, railEntries } from "./sidebar/session-rail.tsx";
import { SessionList } from "./sidebar/session-list.tsx";
import {
  Settings,
  defaultPreferences,
  readPreferences,
  savePreference,
} from "./settings/settings.tsx";
import { SessionTitle, sessionTitle } from "./conversation/session-heading.tsx";
import { iconAction, phone, titleStyle } from "./layout-styles.ts";
import { tintCookie, type Tint } from "./settings/theme-cookie.ts";
import { BrandMark } from "./brand-mark.tsx";
import {
  documentBranding,
  hydratedTheme,
  modes,
  saveTheme,
  type Mode,
} from "./settings/appearance.ts";
import { Icon } from "./icons.tsx";
import {
  destinationKey,
  paletteChoices,
  recentVisits,
  recordVisit,
  saveVisits,
  Switcher,
} from "./commands/palette.tsx";
import { Conversation } from "./conversation/conversation.tsx";
import { Button, Heading, Input, Text } from "@harrhy/ui/native";
import { clientEntry, css, on, ref, type Handle } from "remix/component";
import {
  followCatalog,
  MAX_TITLE,
  type ArchiveTarget,
  type Catalog,
  type Row,
  type Snapshot,
} from "./pi/catalog.ts";
import { mountRailSwipe, phoneWidth } from "./sidebar/swipe.ts";

const line = "1px solid var(--hui-border)";
const shell = css({
  height: "100dvh",
  overflow: "hidden",
  display: "grid",
  gridTemplateColumns: "clamp(13.75rem, 22vw, 18.75rem) minmax(0, 1fr)",
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
  gap: space(1),
  minHeight: "3.25rem",
  boxSizing: "border-box",
  paddingInline: space(2),
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
  padding: `${space(3)} ${space(2)}`,
  overflowWrap: "anywhere",
});

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
      initialTint?: Tint;
      renderedAt: number;
      listPage?: boolean;
      target?: string;
    }>,
  ) {
    let seed = handle.props.snapshot
      ? (JSON.parse(handle.props.snapshot) as Snapshot)
      : undefined;
    // Presentation belongs to this authorized document, not a particular socket.
    let branding = seed?.branding;
    if (seed) delete seed.branding;
    let applyBranding: ReturnType<typeof documentBranding>;
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
    // Only navigation handlers request focus. A Chord baseline (or the newly
    // created row) can arrive after the shell commits the destination.
    let pendingFocus: AbortController | undefined;
    function requestFocus() {
      pendingFocus?.abort();
      const request = new AbortController();
      pendingFocus = request;
      const signal = AbortSignal.any([request.signal, handle.signal]);
      const cancel = () => request.abort();
      const options = { signal, capture: true };
      document.addEventListener("pointerdown", cancel, options);
      document.addEventListener("keydown", cancel, options);
      document.addEventListener("visibilitychange", cancel, options);
      window.addEventListener("popstate", cancel, options);
      window.addEventListener("pagehide", cancel, options);
      window.addEventListener("blur", cancel, { signal });
      // Native Dialog.close() may restore its opener during this commit.
      if (!switching) document.addEventListener("focusin", cancel, options);
      async function afterUpdate(destination: string) {
        await handle.update();
        const detailPane = detailHeader?.parentElement;
        if (signal.aborted || !detailPane || document.hidden) return cancel();
        document.addEventListener("focusin", cancel, options);
        const focus = () => {
          if (detailPane.dataset.destination !== destination) {
            if (detailPane.dataset.destination) cancel();
            return;
          }
          const selector = matchMedia(`${phoneWidth}, (pointer: coarse)`)
            .matches
            ? "h1[tabindex], h2[tabindex]"
            : destination === "list"
              ? 'input[type="search"]'
              : destination === "new"
                ? 'input[name="title"]'
                : "textarea:enabled";
          const field = detailPane.querySelector<HTMLElement>(selector);
          if (!field) return;
          cancel();
          field.focus({ preventScroll: true });
        };
        focus();
        if (signal.aborted) return;
        const observer = new MutationObserver(focus);
        observer.observe(detailPane, {
          childList: true,
          subtree: true,
          attributeFilter: ["disabled", "data-destination"],
        });
        signal.addEventListener("abort", () => observer.disconnect(), {
          once: true,
        });
      }
      return { afterUpdate, cancel };
    }
    function showList(from?: HTMLElement) {
      const focus = requestFocus();
      trigger = from ?? switchFrom;
      switchFrom = undefined;
      switching = false;
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
      void focus.afterUpdate("list");
    }
    let sidebar = true;
    let switching = false;
    let recent: ReturnType<typeof recentVisits> = [];
    let switchFrom: HTMLElement | undefined;
    let settings = false;
    let mode = handle.props.initialMode ?? "system";
    let tint = handle.props.initialTint ?? "pi";
    function setTint(next: Tint) {
      tint = next;
      if (next === "pi") delete document.documentElement.dataset.clankTint;
      else document.documentElement.dataset.clankTint = next;
      try {
        document.cookie = tintCookie(next);
      } catch {
        /* Still applies for this visit. */
      }
      void handle.update();
    }
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
    function startSwitch(from?: HTMLElement) {
      if (view.kind !== "ready") return;
      switchFrom =
        from ??
        (document.activeElement instanceof HTMLElement
          ? document.activeElement
          : undefined);
      switching = true;
      void handle.update();
    }
    function closeSwitch() {
      switching = false;
      void handle.update().then(() => {
        if (switchFrom?.isConnected) switchFrom.focus({ preventScroll: true });
        switchFrom = undefined;
      });
    }
    let branch: number | undefined;
    let editDraft:
      | { session: string; conversation: number; text: string }
      | undefined;
    let agentId: number | undefined;
    const sessionRail = createSessionRail(handle, {
      open,
      startNew,
      showList,
      archiveAction,
    });
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
      if (view.kind === "ready")
        recent = recordVisit(
          recent,
          destinationKey(id, destination ?? row.main),
          Date.now(),
        );
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
      const focus = requestFocus();
      trigger = from ?? switchFrom;
      switchFrom = undefined;
      if (child !== undefined) sessionRail.expand(id);
      switching = false;
      selectedId = id;
      branch = nextBranch;
      agentId = child;
      newOpen = false;
      detailOpen = true;
      await focus.afterUpdate(destinationKey(id, destination ?? row.main));
    }
    let creating = false;
    let newOpen = false;
    let createError = "";
    let createSlug = "";
    async function startNew(from?: HTMLButtonElement) {
      const focus = requestFocus();
      trigger = from ?? switchFrom;
      switchFrom = undefined;
      switching = false;
      newOpen = true;
      createSlug = "";
      createError = "";
      await focus.afterUpdate("new");
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
      trigger?.focus({ preventScroll: true });
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
      const next = from.isConnected ? from : sessionRail.archiveFallback();
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
      async function show(next: View) {
        if (signal.aborted) return;
        if (next.kind === "ready" && next.catalog.branding !== undefined)
          branding = next.catalog.branding ?? undefined;
        else if (next.kind === "sign-in") branding = undefined;
        applyBranding(branding);
        if (next.kind === "sign-in") {
          archiving = undefined;
          cached = seed = undefined;
          switching = settings = newOpen = false;
          createSlug = "";
        }
        if (next.kind !== "ready") switching = false;
        if (next.kind === "sign-in" || next.kind === "offline")
          pendingFocus?.abort();
        if (next.kind === "sign-in") {
          recent = [];
          saveVisits(recent);
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
        await show({ kind: "offline" });
      } catch (error) {
        // A closed link alone is not evidence that the owner was signed out.
        await show({
          kind: isChordError(error, "forbidden") ? "sign-in" : "offline",
        });
      }
      if (!signal.aborted) {
        retry = setTimeout(() => void connect(), retryDelay);
        retryDelay = Math.min(8000, retryDelay * 2);
      }
    }
    const mount = ref<HTMLElement>((node, signal) => {
      applyBranding = documentBranding(node.ownerDocument, branding);
      const updateVisibility = () => {
        void handle.update();
      };
      document.addEventListener("visibilitychange", updateVisibility, {
        signal,
      });
      matchMedia(phoneWidth).addEventListener("change", updateVisibility, {
        signal,
      });
      mountRailSwipe(node, signal, (list) => (list ? back() : showDetail()));
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
      recent = recentVisits();
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
            event.keyCode === 229 ||
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
          applyBranding();
          branding = undefined;
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
      const live = view.kind === "ready" ? view.catalog : undefined;
      const catalog = live ?? cached;
      const selected = catalog?.rows.find((item) => item.id === selectedId);
      const entries = railEntries(catalog, {
        familiarId: handle.props.familiarId,
        activeIds: catalog?.activeIds ?? seed?.activeIds,
        selectedId,
        recency: preferences.recency,
        now,
      });
      const { familiar, children, olderIds } = entries;
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
      const currentBranch = selected?.branches.find(
        (item) => item.conversation === conversation,
      );
      const here =
        live &&
        selected &&
        !listPage &&
        !newOpen &&
        conversation !== undefined &&
        (conversation === selected.main ||
          (agentId === undefined
            ? currentBranch
            : live.childrenReady && selectedChild))
          ? destinationKey(selected.id, conversation)
          : undefined;
      if (
        here &&
        recent[0]?.id !== here &&
        (!matchMedia(phoneWidth).matches || detailOpen)
      )
        recent = recordVisit(recent, here);
      const choices =
        switching && live
          ? paletteChoices(
              live.rows,
              (row) => (row === familiar ? "Familiar" : sessionTitle(row)),
              live.childrenReady ? live.children : {},
              recent,
              here,
              live.indicators,
            )
          : [];
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
              open={switching}
              items={choices}
              close={closeSwitch}
              select={(id) => {
                const choice = choices.find((item) => item.id === id);
                if (!choice || !live) return;
                if (choice.target)
                  void open(choice.target.session, choice.target.conversation);
                else if (choice.id === "list") showList();
                else void startNew();
              }}
            />
          )}
          {catalog && (
            <Settings
              open={settings}
              mode={mode}
              setMode={setMode}
              tint={tint}
              setTint={setTint}
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
              <div mix={css({ display: "flex", gap: space(0.25) })}>
                {catalog && (
                  <Button
                    variant="quiet"
                    aria-label="Switch session"
                    title="Switch session (⌘/Ctrl+K)"
                    mix={[
                      iconAction,
                      on("click", (event) => startSwitch(event.currentTarget)),
                    ]}
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
              {catalog &&
                sessionRail.render(
                  entries,
                  { selectedId, agentId, listPage, newOpen },
                  branding?.logo,
                )}
            </div>
            {catalog && (
              <footer
                mix={css({
                  borderTop: line,
                  padding: `${space(0.5)} ${space(1)}`,
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: space(0.5),
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
            data-destination={
              newOpen
                ? "new"
                : listPage
                  ? "list"
                  : selected && conversation !== undefined
                    ? destinationKey(selected.id, conversation)
                    : undefined
            }
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
                  gap: space(0.5),
                  "& h1, & h2": {
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  },
                  paddingBlock: space(0.5),
                  [phone]: { paddingInline: space(0.75) },
                  "&:focus-visible": { outlineOffset: "-2px" },
                }),
              ]}
            >
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
                  <Heading level={2} tabindex={-1} mix={titleStyle}>
                    Sessions
                  </Heading>
                  <Text
                    tone="muted"
                    mix={css({ margin: 0, fontSize: "0.75rem" })}
                  >
                    {preferences.recency === "forever"
                      ? "The sidebar shows all sessions."
                      : `Dimmed sessions are outside the ${preferences.recency}-day window and hidden from the sidebar.`}
                  </Text>
                </div>
              ) : newOpen ? (
                <Heading level={2} tabindex={-1} mix={titleStyle}>
                  New session
                </Heading>
              ) : selected && catalog ? (
                <SessionTitle
                  key={selected.id}
                  row={selected}
                  rename={live?.rename}
                  subtitle={
                    conversation && conversation !== selected.main
                      ? `${selectedChild ? "Subagent" : "Branch"} · ${selectedChild?.name ?? (currentBranch?.label || `Conversation ${conversation}`)}`
                      : selected.cwd
                  }
                  switchConversation={live ? startSwitch : undefined}
                />
              ) : (
                <Heading level={2} mix={titleStyle}>
                  {view.kind === "sign-in" ? "Sign in to Pi" : "Sessions"}
                </Heading>
              )}
              <span
                role="status"
                mix={css({
                  flex: "none",
                  minInlineSize: "6ch",
                  marginInlineStart: "auto",
                  textAlign: "end",
                  fontSize: "0.75rem",
                  color: "var(--hui-danger)",
                })}
              >
                {view.kind === "offline" ? "Offline" : ""}
              </span>
            </div>
            {newOpen && catalog ? (
              <div mix={scroll}>
                <div mix={measure}>
                  <form
                    mix={[
                      css({
                        display: "grid",
                        gap: space(1.5),
                        maxWidth: "30rem",
                        "& label": { display: "grid", gap: space(0.5) },
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
                        const focus = requestFocus();
                        const source = event.currentTarget;
                        creating = true;
                        createError = "";
                        void handle.update();
                        try {
                          const row = await live.create(cwd, title, slug);
                          if (!source.isConnected || !newOpen) {
                            focus.cancel();
                            return;
                          }
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
                          void focus.afterUpdate(
                            destinationKey(row.id, row.main),
                          );
                        } catch (error) {
                          focus.cancel();
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
                      <Input name="title" required maxLength={MAX_TITLE} />
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
                          gap: space(0.5),
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
                        mix={css({ marginTop: space(1) })}
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
