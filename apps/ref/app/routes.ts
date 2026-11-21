import { get, post, route } from "remix/routes";

export const routes = route({
  home: get("/"),
  exportPage: get("/archive/exports"),
  logout: post("/logout"),
  auth: route("auth", {
    login: get("/login"),
    callback: get("/callback"),
  }),
  boards: {
    create: post("/boards"),
    show: get("/boards/:boardId"),
    rename: post("/boards/:boardId/rename"),
  },
  resources: {
    snapshot: get("/api/boards/:boardId/snapshot"),
    cursors: get("/api/boards/:boardId/canvas/live"),
    websocket: get("/api/boards/:boardId/ws"),
    upload: post("/api/boards/:boardId/assets"),
    link: post("/api/boards/:boardId/links"),
    media: get("/media/:boardId/:assetId"),
    preview: get("/previews/:boardId/:imageId"),
  },
  mcp: {
    endpointGet: get("/mcp"),
    endpoint: post("/mcp"),
  },
  archive: {
    startExport: post("/api/archive/exports"),
    exportStatus: get("/api/archive/exports/:id"),
    downloadExport: get("/api/archive/exports/:id/download"),
    boards: get("/api/archive/boards"),
    restoreBoard: post("/api/archive/boards"),
    restoreAsset: post("/api/archive/boards/:boardId/assets/:assetId"),
    restorePreview: post("/api/archive/boards/:boardId/previews/:imageId"),
    restoreLink: post("/api/archive/boards/:boardId/links/:assetId"),
    restoreItem: post("/api/archive/boards/:boardId/items"),
  },
});
