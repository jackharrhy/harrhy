import { space } from "@harrhy/ui/styles";
import {
  annotationProjectionInput,
  ANNOTATION_PROJECTION_VERSION,
} from "../content/annotation.ts";
import { css, on, ref, type Handle } from "remix/component";
import { controlStyles, focusStyles } from "@harrhy/ui/recipes";
import type { AgentCatalog } from "./bridge.ts";
import { Button, Textarea } from "@harrhy/ui/native";
import { canonicalComments, type QuoteEvidence } from "./contract.ts";
import { createCommentDrafts, type RecoverableDraft } from "./browser-draft.ts";
import { captureQuote, projectArticle, restoreQuote } from "./projection.ts";
import {
  renderCommentFragments,
  clearCommentFragments,
  commentIdsAtTarget,
} from "./fragments.ts";
import {
  createCommentBrowserApi,
  originalBatch,
  type ReviewComment,
  type ReviewState,
  type ReviewTarget,
} from "./browser-api.ts";

export interface ArticleEvidence {
  readonly articleUrl: string;
  readonly sourceSha256: string;
  readonly annotationProjectionSha256: string;
}
// Imported by the server as well so native watch follows the browser source graph.
export function commentMount() {
  return <span id="atlas-comments-mount" />;
}

const controls = css({
  fontFamily: "var(--hui-font-ui)",
  overflowWrap: "anywhere",
  fontSize: ".8rem",
  lineHeight: 1.5,
  "& button": { cursor: "pointer" },
  "& button:disabled": { cursor: "default", opacity: 0.6 },
  "& .atlas-comment-tray": {
    position: "fixed",
    right: "1rem",
    bottom: "1rem",
    zIndex: 5,
    maxWidth: "calc(100vw - 2rem)",
    padding: space(0.7),
    background: "var(--hui-surface)",
    border: "1px solid var(--hui-border)",
  },
  "& .atlas-comment-review": {
    position: "fixed",
    margin: 0,
    inset: "auto 1rem 1rem auto",
    width: "min(24rem, calc(100vw - 2rem))",
    maxHeight: "75dvh",
    overflowY: "auto",
    padding: space(1.6),
    background: "var(--hui-surface)",
    color: "var(--hui-ink)",
    border: "1px solid var(--hui-control-border)",
    borderRadius: "var(--hui-panel-radius)",
    fontFamily: "var(--hui-font-ui)",
    fontSize: ".85rem",
    lineHeight: 1.5,
  },
  "& h2": {
    fontFamily: "var(--hui-font-ui)",
    fontSize: "1rem",
    fontWeight: 600,
    margin: 0,
  },
  "& .atlas-comment-review-header": { marginBottom: space(0.5), marginTop: 0 },
  "& .atlas-comment-review-header h2": { marginRight: "auto" },
  "& .atlas-comment-send-row": {
    display: "flex",
    gap: space(1),
    alignItems: "center",
    marginTop: space(1.4),
  },
  "& .atlas-comment-send-row select": { flex: "1", width: 0 },
  "& .atlas-comment-mode-dot": {
    position: "absolute",
    right: ".45rem",
    bottom: ".4rem",
    width: "5px",
    height: "5px",
    borderRadius: "50%",
    background: "transparent",
  },
  "& .atlas-comment-mode-dot[data-on]": { background: "var(--hui-accent)" },
  "& p": { margin: `${space(1)} 0` },
  "& ol": { listStyle: "none", margin: `${space(1)} 0`, padding: 0 },
  "& li": {
    borderBottom: "1px solid var(--hui-border)",
    paddingBlock: space(1.2),
  },
  "& blockquote": {
    margin: `0 0 ${space(0.5)}`,
    padding: 0,
    border: 0,
    fontSize: ".75rem",
    color: "var(--hui-muted)",
    whiteSpace: "pre-wrap",
  },
  "& .atlas-comment-text": { whiteSpace: "pre-wrap", overflowWrap: "anywhere" },
  "& .atlas-comment-actions": {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: space(0.8),
    marginTop: space(0.8),
  },
  "& fieldset": { border: 0, margin: `${space(1)} 0`, padding: 0 },
  "& label": {
    display: "flex",
    alignItems: "center",
    gap: space(0.8),
    paddingBlock: space(0.7),
  },
  "& .atlas-comment-editor": {
    position: "fixed",
    margin: 0,
    padding: 0,
    border: 0,
    outline: "none",
    background: "transparent",
    overflow: "visible",
    width: "min(352px, calc(100vw - 24px))",
  },
  "& .atlas-comment-editor textarea": {
    display: "block",
    width: "100%",
    minHeight: "64px",
    maxHeight: "280px",
    resize: "vertical",
    overflow: "auto",
    font: "inherit",
    fontSize: "max(.9rem, 16px)",
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    border: "2px solid var(--hui-control-border)",
    outline: "none",
    boxShadow: "none",
  },
  "& .atlas-comment-editor textarea:focus-visible, & .atlas-comment-editor textarea:focus":
    {
      borderColor: "var(--hui-focus)",
      outline: "none",
      boxShadow: "none",
    },
  "& .atlas-comment-editor-status": {
    padding: `${space(0.5)} ${space(0.8)}`,
    background: "var(--hui-surface)",
    color: "var(--hui-ink)",
  },
});
const reviewIconStyles = css({
  width: "2.75rem",
  minWidth: "2.75rem",
  height: "2.75rem",
  padding: 0,
});
export const annotationStyles = css({
  "& [data-atlas-comment-fragment]": {
    background: "color-mix(in srgb, var(--hui-accent) 24%, var(--hui-canvas))",
    color: "var(--hui-ink)",
    cursor: "pointer",
  },
  "& [data-atlas-active-comment]": {
    background: "color-mix(in srgb, var(--hui-accent) 38%, var(--hui-canvas))",
  },
});

