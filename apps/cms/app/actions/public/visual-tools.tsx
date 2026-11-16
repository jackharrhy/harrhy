import { clientEntry, css, on, type Handle } from "remix/component";
import {
  Button,
  ButtonLink,
  Inline,
  Notice,
  Textarea,
} from "@harrhy/ui/native";
import { Dialog } from "@harrhy/ui/interactive";
import { themeRoot } from "@harrhy/ui/theme";
import { adminTheme } from "../../ui/admin-theme.ts";

interface VisualField {
  id: string;
  text: string;
}

export const VisualTools = clientEntry(
  import.meta.url,
  function VisualTools(handle: Handle<{ active: boolean; slug: string }>) {
    const slug = handle.props.slug || "~";
    const endpoint = "/tea/admin/visual/" + encodeURIComponent(slug);
    const editor =
      slug === "~"
        ? "/tea/admin/homepage"
        : "/tea/admin/pages/" + encodeURIComponent(slug);
    const fields = new Map<string, string>();
    let revision = "",
      text = "",
      error = "",
      loadingError = "",
      saving = false;
    let selected: { id: string; element: Element } | undefined;
    let ready: Promise<void>;
    const sitePath = slug === "~" ? "/" : "/" + encodeURIComponent(slug);
    let siteLink = sitePath + (handle.props.active ? "" : "?tea_edit=1");

    async function refresh() {
      const response = await fetch(endpoint, {
        credentials: "same-origin",
        cache: "no-store",
        signal: handle.signal,
      });
      if (!response.ok || response.redirected)
        throw new Error("Sign in to TeaCMS to edit.");
      const data = (await response.json()) as {
        revision: string;
        fields: VisualField[];
      };
      revision = data.revision;
      fields.clear();
      for (const field of data.fields) fields.set(field.id, field.text);
    }
    async function select(element: Element) {
      await ready;
      if (loadingError || handle.signal.aborted) return;
      const id = element.getAttribute("data-preview-key");
      if (!id) return;
      if (!fields.has(id)) {
        location.href = editor + "?block=" + encodeURIComponent(id);
        return;
      }
      if (element instanceof HTMLElement)
        element.focus({ preventScroll: true });
      selected = { id, element };
      text = fields.get(id)!;
      error = "";
      handle.update();
    }
    async function save() {
      if (!selected || saving) return;
      const current = selected;
      saving = true;
      error = "";
      handle.update();
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          credentials: "same-origin",
          signal: handle.signal,
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ id: current.id, text, revision }),
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "Could not save draft.");
        revision = result.revision;
        fields.set(current.id, text);
        current.element.textContent = text;
        selected = undefined;
      } catch (cause) {
        if (!handle.signal.aborted)
          error =
            cause instanceof Error ? cause.message : "Could not save draft.";
      } finally {
        saving = false;
        if (!handle.signal.aborted) handle.update();
      }
    }
    handle.queueTask(() => {
      const url = new URL(location.href);
      url.searchParams.delete("tea_edit");
      if (!handle.props.active) url.searchParams.set("tea_edit", "1");
      siteLink = url.href;
      handle.update();
      if (!handle.props.active) return;
      ready = refresh().catch((cause) => {
        if (!handle.signal.aborted) {
          loadingError =
            cause instanceof Error
              ? cause.message
              : "Could not load editing tools.";
          handle.update();
        }
      });
      const elements = [...document.querySelectorAll("[data-preview-key]")];
      for (const element of elements) {
        if (!element.matches("a, button, input, textarea, select"))
          element.setAttribute("tabindex", "0");
        element.classList.add("tea-editable-field");
      }
      document.addEventListener(
        "click",
        (event) => {
          const element =
            event.target instanceof Element
              ? event.target.closest("[data-preview-key]")
              : null;
          if (!element || selected) return;
          event.preventDefault();
          void select(element);
        },
        { signal: handle.signal },
      );
      document.addEventListener(
        "keydown",
        (event) => {
          if (event.key !== "Enter" || !(event.target instanceof Element))
            return;
          const element = event.target.closest("[data-preview-key]");
          if (!element || selected) return;
          event.preventDefault();
          void select(element);
        },
        { signal: handle.signal },
      );
    });
    return () => (
      <div mix={[adminTheme, themeRoot, toolsStyles]} data-tea-visual-tools>
        <Inline id="tea-visual-bar">
          <strong>
            {loadingError || (handle.props.active ? "Editing draft" : "TeaCMS")}
          </strong>
          <ButtonLink href={editor} data-rmx-document>
            Full editor
          </ButtonLink>
          <ButtonLink href={siteLink} data-rmx-document variant="quiet">
            {handle.props.active ? "Done" : "Edit on site"}
          </ButtonLink>
        </Inline>
        {handle.props.active && (
          <Dialog
            id="tea-visual-dialog"
            open={Boolean(selected)}
            title="Edit this block"
            initialFocus="textarea"
            onClose={() => {
              if (!saving) {
                selected = undefined;
                handle.update();
              }
            }}
          >
            <Textarea
              aria-label="Block text"
              value={text}
              disabled={saving}
              rows={5}
              mix={on("input", (event) => {
                text = event.currentTarget.value;
              })}
            />
            <Inline className="tea-actions">
              <Button
                variant="primary"
                disabled={saving}
                mix={on("click", () => void save())}
              >
                {saving ? "Saving…" : "Save draft"}
              </Button>
              <ButtonLink
                href={
                  selected
                    ? editor + "?block=" + encodeURIComponent(selected.id)
                    : editor
                }
                data-rmx-document
              >
                Full editor
              </ButtonLink>
              <Button
                variant="quiet"
                disabled={saving}
                mix={on("click", () => {
                  selected = undefined;
                  handle.update();
                })}
              >
                Cancel
              </Button>
            </Inline>
            {error && (
              <Notice tone="danger" role="status">
                {error}
              </Notice>
            )}
          </Dialog>
        )}
      </div>
    );
  },
);

const toolsStyles = css({
  "& #tea-visual-bar": {
    position: "fixed",
    zIndex: 2147483646,
    bottom: "18px",
    left: "18px",
    maxWidth: "calc(100vw - 36px)",
    padding: "0.625rem",
    border: "1px solid var(--hui-border)",
    borderRadius: "var(--hui-panel-radius)",
    background: "var(--hui-surface)",
  },
  "& .tea-actions": { marginBlock: "1rem" },
});
