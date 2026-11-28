import { space } from "@harrhy/ui/theme";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { readingPosition, rememberPosition } from "./reading-position.ts";
import { Activity, type Step } from "./activity.tsx";
import { localizeMessageTime } from "./message-time.ts";
import { Icon } from "../icons.tsx";
import { Markdown } from "./markdown.tsx";
import { structuredAttribution, type Attribution } from "./attribution.ts";
import { Button, Text, Textarea } from "@harrhy/ui/native";
import type { LiveState } from "@earendil-works/pi-durable";
import { css, on, ref, type Handle, type RemixNode } from "remix/component";
import type { Catalog, ChatFeed } from "../pi/catalog.ts";

const plain = css({
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  margin: `${space(0.75)} 0`,
});
const measure = css({
  width: "100%",
  maxWidth: "52rem",
  marginInline: "auto",
  padding: space(2),
  boxSizing: "border-box",
});
const status = {
  answered: "answered",
  failed: "failed",
  question: "asks",
  note: "wrote",
};
// The attribution glyph keeps its intrinsic width; only the gap scales with text.
const attributionGap = space(1);
const incomingTextInset = `calc(16px + ${attributionGap})`;
const senderLabel = {
  guest: "Guest",
  session: "Session",
  external: "External peer",
  subagent: "Subagent",
};
function messageTime(at: number) {
  return (
    <time
      data-message-time
      datetime={new Date(at).toISOString()}
      mix={[
        ref<HTMLTimeElement>(localizeMessageTime),
        css({ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }),
      ]}
    />
  );
}
function TranscriptInput(
  handle: Handle<{ text: string; sender?: Attribution; at?: number }>,
) {
  return () => {
    const { text, sender, at } = handle.props;
    if (!sender) return <p mix={plain}>{text}</p>;
    if (sender.kind === "owner")
      return (
        <div
          mix={css({
            marginInlineStart: "auto",
            width: "fit-content",
            maxWidth: "88%",
            background: "var(--hui-selected-surface)",
            padding: `${space(1)} ${space(1.5)}`,
            borderRadius: "0.25rem",
            boxSizing: "border-box",
          })}
        >
          <div mix={css({ whiteSpace: "pre-wrap", overflowWrap: "anywhere" })}>
            {text}
          </div>
        </div>
      );
    return (
      <article
        aria-label={senderLabel[sender.kind] + " message"}
        mix={css({ marginBlock: space(1.5), overflowWrap: "anywhere" })}
      >
        <header
          mix={css({
            display: "flex",
            alignItems: "center",
            gap: attributionGap,
            marginBlockEnd: space(1),
            fontSize: "0.8125rem",
            color: "var(--hui-muted)",
            "& > svg": { flex: "none" },
          })}
        >
          <Icon
            name={
              sender.kind === "subagent"
                ? sender.intent === "failed"
                  ? "failed"
                  : "bot"
                : sender.kind === "guest"
                  ? "guest"
                  : "peer"
            }
          />
          <span>
            <strong mix={css({ color: "var(--hui-ink)" })}>
              {sender.name}
            </strong>
            {" · "}
            <span>
              {sender.intent
                ? status[sender.intent]
                : sender.kind === "guest"
                  ? "(guest) wrote"
                  : sender.kind === "external"
                    ? "(external peer) wrote"
                    : "wrote"}
            </span>
            {at !== undefined && <> · {messageTime(at)}</>}
          </span>
        </header>
        <div mix={css({ paddingInlineStart: incomingTextInset })}>
          {sender.quote && (
            <blockquote
              mix={css({
                marginInline: 0,
                paddingInlineStart: space(1),
                borderInlineStart: "2px solid var(--hui-border)",
                whiteSpace: "pre-wrap",
              })}
            >
              <strong>{sender.quote.name}</strong>
              {" · "}
              {sender.quote.text}
            </blockquote>
          )}
          {sender.intent === "failed" ? (
            <p mix={plain}>{text}</p>
          ) : (
            <Markdown text={text} />
          )}
        </div>
      </article>
    );
  };
}

