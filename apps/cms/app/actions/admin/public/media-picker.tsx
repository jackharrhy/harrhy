import { restoreDialogFocus } from "./dialog-focus.ts";
import { Button, Input } from "@harrhy/ui/native";
import { CmsSelect } from "./cms-select.tsx";
import { on, type Handle } from "remix/component";
import { Dialog } from "@harrhy/ui/interactive";
import type { Media } from "../../../ui/public/content-types.ts";

export function MediaPicker(
  handle: Handle<{
    media: Media[];
    choose: (media: Media) => void;
    close: () => void;
  }>,
) {
  const focusReturn = restoreDialogFocus();
  let query = "",
    folder = "all";
  return () => (
    <Dialog
      open
      title="Choose an image"
      className="media-dialog"
      initialFocus='input[type="search"]'
      mix={focusReturn}
      onClose={() => handle.props.close()}
    >
      <div className="section-heading">
        <Button
          type="button"
          className="button"
          mix={on("click", () => handle.props.close())}
        >
          Close
        </Button>
      </div>
      <Input
        type="search"
        aria-label="Search images"
        placeholder="Filename or alt text"
        mix={on("input", (event) => {
          query = event.currentTarget.value;
          handle.update();
        })}
      />
      <CmsSelect
        aria-label="Image folder"
        value={folder}
        onValueChange={(value) => {
          folder = value;
          handle.update();
        }}
        options={[
          { value: "all", label: "All folders" },
          { value: "unfiled", label: "Unfiled" },
          ...[
            ...new Map(
              handle.props.media
                .filter((m) => m.folder_id)
                .map((m) => [m.folder_id!, m.folder_path ?? "Folder"]),
            ).entries(),
          ].map(([id, path]) => ({ value: id, label: path })),
        ]}
      />
      <div className="picker-grid">
        {handle.props.media
          .filter(
            (m) =>
              m.mime_type.startsWith("image/") &&
              (folder === "all" ||
                (folder === "unfiled" && !m.folder_id) ||
                m.folder_id === folder) &&
              (m.filename + " " + m.alt)
                .toLowerCase()
                .includes(query.toLowerCase()),
          )
          .map((m) => (
            <Button
              type="button"
              className="picker-image"
              mix={on("click", () => handle.props.choose(m))}
            >
              <img
                src={"/tea/api/media/file/" + m.id}
                alt={m.alt ?? m.filename}
                loading="lazy"
              />
              <span>{m.filename}</span>
            </Button>
          ))}
      </div>
      <p className="muted">
        <a href="/tea/admin/media" target="_blank">
          Upload a file
        </a>
        , then save your edits and reload this page.
      </p>
    </Dialog>
  );
}
