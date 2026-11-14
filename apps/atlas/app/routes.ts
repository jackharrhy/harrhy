import { get, route } from "remix/routes";

export const routes = route({
  home: get("/"),
  search: get("/search/"),
  space: get("/spaces/:space/"),
  spaceSearch: get("/spaces/:space/search/"),
  authors: get("/authors/"),
  author: get("/authors/:author/"),
  health: get("/healthz"),
  page: get("/*slug"),
});
