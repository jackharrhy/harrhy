import { CmsSelect } from "../../../../app/actions/admin/public/cms-select.tsx";
import { Button, Input, Notice, Panel } from "@harrhy/ui/native";
import { clientEntry, on, type Handle } from "remix/component";
import type { Sidebar, Page } from "../../../../app/ui/public/content-types.ts";

export const NavigationEditor = clientEntry(
  import.meta.url,
  function NavigationEditor(
    handle: Handle<{ sidebar: Sidebar; pages: Page[] }>,
  ) {
    const data = structuredClone(handle.props.sidebar);
    data.categories = [
      { categoryTitle: null, items: data.categories.flatMap((c) => c.items) },
    ];
    data.top_image_id = null;
    const items = data.categories[0].items;
    let dirty = false,
      saving = false,
      status = "",
      error = "";
    function change() {
      dirty = true;
      status = "Unsaved changes";
      handle.update();
    }
    handle.queueTask(() =>
      window.addEventListener(
        "beforeunload",
        (e) => {
          if (dirty) {
            e.preventDefault();
            e.returnValue = "";
          }
        },
        { signal: handle.signal },
      ),
    );
    async function save() {
      saving = true;
      error = "";
      handle.update();
      const sent = JSON.stringify(data);
      try {
        const response = await fetch("/tea/admin/sidebar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: sent,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        dirty = JSON.stringify(data) !== sent;
        data.revision = result.revision;
        status = dirty ? "Unsaved changes" : "Navigation saved.";
      } catch (e) {
        error = (e as Error).message;
      } finally {
        saving = false;
        handle.update();
      }
    }
    return () => (
      <>
        <div className="page-heading">
          <div>
            <h1>Navigation</h1>
            <p className="muted">
              Header links, social profiles, and footer email.
            </p>
          </div>
          <Button
            variant="primary"
            disabled={saving || !dirty}
            mix={on("click", () => void save())}
          >
            {saving ? "Saving…" : "Save navigation"}
          </Button>
        </div>
        {error && (
          <Notice tone="danger" role="alert">
            {error}
          </Notice>
        )}
        <p role="status" className="save-status">
          {status}
        </p>
        <Panel>
          <h2>Pages</h2>
          {items.map((item, i) => (
            <div className="navigation-item">
              <label>
                Link label
                <Input
                  value={item.text}
                  mix={on("input", (e) => {
                    item.text = e.currentTarget.value;
                    change();
                  })}
                />
              </label>
              <label>
                Page
                <CmsSelect
                  aria-label="Page"
                  value={item.pageSlug}
                  options={[
                    { value: "", label: "Homepage" },
                    ...handle.props.pages.map((p) => ({
                      value: p.slug,
                      label: p.title,
                    })),
                  ]}
                  onValueChange={(value) => {
                    item.pageSlug = value;
                    change();
                  }}
                />
              </label>
              <div className="block-actions">
                <Button
                  variant="quiet"
                  aria-label="Move link up"
                  disabled={!i}
                  mix={on("click", () => {
                    [items[i - 1], items[i]] = [item, items[i - 1]];
                    change();
                  })}
                >
                  ↑
                </Button>
                <Button
                  variant="quiet"
                  aria-label="Move link down"
                  disabled={i === items.length - 1}
                  mix={on("click", () => {
                    [items[i + 1], items[i]] = [item, items[i + 1]];
                    change();
                  })}
                >
                  ↓
                </Button>
                <Button
                  variant="danger"
                  aria-label="Remove link"
                  mix={on("click", () => {
                    items.splice(i, 1);
                    change();
                  })}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
          <Button
            variant="quiet"
            className="small"
            mix={on("click", () => {
              items.push({ text: "New link", pageSlug: "" });
              change();
            })}
          >
            Add link
          </Button>
        </Panel>
        <Panel>
          <h2>Social profiles and email</h2>
          <p className="muted">
            Use Instagram, SoundCloud, or YouTube for icons. Add a mailto: URL
            for the footer email.
          </p>
          {data.links.map((link, i) => (
            <div className="navigation-item">
              <label>
                Service
                <Input
                  value={link.service}
                  mix={on("input", (e) => {
                    link.service = e.currentTarget.value;
                    change();
                  })}
                />
              </label>
              <label>
                URL
                <Input
                  value={link.url}
                  mix={on("input", (e) => {
                    link.url = e.currentTarget.value;
                    change();
                  })}
                />
              </label>
              <Button
                variant="danger"
                aria-label="Remove external link"
                mix={on("click", () => {
                  data.links.splice(i, 1);
                  change();
                })}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            variant="quiet"
            className="small"
            mix={on("click", () => {
              data.links.push({ service: "", url: "" });
              change();
            })}
          >
            Add external link
          </Button>
        </Panel>
      </>
    );
  },
);
