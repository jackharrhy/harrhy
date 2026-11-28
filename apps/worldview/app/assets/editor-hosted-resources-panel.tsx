import {
  type HostedProject,
  type HostedResourceMount,
} from "@harrhy/maps-protocol";
import { clientEntry, on, ref, type Handle } from "remix/component";
import {
  listHostedResources,
  removeHostedResource,
  resourceUploads,
  uploadHostedResource,
} from "./editor-hosted-resources.ts";
import type { EditorHostedResourcesContext } from "./editor-hosted-resources-bridge.ts";

function message(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}

export const EditorHostedResources = clientEntry(
  `file:///app/assets/editor-hosted-resources-panel.tsx#EditorHostedResources`,
  function EditorHostedResourcesComponent(handle: Handle) {
    let context: EditorHostedResourcesContext | null = null;
    let project: HostedProject | null = null;
    let mounts: readonly HostedResourceMount[] = [];
    let loaded = false;
    let resourceStatus = "";
    let nextCursor: string | null = null;
    let resourceBusy = false;
    let generation = 0;
    let filesInput: HTMLInputElement | null = null;
    let folderInput: HTMLInputElement | null = null;

    handle.queueTask(() => {
      window.addEventListener(
        "tea-maps-hosted-resources-bridge-ready",
        () =>
          window.dispatchEvent(new Event("tea-maps-hosted-resources-ready")),
        { signal: handle.signal },
      );
      window.addEventListener(
        "tea-maps-hosted-resources-state",
        (event) => {
          const next = (event as CustomEvent<EditorHostedResourcesContext>)
            .detail;
          context = next;
          if (project?.id === next.project?.id) {
            project = next.project;
            handle.update();
            if (project && !resourceBusy) void refresh(project, ++generation);
            return;
          }
          project = next.project;
          const request = ++generation;
          mounts = [];
          loaded = false;
          resourceStatus = "";
          resourceBusy = false;
          handle.update();
          if (project) void refresh(project, request);
        },
        { signal: handle.signal },
      );
      window.dispatchEvent(new Event("tea-maps-hosted-resources-ready"));
    });

    async function refresh(selected: HostedProject, request = generation) {
      resourceStatus = "Loading project resources";
      handle.update();
      try {
        const next = await listHostedResources(
          selected.id,
          fetch,
          handle.signal,
        );
        if (request !== generation || handle.signal.aborted) return;
        mounts = next;
        loaded = true;
        resourceStatus = "";
      } catch (cause) {
        if (request === generation && !handle.signal.aborted)
          resourceStatus = message(cause);
      }
      if (request === generation && !handle.signal.aborted) handle.update();
    }

    async function upload(folder: boolean) {
      const selected = project;
      const input = folder ? folderInput : filesInput;
      if (!selected || selected.role !== "owner" || !input || resourceBusy)
        return;
      const files = [...(input.files ?? [])];
      if (!files.length) return;
      let uploads: ReturnType<typeof resourceUploads>;
      try {
        uploads = resourceUploads(files, folder);
      } catch (cause) {
        resourceStatus = message(cause);
        handle.update();
        return;
      }
      const request = generation;
      resourceBusy = true;
      handle.update();
      try {
        for (const [index, item] of uploads.entries()) {
          resourceStatus = `Uploading ${index + 1} of ${uploads.length}: ${item.name}`;
          handle.update();
          await uploadHostedResource(selected.id, item);
        }
        input.value = "";
        context?.resourcesChanged(selected.id);
        if (request === generation) {
          await refresh(selected, request);
          if (!handle.signal.aborted)
            resourceStatus += ` · uploaded ${uploads.length}`;
        }
      } catch (cause) {
        if (request === generation) resourceStatus = message(cause);
      } finally {
        if (request === generation && !handle.signal.aborted) {
          resourceBusy = false;
          handle.update();
        }
      }
    }

    async function remove(mount: HostedResourceMount) {
      const selected = project;
      if (!selected || selected.role !== "owner" || resourceBusy) return;
      const request = generation;
      resourceBusy = true;
      handle.update();
      try {
        await removeHostedResource(selected.id, mount.id);
        context?.resourcesChanged(selected.id);
        if (request === generation) await refresh(selected, request);
      } catch (cause) {
        if (request === generation) resourceStatus = message(cause);
      } finally {
        if (request === generation && !handle.signal.aborted) {
          resourceBusy = false;
          handle.update();
        }
      }
    }

    return () => {
      const currentProject = project;
      const uniqueBytes = new Map(
        mounts.map((mount) => [mount.expectedSha256, mount.size]),
      );
      const totalBytes = [...uniqueBytes.values()].reduce(
        (sum, size) => sum + size,
        0,
      );
      return (
        <details id="hosted-project-resources" hidden={!currentProject}>
          <summary>Project resources</summary>
          <p id="hosted-resource-status" role="status">
            {resourceStatus ||
              `${mounts.length} resources · ${Math.ceil(totalBytes / (1024 * 1024))} / 1024 MiB`}
          </p>
          <ul id="hosted-resource-list">
            {loaded && mounts.length === 0 ? (
              <li>No project resources yet</li>
            ) : (
              mounts.map((mount) => (
                <li key={mount.id}>
                  <a
                    href={`/api/projects/${encodeURIComponent(currentProject!.id)}/resources/${encodeURIComponent(mount.id)}/content`}
                    download={mount.displayName}
                    data-rmx-document
                  >
                    {mount.displayName}
                  </a>
                  <small>
                    {mount.kind} · {Math.ceil(mount.size / 1024)} KiB
                  </small>
                  {currentProject?.role === "owner" && (
                    <button
                      type="button"
                      aria-label={`Remove ${mount.displayName}`}
                      disabled={resourceBusy}
                      mix={on("click", () => void remove(mount))}
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))
            )}
          </ul>
          <div
            id="hosted-resource-upload"
            hidden={currentProject?.role !== "owner"}
          >
            <label for="hosted-resource-files">Upload project files</label>
            <input
              id="hosted-resource-files"
              type="file"
              multiple
              accept=".wad,.lmp,.pcx,.fgd,.def,.ent,.spr"
              mix={ref((node: HTMLInputElement) => {
                filesInput = node;
              })}
            />
            <button
              id="hosted-resource-upload-button"
              type="button"
              disabled={resourceBusy}
              mix={on("click", () => void upload(false))}
            >
              Upload files
            </button>
            <label for="hosted-resource-folder">Game asset folder</label>
            <input
              id="hosted-resource-folder"
              type="file"
              multiple
              mix={ref((node: HTMLInputElement) => {
                folderInput = node;
                node.setAttribute("webkitdirectory", "");
              })}
            />
            <button
              id="hosted-resource-folder-button"
              type="button"
              disabled={resourceBusy}
              mix={on("click", () => void upload(true))}
            >
              Upload folder assets
            </button>
            <small>
              Up to 512 MiB per file. Files are copied into this project.
            </small>
          </div>
        </details>
      );
    };
  },
);
