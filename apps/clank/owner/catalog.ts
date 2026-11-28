import { followBranding, type Branding } from "./branding.ts";
import { SessionTree } from "../../pi/plugins/tree/contract.ts";
import { ownerSessions } from "./session-wire.ts";
import { validSlug } from "./routes.ts";
import {
  Search,
  type SearchResults,
} from "../../pi/plugins/search/contract.ts";
import { Familiar } from "../../pi/plugins/familiar/contract.ts";
import {
  followLive,
  workAllowsArchive,
  type Work,
  type Feed,
} from "./archive-availability.ts";
import { activityIds, workFeed, unreadFeed } from "./sidebar-activity.ts";
import {
  SubagentControl,
  Subagents,
  type Child,
} from "../../pi/plugins/subagents/contract.ts";
import type { ConversationView } from "@earendil-works/pi-durable";
import { SessionMetrics } from "../../pi/plugins/status/contract.ts";
import { cacheHitRate } from "../../pi/src/runtime/conversation-stats.ts";
import { Chat, type ModelMeta } from "../../pi/plugins/chat/contract.ts";
import { webSocketLink } from "@earendil-works/chord";
import {
  BACKGROUND_CONTEXT,
  withAbortSignal,
} from "@earendil-works/chord/context";
import { type Session } from "../../pi/plugins/sessions/contract.ts";
import { createHost, type Ctx } from "../../pi/src/runtime/chord.ts";
import { SERVER_PART_LIMITS } from "../../pi/src/runtime/link-limits.ts";
import { SERVER } from "../../pi/src/runtime/principals.ts";
import { clientLinkPath } from "../../pi/src/runtime/stale-page.ts";

export { MAX_TITLE } from "../../pi/plugins/sessions/contract.ts";
export type Row = Pick<
  Session,
  | "id"
  | "title"
  | "cwd"
  | "model"
  | "updatedAt"
  | "pinned"
  | "main"
  | "branches"
> & { slug?: string };
export type ChatFeed = {
  view: ConversationView | null;
  model?: ModelMeta | null;
  contextTokens?: number;
  cacheHit?: number;
  viewers?: number;
  sessionCost?: number;
  send(text: string, requestId: string): Promise<unknown>;
};
export type ArchiveTarget = {
  session: string;
  conversation?: number;
  name: string;
};
export type Catalog = {
  canArchive(target: ArchiveTarget): boolean;
  archive(target: ArchiveTarget): Promise<void>;
  chat(
    session: string,
    conversation: number,
    signal: AbortSignal,
    publish: (feed: ChatFeed) => Promise<unknown>,
  ): Promise<void>;
  create(
    cwd: string,
    title: string,
    slug?: string,
  ): Promise<Session & { slug?: string }>;
  /** False until this connection obtains branding or knows it is unavailable. */
  brandingReady: boolean;
  branding?: Branding;
  canCreateSlug: boolean;
  rows: Row[];
  activeIds?: string[];
  search(query: string, sessions: string[]): Promise<SearchResults>;
  childrenReady?: boolean;
  children: Readonly<Record<string, readonly Child[]>>;
  editMessage(
    session: string,
    entry: number,
  ): Promise<{ conversation: number; text: string | null }>;
  rename(id: string, title: string): Promise<void>;
};

export type Snapshot = Pick<Catalog, "rows" | "children" | "activeIds"> & {
  /** Initial owner document only; never copy branding into reconnect snapshots. */
  branding?: Branding;
  selectedId?: string;
  chat?: Omit<ChatFeed, "send">;
};

export function activeRows(sessions: readonly Session[]): Row[] {
  return sessions
    .filter((row) => row.archivedAt === null)
    .toSorted(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        b.updatedAt - a.updatedAt ||
        a.id.localeCompare(b.id),
    )
    .map(
      ({
        id,
        title,
        cwd,
        model,
        updatedAt,
        pinned,
        main,
        branches,
        ...extra
      }) => ({
        ...("slug" in extra && validSlug(extra.slug)
          ? { slug: extra.slug }
          : {}),
        id,
        title,
        cwd,
        model,
        updatedAt,
        pinned,
        main,
        branches,
      }),
    );
}