const messageAction = css({
  display: "inline-flex",
  alignItems: "center",
  minHeight: "2rem",
  padding: `0 ${space(1)}`,
  border: 0,
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  "&:hover:not(:disabled)": { color: "var(--hui-ink)" },
  "&:focus-visible": {
    outline: "2px solid currentColor",
    outlineOffset: "-2px",
  },
  "&:disabled": { opacity: 0.5, cursor: "default" },
});

function MessageActions(
  handle: Handle<{
    text: string;
    at?: number;
    alignEnd?: boolean;
    indentToBody?: boolean;
    edit?: () => void;
    editDisabled?: boolean;
  }>,
) {
  let announcement = "";
  return () => {
    const { text, at, alignEnd, edit, editDisabled } = handle.props;
    const time = at === undefined ? undefined : messageTime(at);
    return (
      <div
        mix={css({
          display: "flex",
          alignItems: "center",
          justifyContent: alignEnd ? "flex-end" : "flex-start",
          minHeight: "2rem",
          marginInline: alignEnd ? `0 ${space(-1)}` : `${space(-1)} 0`,
          paddingInlineStart: handle.props.indentToBody ? incomingTextInset : 0,
          color: "var(--hui-muted)",
          fontSize: "0.6875rem",
          "& time": { paddingInline: space(1) },
        })}
      >
        {alignEnd && time}
        {edit && (
          <button
            type="button"
            aria-label="Edit message"
            title="Continue before this message with its text in the composer"
            disabled={editDisabled}
            mix={[messageAction, on("click", edit)]}
          >
            <Icon name="edit" />
          </button>
        )}
        {text && (
          <button
            type="button"
            aria-label="Copy message"
            mix={[
              messageAction,
              on("click", async () => {
                try {
                  await navigator.clipboard.writeText(text);
                  announcement = "Copied";
                } catch {
                  announcement = "Could not copy";
                }
                void handle.update();
              }),
            ]}
          >
            <Icon name="copy" />
          </button>
        )}
        {!alignEnd && time}
        <span
          role="status"
          mix={css({
            position: "absolute",
            width: "1px",
            height: "1px",
            overflow: "hidden",
            clipPath: "inset(50%)",
          })}
        >
          {announcement}
        </span>
      </div>
    );
  };
}

const textOf = (content: readonly { type: string; text?: string }[]) =>
  content
    .flatMap((part) =>
      part.type === "text" && part.text !== undefined ? [part.text] : [],
    )
    .join("\n");

