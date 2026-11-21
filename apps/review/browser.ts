import { FileDiff, parsePatchFiles } from "@pierre/diffs";
import type { DiffLineAnnotation } from "@pierre/diffs";
import {
  maxTitleLength,
  normalizeTitle,
  titleError,
  untitledReview,
} from "./title.ts";

interface Summary {
  id: string;
  title: string;
  fileCount: number;
  base: string;
  head: string;
  mergeBase: string;
  created: string | number;
}

type Side = "old" | "new";
type Anchor = { side: Side; line: number };
type CommentTarget = { scope: "review" } | { scope: "file"; file: number };
type InlineTarget = Anchor & { scope?: undefined; file: number };
type Thread = (CommentTarget | InlineTarget) & {
  id: string;
  resolved: boolean;
  messages: { text: string; created: string | number }[];
};
interface Review extends Summary {
  patch: string;
  threads: Thread[];
  viewedFiles: number[];
}

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  ...children: (Node | string)[]
) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  for (const child of children) {
    element.appendChild(
      typeof child === "string" ? document.createTextNode(child) : child,
    );
  }
  return element;
}

function link(label: string, href: string, className = "") {
  const element = node("a", className, label);
  element.href = href;
  return element;
}

function button(label: string, testId: string, className = "") {
  const element = node("button", className, label);
  element.type = "button";
  element.dataset.testid = testId;
  return element;
}

function date(value: string | number) {
  const parsed = new Date(value);
  const valid = Number.isFinite(parsed.getTime());
  const element = node(
    "time",
    "",
    valid ? parsed.toLocaleString() : String(value),
  );
  if (valid) element.dateTime = parsed.toISOString();
  return element;
}

async function request(path: string, method = "GET", data?: object) {
  const headers = new Headers();
  if (method !== "GET") headers.set("X-Harrhy-Review", "1");
  if (data !== undefined) headers.set("Content-Type", "application/json");
  const response = await fetch(path, {
    method,
    headers,
    body: data === undefined ? undefined : JSON.stringify(data),
    cache: "no-store",
    redirect: "error",
    mode: "same-origin",
  });
  if (response.status === 404)
    throw new Error("This review is no longer available.");
  if (!response.ok) throw new Error(`Request failed (${response.status}).`);
  return response;
}

function shortHash(hash: string) {
  return node("code", "", hash.slice(0, 7));
}

function comparison(review: Summary) {
  return node(
    "span",
    "row muted",
    "Base",
    shortHash(review.base),
    "→ Head",
    shortHash(review.head),
  );
}

function fileCount(count: number) {
  return node(
    "span",
    "muted",
    `${count} ${count === 1 ? "file" : "files"} changed`,
  );
}

const anchorKey = ({ side, line }: Anchor) => `${side}:${line}`;
const anchorLabel = ({ side, line }: Anchor) =>
  `${side === "old" ? "Old" : "New"} line ${line}`;

