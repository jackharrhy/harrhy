import { get, route } from "remix/routes";

export const routes = route({
  xeetWorker: get("/_atlas/xeet-worker.js"),
  image: get("/_atlas/images/:space/*asset"),
  navigation: get("/_atlas/navigation.js"),
  comments: "/_atlas/comments/:operation",
  commentAsset: get("/_atlas/comment-assets/:digest.js"),
  widget: get("/_atlas/widgets/:digest.js"),
  home: get("/"),
  space: get("/spaces/:space/"),
  authors: get("/authors/"),
  author: get("/authors/:author/"),
  health: get("/healthz"),
  page: get("/*slug"),
});
