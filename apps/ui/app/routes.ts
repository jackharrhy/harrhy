import { get, route } from "remix/routes";
export const routes = route({
  home: get("/"),
  explorer: get("/explorer"),
  component: get("/explorer/:component"),
  scenes: get("/scenes"),
  scene: get("/scenes/:scene"),
});