export async function followCatalog(
  signal: AbortSignal,
  publish: (catalog: Catalog) => Promise<unknown>,
  familiarId?: string,
) {
  const viewer = crypto.randomUUID();
  const url = new URL(clientLinkPath("script"), location.origin);
  url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(url);
  const link = webSocketLink(socket);
  const lifetime = new AbortController();
  const close = () => {
    lifetime.abort();
    link.close();
  };
  socket.addEventListener("close", close, {
    once: true,
    signal: lifetime.signal,
  });
  socket.addEventListener("error", close, {
    once: true,
    signal: lifetime.signal,
  });
  signal.addEventListener("abort", close, { signal: lifetime.signal });
  if (signal.aborted) close();
  const deadline = setTimeout(close, 10_000);
  const ctx = withAbortSignal(lifetime.signal, BACKGROUND_CONTEXT);
  const host = createHost({ onError: () => {} });
  try {
    host.connect(link, { principal: SERVER, limits: SERVER_PART_LIMITS }, ctx);
    await host.load([], ctx);
    await host.root(async (scope) => {
      const bindingVersion = await ownerSessions(scope);
      const sessions = bindingVersion.ref;
      const binding = await sessions.state.watch(scope);
      const watch = await sessions.sessions.watch(scope);
      const authorized = () =>
        !lifetime.signal.aborted &&
        sessions.variant === "owner" &&
        sessions.state.value.kind === "live";
      const rename = async (id: string, title: string) => {
        if (!authorized()) throw Error("Owner Sessions ended");
        await sessions.rename({ id, title }, scope);
      };
      const chat: Catalog["chat"] = async (
        session,
        conversation,
        chatSignal,
        receive,
      ) => {
        const active = AbortSignal.any([chatSignal, lifetime.signal]);
        await host.root(
          async (chatScope) => {
            const ref = await chatScope.get(Chat, { session, conversation });
            if (ref.variant !== "participant")
              throw Error("Pi chat is not writable");
            const chatBinding = await ref.state.watch(chatScope);
            const viewWatch = await ref.view.watch(chatScope);
            const canSend = () =>
              !active.aborted &&
              authorized() &&
              ref.variant === "participant" &&
              ref.state.value.kind === "live";
            const send = async (text: string, requestId: string) => {
              if (!canSend()) throw Error("Chat ended");
              return ref.send(
                { text, requestId, whenBusy: "followUp" },
                chatScope,
              );
            };
            try {
              if (!canSend()) return;
              chatBinding.start(async () => {});
              let view = viewWatch.value;
              const model = await ref.model.watch(chatScope);
              const stats = await ref.stats.watch(chatScope);
              let currentModel = model.value;
              let activeStats = stats.value;
              let viewers: number | undefined;
              let sessionCost: number | undefined;
              const publishChat = () =>
                receive({
                  view,
                  send,
                  model: currentModel,
                  viewers,
                  sessionCost,
                  contextTokens: activeStats?.contextTokens,
                  cacheHit:
                    activeStats?.latestAssistantUsage &&
                    cacheHitRate(activeStats.latestAssistantUsage),
                });
              void host
                .root(
                  async (metricsScope) => {
                    const metrics = await metricsScope.get(SessionMetrics, {
                      session,
                      viewer,
                    });
                    if (metrics.variant !== "reader") return;
                    const [clients, usage] = await Promise.all([
                      metrics.clients.watch(metricsScope),
                      metrics.usage.watch(metricsScope),
                    ]);
                    if (!canSend()) return;
                    viewers = clients.value;
                    sessionCost = usage.value?.cost.total;
                    await publishChat();
                    clients.start(async (call) => {
                      if (call.kind !== "value" || call.retired || !canSend())
                        return;
                      viewers = call.value;
                      await publishChat();
                    });
                    usage.start(async (call) => {
                      if (call.kind !== "value" || call.retired || !canSend())
                        return;
                      sessionCost = call.value?.cost.total;
                      await publishChat();
                    });
                    await Promise.race([clients.closed, usage.closed]);
                  },
                  withAbortSignal(active, ctx),
                )
                .catch(() => {});
              model.start(async (call) => {
                if (call.kind === "value" && !call.retired && canSend()) {
                  currentModel = call.value;
                  await publishChat();
                }
              });
              stats.start(async (call) => {
                if (call.kind === "value" && !call.retired && canSend()) {
                  activeStats = call.value;
                  await publishChat();
                }
              });
              await publishChat();
              viewWatch.start(async (call) => {
                if (call.kind === "value" && !call.retired && canSend()) {
                  view = call.value;
                  await publishChat();
                }
              });
              await Promise.race([chatBinding.closed, viewWatch.closed]);
            } finally {
              await Promise.all([chatBinding.stop(), viewWatch.stop()]);
            }
          },
          withAbortSignal(active, ctx),
        );
      };
      const create: Catalog["create"] = async (cwd, title, slug) => {
        if (!authorized()) throw Error("Owner Sessions ended");
        if (slug !== undefined) {
          if (bindingVersion.version !== 9 || !validSlug(slug))
            throw Error("Session URL name is unavailable");
          const row = await bindingVersion.ref.create(
            { cwd, title, slug },
            scope,
          );
          if (row.slug !== slug)
            throw Error("Pi did not confirm the session URL name");
          return row;
        }
        return sessions.create({ cwd, title }, scope);
      };
      const search: Catalog["search"] = (query, sessionIds) =>
        host.root(async (searchScope) => {
          if (!authorized()) throw Error("Owner Sessions ended");
          const ref = await searchScope.get(Search, {});
          if (ref.variant !== "owner") throw Error("Pi search unavailable");
          return ref.search(
            { query, archived: false, sessions: sessionIds },
            searchScope,
          );
        }, ctx);
      let branding: Branding | undefined;
      let brandingReady = false;
      let rows = activeRows(watch.value);
      let readChildren: (() => Catalog["children"] | undefined) | undefined;
      let readWork: (() => Work | undefined) | undefined;
      let readFamiliar: (() => string | null | undefined) | undefined;
      let unread: string[] | undefined;
      let activeIds: string[] | undefined;
      function canArchive({ session, conversation, name }: ArchiveTarget) {
        if (!authorized() || session === familiarId) return false;
        const familiar = readFamiliar?.();
        const work = readWork?.();
        if (
          familiar === undefined ||
          familiar === session ||
          !work ||
          !workAllowsArchive(work, session, conversation)
        )
          return false;
        let row;
        try {
          row = sessions.sessions.value.find((r) => r.id === session);
        } catch {
          return false;
        }
        if (row?.archivedAt !== null) return false;
        if (conversation === undefined)
          return (row.title || "Untitled session") === name;
        return (
          conversation !== row.main &&
          Boolean(
            readChildren?.()?.[session]?.some(
              (child) =>
                child.conversationId === conversation &&
                !child.archived &&
                child.kind !== "agent" &&
                child.name === name,
            ),
          )
        );
      }
      const archive: Catalog["archive"] = async ({
        session,
        conversation,
        name,
      }) => {
        const check = () => {
          if (!canArchive({ session, conversation, name }))
            throw Error("Archive is unavailable");
        };
        check();
        const command = withAbortSignal(AbortSignal.timeout(8000), scope);
        if (conversation === undefined) {
          await sessions.archive({ id: session }, command);
        } else {
          await host.root(async (childScope) => {
            const control = await childScope.get(SubagentControl, { session });
            check(); // Acquiring the worker can outlive a change to the child or operation.
            if (
              control.variant !== "participant" ||
              control.state.value.kind !== "live"
            )
              throw Error("Subagent control unavailable");
            await control.archive({ conversation, archived: true }, childScope);
          }, command);
        }
      };
      const update = () => {
        const children = readChildren?.();
        return publish({
          archive,
          canArchive,
          branding,
          brandingReady,
          rows,
          children: children ?? {},
          childrenReady: children !== undefined,
          activeIds,
          rename,
          chat,
          create,
          editMessage: (session, entry) =>
            host.root(async (editScope) => {
              if (!authorized()) throw Error("Owner Sessions ended");
              const tree = await editScope.get(SessionTree, { session });
              if (!authorized() || tree.variant !== "owner")
                throw Error("Owner tree unavailable");
              return tree.navigate({ entry }, editScope);
            }, ctx),
          search,
          canCreateSlug: bindingVersion.version === 9,
        });
      };
      const follow = <T>(
        get: (scope: Ctx) => Promise<Feed<T> | undefined>,
        receive: (read: () => T | undefined) => void,
      ) => {
        void host
          .root(async (feedScope) => {
            const feed = await get(feedScope);
            if (feed)
              await followLive(feedScope, feed, async (read) => {
                if (!authorized()) return;
                receive(read);
                await update();
              });
          }, ctx)
          .catch(() => {});
      };
      const refreshActivity = () => {
        const work = readWork?.();
        activeIds = work && unread ? activityIds(work, unread) : undefined;
      };
      try {
        if (!authorized() || binding.value.kind !== "live")
          throw Error("Owner Sessions ended");
        clearTimeout(deadline);
        binding.start(async (call) => {
          if (call.kind !== "value" || call.value.kind !== "live") close();
        });
        await update();
        // Branding is optional: an older Pi must still get a working catalog.
        const publishBranding = async (value: Branding | undefined) => {
          if (!authorized()) return;
          brandingReady = true;
          branding = value;
          await update();
        };
        void host
          .root(
            (brandScope) => followBranding(brandScope, publishBranding),
            ctx,
          )
          .finally(() => publishBranding(undefined))
          .catch(() => {});
        follow(
          async (s) => {
            const agents = await s.get(Subagents, {});
            if (agents.variant === "reader")
              return {
                state: agents.state,
                fields: [agents.children],
                read: () => agents.children.value,
              };
          },
          (read) => {
            readChildren = read;
          },
        );
        follow(
          async (s) => {
            const familiar = await s.get(Familiar, {});
            if (familiar.variant === "owner")
              return {
                state: familiar.state,
                fields: [familiar.session],
                read: () => familiar.session.value,
              };
          },
          (read) => {
            readFamiliar = read;
          },
        );
        follow(
          (s) => workFeed(s, sessions.operations),
          (read) => {
            readWork = read;
            refreshActivity();
          },
        );
        follow(unreadFeed, (read) => {
          unread = read();
          refreshActivity();
        });
        watch.start(async (call) => {
          if (call.kind !== "value" || call.retired || !authorized()) close();
          else {
            rows = activeRows(call.value);
            await update();
          }
        });
        await Promise.race([binding.closed, watch.closed]);
      } finally {
        close();
        await Promise.all([binding.stop(), watch.stop()]);
      }
    }, ctx);
  } finally {
    clearTimeout(deadline);
    close();
    await host.close(BACKGROUND_CONTEXT);
  }
}