function detail(root: HTMLElement, review: Review) {
  const api = `/api/reviews/${encodeURIComponent(review.id)}`;
  let threads = review.threads;
  const files = parsePatchFiles(review.patch, { throwOnError: true }).flatMap(
    (patch) => patch.files,
  );
  let style: "split" | "unified" = matchMedia("(max-width: 760px)").matches
    ? "unified"
    : "split";
  let pending = false;
  const drafts = new Map<string, string>();
  const masthead = document.querySelector(".masthead");
  if (masthead) {
    new ResizeObserver(() => {
      root.style.setProperty(
        "--review-masthead-height",
        `${masthead.getBoundingClientRect().height}px`,
      );
    }).observe(masthead);
  }

  const status = node("p", "danger");
  status.setAttribute("role", "alert");
  const remove = button("Delete review", "delete-review", "danger");
  const split = button("Split", "view-split");
  const unified = button("Unified", "view-unified");
  const modes = node("div", "diff-modes", unified, split);
  modes.setAttribute("role", "group");
  modes.setAttribute("aria-label", "Diff layout");
  document.getElementById("view-controls")?.replaceChildren(modes);
  const heading = node("h1", "", review.title ?? untitledReview);
  const rename = button("Rename", "rename-review");
  rename.setAttribute("aria-expanded", "false");
  rename.setAttribute("aria-controls", "review-title-editor");
  const titleInput = node("input");
  titleInput.id = "review-title";
  titleInput.type = "text";
  titleInput.required = true;
  titleInput.maxLength = maxTitleLength;
  const titleLabel = node("label", "", "Review title");
  titleLabel.htmlFor = titleInput.id;
  const saveTitle = button("Save title", "save-review-title", "primary");
  saveTitle.type = "submit";
  const cancelRename = button("Cancel", "cancel-rename");
  const titleEditor = node(
    "form",
    "title-editor",
    titleLabel,
    node("div", "row", titleInput, saveTitle, cancelRename),
  );
  titleEditor.id = "review-title-editor";
  titleEditor.hidden = true;
  const reviewComments = scopedComments({ scope: "review" });
  const header = node(
    "div",
    "review-header",
    node("div", "row", heading, rename),
    titleEditor,
    node("div", "row", fileCount(files.length), "·", comparison(review)),
    node(
      "div",
      "row muted",
      "Merge base",
      shortHash(review.mergeBase),
      "·",
      date(review.created),
    ),
    node("div", "row", reviewComments.trigger, remove),
    status,
  );
  const viewed = new Set(review.viewedFiles);
  const progressText = node("span", "muted");
  progressText.setAttribute("role", "status");
  const progress = node("progress");
  progress.max = Math.max(1, files.length);
  progress.setAttribute("aria-label", "Files viewed");
  const progressRow = node("div", "viewed-progress", progress, progressText);
  progressRow.dataset.testid = "viewed-progress";
  function updateProgress() {
    progress.value = viewed.size;
    progressText.textContent = `${viewed.size} of ${files.length} viewed`;
  }
  updateProgress();
  const fileList = node("ul", "file-list");
  const nav = node(
    "nav",
    "panel file-nav",
    node("h2", "", `Files changed (${files.length})`),
    progressRow,
    fileList,
  );
  nav.setAttribute("aria-label", "Changed files");
  nav.dataset.testid = "file-list";
  const content = node("div", "files");
  root.replaceChildren(
    header,
    reviewComments.panel,
    files.length
      ? node("div", "review-layout", nav, content)
      : node("p", "panel inset", "No file changes in this review."),
  );

  function closeTitleEditor() {
    titleEditor.hidden = true;
    rename.setAttribute("aria-expanded", "false");
    status.textContent = "";
    rename.focus();
  }

  rename.addEventListener("click", () => {
    if (pending) return;
    if (!titleEditor.hidden) return closeTitleEditor();
    titleInput.value = heading.textContent ?? "";
    titleEditor.hidden = false;
    rename.setAttribute("aria-expanded", "true");
    titleInput.select();
    titleInput.focus();
  });
  cancelRename.addEventListener("click", closeTitleEditor);
  titleEditor.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !pending) closeTitleEditor();
  });
  titleEditor.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (pending) return;
    const title = normalizeTitle(titleInput.value);
    if (!title) {
      status.textContent = titleError;
      titleInput.focus();
      return;
    }
    cancelRename.disabled = true;
    titleInput.readOnly = true;
    try {
      const response = await change(saveTitle, api, "PATCH", { title });
      if (response) {
        const updated: { title: string } = await response.json();
        heading.textContent = updated.title;
        closeTitleEditor();
      }
    } finally {
      cancelRename.disabled = false;
      titleInput.readOnly = false;
    }
  });

  async function change(
    control: HTMLButtonElement,
    path: string,
    method: "POST" | "PATCH" | "DELETE",
    body?: object,
  ) {
    if (pending) return false;
    pending = true;
    control.disabled = true;
    status.textContent = "";
    try {
      const response = await request(path, method, body);
      if (method === "POST") {
        // The mutation response has no required body; read back the authoritative threads.
        try {
          const updated: Review = await (await request(api)).json();
          threads = updated.threads;
        } catch {
          status.textContent =
            "Change saved, but the review could not be refreshed. Reload to see the change.";
        }
      }
      return response;
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : "Could not save the change.";
      return false;
    } finally {
      control.disabled = false;
      pending = false;
    }
  }

  function update(control: HTMLButtonElement, path: string, body: object) {
    return change(control, path, "POST", body);
  }

  remove.addEventListener("click", async () => {
    if (!confirm("Delete this review and its comments?")) return;
    if (await change(remove, api, "DELETE")) location.assign("/");
  });

  function commentForm(
    label: string,
    action: string,
    testId: string,
    key: string,
    save: (submit: HTMLButtonElement, text: string) => Promise<void>,
  ) {
    const area = node("textarea");
    area.setAttribute("aria-label", label);
    area.placeholder = label;
    area.required = true;
    area.value = drafts.get(key) ?? "";
    area.addEventListener("input", () => drafts.set(key, area.value));
    const submit = button(action, testId, "primary");
    submit.type = "submit";
    const form = node("form", "composer", area, submit);
    form.dataset.testid = `${testId}-form`;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const text = area.value.trim();
      if (text) await save(submit, text);
    });
    return form;
  }

  function renderThread(thread: Thread, refresh: () => void) {
    const endpoint = `${api}/threads/${encodeURIComponent(thread.id)}`;
    const action = thread.resolved ? "reopen" : "resolve";
    const toggle = button(thread.resolved ? "Reopen" : "Resolve", action);
    toggle.addEventListener("click", async () => {
      if (await update(toggle, endpoint, { action })) refresh();
    });
    const panel = node(
      "article",
      "thread",
      node(
        "div",
        "row between",
        node(
          "strong",
          "",
          thread.scope === "review"
            ? "Review comment"
            : thread.scope === "file"
              ? "File comment"
              : anchorLabel(thread),
        ),
        node("span", "muted", thread.resolved ? "Resolved" : "Open"),
      ),
      ...thread.messages.map((message) =>
        node(
          "div",
          "",
          node("p", "message", message.text),
          date(message.created),
        ),
      ),
      node("div", "row", toggle),
    );
    panel.dataset.testid = "thread";
    panel.dataset.threadId = thread.id;
    if (!thread.resolved) {
      const key = `reply:${thread.id}`;
      panel.appendChild(
        commentForm(
          "Reply to thread",
          "Reply",
          "reply",
          key,
          async (submit, text) => {
            if (await update(submit, endpoint, { action: "reply", text })) {
              drafts.delete(key);
              refresh();
            }
          },
        ),
      );
    }
    return panel;
  }

  function scopedComments(target: CommentTarget, onChange?: () => void) {
    const isReview = target.scope === "review";
    const testId = isReview ? "review-comment" : "file-comment";
    const list = node("div", "scoped-threads");
    const form = commentForm(
      isReview ? "Comment on this review" : "Comment on this file",
      "Post comment",
      testId,
      isReview ? "review" : `file:${target.file}`,
      async (submit, text) => {
        if (await update(submit, `${api}/threads`, { ...target, text })) {
          const area = form.querySelector("textarea");
          if (area) area.value = "";
          drafts.delete(isReview ? "review" : `file:${target.file}`);
          refresh();
        }
      },
    );
    const commentsHeading = node(
      isReview ? "h2" : "h3",
      "",
      isReview ? "Review comments" : "File comments",
    );
    const panel = node(
      "section",
      isReview
        ? "panel scoped-comments review-comments"
        : "scoped-comments file-comments",
      commentsHeading,
      list,
      form,
    );
    panel.dataset.testid = `${testId}s`;
    panel.popover = "auto";
    panel.setAttribute("aria-label", commentsHeading.textContent ?? "Comments");
    panel.setAttribute("role", "dialog");
    const trigger = button(
      isReview ? "Comment" : "File comments",
      `${testId}-open`,
    );
    trigger.popoverTargetElement = panel;
    function refresh() {
      const scoped = threads.filter((thread) =>
        target.scope === "review"
          ? thread.scope === "review"
          : thread.scope === "file" && thread.file === target.file,
      );
      list.replaceChildren(
        ...scoped.map((thread) => renderThread(thread, refresh)),
      );
      const label = isReview ? "Comment" : "File comments";
      trigger.textContent = scoped.length
        ? `${label} (${scoped.length})`
        : label;
      onChange?.();
    }
    refresh();
    return { panel, trigger };
  }

  // Open sections without constructing offscreen diffs.
  const deferred = new Map<Element, () => void>();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const { target, isIntersecting } of entries) {
        if (isIntersecting) deferred.get(target)?.();
      }
    },
    { rootMargin: "240px 0px" },
  );

  const views = files.map((fileDiff, file) => {
    const path = fileDiff.prevName
      ? `${fileDiff.prevName} → ${fileDiff.name}`
      : fileDiff.name;
    const count = node("span", "muted thread-count");
    const check = node("input");
    check.type = "checkbox";
    check.checked = viewed.has(file);
    check.dataset.testid = "file-viewed";
    check.setAttribute("aria-label", `Viewed: ${path}`);
    const viewedLabel = node("label", "viewed-label", check, "Viewed");
    const comments = scopedComments({ scope: "file", file }, updateCount);
    const summary = node(
      "summary",
      "",
      node("span", "file-heading", node("span", "path", path), count),
      node("span", "file-actions", comments.trigger, viewedLabel),
    );
    const host = node("div", "diff-host");
    summary.dataset.testid = "file-heading";
    const section = node("details", "panel diff-file", summary, host);
    section.id = `file-${file}`;
    section.dataset.testid = "diff-file";
    section.dataset.fileIndex = String(file);
    section.open = !check.checked;
    content.append(section, comments.panel);
    const jump = link("", `#${section.id}`);
    jump.appendChild(node("span", "path", path));
    jump.addEventListener("click", () => {
      section.open = true;
      load();
    });
    fileList.appendChild(node("li", "", jump));

    const viewedError = node("span", "viewed-error");
    viewedError.setAttribute("role", "alert");
    section.after(viewedError);
    check.addEventListener("change", async () => {
      const next = check.checked;
      check.checked = viewed.has(file);
      if (check.getAttribute("aria-disabled") === "true") return;
      check.setAttribute("aria-disabled", "true");
      viewedError.textContent = "";
      try {
        const response = await request(`${api}/viewed`, "PUT", {
          file,
          viewed: next,
        });
        const saved: { file: number; viewed: boolean } = await response.json();
        if (saved.viewed) viewed.add(file);
        else viewed.delete(file);
        check.checked = saved.viewed;
        section.open = !saved.viewed;
        updateProgress();
        if (section.open) load();
      } catch (error) {
        viewedError.textContent =
          error instanceof Error
            ? error.message
            : "Could not update viewed status.";
      } finally {
        check.removeAttribute("aria-disabled");
      }
    });

    let composer: Anchor | undefined;
    interface Annotation extends Anchor {
      threads: (Thread & InlineTarget)[];
      compose: boolean;
    }
    let composerArea: HTMLTextAreaElement | null = null;
    let diff: FileDiff<Annotation> | undefined;
    const createDiff = () =>
      new FileDiff<Annotation>({
        diffStyle: style,
        themeType: "light",
        disableFileHeader: true,
        overflow: "wrap",
        lineHoverHighlight: "both",
        enableGutterUtility: true,
        onLineNumberClick: ({ annotationSide, lineNumber }) =>
          startComment({
            side: annotationSide === "deletions" ? "old" : "new",
            line: lineNumber,
          }),
        onGutterUtilityClick: ({ side, start }) =>
          startComment({
            side: side === "deletions" ? "old" : "new",
            line: start,
          }),
        renderAnnotation: ({ metadata }) => {
          const panel = node(
            "div",
            "annotation",
            ...metadata.threads.map((thread) => renderThread(thread, render)),
          );
          if (metadata.compose) {
            const key = `inline:${file}:${anchorKey(metadata)}`;
            const form = commentForm(
              `Comment on ${anchorLabel(metadata).toLowerCase()}`,
              "Post comment",
              "new-comment",
              key,
              async (submit, text) => {
                if (
                  await update(submit, `${api}/threads`, {
                    file,
                    side: metadata.side,
                    line: metadata.line,
                    text,
                  })
                ) {
                  drafts.delete(key);
                  if (composer && anchorKey(composer) === anchorKey(metadata))
                    composer = undefined;
                  render();
                  summary.focus({ preventScroll: true });
                }
              },
            );
            const cancel = button("Cancel", "cancel-comment");
            cancel.addEventListener("click", () => {
              drafts.delete(key);
              composer = undefined;
              render();
              summary.focus({ preventScroll: true });
            });
            form.appendChild(cancel);
            panel.appendChild(form);
            composerArea = form.querySelector("textarea");
          }
          return panel;
        },
      });

    let loaded = false;
    function load() {
      if (loaded || !section.open) return;
      loaded = true;
      observer.unobserve(host);
      deferred.delete(host);
      host.classList.remove("diff-deferred");
      if (fileDiff.hunks.length) render();
      else
        host.appendChild(
          node("p", "inset muted", "No text changes to display for this file."),
        );
    }

    function updateCount() {
      const open = threads.filter(
        (thread) =>
          thread.scope !== "review" && thread.file === file && !thread.resolved,
      ).length;
      count.textContent = open ? `${open} open` : "";
    }

    function startComment(anchor: Anchor) {
      if (pending) return;
      composer = anchor;
      render();
      composerArea?.focus();
    }

    function render() {
      const groups = new Map<string, Annotation>();
      function group(anchor: Anchor) {
        const key = anchorKey(anchor);
        const entry = groups.get(key) ?? {
          side: anchor.side,
          line: anchor.line,
          threads: [],
          compose: false,
        };
        groups.set(key, entry);
        return entry;
      }
      updateCount();
      for (const thread of threads) {
        if (thread.scope !== undefined || thread.file !== file) continue;
        group(thread).threads.push(thread);
      }
      if (!loaded || !section.open || !fileDiff.hunks.length) return;
      if (composer) group(composer).compose = true;
      const annotations: DiffLineAnnotation<Annotation>[] = [
        ...groups.values(),
      ].map((metadata) => ({
        side: metadata.side === "old" ? "deletions" : "additions",
        lineNumber: metadata.line,
        metadata,
      }));
      diff ??= createDiff();
      diff.setOptions({ ...diff.options, diffStyle: style });
      diff.render({
        fileDiff,
        containerWrapper: host,
        lineAnnotations: annotations,
        forceRender: true,
      });
    }
    host.classList.add("diff-deferred");
    deferred.set(host, load);
    observer.observe(host);
    section.addEventListener("toggle", () => {
      if (loaded && section.open) render();
    });
    render();
    return { section, render };
  });

  function setStyle(next: typeof style) {
    if (next !== style) {
      style = next;
      for (const view of views) view.render();
    }
    split.setAttribute("aria-pressed", String(style === "split"));
    unified.setAttribute("aria-pressed", String(style === "unified"));
  }
  split.addEventListener("click", () => setStyle("split"));
  unified.addEventListener("click", () => setStyle("unified"));
  setStyle(style);
  const target = views.find(
    ({ section }) => `#${section.id}` === location.hash,
  )?.section;
  if (target) {
    target.open = true;
    target.scrollIntoView();
  }
}

function main(root: HTMLElement, data: HTMLElement) {
  try {
    const review: Review = JSON.parse(data.textContent ?? "");
    data.remove();
    detail(root, review);
  } catch (error) {
    const notice = node(
      "p",
      "",
      error instanceof Error ? error.message : "Could not load reviews.",
    );
    notice.setAttribute("role", "alert");
    const retry = button("Retry", "retry");
    retry.addEventListener("click", () => location.reload());
    root.replaceChildren(
      node("h1", "", "review"),
      node(
        "div",
        "panel inset",
        notice,
        node("div", "row", retry, link("Review inbox", "/")),
      ),
    );
  }
}

const root = document.getElementById("review-app");
const data = document.getElementById("review-data");
if (root && data) main(root, data);
