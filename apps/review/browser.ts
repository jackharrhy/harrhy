import { FileDiff, parsePatchFiles } from "@pierre/diffs";
import type { DiffLineAnnotation } from "@pierre/diffs";
import { maxTitleLength, normalizeTitle, titleError, untitledReview } from "./title.ts";

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
interface Thread extends Anchor {
  id: string;
  file: number;
  resolved: boolean;
  messages: { text: string; created: string | number }[];
}
interface Review extends Summary {
  patch: string;
  threads: Thread[];
}

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  ...children: (Node | string)[]
) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  for (const child of children) {
    element.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
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
  const element = node("time", "", valid ? parsed.toLocaleString() : String(value));
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
  if (response.status === 404) throw new Error("This review is no longer available.");
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
  return node("span", "muted", `${count} ${count === 1 ? "file" : "files"} changed`);
}

async function inbox(root: HTMLElement) {
  const reviews: Summary[] = await (await request("/api/reviews")).json();
  const panel = node("ul", "panel review-list");
  for (const review of reviews) {
    const entry = link("", `/reviews/${encodeURIComponent(review.id)}`);
    entry.dataset.testid = "review-link";
    entry.appendChild(
      node(
        "span",
        "review-entry",
        node("strong", "", review.title ?? untitledReview),
        node("span", "row", fileCount(review.fileCount), "·", comparison(review)),
      ),
    );
    entry.appendChild(date(review.created));
    panel.appendChild(node("li", "", entry));
  }
  root.replaceChildren(
    node(
      "div",
      "review-header",
      node("h1", "", "Review inbox"),
      node("p", "muted", "Saved comparisons on this device."),
    ),
    reviews.length
      ? panel
      : node(
          "p",
          "panel inset",
          "No reviews yet. Create a review from your terminal to see it here.",
        ),
  );
}

const anchorKey = ({ side, line }: Anchor) => `${side}:${line}`;
const anchorLabel = ({ side, line }: Anchor) => `${side === "old" ? "Old" : "New"} line ${line}`;