const recipientId = (target: ReviewTarget) => target.sessionId ?? target.key;

export function Comments(handle: Handle) {
  const api = createCommentBrowserApi();
  const drafts = createCommentDrafts(sessionStorage, location.origin);
  let recovery: RecoverableDraft | undefined;
  const root = document.querySelector<HTMLElement>("[data-atlas-article]");
  const metadata: ArticleEvidence | undefined = root
    ? {
        articleUrl: root.dataset.articleUrl!,
        sourceSha256: root.dataset.sourceSha256!,
        annotationProjectionSha256: root.dataset.annotationProjectionSha256!,
      }
    : undefined;
  let state: ReviewState | undefined;
  let reviewed = false;
  let targets: readonly ReviewTarget[] = [];
  let selectedRecipient =
    sessionStorage.getItem("atlas-comment-recipient") ?? "";
  let catalog: AgentCatalog = { targets: [] };
  const selected = () =>
    targets.find((target) => recipientId(target) === selectedRecipient);
  const unsent = () =>
    state?.comments.filter((comment) => !originalBatch(state!, comment)) ?? [];
  const unresolved = () =>
    state?.batches.find((batch) => batch.state !== "admitted");
  let sentBatchId = sessionStorage.getItem("atlas-comment-visible-sent") ?? "";
  let uiEpoch = 0;
  const currentSent = () =>
    state?.batches.find(
      (batch) => batch.batchId === sentBatchId && batch.state === "admitted",
    );
  function visibleSent(batchId = "") {
    sentBatchId = batchId;
    if (batchId) sessionStorage.setItem("atlas-comment-visible-sent", batchId);
    else sessionStorage.removeItem("atlas-comment-visible-sent");
  }
  function dismiss() {
    uiEpoch++;
    mode = false;
    reviewing = false;
    selectedQuote = undefined;
    sessionStorage.setItem("atlas-comment-mode", "off");
    visibleSent();
    clearTimeout(blurTimer);
    review?.hidePopover();
    editor?.hidePopover();
    update();
  }
  function rememberRecipient(value: string) {
    selectedRecipient = value;
    if (value) sessionStorage.setItem("atlas-comment-recipient", value);
    else sessionStorage.removeItem("atlas-comment-recipient");
  }
  let mode = sessionStorage.getItem("atlas-comment-mode") === "on";
  let validProjection = false,
    busy = false,
    reviewing = false;
  let status = "";
  let active:
    | {
        evidence: QuoteEvidence;
        revision: number;
        text: string;
        error: string;
        presentation: "anchored" | "docked";
      }
    | undefined;
  let editor: HTMLDivElement, review: HTMLDivElement, toggle: HTMLButtonElement;
  let focusReturn: HTMLElement | null = null;
  let manualHeight: number | undefined,
    resizing = false;
  let placement: "above" | "below" | undefined;
  let blurTimer: ReturnType<typeof setTimeout> | undefined;
  let selectedQuote: QuoteEvidence["quote"] | undefined;
  let gesture:
    | {
        x: number;
        y: number;
        at: number;
        moved: boolean;
        cancelled: boolean;
        quote?: string;
      }
    | undefined;
  let selectionFrame = 0,
    autoSelectionFrame = 0;
  let inputKind = matchMedia("(pointer: coarse)").matches ? "touch" : "mouse";
  const update = () => {
    void handle.update();
  };
  const local = (comment: ReviewComment) =>
    metadata &&
    comment.evidence.articleUrl === metadata.articleUrl &&
    comment.evidence.sourceSha256 === metadata.sourceSha256 &&
    comment.evidence.annotationProjectionSha256 ===
      metadata.annotationProjectionSha256;
  const rangeFor = (comment: ReviewComment) =>
    root && validProjection && local(comment)
      ? restoreQuote(root, comment.evidence.quote)
      : undefined;
  function paint() {
    if (!root || !validProjection) return;
    renderCommentFragments(root, [
      ...(state?.comments.filter(local).map((comment) => ({
        id: comment.evidence.id,
        quote: comment.evidence.quote,
      })) ?? []),
      ...(active
        ? [
            {
              id: active.evidence.id,
              quote: active.evidence.quote,
              active: true,
            },
          ]
        : []),
    ]);
  }
  async function refresh() {
    state = await api.state();
    reviewed = true;
    if (!unsent().length && !unresolved()) rememberRecipient("");
    paint();
    update();
  }
  async function loadTargets() {
    try {
      catalog = await api.catalog();
      targets = catalog.targets;
      if (!selectedRecipient) {
        const legacy = targets.find(
          (target) => target.key === state?.defaultTargetKey,
        );
        selectedRecipient =
          catalog.defaultSessionId !== undefined
            ? catalog.defaultSessionId
            : legacy
              ? recipientId(legacy)
              : "";
        rememberRecipient(selectedRecipient);
      }
    } catch {
      targets = [];
      status = "Recipients unavailable. Refresh.";
    }
    update();
  }
  function position() {
    if (!active || !editor?.matches(":popover-open")) return;
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft ?? 0,
      top = viewport?.offsetTop ?? 0;
    const width = viewport?.width ?? innerWidth,
      height = viewport?.height ?? innerHeight;
    const docked = active.presentation === "docked";
    const range = root && restoreQuote(root, active.evidence.quote);
    const rects = range
      ? [...range.getClientRects()].filter((rect) => rect.width && rect.height)
      : [];
    if (!docked && !rects.length) return;
    const first = rects[0],
      last = rects[rects.length - 1];
    const below = docked ? height - 24 : top + height - last.bottom - 20;
    const above = docked ? height - 24 : first.top - top - 20;
    placement ??= below >= 88 || below >= above ? "below" : "above";
    if (placement === "below" && below < 64 && above > below)
      placement = "above";
    if (placement === "above" && above < 64 && below > above)
      placement = "below";
    const available = Math.max(
      24,
      Math.min(
        280,
        height * 0.45,
        docked ? height - 24 : placement === "below" ? below : above,
      ),
    );
    editor.style.width = `${Math.min(352, width - 24)}px`;
    const field = editor.querySelector("textarea")!;
    field.style.minHeight = `${Math.min(64, available)}px`;
    field.style.maxHeight = `${available}px`;
    if (!resizing) {
      field.style.height = "auto";
      field.style.height = `${Math.min(available, manualHeight ?? Math.max(88, field.scrollHeight + 4))}px`;
    }
    const size = editor.getBoundingClientRect();
    const center = docked
      ? left + width / 2
      : range!.getBoundingClientRect().left +
        range!.getBoundingClientRect().width / 2;
    editor.style.left = `${Math.max(left + 12, Math.min(center - size.width / 2, left + width - size.width - 12))}px`;
    editor.style.top = `${docked ? Math.max(top + 12, top + height - size.height - 12) : Math.max(top + 12, Math.min(placement === "below" ? last.bottom + 8 : first.top - size.height - 8, top + height - size.height - 12))}px`;
  }
  function closeEditor(restoreFocus: boolean) {
    if (active) {
      try {
        drafts.forget(active.evidence.articleUrl);
      } catch {
        /* Departure guard still protects the live editor. */
      }
    }
    recovery = undefined;
    clearTimeout(blurTimer);
    active = undefined;
    editor?.hidePopover();
    paint();
    update();
    if (restoreFocus)
      (focusReturn?.isConnected &&
      focusReturn !== document.body &&
      focusReturn.getClientRects().length
        ? focusReturn
        : toggle
      )?.focus({ preventScroll: true });
  }
  async function save(restoreFocus = false) {
    if (!active || busy) return;
    if (!active.text.trim()) {
      closeEditor(restoreFocus);
      return;
    }
    const draft = active;
    busy = true;
    draft.error = "Saving…";
    update();
    try {
      await api.save(
        { ...draft.evidence, comment: draft.text },
        draft.revision,
      );
      closeEditor(restoreFocus);
      status = "";
      await refresh();
    } catch (error) {
      if (active === draft)
        draft.error = `${(error as Error).message} Text kept.`;
    } finally {
      busy = false;
      update();
      handle.queueTask(position);
    }
  }
  function openEditor(evidence: QuoteEvidence, revision: number) {
    if (!mode || active || busy) return;
    focusReturn = document.activeElement as HTMLElement;
    active = {
      evidence,
      revision,
      text: evidence.comment,
      error: "",
      presentation: inputKind === "touch" ? "docked" : "anchored",
    };
    const draft = active;
    const epoch = uiEpoch;
    manualHeight = undefined;
    placement = undefined;
    reviewing = false;
    review?.hidePopover();
    selectedQuote = undefined;
    getSelection()?.removeAllRanges();
    paint();
    update();
    handle.queueTask(() => {
      if (
        !mode ||
        epoch !== uiEpoch ||
        active !== draft ||
        handle.signal.aborted
      )
        return;
      editor.showPopover();
      position();
      editor.querySelector("textarea")?.focus({ preventScroll: true });
    });
  }
  function capture() {
    if (!mode || !validProjection || !root || !metadata || active || busy)
      return;
    const selection = getSelection();
    const current =
      selection?.rangeCount && !selection.isCollapsed
        ? captureQuote(root, selection.getRangeAt(0))
        : undefined;
    const quote = current ?? selectedQuote;
    const range = quote && restoreQuote(root, quote);
    if (!quote || !range) {
      status = "Select article text first.";
      update();
      return;
    }
    selectedQuote = undefined;
    const existing = state?.comments.find(
      (comment) =>
        local(comment) &&
        !originalBatch(state!, comment) &&
        comment.evidence.quote.start === quote.start &&
        comment.evidence.quote.end === quote.end,
    );
    openEditor(
      existing?.evidence ?? {
        ...metadata,
        id: crypto.randomUUID(),
        quote,
        comment: "",
      },
      existing?.revision ?? 0,
    );
  }
  function openReview() {
    if (!mode) return;
    const epoch = uiEpoch;
    if (active) {
      void save();
      return;
    }
    reviewing = true;
    update();
    handle.queueTask(() => {
      if (
        !mode ||
        epoch !== uiEpoch ||
        !reviewing ||
        active ||
        handle.signal.aborted
      )
        return;
      review.showPopover();
      review.querySelector<HTMLButtonElement>("button")?.focus();
    });
    void operation(refreshReview, "");
  }
  async function refreshReview() {
    const epoch = uiEpoch;
    await refresh();
    let receiptError: unknown;
    for (const batch of state?.batches ?? []) {
      if (batch.state === "admitted" && batch.chatUrl) continue;
      try {
        const receipt = (await api.receipt(batch.batchId)) as {
          state?: string;
        };
        if (
          batch.state !== "admitted" &&
          receipt.state === "admitted" &&
          mode &&
          reviewing &&
          epoch === uiEpoch &&
          !handle.signal.aborted
        )
          visibleSent(batch.batchId);
      } catch (error) {
        receiptError = error;
      }
    }
    await loadTargets();
    if (receiptError) throw receiptError;
  }
  async function operation(run: () => Promise<unknown>, message: string) {
    if (busy || active) return;
    busy = true;
    const epoch = uiEpoch;
    status = "";
    update();
    try {
      const result = (await run()) as
        | { batchId?: string; state?: string }
        | undefined;
      if (result?.batchId && result.state === "admitted") {
        rememberRecipient("");
        if (mode && reviewing && epoch === uiEpoch && !handle.signal.aborted)
          visibleSent(result.batchId);
        status = "";
      } else status = result?.batchId ? "Couldn’t send. Try again." : message;
    } catch {
      status =
        message === "Sent"
          ? "Couldn’t send. Try again."
          : "Couldn’t save changes. Refresh and try again.";
    } finally {
      try {
        await refresh();
      } catch {
        reviewed = false;
        status = "Connection lost. Refresh before sending.";
      }
      busy = false;
      update();
    }
  }
  function jump(comment: ReviewComment) {
    if (!mode) return;
    const batch = state && originalBatch(state, comment);
    if (batch) {
      if (batch.state !== "admitted" || batch.batchId === sentBatchId)
        openReview();
      return;
    }
    const range = rangeFor(comment);
    if (!range) {
      if (comment.evidence.articleUrl !== metadata?.articleUrl) {
        location.assign(
          comment.evidence.articleUrl +
            `#atlas-comment-${encodeURIComponent(comment.evidence.id)}`,
        );
        return;
      }
      status = "Article changed. Select the passage again.";
      update();
      return;
    }
    root!.querySelectorAll("details").forEach((details) => {
      if (
        details.contains(range.startContainer) ||
        details.contains(range.endContainer)
      )
        details.open = true;
    });
    const rect = range.getBoundingClientRect();
    scrollTo({
      top: Math.max(0, scrollY + rect.top - innerHeight / 3),
      behavior: "instant",
    });
    openEditor(comment.evidence, comment.revision);
  }
  function articleSelection() {
    const selection = getSelection();
    return root && selection?.rangeCount && !selection.isCollapsed
      ? captureQuote(root, selection.getRangeAt(0))
      : undefined;
  }
  function pointerDown(event: PointerEvent) {
    cancelAnimationFrame(autoSelectionFrame);
    autoSelectionFrame = 0;
    if (event.pointerType) inputKind = event.pointerType;
    if (mode && active && !event.composedPath().includes(editor))
      void save(false);
    if (!root?.contains(event.target as Node)) {
      gesture = undefined;
      return;
    }
    gesture = {
      x: event.clientX,
      y: event.clientY,
      at: performance.now(),
      moved: false,
      cancelled: false,
      quote: JSON.stringify(articleSelection()),
    };
  }
  function pointerMove(event: PointerEvent) {
    if (
      gesture &&
      Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 8
    )
      gesture.moved = true;
  }
  function pointerUp(event: PointerEvent) {
    if (event.pointerType) inputKind = event.pointerType;
    if (resizing) {
      manualHeight = editor
        .querySelector("textarea")!
        .getBoundingClientRect().height;
      resizing = false;
    }
    selectionChanged();
    const interaction = gesture;
    if (
      !mode ||
      active ||
      busy ||
      !root?.contains(event.target as Node) ||
      event.button !== 0 ||
      !["mouse", "pen"].includes(event.pointerType) ||
      !interaction ||
      interaction.cancelled
    )
      return;
    cancelAnimationFrame(autoSelectionFrame);
    autoSelectionFrame = requestAnimationFrame(() => {
      autoSelectionFrame = 0;
      if (!mode || active || busy || interaction.cancelled) return;
      const quote = articleSelection();
      if (
        !quote ||
        (!interaction.moved && JSON.stringify(quote) === interaction.quote)
      )
        return;
      selectedQuote = quote;
      capture();
    });
  }
  function pointerCancel() {
    cancelAnimationFrame(autoSelectionFrame);
    autoSelectionFrame = 0;
    if (gesture) gesture.cancelled = true;
    resizing = false;
    selectionChanged();
    position();
  }
  function activateMark(event: MouseEvent) {
    if (!mode || !root || active || busy) return;
    const interaction = event.detail ? gesture : undefined;
    gesture = undefined;
    if (
      interaction &&
      (interaction.cancelled ||
        interaction.moved ||
        performance.now() - interaction.at > 500)
    )
      return;
    const quote = articleSelection();
    if (interaction && quote && JSON.stringify(quote) !== interaction.quote)
      return;
    const ids = commentIdsAtTarget(root, event.target);
    const hits =
      state?.comments.filter((comment) => ids.includes(comment.evidence.id)) ??
      [];
    if (hits.length === 1) jump(hits[0]);
    else if (hits.length > 1) {
      openReview();
      status = `${hits.length} overlapping comments.`;
      update();
    }
  }
  function selectionChanged() {
    if (!mode || active || !root || selectionFrame) return;
    selectionFrame = requestAnimationFrame(() => {
      selectionFrame = 0;
      if (active || !mode) return;
      const selection = getSelection();
      if (!selection?.rangeCount || selection.isCollapsed) return;
      selectedQuote = validProjection
        ? captureQuote(root, selection.getRangeAt(0))
        : undefined;
      status = "";
      update();
    });
  }
  function keyboard(event: KeyboardEvent) {
    if (!mode) return;
    if (
      !active &&
      ((event.shiftKey &&
        [
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
          "Home",
          "End",
        ].includes(event.key)) ||
        ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a"))
    ) {
      inputKind = "keyboard";
      update();
    }
    if (event.altKey && event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      capture();
      return;
    }
    if (event.key !== "Escape") return;
    if (active && !busy) {
      event.preventDefault();
      closeEditor(true);
    } else {
      dismiss();
      toggle.focus();
    }
  }
  function beforeUnload(event: BeforeUnloadEvent) {
    if (active?.text.trim()) {
      event.preventDefault();
      event.returnValue = "";
    }
  }
  window.addEventListener("beforeunload", beforeUnload);
  document.addEventListener("pointerdown", pointerDown, true);
  document.addEventListener("pointermove", pointerMove);
  document.addEventListener("pointerup", pointerUp);
  document.addEventListener("pointercancel", pointerCancel);
  root?.addEventListener("click", activateMark);
  document.addEventListener("selectionchange", selectionChanged);
  document.addEventListener("keydown", keyboard);
  window.addEventListener("resize", position);
  window.addEventListener("scroll", position, true);
  window.visualViewport?.addEventListener("resize", position);
  window.visualViewport?.addEventListener("scroll", position);
  handle.signal.addEventListener("abort", () => {
    clearTimeout(blurTimer);
    window.removeEventListener("beforeunload", beforeUnload);
    document.removeEventListener("pointerdown", pointerDown, true);
    document.removeEventListener("pointermove", pointerMove);
    document.removeEventListener("pointerup", pointerUp);
    document.removeEventListener("pointercancel", pointerCancel);
    root?.removeEventListener("click", activateMark);
    document.removeEventListener("selectionchange", selectionChanged);
    cancelAnimationFrame(selectionFrame);
    cancelAnimationFrame(autoSelectionFrame);
    document.removeEventListener("keydown", keyboard);
    window.removeEventListener("resize", position);
    window.removeEventListener("scroll", position, true);
    window.visualViewport?.removeEventListener("resize", position);
    window.visualViewport?.removeEventListener("scroll", position);
    if (root) clearCommentFragments(root);
  });
  handle.queueTask(async () => {
    try {
      if (root && metadata) {
        const bytes = new TextEncoder().encode(
          annotationProjectionInput(projectArticle(root).text),
        );
        const digest = [
          ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        ]
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
        validProjection =
          root.dataset.annotationProjectionVersion ===
            String(ANNOTATION_PROJECTION_VERSION) &&
          digest === metadata.annotationProjectionSha256;
      }
      await refresh();
      status = root && !validProjection ? "Article changed. Refresh." : "";
      if (metadata && root) {
        try {
          recovery = drafts.read(metadata.articleUrl);
          if (recovery) {
            const saved = state?.comments.find(
              (comment) => comment.evidence.id === recovery!.evidence.id,
            );
            if (
              saved &&
              canonicalComments([saved.evidence]) ===
                canonicalComments([recovery.evidence])
            ) {
              drafts.forget(metadata.articleUrl);
              recovery = undefined;
            } else if (
              validProjection &&
              recovery.evidence.sourceSha256 === metadata.sourceSha256 &&
              recovery.evidence.annotationProjectionSha256 ===
                metadata.annotationProjectionSha256
            ) {
              const range = restoreQuote(root, recovery.evidence.quote);
              if (range && mode) {
                openEditor(recovery.evidence, recovery.revision);
                active!.error = "Recovered draft.";
              }
            }
            if (recovery && !active)
              status = "Draft source changed. Copy the text before discarding.";
          }
        } catch {
          status = "Draft recovery unavailable.";
        }
      }
      const id = decodeURIComponent(
        location.hash.replace(/^#atlas-comment-/, ""),
      );
      const comment = state?.comments.find((item) => item.evidence.id === id);
      if (comment) jump(comment);
    } catch {
      status = "Comments unavailable. Refresh.";
    }
    update();
  });
  return () => (
    <span mix={controls}>
      <Button
        variant="quiet"
        type="button"
        aria-label="Comments"
        title="Comments"
        aria-pressed={mode}
        mix={[
          css({
            width: "2.75rem",
            minWidth: "2.75rem",
            height: "2.75rem",
            padding: 0,
            position: "relative",
          }),
          ref((node) => {
            toggle = node;
          }),
          on("click", () => {
            if (mode) {
              if (active) void save();
              dismiss();
              return;
            }
            uiEpoch++;
            mode = true;
            sessionStorage.setItem("atlas-comment-mode", "on");
            visibleSent();
            const draft = active;
            const epoch = uiEpoch;
            if (draft)
              handle.queueTask(() => {
                if (
                  mode &&
                  epoch === uiEpoch &&
                  active === draft &&
                  !handle.signal.aborted
                ) {
                  editor.showPopover();
                  position();
                  editor.querySelector("textarea")?.focus();
                }
              });
            else if (
              recovery &&
              validProjection &&
              root &&
              local({
                evidence: recovery.evidence,
                revision: recovery.revision,
              }) &&
              restoreQuote(root, recovery.evidence.quote)
            )
              openEditor(recovery.evidence, recovery.revision);
            update();
          }),
        ]}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 4V6a2 2 0 0 1 2-2Z" />
        </svg>
        <span
          className="atlas-comment-mode-dot"
          data-on={mode ? "" : undefined}
          aria-hidden="true"
        />
      </Button>
      {mode &&
        !active &&
        (unsent().length ||
          unresolved() ||
          recovery ||
          reviewing ||
          currentSent() ||
          selectedQuote) && (
          <aside className="atlas-comment-tray" aria-label="Saved comments">
            {(unsent().length > 0 ||
              unresolved() ||
              recovery ||
              reviewing ||
              currentSent()) && (
              <Button variant="quiet" mix={on("click", openReview)}>
                Review
              </Button>
            )}
            {mode && root && ["touch", "keyboard"].includes(inputKind) && (
              <Button
                variant="quiet"
                disabled={!validProjection || busy || !selectedQuote}
                mix={on("click", capture)}
              >
                Comment on selection
              </Button>
            )}
          </aside>
        )}
      <div
        popover="manual"
        role="dialog"
        aria-label="Comment on selected text"
        className="atlas-comment-editor"
        mix={ref((node) => {
          editor = node;
        })}
      >
        <Textarea
          aria-label="Comment"
          aria-describedby="atlas-comment-editor-help"
          rows={2}
          maxLength={4096}
          value={active?.text ?? ""}
          disabled={busy}
          mix={[
            on("pointerdown", (event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              if (
                event.clientX > rect.right - 18 &&
                event.clientY > rect.bottom - 18
              )
                resizing = true;
            }),
            on("input", (event) => {
              if (active) {
                active.text = event.currentTarget.value;
                try {
                  drafts.remember(
                    active.evidence,
                    active.revision,
                    active.text,
                  );
                } catch {
                  active.error =
                    "Draft recovery unavailable. Keep this page open.";
                }
                update();
                handle.queueTask(position);
              }
            }),
            on("focus", () => clearTimeout(blurTimer)),
            on("blur", (event) => {
              if (editor.contains(event.relatedTarget as Node | null)) return;
              const draft = active;
              const epoch = uiEpoch;
              clearTimeout(blurTimer);
              blurTimer = setTimeout(() => {
                if (
                  mode &&
                  epoch === uiEpoch &&
                  active === draft &&
                  !editor.contains(document.activeElement) &&
                  document.hasFocus()
                )
                  void save();
              }, 120);
            }),
            on("keydown", (event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.isComposing
              ) {
                event.preventDefault();
                void save(true);
              }
            }),
          ]}
        />
        <span id="atlas-comment-editor-help" hidden>
          Enter saves. Shift+Enter adds a line. Escape cancels.
        </span>
        {active?.error && (
          <div className="atlas-comment-editor-status" role="status">
            {active.error}
            {!busy && (
              <Button
                variant="quiet"
                mix={on("click", () => {
                  const draft = active;
                  if (!draft) return;
                  void (async () => {
                    try {
                      await refresh();
                      if (active !== draft) return;
                      const saved = state?.comments.find(
                        (comment) => comment.evidence.id === draft.evidence.id,
                      );
                      draft.error =
                        saved && saved.revision !== draft.revision
                          ? "A saved version exists. Escape to keep it, then inspect it in Review before editing again."
                          : "Review refreshed. Press Enter to save your retained text.";
                    } catch {
                      if (active === draft)
                        draft.error =
                          "Refresh unavailable. Your text is kept here.";
                    }
                    update();
                  })();
                })}
              >
                Refresh
              </Button>
            )}
          </div>
        )}
      </div>
      <div
        popover="manual"
        role="dialog"
        aria-label="Review saved comments"
        className="atlas-comment-review"
        mix={ref((node) => {
          review = node;
        })}
      >
        <div className="atlas-comment-review-header atlas-comment-actions">
          <h2>Comments</h2>
          <Button
            variant="quiet"
            disabled={busy}
            aria-label="Refresh"
            title="Refresh"
            mix={[
              reviewIconStyles,
              on("click", () => {
                void operation(refreshReview, "");
              }),
            ]}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 2l1 4M18 18a8 8 0 0 1-13-2l-1-4" />
            </svg>
          </Button>
          <Button
            variant="quiet"
            aria-label="Close"
            title="Close"
            mix={[
              reviewIconStyles,
              on("click", () => {
                dismiss();
                toggle.focus();
              }),
            ]}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="m6 6 12 12M6 18 18 6" />
            </svg>
          </Button>
        </div>
        {status && !unresolved() && <p role="status">{status}</p>}
        {recovery && !active && (
          <section aria-label="Unsaved browser draft">
            <p>Unsaved draft</p>
            <Textarea
              aria-label="Recoverable comment text"
              readOnly
              value={recovery.evidence.comment}
            />
            <Button
              variant="quiet"
              mix={on("click", () => {
                drafts.forget(recovery!.evidence.articleUrl);
                recovery = undefined;
                update();
              })}
            >
              Discard draft
            </Button>
          </section>
        )}
        {!unsent().length && !state?.batches.length && <p>No comments yet.</p>}
        <ol>
          {unsent().map((comment) => (
            <li key={comment.evidence.id}>
              {comment.current === false && (
                <p>Article changed. Select the passage again.</p>
              )}
              <small>
                <a href={comment.evidence.articleUrl}>
                  {new URL(comment.evidence.articleUrl).pathname}
                </a>
              </small>
              <blockquote>{comment.evidence.quote.exact}</blockquote>
              <div className="atlas-comment-text">
                {comment.evidence.comment}
              </div>
              <div className="atlas-comment-actions">
                <Button
                  variant="quiet"
                  disabled={busy || !!unresolved()}
                  mix={on("click", () => jump(comment))}
                >
                  Edit
                </Button>
                <Button
                  variant="quiet"
                  disabled={busy || !!unresolved()}
                  mix={on("click", () => {
                    void operation(
                      () => api.remove(comment.evidence.id, comment.revision),
                      "",
                    );
                  })}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ol>
        {unresolved() ? (
          <div className="atlas-comment-actions">
            <span role="status">Couldn’t send. Try again.</span>
            <Button
              disabled={busy}
              mix={on("click", () => {
                const batch = unresolved();
                if (!batch) return;
                void operation(async () => {
                  const receipt = (await api.receipt(batch.batchId)) as {
                    state?: string;
                  };
                  return receipt.state === "admitted"
                    ? receipt
                    : api.retry(batch.batchId);
                }, "");
              })}
            >
              Try again
            </Button>
          </div>
        ) : (
          !unsent().length &&
          currentSent() && (
            <p className="atlas-comment-actions" role="status">
              Sent
              {currentSent()!.chatUrl && (
                <a href={currentSent()!.chatUrl} target="_blank" rel="noopener">
                  Open in Pi
                </a>
              )}
            </p>
          )
        )}
        {unsent().length > 32 && <p>Keep this round to 32 comments.</p>}
        {!unresolved() && !!unsent().length && (
          <div className="atlas-comment-send-row">
            <select
              aria-label="Send to"
              id="atlas-comment-recipient"
              disabled={busy}
              mix={[
                controlStyles,
                focusStyles,
                css({ width: "100%", minWidth: 0 }),
                on("change", (event) => {
                  rememberRecipient(event.currentTarget.value);
                  update();
                }),
              ]}
            >
              <option value="" selected={!selected()}>
                Choose a recipient
              </option>
              {targets.map((target) => (
                <option
                  key={recipientId(target)}
                  value={recipientId(target)}
                  selected={recipientId(target) === selectedRecipient}
                >
                  {target.label}
                </option>
              ))}
              {catalog.unavailable?.map((target) => (
                <option
                  key={target.sessionId}
                  disabled
                  value={target.sessionId}
                >
                  {target.label} —{" "}
                  {target.reason === "not-writable"
                    ? "not writable"
                    : "binding disabled"}
                </option>
              ))}
            </select>
            <Button
              disabled={
                busy ||
                !reviewed ||
                !selected() ||
                unsent().length > 32 ||
                unsent().some((comment) => comment.current === false)
              }
              mix={on("click", () => {
                const target = selected();
                if (!target || !state) return;
                const items = unsent().map((comment) => ({
                  id: comment.evidence.id,
                  revision: comment.revision,
                }));
                void operation(
                  () =>
                    api.send(items, {
                      key: target.key,
                      revision: target.revision,
                    }),
                  "Sent",
                );
              })}
            >
              Send
            </Button>
          </div>
        )}
      </div>
    </span>
  );
}
