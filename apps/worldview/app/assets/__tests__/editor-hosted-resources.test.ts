import { expect, it, vi } from "vitest";
import {
  listHostedResources,
  removeHostedResource,
  resourceUploads,
  uploadHostedResource,
} from "../editor-hosted-resources.ts";

const mount = {
  id: "resource-1",
  ordinal: 0,
  provider: "upload",
  providerAssetId: "asset-1",
  expectedSha256: "a".repeat(64),
  kind: "png",
  displayName: "textures/wall/brick.png",
  size: 4,
  createdAt: 1,
};

it("keeps contained game asset paths and maps resource extensions to service kinds", () => {
  const texture = new File(["image"], "brick.png", { type: "image/png" });
  Object.defineProperty(texture, "webkitRelativePath", {
    value: "game/assets/textures/wall/brick.png",
  });
  const unrelated = new File(["junk"], "notes.txt");
  Object.defineProperty(unrelated, "webkitRelativePath", {
    value: "game/docs/notes.txt",
  });
  expect(resourceUploads([texture, unrelated], true)).toEqual([
    { file: texture, name: "textures/wall/brick.png", kind: "png" },
  ]);
  expect(
    resourceUploads([new File(["wad"], "map.wad")], false)[0],
  ).toMatchObject({
    name: "map.wad",
    kind: "wad",
  });
  expect(() => resourceUploads([new File(["x"], "brick.png")], false)).toThrow(
    /Unsupported/,
  );
});

it("uses authenticated resource list, upload, and removal endpoints", async () => {
  const file = new File(["image"], "brick.png", { type: "image/png" });
  const fetcher = vi.fn<typeof fetch>(async (path, init) => {
    const endpoint = String(path);
    expect(init?.credentials).toBe("same-origin");
    if (init?.method === "PUT") {
      expect(endpoint).toContain("name=textures%2Fwall%2Fbrick.png");
      expect(endpoint).toContain("kind=png");
      expect(init.body).toBe(file);
      return Response.json({ mount }, { status: 201 });
    }
    if (init?.method === "DELETE") {
      expect(endpoint).toBe("/api/projects/project-1/resources/resource-1");
      return Response.json({ ok: true });
    }
    expect(endpoint).toBe("/api/projects/project-1/resources");
    return Response.json({ mounts: [mount] });
  });

  expect(await listHostedResources("project-1", fetcher)).toEqual([mount]);
  expect(
    await uploadHostedResource(
      "project-1",
      { file, name: mount.displayName, kind: "png" },
      fetcher,
    ),
  ).toEqual(mount);
  await removeHostedResource("project-1", mount.id, fetcher);
  expect(fetcher).toHaveBeenCalledTimes(3);
});