async function detail(root: HTMLElement, id: string) {
  const api = `/api/reviews/${encodeURIComponent(id)}`;
  const review: Review = await (await request(api)).json();
  let threads = review.threads;
  const files = parsePatchFiles(review.patch, { throwOnError: true }).flatMap(
    (patch) => patch.files,
  );
  let style: "split" | "unified" = matchMedia("(max-width: 760px)").matches ? "unified" : "split";
  let pending = false;

  const status = node("p", "danger");
  status.setAttribute("role", "alert");
  const remove = button("Delete review", "delete-review", "danger");
  const split = button("Split", "view-split");
  const unified = button("Unified", "view-unified");
  const modes = node("div", "row", split, unified);
  modes.setAttribute("role", "group");
  modes.setAttribute("aria-label", "Diff layout");
  const toolbar = node("div", "row between", modes, remove);
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
  const header = node(
    "div",
    "review-header",
    link("← Review inbox", "/", "back"),
    node("div", "row", heading, rename),
    titleEditor,
    node("div", "row", fileCount(files.length), "·", comparison(review)),
    node("div", "row muted", "Merge base", shortHash(review.mergeBase), "·", date(review.created)),
    toolbar,
    status,
  );
  const fileList = node("ul", "file-list");
  const nav = node(
    "nav",
    "panel file-nav",
    node("h2", "", `Files changed (${files.length})`),
    fileList,
  );
  nav.setAttribute("aria-label", "Changed files");
  nav.dataset.testid = "file-list";
  const content = node("div", "files");
  root.replaceChildren(
    header,
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
      status.textContent = error instanceof Error ? error.message : "Could not save the change.";
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

  const views = files.map((fileDiff, file) => {
    const path = fileDiff.prevName ? `${fileDiff.prevName} → ${fileDiff.name}` : fileDiff.name;
    const count = node("span", "muted thread-count");
    const summary = node("summary", "", node("span", "path", path), count);
    const host = node("div", "diff-host");
    const section = node("details", "panel diff-file", summary, host);
    section.id = `file-${file}`;
    section.dataset.testid = "diff-file";
    section.dataset.fileIndex = String(file);
    section.open = file === 0;
    content.appendChild(section);
    const jump = link("", `#${section.id}`);
    jump.appendChild(node("span", "path", path));
    jump.addEventListener("click", () => {
      section.open = true;
    });
    fileList.appendChild(node("li", "", jump));

    const drafts = new Map<string, string>();
    let composer: Anchor | undefined;
    interface Annotation extends Anchor {
      threads: Thread[];
      compose: boolean;
    }
    let composerArea: HTMLTextAreaElement | null = null;
    const diff = new FileDiff<Annotation>({
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
        const panel = node("div", "annotation", ...metadata.threads.map(renderThread));
        if (metadata.compose) {
          const key = anchorKey(metadata);
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
                if (composer && anchorKey(composer) === key) composer = undefined;
                render();
                picker?.focus();
              }
            },
          );
          const cancel = button("Cancel", "cancel-comment");
          cancel.addEventListener("click", () => {
            drafts.delete(key);
            composer = undefined;
            render();
            picker?.focus();
          });
          form.appendChild(cancel);
          panel.appendChild(form);
          composerArea = form.querySelector("textarea");
        }
        return panel;
      },
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

    function renderThread(thread: Thread) {
      const endpoint = `${api}/threads/${encodeURIComponent(thread.id)}`;
      const action = thread.resolved ? "reopen" : "resolve";
      const toggle = button(thread.resolved ? "Reopen" : "Resolve", action);
      toggle.addEventListener("click", async () => {
        if (await update(toggle, endpoint, { action })) render();
      });
      const panel = node(
        "article",
        "thread",
        node(
          "div",
          "row between",
          node("strong", "", anchorLabel(thread)),
          node("span", "muted", thread.resolved ? "Resolved" : "Open"),
        ),
        ...thread.messages.map((message) =>
          node("div", "", node("p", "message", message.text), date(message.created)),
        ),
        node("div", "row", toggle),
      );
      panel.dataset.testid = "thread";
      panel.dataset.threadId = thread.id;
      if (!thread.resolved) {
        const key = `reply:${thread.id}`;
        panel.appendChild(
          commentForm("Reply to thread", "Reply", "reply", key, async (submit, text) => {
            if (await update(submit, endpoint, { action: "reply", text })) {
              drafts.delete(key);
              render();
            }
          }),
        );
      }
      return panel;
    }

    // The line picker also exposes the gutter action to keyboard and touch users.
    const picker = fileDiff.hunks.length ? node("select") : undefined;
    if (picker) {
      picker.dataset.testid = "comment-line";
      picker.setAttribute("aria-label", `Line to comment on in ${fileDiff.name}`);
      for (const side of ["new", "old"] as const) {
        const group = node("optgroup");
        group.label = side === "old" ? "Old file" : "New file";
        for (const hunk of fileDiff.hunks) {
          const start = side === "old" ? hunk.deletionStart : hunk.additionStart;
          const length = side === "old" ? hunk.deletionCount : hunk.additionCount;
          for (let line = start; line < start + length; line++) {
            const anchor = { side, line };
            const option = node("option", "", anchorLabel(anchor));
            option.value = anchorKey(anchor);
            group.appendChild(option);
          }
        }
        if (group.childElementCount) picker.appendChild(group);
      }
      const add = button("Add comment", "add-comment");
      add.addEventListener("click", () => {
        const [side, line] = picker.value.split(":");
        if (side === "old" || side === "new") startComment({ side, line: Number(line) });
      });
      section.appendChild(node("div", "row comment-picker", picker, add));
    } else {
      host.appendChild(node("p", "inset muted", "No text changes to display for this file."));
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
      let open = 0;
      for (const thread of threads) {
        if (thread.file !== file) continue;
        group(thread).threads.push(thread);
        if (!thread.resolved) open++;
      }
      count.textContent = open ? `${open} open` : "";
      if (!section.open || !fileDiff.hunks.length) return;
      if (composer) group(composer).compose = true;
      const annotations: DiffLineAnnotation<Annotation>[] = [...groups.values()].map(
        (metadata) => ({
          side: metadata.side === "old" ? "deletions" : "additions",
          lineNumber: metadata.line,
          metadata,
        }),
      );
      diff.setOptions({ ...diff.options, diffStyle: style });
      diff.render({
        fileDiff,
        containerWrapper: host,
        lineAnnotations: annotations,
        forceRender: true,
      });
    }
    section.addEventListener("toggle", () => {
      if (section.open) render();
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
  const target = views.find(({ section }) => `#${section.id}` === location.hash)?.section;
  if (target) {
    target.open = true;
    target.scrollIntoView();
  }
}

async function main(root: HTMLElement) {
  try {
    const match = /^\/reviews\/([^/]+)\/?$/.exec(location.pathname);
    if (match) await detail(root, decodeURIComponent(match[1]));
    else await inbox(root);
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
      node("h1", "", "Harrhy Review"),
      node("div", "panel inset", notice, node("div", "row", retry, link("Review inbox", "/"))),
    );
  }
}

const root = document.getElementById("review-app");
if (root) void main(root);
