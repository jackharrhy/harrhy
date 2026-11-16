import { Select } from "@harrhy/ui/interactive";
import { Button, Input, Notice } from "@harrhy/ui/native";
import { clientEntry, on, ref, type Handle } from "remix/component";
import type { Adornment, Media } from "../../../ui/public/content-types.ts";
import { ImageAppearance } from "../../../actions/admin/public/image-appearance.tsx";
import { AdornmentCanvas } from "./adornment-canvas.tsx";
import { MediaPicker } from "../../../actions/admin/public/media-picker.tsx";

export const AdornmentLibrary = clientEntry(
  import.meta.url,
  function AdornmentLibrary(
    handle: Handle<{ adornments: Adornment[]; media: Media[] }>,
  ) {
    let contextImage =
      handle.props.media.find(
        (m) =>
          m.mime_type.startsWith("image/") &&
          !handle.props.adornments.some((a) => a.media_id === m.id),
      )?.id ?? null;
    let photoStyle: Record<string, string | number | undefined> = {};
    let items = handle.props.adornments,
      editing: Adornment | null = null,
      picking = false,
      error = "",
      status = "",
      saving = false;
    return () => (
      <>
        <div className="page-heading">
          <div>
            <h1>
              Adornments<span className="count">{items.length}</span>
            </h1>
            <p className="muted">Tape and artwork placed around images.</p>
          </div>
          <Button
            variant="primary"
            mix={on("click", () => {
              editing = {
                id: "",
                name: "",
                media_id: null,
                css: { width: "30%", left: "35%", top: "0%" },
              };
              error = "";
              handle.update();
            })}
          >
            + New adornment
          </Button>
        </div>
        {error && (
          <Notice tone="danger" role="alert">
            {error}
          </Notice>
        )}
        {status && <Notice role="status">{status}</Notice>}
        <div className="adornment-grid">
          {items.map((a) => (
            <Button
              variant="quiet"
              className="adornment-tile"
              mix={on("click", () => {
                editing = structuredClone(a);
                error = "";
                handle.update();
              })}
            >
              <div>
                {a.media_id && (
                  <img src={"/tea/api/media/file/" + a.media_id} alt="" />
                )}
              </div>
              <strong>{a.name}</strong>
            </Button>
          ))}
        </div>
        {editing && (
          <dialog
            className="adornment-suite"
            inert={saving}
            aria-label="Adornment editor"
            mix={[
              ref((node) => node.showModal()),
              on("cancel", (e) => {
                e.preventDefault();
                if (!saving) {
                  editing = null;
                  handle.update();
                }
              }),
            ]}
          >
            <div className="section-heading">
              <h2>{editing.id ? editing.name : "New adornment"}</h2>
              <Button
                variant="quiet"
                disabled={saving}
                mix={on("click", () => {
                  editing = null;
                  handle.update();
                })}
              >
                Close
              </Button>
            </div>
            {error && (
              <Notice tone="danger" role="alert">
                {error}
              </Notice>
            )}
            <div className="suite-layout">
              <div>
                <label>
                  Preview image
                  <Select
                    aria-label="Preview image"
                    key={contextImage ?? ""}
                    defaultValue={contextImage ?? ""}
                    options={[
                      { value: "", label: "No image" },
                      ...handle.props.media
                        .filter(
                          (m) =>
                            m.mime_type.startsWith("image/") &&
                            !items.some((a) => a.media_id === m.id),
                        )
                        .map((m) => ({ value: m.id, label: m.filename })),
                    ]}
                    onValueChange={(value) => {
                      contextImage = value || null;
                      handle.update();
                    }}
                  />
                </label>
                <AdornmentCanvas
                  image={contextImage}
                  imageProps={photoStyle}
                  layers={[{ ...editing, id: "editing" }]}
                  selected="editing"
                  change={(_, css) => {
                    editing!.css = css;
                    handle.update();
                  }}
                />
              </div>
              <div>
                <details className="preview-photo-settings">
                  <summary>Preview photo styling</summary>
                  <ImageAppearance
                    value={photoStyle}
                    change={(changes) => {
                      photoStyle = { ...photoStyle, ...changes };
                      handle.update();
                    }}
                  />
                  <small>
                    Preview only. Save photo styling in the page image block.
                  </small>
                </details>
                <div className="field-grid">
                  <label>
                    Name
                    <Input
                      value={editing.name}
                      required
                      mix={on("input", (e) => {
                        editing!.name = e.currentTarget.value;
                        handle.update();
                      })}
                    />
                  </label>
                  <div>
                    <label>Artwork</label>
                    <Button
                      variant="quiet"
                      mix={on("click", () => {
                        picking = true;
                        handle.update();
                      })}
                    >
                      {editing.media_id ? "Change artwork" : "Choose artwork"}
                    </Button>
                  </div>
                </div>
                <details className="advanced-placement">
                  <summary>Advanced layout</summary>
                  <div className="field-grid">
                    {[
                      "width",
                      "height",
                      "top",
                      "right",
                      "bottom",
                      "left",
                      "rotation",
                      "border",
                      "filter",
                      "padding",
                      "margin",
                    ].map((key) => (
                      <label>
                        {key}
                        <Input
                          value={String(editing!.css[key] ?? "")}
                          placeholder={key === "rotation" ? "0" : ""}
                          mix={on("input", (e) => {
                            editing!.css[key] =
                              key === "rotation"
                                ? Number(e.currentTarget.value) || 0
                                : e.currentTarget.value;
                            handle.update();
                          })}
                        />
                      </label>
                    ))}
                  </div>
                </details>
                <p className="muted">
                  Saving changes this shared adornment wherever it is used. For
                  one image, edit its placement in the page draft.
                </p>
              </div>
            </div>
            <div className="form-actions">
              <Button
                variant="primary"
                disabled={saving}
                mix={on("click", async () => {
                  saving = true;
                  error = "";
                  handle.update();
                  try {
                    const r = await fetch("/tea/admin/adornments", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(editing),
                    });
                    const result = await r.json();
                    if (!r.ok) throw new Error(result.error);
                    items = result.items;
                    editing = null;
                    status = "Adornment saved.";
                  } catch (e) {
                    error = (e as Error).message;
                  } finally {
                    saving = false;
                    handle.update();
                  }
                })}
              >
                Save adornment
              </Button>
              {editing.id && (
                <Button
                  variant="danger"
                  mix={on("click", async () => {
                    const item = editing;
                    if (!item || saving || !confirm("Remove this adornment?"))
                      return;
                    saving = true;
                    handle.update();
                    try {
                      const r = await fetch(
                        "/tea/admin/adornments/" + item.id + "/delete",
                        { method: "POST" },
                      );
                      const result = await r.json();
                      if (!r.ok) throw new Error(result.error);
                      items = items.filter((a) => a.id !== item.id);
                      editing = null;
                      status = "Adornment removed.";
                    } catch (cause) {
                      error =
                        cause instanceof Error
                          ? cause.message
                          : "Could not remove adornment.";
                    } finally {
                      saving = false;
                    }
                    handle.update();
                  })}
                >
                  Remove adornment
                </Button>
              )}
            </div>
          </dialog>
        )}
        {picking && (
          <MediaPicker
            media={handle.props.media}
            choose={(m) => {
              editing!.media_id = m.id;
              picking = false;
              handle.update();
            }}
            close={() => {
              picking = false;
              handle.update();
            }}
          />
        )}
      </>
    );
  },
);
