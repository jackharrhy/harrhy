import {
  HostedProjectResponseSchema,
  HostedSessionResponseSchema,
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
import { readHostedApi } from "./hosted-api.ts";
import { ProjectDetailHeader } from "./project-detail-header.tsx";

export const ProjectResources = clientEntry(
  `file:///app/assets/project-resources-page.tsx#ProjectResources`,
  function ProjectResourcesComponent(handle: Handle<{ projectId: string }>) {
    let project: HostedProject | null = null;
    let mounts: readonly HostedResourceMount[] = [];
    let signInRequired = false;
    let loaded = false;
    let status = "Loading project…";
    let resourceStatus = "Loading project resources";
    let nextCursor: string | null = null;
    let resourceBusy = false;

    handle.queueTask(() => {
      void (async () => {
        try {
          const session = await readHostedApi(
            "/api/session",
            HostedSessionResponseSchema,
          );
          if (!session.user) {
            signInRequired = true;
            status = "Sign in to open this project";
          } else {
            const response = await readHostedApi(
              `/api/projects/${encodeURIComponent(handle.props.projectId)}`,
              HostedProjectResponseSchema,
            );
            project = response.project;
            document.title = `${project.name} · Worldview`;
            status = "";
            handle.update();
            await refresh();
          }
        } catch (cause) {
          status = message(cause);
        }
        handle.update();
      })();
    });

    async function refresh() {
      if (!project) return;
      mounts = await listHostedResources(project.id);
      loaded = true;
      resourceStatus = "";
      handle.update();
    }

    async function remove(mount: HostedResourceMount) {
      if (!project || project.role !== "owner" || resourceBusy) return;
      resourceBusy = true;
      resourceStatus = `Removing ${mount.displayName}`;
      handle.update();
      try {
        await removeHostedResource(project.id, mount.id);
        await refresh();
      } catch (cause) {
        resourceStatus = message(cause);
      } finally {
        resourceBusy = false;
        handle.update();
      }
    }

    async function upload(inputId: string, fromFolder: boolean) {
      if (!project || project.role !== "owner" || resourceBusy) return;
      const input = document.querySelector<HTMLInputElement>(`#${inputId}`);
      if (!input?.files?.length) return;
      resourceBusy = true;
      handle.update();
      try {
        const selected = resourceUploads([...input.files], fromFolder);
        for (const [index, item] of selected.entries()) {
          resourceStatus = `Uploading ${index + 1} of ${selected.length}: ${item.name}`;
          handle.update();
          await uploadHostedResource(project.id, item);
        }
        input.value = "";
        await refresh();
      } catch (cause) {
        resourceStatus = message(cause);
      } finally {
        resourceBusy = false;
        handle.update();
      }
    }

    return () => {
      const currentProject = project;
      const bytes = [
        ...new Map(
          mounts.map((mount) => [mount.expectedSha256, mount.size]),
        ).values(),
      ].reduce((sum, size) => sum + size, 0);
      return (
        <section class="project-detail">
          <p id="projects-status" role="status">
            {status}
          </p>
          {signInRequired ? (
            <a
              id="projects-login"
              href={`/auth/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`}
              data-rmx-document
            >
              Sign in
            </a>
          ) : null}
          {currentProject ? (
            <div>
              <ProjectDetailHeader
                project={currentProject}
                section="resources"
              />
              <h2>Resources</h2>
              <p>Project members can download mounted resources.</p>
              <p id="project-resource-status" role="status">
                {resourceStatus ||
                  `${mounts.length} resources · ${Math.ceil(bytes / (1024 * 1024))} / 1024 MiB`}
              </p>
              <div id="project-resource-list" class="project-list">
                {loaded && mounts.length === 0
                  ? "No project resources yet"
                  : mounts.map((mount) => (
                      <div class="project-row">
                        <a
                          href={`/api/projects/${encodeURIComponent(currentProject.id)}/resources/${encodeURIComponent(mount.id)}/content`}
                          download={mount.displayName}
                          data-rmx-document
                        >
                          {mount.displayName}
                        </a>
                        <small>
                          {mount.kind} · {Math.ceil(mount.size / 1024)} KiB
                        </small>
                        {currentProject.role === "owner" ? (
                          <button
                            type="button"
                            aria-label={`Remove ${mount.displayName}`}
                            disabled={resourceBusy}
                            mix={on("click", () => void remove(mount))}
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    ))}
              </div>
              {currentProject.role === "owner" ? (
                <div>
                  <section id="project-resource-upload">
                    <label for="project-resource-files">Upload resources</label>
                    <input
                      id="project-resource-files"
                      type="file"
                      multiple
                      accept=".wad,.lmp,.pcx,.fgd,.def,.ent,.spr"
                    />
                    <button
                      id="project-resource-upload-button"
                      type="button"
                      disabled={resourceBusy}
                      mix={on(
                        "click",
                        () => void upload("project-resource-files", false),
                      )}
                    >
                      Upload files
                    </button>
                    <label for="project-resource-folder">
                      Game asset folder
                    </label>
                    <input
                      id="project-resource-folder"
                      type="file"
                      multiple
                      mix={ref((node: HTMLInputElement) => {
                        node.setAttribute("webkitdirectory", "");
                      })}
                    />
                    <button
                      id="project-resource-folder-button"
                      type="button"
                      disabled={resourceBusy}
                      mix={on(
                        "click",
                        () => void upload("project-resource-folder", true),
                      )}
                    >
                      Upload folder
                    </button>
                  </section>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      );
    };
  },
);

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
