import { afterEach, expect, it, vi } from "vitest";
import { saveBoardLink, uploadBoardImage } from "../board-resources.ts";
import type { AppRuntimeService } from "../runtime.ts";
import * as previews from "../link-preview.ts";

function setup() {
  const board = {
    storeAsset: vi.fn().mockResolvedValue(undefined),
    existingLink: vi.fn().mockResolvedValue(null),
    recordLink: vi.fn(),
    refreshLink: vi.fn(),
  };
  const media = { put: vi.fn(), delete: vi.fn() };
  const runtime = {
    board: vi.fn(() => board),
    media,
  } as unknown as AppRuntimeService;
  return { runtime, board, media };
}

const preview = {
  url: "https://example.com/post",
  title: "Post",
  description: "",
  imageUrl: "https://example.com/image.png",
  siteName: "Example",
};
const saved = { assetId: "asset", preview, existingItemId: "item" };

afterEach(() => vi.restoreAllMocks());

it("validates image size and signatures before storing anything", async () => {
  const { runtime, media } = setup();
  expect(
    await uploadBoardImage(runtime, "board", new File([], "empty")),
  ).toEqual({
    ok: false,
    message: "Image must be 20 MB or less",
    status: 413,
  });
  expect(
    await uploadBoardImage(
      runtime,
      "board",
      new File(["text"], "fake.png", { type: "image/png" }),
    ),
  ).toEqual({
    ok: false,
    message: "PNG, JPEG, GIF, or WebP required",
    status: 415,
  });
  expect(media.put).not.toHaveBeenCalled();
});

it("uses detected MIME, bounds filenames, and returns the stored asset URL", async () => {
  const { runtime, board, media } = setup();
  const file = new File([new Uint8Array([137, 80, 78, 71])], "x".repeat(180), {
    type: "text/plain",
  });
  const result = await uploadBoardImage(runtime, "board", file);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Upload failed");
  const { assetId } = result.value;
  expect(result).toEqual({
    ok: true,
    status: 201,
    value: {
      assetId,
      filename: "x".repeat(160),
      url: `/media/board/${assetId}`,
    },
  });
  expect(media.put).not.toHaveBeenCalled();
  expect(board.storeAsset).toHaveBeenCalledWith(
    "board",
    {
      id: assetId,
      objectKey: `boards/board/${assetId}`,
      filename: "x".repeat(160),
      contentType: "image/png",
      size: 4,
    },
    expect.any(ArrayBuffer),
  );
});

it("does not delete committed media when the metadata RPC response is lost", async () => {
  const { runtime, board, media } = setup();
  const failure = new Error("Write failed");
  let committed = false;
  board.storeAsset.mockImplementation(async () => {
    committed = true;
    throw failure;
  });
  await expect(
    uploadBoardImage(
      runtime,
      "board",
      new File([new Uint8Array([255, 216, 255])], "photo"),
    ),
  ).rejects.toBe(failure);
  expect(committed).toBe(true);
  expect(media.delete).not.toHaveBeenCalled();
});

it("rejects private URLs and returns existing normalized links without fetching", async () => {
  const { runtime, board } = setup();
  const fetch = vi.spyOn(previews, "previewLink");
  expect(await saveBoardLink(runtime, "board", "http://127.0.0.1/")).toEqual({
    ok: false,
    message: "Enter a public web URL",
    status: 400,
  });
  board.existingLink.mockResolvedValue(saved);
  expect(
    await saveBoardLink(runtime, "board", "https://example.com/post#fragment"),
  ).toEqual({ ok: true, value: saved, status: 200 });
  expect(board.existingLink).toHaveBeenCalledWith("board", preview.url);
  expect(fetch).not.toHaveBeenCalled();
});

it("preserves refresh failure statuses without replacing the existing link", async () => {
  const { runtime, board } = setup();
  expect(
    await saveBoardLink(runtime, "board", preview.url, true),
  ).toMatchObject({ ok: false, status: 404 });
  board.existingLink.mockResolvedValue(saved);
  const fetch = vi
    .spyOn(previews, "previewLink")
    .mockResolvedValue({ ...preview, imageUrl: null });
  expect(
    await saveBoardLink(runtime, "board", preview.url, true),
  ).toMatchObject({ ok: false, status: 422 });
  fetch.mockResolvedValue(preview);
  vi.spyOn(previews, "cachePreviewImage").mockResolvedValue(preview);
  expect(
    await saveBoardLink(runtime, "board", preview.url, true),
  ).toMatchObject({ ok: false, status: 502 });
  expect(board.refreshLink).not.toHaveBeenCalled();
});

it("saves cached previews and preserves the refresh payload and race failure", async () => {
  const { runtime, board } = setup();
  vi.spyOn(previews, "previewLink").mockResolvedValue(preview);
  const cached = { ...preview, imageUrl: "/previews/board/hash" };
  vi.spyOn(previews, "cachePreviewImage").mockResolvedValue(cached);
  board.recordLink.mockResolvedValue(saved);
  expect(await saveBoardLink(runtime, "board", preview.url)).toEqual({
    ok: true,
    value: saved,
    status: 201,
  });
  expect(board.recordLink).toHaveBeenCalledWith("board", cached);
  board.existingLink.mockResolvedValue(saved);
  const updated = { ...saved, changed: true };
  board.refreshLink.mockResolvedValue(updated);
  expect(await saveBoardLink(runtime, "board", preview.url, true)).toEqual({
    ok: true,
    value: updated,
    status: 200,
  });
  expect(board.refreshLink).toHaveBeenCalledWith("board", "asset", cached);
  board.refreshLink.mockResolvedValue(null);
  expect(
    await saveBoardLink(runtime, "board", preview.url, true),
  ).toMatchObject({ ok: false, status: 404 });
});
