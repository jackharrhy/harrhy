import type { AssistantMessage } from "@earendil-works/pi-ai";
import { Activity, type Step } from "./activity.tsx";
import { localizeMessageTime } from "./message-time.ts";
import { Icon } from "./icons.tsx";
import { Markdown } from "./markdown.tsx";
import { structuredAttribution, type Attribution } from "./attribution.ts";
import { Button, Text, Textarea } from "@harrhy/ui/native";
import type { LiveState } from "@earendil-works/pi-durable";
import { css, on, ref, type Handle, type RemixNode } from "remix/component";
import type { Catalog, ChatFeed } from "./catalog.ts";

const plain = css({
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  margin: "6px 0",
});
const measure = css({
  width: "100%",
  maxWidth: "52rem",
  marginInline: "auto",
  padding: "16px",
  boxSizing: "border-box",
});
const status = {
  answered: "Answered",
  failed: "Failed",
  question: "Question",
  note: "Note",
};
const senderLabel = {
  owner: "Owner",
  guest: "Guest",
  session: "Session",
  external: "External peer",
  subagent: "Subagent",
};
function TranscriptInput(
  handle: Handle<{ text: string; sender?: Attribution }>,
) {
  return () => {
    const { text, sender } = handle.props;
    if (!sender) return <p mix={plain}>{text}</p>;
    if (sender.kind === "owner")
      return (
        <div
          mix={css({
            marginInlineStart: "auto",
            width: "fit-content",
            maxWidth: "88%",
            background: "var(--hui-selected-surface)",
            padding: "8px 12px",
            borderRadius: "4px",
            boxSizing: "border-box",
          })}
        >
          <div
            mix={css({
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--hui-muted)",
              marginBottom: "4px",
            })}
          >
            {sender.name || "Owner"}
          </div>
          <div mix={css({ whiteSpace: "pre-wrap", overflowWrap: "anywhere" })}>
            {text}
          </div>
        </div>
      );
    return (
      <article
        aria-label={senderLabel[sender.kind] + " message"}
        mix={css({ marginBlock: "12px", overflowWrap: "anywhere" })}
      >
        <header mix={css({ fontSize: "13px", color: "var(--hui-muted)" })}>
          <strong mix={css({ color: "var(--hui-ink)" })}>{sender.name}</strong>
          {" · "}
          <span>
            {sender.intent ? status[sender.intent] : senderLabel[sender.kind]}
          </span>
        </header>
        <div mix={css({ paddingInlineStart: "16px" })}>
          {sender.quote && (
            <blockquote
              mix={css({
                marginInline: 0,
                paddingInlineStart: "8px",
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
  minHeight: "32px",
  padding: "0 8px",
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
    edit?: () => void;
    editDisabled?: boolean;
  }>,
) {
  let announcement = "";
  return () => {
    const { text, at, alignEnd, edit, editDisabled } = handle.props;
    const time =
      at === undefined ? undefined : (
        <time
          data-message-time
          datetime={new Date(at).toISOString()}
          mix={[
            ref<HTMLTimeElement>(localizeMessageTime),
            css({
              paddingInline: "8px",
              fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
            }),
          ]}
        />
      );
    return (
      <div
        mix={css({
          display: "flex",
          alignItems: "center",
          justifyContent: alignEnd ? "flex-end" : "flex-start",
          minHeight: "32px",
          marginInline: alignEnd ? "0 -8px" : "-8px 0",
          color: "var(--hui-muted)",
          fontSize: "11px",
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
  let previousTop = 0;
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
    if (node.dataset.ssrPositioned) {
      previousTop = node.scrollTop;
      following = node.scrollHeight - node.clientHeight - previousTop <= 64;
      if (!following) void handle.update();
    } else {
      followLatest();
    }
    const observer = new ResizeObserver(followLatest);
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
    const pushStep = (step: Step) => {
      const last = parts.at(-1);
      if (last?.kind === "activity") last.steps.push(step);
      else parts.push({ kind: "activity", key: step.id, steps: [step] });
    };
    const body = (key: string, content: RemixNode, time?: number) => {
      const last = parts.at(-1);
      if (last?.kind === "activity" && time !== undefined) last.endedAt = time;
      parts.push({ kind: "body", key, content });
    };
    const assistant = (
      message: AssistantMessage | NonNullable<typeof partial>,
      streaming: boolean,
      key: string,
    ) => {
      if (!streaming) {
        const previous = parts.at(-1);
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
          pushStep({
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
          pushStep({
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
      const input = structuredAttribution(entry.kind, entry.data);
      if (input)
        body(
          "input:" + entry.id,
          <>
            <TranscriptInput text={input.text} sender={input} />
            <MessageActions
              text={input.text}
              at={entry.model?.find((item) => item.role === "user")?.timestamp}
              alignEnd={input.kind === "owner"}
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
          body(
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
          pushStep({
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
    if (live?.run && parts.at(-1)?.kind !== "activity" && !partial)
      parts.push({ kind: "activity", key: "waiting", steps: [] });
    return (
      <div
        mix={css({
          display: "grid",
          gridTemplateRows: "minmax(0, 1fr) auto",
          gridTemplateColumns: "minmax(0, 1fr)",
          minHeight: 0,
        })}
      >
        <div
          aria-label="Transcript"
          tabindex={0}
          mix={[
            mount,
            on("scroll", (event) => {
              const node = event.currentTarget;
              const nearBottom =
                node.scrollHeight - node.scrollTop - node.clientHeight <= 64;
              // Content growth can leave a queued scroll event behind our last write.
              const movedUp = node.scrollTop < previousTop;
              previousTop = node.scrollTop;
              if (following === nearBottom || (following && !movedUp)) return;
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
                padding: "24px 16px",
                fontSize: "16px",
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
                    marginBlock: "20px",
                    "@media (min-width: 48rem)": { marginBlock: "26px" },
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
        {!following && (
          <Button
            type="button"
            variant="quiet"
            mix={[
              css({
                gridArea: "1 / 1",
                alignSelf: "end",
                justifySelf: "center",
                zIndex: 1,
                marginBottom: "12px",
                minHeight: "44px",
                backgroundColor: "var(--hui-surface)",
                border: "1px solid var(--hui-border)",
              }),
              on("click", () => {
                following = true;
                followLatest();
                viewport?.focus({ preventScroll: true });
                void handle.update();
              }),
            ]}
          >
            Jump to latest
          </Button>
        )}
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
                paddingBlock: "8px 0",
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
                  fontSize: "16px",
                  lineHeight: "24px",
                  minHeight: "24px",
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
                  width: "44px",
                  minHeight: "44px",
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
          <div mix={[measure, css({ paddingBlock: "0 8px" })]}>
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
                  gap: "0 12px",
                  paddingBlock: "4px 0",
                  color: "var(--hui-muted)",
                  fontSize: "11px",
                  lineHeight: "16.5px",
                  minHeight: "40px",
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
                    gap: "4px",
                    whiteSpace: "nowrap",
                    minHeight: "24px",
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
                    gap: "4px",
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
                            marginInlineEnd: "4px",
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
                    gap: "8px",
                    minHeight: "16px",
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
