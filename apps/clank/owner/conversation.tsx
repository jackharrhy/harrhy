import type { AssistantMessage } from "@earendil-works/pi-ai";
import { Activity, type Step } from "./activity.tsx";
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
  maxWidth: "72ch",
  "@media (min-width: 75rem)": { maxWidth: "min(90ch, 100%)" },
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
    if (!sender || sender.kind === "owner")
      return (
        <p
          mix={[
            plain,
            sender &&
              css({
                marginInlineStart: "auto",
                width: "fit-content",
                maxWidth: "88%",
                background: "var(--hui-selected-surface)",
                padding: "8px 12px",
                borderRadius: "4px",
              }),
          ]}
        >
          {text}
        </p>
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
};
export function Conversation(handle: Handle<Props>) {
  let feed: ChatFeed | undefined;
  let animateActivity = false;
  let disconnected = false;
  let draft = "";
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
      !draft.trim()
    )
      return;
    const text = draft.trim();
    if (pending?.text !== text) pending = { text, id: crypto.randomUUID() };
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
    const number = new Intl.NumberFormat();
    const context =
      limit === undefined
        ? undefined
        : data?.contextTokens === undefined
          ? `${number.format(limit)} context`
          : `${number.format(data.contextTokens)} / ${number.format(limit)} context`;
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
      for (const [i, part] of message.content.entries()) {
        const partKey = key + ":" + i;
        if (part.type === "text" && part.text.trim()) {
          body(
            partKey,
            streaming ? (
              <p data-streaming mix={plain}>
                {part.text}
              </p>
            ) : (
              <Markdown text={part.text} />
            ),
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
    for (const entry of view?.entries ?? []) {
      const input = structuredAttribution(entry.kind, entry.data);
      if (input)
        body(
          "input:" + entry.id,
          <TranscriptInput text={input.text} sender={input} />,
        );
      for (const [i, message] of (entry.model ?? []).entries()) {
        const key = "entry:" + entry.id + ":" + i;
        if (message.role === "assistant") assistant(message, false, key);
        else if (message.role === "user" && !input)
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
    if (partial) assistant(partial, true, "live:" + partial.timestamp);
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
              overflow: "auto",
              overscrollBehavior: "contain",
            }),
          ]}
        >
          <div
            data-chat-measure
            mix={[
              measure,
              css({
                padding: "20px",
                "@media (min-width: 48rem)": { padding: "28px 24px" },
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
                <div key={part.key}>{part.content}</div>
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
              "& textarea:focus-visible": { outline: "none" },
              "@media (forced-colors: active)": {
                "& textarea:focus-visible": {
                  outline: "1px solid Highlight",
                  outlineOffset: "1px",
                },
              },
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
                paddingBlock: "12px 8px",
                borderBlock: "1px solid var(--hui-border)",
              }),
            ]}
          >
            <Textarea
              aria-label="Message"
              placeholder="Message Pi…"
              value={draft}
              rows={2}
              maxLength={100_000}
              readOnly={sending}
              disabled={!view || (!feed && !handle.props.chat)}
              mix={[
                css({
                  width: "100%",
                  boxSizing: "border-box",
                  resize: "none",
                  border: 0,
                  padding: "4px 0",
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
                    event.shiftKey ||
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
            {handle.props.showMetadata && (
              <div
                aria-label={
                  model || effort || context ? "Composer metadata" : undefined
                }
                aria-hidden={!model && !effort && !context}
                mix={css({
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "4px 12px",
                  borderTop: "1px solid var(--hui-border)",
                  paddingBlock: "4px",
                  color: "var(--hui-muted)",
                  fontSize: "12px",
                  lineHeight: "18px",
                  minHeight: "18px",
                  boxSizing: "content-box",
                  fontVariantNumeric: "tabular-nums",
                })}
              >
                {model && <span>{model.name}</span>}
                {effort && <span>Effort: {effort}</span>}
                {context && <span>{context}</span>}
              </div>
            )}
            {disconnected && handle.props.chat && (
              <Text role="status">Reconnecting to conversation…</Text>
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