type Props = {
  chat?: Catalog["chat"];
  seed?: Omit<ChatFeed, "send">;
  session: string;
  conversation: number;
  showMetadata: boolean;
  enterToSend: boolean;
  initialDraft?: string;
  consumeDraft(): void;
  canEdit: boolean;
  editMessage?(entry: number): Promise<unknown>;
};
export function Conversation(handle: Handle<Props>) {
  let feed: ChatFeed | undefined;
  // Settlement appends pi.assistant and clears generation in one Durable view.
  // Carry only its render key across that boundary, never the partial's body.
  let inFlight:
    | { attempt: string; key: string; at: number; tail: number }
    | undefined;
  let settledKeys = new Map<number, string>();
  let animateActivity = false;
  let disconnected = false;
  let draft = "";
  let editing = false;
  let editFailed = false;
  let composer: HTMLTextAreaElement | undefined;
  const composerRef = ref<HTMLTextAreaElement>((node) => {
    composer = node;
  });
  async function edit(entry: number) {
    if (!handle.props.editMessage || editing || draft || sending) return;
    editing = true;
    editFailed = false;
    void handle.update();
    try {
      await handle.props.editMessage(entry);
    } catch {
      editFailed = true;
    } finally {
      editing = false;
      if (!handle.signal.aborted) void handle.update();
    }
  }
  let pending: { text: string; id: string } | undefined;
  let sending = false;
  let composing = false;
  let error = false;
  let viewport: HTMLDivElement | undefined;
  let following = true;
  const readingKey = `${handle.props.session}:${handle.props.conversation}`;
  let positioned = false;
  let previousTop = 0;
  function position() {
    const node = viewport;
    if (!node?.clientHeight || !node.dataset.readingKey) return;
    if (positioned) return followLatest();
    positioned = true;
    // Respect scrolling between the first-paint script and hydration.
    if (!node.dataset.ssrPositioned)
      node.scrollTop = readingPosition(readingKey) ?? node.scrollHeight;
    previousTop = node.scrollTop;
    following = node.scrollHeight - node.clientHeight - previousTop <= 64;
    rememberPosition(readingKey, following ? undefined : previousTop);
    if (!following) void handle.update();
  }
  function followLatest() {
    if (!following || !viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
    previousTop = viewport.scrollTop;
  }
  let mounted: AbortSignal | undefined;
  let binding: Catalog["chat"] | undefined;
  let chatAttempt: AbortController | undefined;
  const start = () => {
    const { chat, session, conversation } = handle.props;
    const node = viewport;
    if (!node || !mounted || mounted.aborted || binding === chat) return;
    binding = chat;
    chatAttempt?.abort();
    // A seeded first load hasn't lost a live connection.
    if (feed) disconnected = true;
    if (!chat) return;
    chatAttempt = new AbortController();
    const signal = AbortSignal.any([mounted, chatAttempt.signal]);
    let receivedBaseline = false;
    void (async () => {
      try {
        await chat(session, conversation, signal, async (next) => {
          if (signal.aborted) return;
          animateActivity = receivedBaseline;
          receivedBaseline = true;
          feed = next;
          disconnected = false;
          await handle.update();
        });
      } catch {
        // A failed binding never enables the composer.
      }
      if (!signal.aborted) {
        disconnected = true;
        await handle.update();
      }
    })();
  };
  const mount = ref<HTMLDivElement>((node, signal) => {
    viewport = node;
    mounted = signal;
    position();
    const observer = new ResizeObserver(position);
    observer.observe(node);
    if (node.firstElementChild) observer.observe(node.firstElementChild);
    signal.addEventListener("abort", () => observer.disconnect(), {
      once: true,
    });
    start();
  });
  async function send() {
    if (
      !handle.props.chat ||
      !feed?.view ||
      disconnected ||
      sending ||
      editing ||
      !draft.trim()
    )
      return;
    const text = draft.trim();
    if (pending?.text !== text) pending = { text, id: crypto.randomUUID() };
    // Sending is an explicit return to the live end. Passive stream updates
    // must still leave a reader who scrolled back where they are.
    following = true;
    rememberPosition(readingKey, undefined);
    followLatest();
    sending = true;
    error = false;
    void handle.update();
    try {
      await feed.send(text, pending.id);
      draft = "";
      pending = undefined;
    } catch {
      error = true;
    } finally {
      sending = false;
      if (!handle.signal.aborted) {
        await handle.update();
      }
    }
  }
  return () => {
    if (handle.props.initialDraft !== undefined) {
      draft = handle.props.initialDraft;
      handle.props.consumeDraft();
      handle.queueTask(() => composer?.focus());
    }
    handle.queueTask(start);
    const data = feed ?? handle.props.seed;
    const view = data?.view;
    if (view && !positioned) handle.queueTask(position);
    const live = view?.docs["pi.live"] as unknown as LiveState | undefined;
    const agent = view?.docs["pi.agent"];
    const effort =
      typeof agent?.thinkingLevel === "string"
        ? agent.thinkingLevel
        : undefined;
    const model = data?.model;
    const limit =
      model && model.contextWindow > 0 ? model.contextWindow : undefined;
    const used = data?.contextTokens;
    const percent =
      used !== undefined && limit
        ? Math.round((used / limit) * 100)
        : undefined;
    const compactLimit =
      limit === undefined
        ? undefined
        : limit < 1000
          ? String(limit)
          : limit < 1e6
            ? `${(limit / 1000).toFixed(1).replace(/\.0$/, "")}k`
            : `${(limit / 1e6).toFixed(2)}M`;
    const cost = data?.sessionCost;
    const hit = data?.cacheHit;
    const partial = live?.generation?.message;
    const slots = new Map(live?.tools?.map((slot) => [slot.callId, slot]));
    const results = new Map(
      view?.entries
        .flatMap((entry) => entry.model ?? [])
        .flatMap((message) =>
          message.role === "toolResult"
            ? [[message.toolCallId, message] as const]
            : [],
        ),
    );
    type Part =
      | { kind: "activity"; key: string; steps: Step[]; endedAt?: number }
      | { kind: "body"; key: string; content: RemixNode };
    const parts: Part[] = [];
    const calls = new Set<string>();
    // The first wheel belongs to the turn, even before it has any steps.
    // Later wheels are separated by prose and belong to their first part.
    let after = "start";
    let turnStart = 0;
    const startTurn = (key: string) => {
      after = key;
      turnStart = parts.length;
    };
    const turnTail = () =>
      parts.length > turnStart ? parts.at(-1) : undefined;
    const pushStep = (partKey: string, step: Step) => {
      const last = turnTail();
      if (last?.kind === "activity") last.steps.push(step);
      else
        parts.push({
          kind: "activity",
          key: `activity:${last ? partKey : after}`,
          steps: [step],
        });
    };
    const body = (key: string, content: RemixNode, time?: number) => {
      const last = turnTail();
      if (last?.kind === "activity" && time !== undefined) last.endedAt = time;
      parts.push({ kind: "body", key, content });
    };
    const inputBody = (key: string, content: RemixNode) => {
      body(key, content);
      startTurn(key);
    };
    const assistant = (
      message: AssistantMessage | NonNullable<typeof partial>,
      streaming: boolean,
      key: string,
    ) => {
      if (!streaming) {
        const previous = turnTail();
        if (previous?.kind === "activity") previous.endedAt = message.timestamp;
      }
      const lastText = streaming
        ? -1
        : message.content.findLastIndex(
            (item) => item.type === "text" && Boolean(item.text.trim()),
          );
      for (const [i, part] of message.content.entries()) {
        const partKey = key + ":" + i;
        if (part.type === "text" && part.text.trim()) {
          body(
            partKey,
            <>
              <Markdown text={part.text} streaming={streaming} />
              {i === lastText && (
                <MessageActions
                  text={textOf(message.content)}
                  at={message.timestamp}
                />
              )}
            </>,
            streaming ? undefined : message.timestamp,
          );
        } else if (part.type === "thinking" && part.thinking.trim()) {
          pushStep(partKey, {
            id: partKey,
            name: "Thought",
            state:
              streaming && i === message.content.length - 1
                ? "Running"
                : "Done",
            output: part.thinking,
            at: message.timestamp,
          });
        } else if (part.type === "toolCall" && !calls.has(part.id)) {
          calls.add(part.id);
          const slot = slots.get(part.id);
          const result = results.get(part.id);
          pushStep(partKey, {
            id: part.id,
            name: part.name,
            args: part.arguments,
            output: result ? textOf(result.content) : slot?.output,
            state: result
              ? result.isError
                ? "Failed"
                : "Done"
              : slot?.status === "done"
                ? "Done"
                : slot
                  ? slot.status === "running"
                    ? "Running"
                    : slot.status === "pending"
                      ? "Pending"
                      : slot.status
                  : live?.run
                    ? "Pending"
                    : "Result unavailable",
            at: message.timestamp,
            end: result?.timestamp,
          });
        }
      }
    };
    const retainedKeys = new Map<number, string>();
    if (inFlight && (view?.before ?? 0) > inFlight.tail) inFlight = undefined;
    for (const entry of view?.entries ?? []) {
      // Native markers/failures split runs even when Clank has no row for them.
      if (
        entry.kind === "pi.reset" ||
        entry.kind === "pi.compaction" ||
        entry.kind === "p2.shell" ||
        entry.kind === "app.model-error"
      )
        startTurn(`marker:${entry.id}`);
      const input = structuredAttribution(entry.kind, entry.data);
      if (input) {
        const at = entry.model?.find((item) => item.role === "user")?.timestamp;
        inputBody(
          "input:" + entry.id,
          <>
            <TranscriptInput text={input.text} sender={input} at={at} />
            <MessageActions
              text={input.text}
              at={input.kind === "owner" ? at : undefined}
              alignEnd={input.kind === "owner"}
              indentToBody={input.kind === "subagent"}
              edit={
                input.kind === "owner" && handle.props.canEdit
                  ? () => void edit(entry.id)
                  : undefined
              }
              editDisabled={
                editing ||
                !handle.props.editMessage ||
                Boolean(draft) ||
                sending ||
                disconnected ||
                !feed?.view
              }
            />
          </>,
        );
      }
      for (const [i, message] of (entry.model ?? []).entries()) {
        const key = "entry:" + entry.id + ":" + i;
        if (message.role === "assistant") {
          let responseKey = i === 0 ? settledKeys.get(entry.id) : undefined;
          // Match the first new provider result, not the last entry: the same
          // commit can also append a continuation or the next run's input.
          if (
            inFlight &&
            entry.id > inFlight.tail &&
            entry.kind === "pi.assistant" &&
            i === 0
          ) {
            if (message.timestamp === inFlight.at) responseKey = inFlight.key;
            inFlight = undefined;
          }
          if (responseKey) retainedKeys.set(entry.id, responseKey);
          assistant(message, false, responseKey ?? key);
        } else if (message.role === "user" && !input)
          inputBody(
            key,
            <TranscriptInput
              text={
                typeof message.content === "string"
                  ? message.content
                  : textOf(message.content)
              }
            />,
          );
        else if (
          message.role === "toolResult" &&
          !calls.has(message.toolCallId)
        ) {
          calls.add(message.toolCallId);
          pushStep(key, {
            id: message.toolCallId,
            name: message.toolName,
            output: textOf(message.content),
            state: message.isError ? "Failed" : "Done",
            at:
              message.durationMs === undefined
                ? undefined
                : message.timestamp - message.durationMs,
            end: message.timestamp,
          });
        }
      }
    }
    settledKeys = retainedKeys;
    if (partial) {
      const tail = view?.entries.at(-1)?.id ?? view?.before ?? 0;
      const attempt = `${live?.run?.taskId}:${live?.generation?.attempt}:${partial.timestamp}`;
      if (inFlight?.attempt !== attempt) {
        inFlight = {
          attempt,
          key: `response:${attempt}:${tail}`,
          at: partial.timestamp,
          tail,
        };
      } else {
        inFlight.tail = tail;
      }
      assistant(partial, true, inFlight.key);
    } else {
      inFlight = undefined;
    }
    if (live?.run && !turnTail())
      parts.push({ kind: "activity", key: `activity:${after}`, steps: [] });
    return (
      <div
        mix={css({
          display: "grid",
          position: "relative",
          gridTemplateRows: "minmax(0, 1fr) auto",
          gridTemplateColumns: "minmax(0, 1fr)",
          minHeight: 0,
        })}
      >
        <div
          aria-label="Transcript"
          data-reading-key={view ? readingKey : undefined}
          tabindex={0}
          mix={[
            mount,
            on("scroll", (event) => {
              const node = event.currentTarget;
              if (!positioned || !node.clientHeight) return;
              const nearBottom =
                node.scrollHeight - node.scrollTop - node.clientHeight <= 64;
              // Content growth can leave a queued scroll event behind our last write.
              const movedUp = node.scrollTop < previousTop;
              previousTop = node.scrollTop;
              if (following && !movedUp && !nearBottom) return;
              rememberPosition(
                readingKey,
                nearBottom ? undefined : previousTop,
              );
              if (following === nearBottom) return;
              if (
                nearBottom &&
                node.nextElementSibling === document.activeElement
              )
                node.focus({ preventScroll: true });
              following = nearBottom;
              void handle.update();
            }),
            css({
              gridArea: "1 / 1",
              // Keep absolute message announcements inside the scroller, not the document.
              position: "relative",
              overflow: "auto",
              overscrollBehavior: "contain",
              overflowAnchor: "none",
            }),
          ]}
        >
          <div
            data-chat-measure
            mix={[
              measure,
              css({
                padding: `${space(4)} ${space(2)} ${space(3)}`,
                fontSize: "1rem",
                lineHeight: 1.5,
                "& > :first-child": { marginBlockStart: 0 },
              }),
            ]}
          >
            {!view && !disconnected && (
              <Text role="status" tone="muted">
                Opening conversation…
              </Text>
            )}
            {view?.before !== undefined && (
              <Text tone="muted">Showing recent messages.</Text>
            )}
            {view?.entries.length === 0 && !live?.run && (
              <Text tone="muted">No messages yet.</Text>
            )}
            {parts.map((part, i) =>
              part.kind === "activity" ? (
                <Activity
                  key={part.key}
                  steps={part.steps}
                  endedAt={part.endedAt}
                  animateChanges={animateActivity}
                  working={Boolean(live?.run && i === parts.length - 1)}
                />
              ) : (
                <div
                  key={part.key}
                  mix={css({
                    marginBlock: space(2.5),
                    "@media (min-width: 48rem)": { marginBlock: space(3.25) },
                  })}
                >
                  {part.content}
                </div>
              ),
            )}
            {live?.runFailure && (
              <Text role="status">
                Pi did not finish the run. {live.runFailure.detail}
              </Text>
            )}
          </div>
        </div>
        <Button
          aria-label="Jump to latest"
          title="Jump to latest"
          aria-hidden={following || undefined}
          inert={following}
          data-following={following ? "true" : undefined}
          type="button"
          variant="quiet"
          mix={[
            css({
              gridArea: "1 / 1",
              position: "absolute",
              display: "grid",
              placeItems: "center",
              width: "2.75rem",
              height: "2.75rem",
              padding: 0,
              transition: "opacity 160ms ease-out, transform 160ms ease-out",
              "&[data-following]": {
                opacity: 0,
                transform: "translateY(0.75rem)",
                pointerEvents: "none",
              },
              "@media (prefers-reduced-motion: reduce)": {
                transition: "none",
                "&[data-following]": { transform: "none" },
              },
              alignSelf: "end",
              justifySelf: "center",
              zIndex: 1,
              marginBottom: space(1.5),
              minHeight: "2.75rem",
              backgroundColor: "var(--hui-surface)",
              border: "1px solid var(--hui-border)",
            }),
            on("click", () => {
              following = true;
              rememberPosition(readingKey, undefined);
              followLatest();
              viewport?.focus({ preventScroll: true });
              void handle.update();
            }),
          ]}
        >
          <Icon name="latest" />
        </Button>
        <form
          mix={[
            css({
              paddingBottom: "env(safe-area-inset-bottom, 0px)",
            }),
            on("submit", (event) => {
              event.preventDefault();
              void send();
            }),
          ]}
        >
          <div
            mix={[
              measure,
              css({
                paddingBlock: `${space(1)} 0`,
                borderBlock: "1px solid var(--hui-border)",
              }),
            ]}
          >
            <Textarea
              aria-label="Message"
              placeholder="Message Pi…"
              value={draft}
              rows={1}
              maxLength={100_000}
              readOnly={sending || editing}
              disabled={!view || (!feed && !handle.props.chat)}
              mix={[
                composerRef,
                css({
                  display: "block",
                  width: "100%",
                  boxSizing: "border-box",
                  resize: "none",
                  border: 0,
                  borderRadius: 0,
                  "&:focus-visible": { outline: "none" },
                  "@media (forced-colors: active)": {
                    "&:focus-visible": {
                      outline: "1px solid Highlight",
                      outlineOffset: "-1px",
                    },
                  },
                  padding: 0,
                  fontSize: "1rem",
                  lineHeight: 1.5,
                  minHeight: "1.5rem",
                  background: "transparent",
                  fieldSizing: "content",
                  maxHeight: "min(28dvh, 12rem)",
                }),
                on("compositionstart", () => {
                  composing = true;
                }),
                on("compositionend", () => {
                  composing = false;
                }),
                on("keydown", (event) => {
                  if (
                    event.key !== "Enter" ||
                    event.defaultPrevented ||
                    event.shiftKey ||
                    !handle.props.enterToSend ||
                    !window.matchMedia("(pointer: fine)").matches ||
                    event.isComposing ||
                    event.keyCode === 229 ||
                    composing
                  )
                    return;
                  event.preventDefault();
                  if (!event.repeat) void send();
                }),
                on("input", (event) => {
                  draft = event.currentTarget.value;
                  void handle.update();
                }),
              ]}
            />
            <div mix={css({ display: "flex", justifyContent: "flex-end" })}>
              <Button
                type="submit"
                aria-label="Send"
                title="Send"
                variant="quiet"
                aria-busy={sending}
                disabled={
                  sending ||
                  !feed?.view ||
                  !handle.props.chat ||
                  disconnected ||
                  !draft.trim()
                }
                mix={css({
                  width: "2.75rem",
                  minHeight: "2.75rem",
                  padding: 0,
                  '&[data-variant="quiet"]:disabled': {
                    background: "transparent",
                    borderColor: "transparent",
                    cursor: "default",
                  },
                })}
              >
                <Icon name="send" />
              </Button>
            </div>
          </div>
          <div mix={[measure, css({ paddingBlock: `0 ${space(1)}` })]}>
            {handle.props.showMetadata && (
              <div
                aria-label={
                  model || effort || percent !== undefined
                    ? "Composer metadata"
                    : undefined
                }
                mix={css({
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: `0 ${space(1.5)}`,
                  paddingBlock: `${space(0.5)} 0`,
                  color: "var(--hui-muted)",
                  fontSize: "0.6875rem",
                  lineHeight: 1.5,
                  minHeight: "2.5rem",
                  boxSizing: "content-box",
                  fontVariantNumeric: "tabular-nums",
                })}
              >
                <div
                  mix={css({
                    display: "flex",
                    alignItems: "center",
                    flex: 1,
                    minWidth: 0,
                    gap: space(0.5),
                    whiteSpace: "nowrap",
                    minHeight: "1.5rem",
                  })}
                >
                  {model && (
                    <span
                      title={model.name}
                      mix={css({
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      })}
                    >
                      {model.name}
                    </span>
                  )}
                  {model && effort && <span aria-hidden="true">·</span>}
                  {effort && <span title="Thinking effort">{effort}</span>}
                </div>
                <div
                  mix={css({
                    display: "flex",
                    gap: space(0.5),
                    marginInlineStart: "auto",
                    whiteSpace: "nowrap",
                    fontFamily: "ui-monospace, monospace",
                  })}
                >
                  {data?.viewers !== undefined && (
                    <>
                      <span
                        title="Browsers viewing this session, including subagent views"
                        aria-label={`${data.viewers} browsers viewing this session`}
                        role="img"
                      >
                        <svg
                          aria-hidden="true"
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          mix={css({
                            verticalAlign: "-2px",
                            marginInlineEnd: space(0.5),
                          })}
                        >
                          <circle cx="9" cy="7" r="3" />
                          <path d="M3 20v-2a6 6 0 0 1 12 0v2m2-16a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 5v2" />
                        </svg>
                        {data.viewers}
                      </span>
                      <span aria-hidden="true">·</span>
                    </>
                  )}
                  <span
                    title="Cache hit rate of the latest assistant response"
                    aria-label={`Cache hit rate: ${hit === undefined ? "unavailable" : Math.round(hit * 100) + " percent"}`}
                    role="img"
                  >
                    chr {hit === undefined ? "—" : Math.round(hit * 100) + "%"}
                  </span>
                  {cost !== undefined && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span title="Session total cost: all conversations, subagents and tools">
                        ${cost.toFixed(cost >= 1 ? 2 : cost >= 0.01 ? 3 : 4)}
                      </span>
                    </>
                  )}
                </div>
                <div
                  mix={css({
                    display: "flex",
                    alignItems: "center",
                    flex: "1 0 100%",
                    gap: space(1),
                    minHeight: "1rem",
                    fontFamily: "ui-monospace, monospace",
                    "& progress": {
                      flex: 1,
                      minWidth: 0,
                      height: "2px",
                      border: 0,
                      appearance: "none",
                      background: "var(--hui-border)",
                    },
                    "& progress::-webkit-progress-bar": {
                      background: "var(--hui-border)",
                    },
                    "& progress::-webkit-progress-value": {
                      background: "var(--hui-muted)",
                    },
                    "& progress::-moz-progress-bar": {
                      background: "var(--hui-muted)",
                    },
                  })}
                >
                  {percent !== undefined && (
                    <>
                      <progress
                        aria-label="Estimated active context usage"
                        aria-valuetext={`${percent}% of ${limit} tokens`}
                        value={Math.min(100, Math.max(0, percent))}
                        max={100}
                      />
                      <span>
                        {percent}%/{compactLimit}
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}
            {disconnected && handle.props.chat && (
              <Text role="status">Reconnecting to conversation…</Text>
            )}
            {editFailed && (
              <Text role="alert">Pi could not continue from that message.</Text>
            )}
            {error && (
              <Text role="alert">
                Send could not be confirmed. Retry with the same text to avoid
                duplicate delivery.
              </Text>
            )}
          </div>
        </form>
      </div>
    );
  };
}
