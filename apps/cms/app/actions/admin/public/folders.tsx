import { restoreDialogFocus } from "./dialog-focus.ts";
import { Notice, Button, Input, Textarea } from "@harrhy/ui/native";
import { CmsSelect } from "./cms-select.tsx";
import { folderPath } from "../../../ui/public/folder-path.ts";
export { folderPath } from "../../../ui/public/folder-path.ts";
import { css, on, type Handle, type RemixNode } from "remix/component";
import { Dialog } from "@harrhy/ui/interactive";
import type { MediaFolder } from "../../../ui/public/content-types.ts";

export function Folders(
  handle: Handle<{
    folders: MediaFolder[];
    selected: string;
    select: (id: string) => void;
    change: (folders: MediaFolder[]) => void;
  }>,
) {
  const focusReturn = restoreDialogFocus();
  let editing: MediaFolder | null = null,
    error = "",
    busy = false;
  function tree(parent: string | null, depth = 0): RemixNode {
    return handle.props.folders
      .filter((f) => f.parent_id === parent)
      .map((f) => (
        <div>
          <Button
            type="button"
            className={
              "folder-link" + (handle.props.selected === f.id ? " active" : "")
            }
            style={{ paddingLeft: 10 + depth * 14 }}
            mix={on("click", () => handle.props.select(f.id))}
          >
            ▱ {f.name}
          </Button>
          {tree(f.id, depth + 1)}
        </div>
      ));
  }
  return () => (
    <nav className="folder-nav" aria-label="Media folders">
      <h2>Library</h2>
      {[
        ["all", "All files"],
        ["unfiled", "Unfiled"],
        ["adornments", "Adornment artwork"],
      ].map(([id, label]) => (
        <Button
          type="button"
          className={
            "folder-link" + (handle.props.selected === id ? " active" : "")
          }
          mix={on("click", () => handle.props.select(id))}
        >
          {label}
        </Button>
      ))}
      <div className="section-heading">
        <h3>Folders</h3>
        <Button
          variant="quiet"
          type="button"
          className="text-button"
          mix={on("click", () => {
            editing = {
              id: "",
              name: "",
              description: "",
              parent_id: handle.props.folders.some(
                (f) => f.id === handle.props.selected,
              )
                ? handle.props.selected
                : null,
            };
            error = "";
            handle.update();
          })}
        >
          New folder
        </Button>
      </div>
      {tree(null)}
      {handle.props.folders.some((f) => f.id === handle.props.selected) && (
        <Button
          variant="quiet"
          type="button"
          className="text-button"
          mix={on("click", () => {
            editing = {
              ...handle.props.folders.find(
                (f) => f.id === handle.props.selected,
              )!,
            };
            error = "";
            handle.update();
          })}
        >
          Edit folder
        </Button>
      )}
      {editing && (
        <Dialog
          open
          title={editing.id ? "Edit folder" : "New folder"}
          className="folder-dialog"
          initialFocus="input"
          mix={[
            focusReturn,
            css({ width: "min(440px, calc(100vw - 24px))", padding: "24px" }),
          ]}
          onClose={() => {
            if (!busy) {
              editing = null;
              handle.update();
            }
          }}
        >
          <form
            inert={busy}
            mix={on("submit", async (event) => {
              event.preventDefault();
              busy = true;
              error = "";
              handle.update();
              try {
                const response = await fetch("/tea/admin/folders", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(editing),
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error);
                handle.props.change(result.folders);
                handle.props.select(result.id);
                editing = null;
              } catch (e) {
                error = (e as Error).message;
              } finally {
                busy = false;
                handle.update();
              }
            })}
          >
            {error && (
              <Notice role="alert" className="notice error" tone="danger">
                {error}
              </Notice>
            )}
            <label>
              Folder name
              <Input
                required
                maxLength={100}
                value={editing.name}
                mix={on("input", (e) => {
                  editing!.name = e.currentTarget.value;
                  handle.update();
                })}
              />
            </label>
            <label>
              Description
              <Textarea
                rows={3}
                maxLength={2000}
                value={editing.description}
                mix={on("input", (e) => {
                  editing!.description = e.currentTarget.value;
                  handle.update();
                })}
              />
            </label>
            <label>
              Inside
              <CmsSelect
                value={editing.parent_id ?? ""}
                onValueChange={(value) => {
                  editing!.parent_id = value || null;
                  handle.update();
                }}
                options={[
                  { value: "", label: "Library" },
                  ...handle.props.folders
                    .filter((f) => f.id !== editing!.id)
                    .map((f) => ({
                      value: f.id,
                      label: folderPath(handle.props.folders, f.id),
                    })),
                ]}
              />
            </label>
            <div className="form-actions">
              <Button
                variant="primary"
                type="submit"
                className="button primary"
                disabled={busy}
              >
                Save folder
              </Button>
              <Button
                type="button"
                className="button"
                disabled={busy}
                mix={on("click", () => {
                  editing = null;
                  handle.update();
                })}
              >
                Cancel
              </Button>
              {editing.id && (
                <Button
                  variant="danger"
                  type="button"
                  className="text-button danger"
                  disabled={busy}
                  mix={on("click", async () => {
                    if (!confirm("Remove this empty folder?")) return;
                    busy = true;
                    handle.update();
                    try {
                      const response = await fetch(
                        "/tea/admin/folders/" + editing!.id + "/delete",
                        { method: "POST" },
                      );
                      const result = await response.json();
                      if (!response.ok) throw new Error(result.error);
                      handle.props.change(result.folders);
                      handle.props.select("all");
                      editing = null;
                    } catch (e) {
                      error = (e as Error).message;
                    } finally {
                      busy = false;
                      handle.update();
                    }
                  })}
                >
                  Remove folder
                </Button>
              )}
            </div>
          </form>
        </Dialog>
      )}
    </nav>
  );
}
