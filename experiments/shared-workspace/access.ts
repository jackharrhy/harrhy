import type { Store } from "./storage.ts";
export const hosts = ["home", "away"] as const;
const people = ["owner", "marty", "outsider"] as const;
export type Host = (typeof hosts)[number];
export type Principal = (typeof people)[number];
export type Target = "familiar" | "scoped";
export type Route = `${Host}/${Target}`;
export type Access = { read: boolean; send: boolean; epoch: number };
export type Identity = { host: Host; principal: Principal };
export const fixture = new Map<string, Identity>(
  hosts.flatMap((host) =>
    people.map(
      (principal) =>
        [`Bearer fixture-${host}-${principal}`, { host, principal }] as const,
    ),
  ),
);
export function check(ok: unknown, code = "DENIED"): asserts ok {
  if (!ok) throw new Error(code);
}
export const routes = [
  "home/familiar",
  "home/scoped",
  "away/familiar",
  "away/scoped",
] as const satisfies readonly Route[];
export const isRoute = (value: unknown): value is Route =>
  routes.some((route) => route === value);

export const isTarget = (value: unknown): value is Target =>
  value === "familiar" || value === "scoped";
export function roomAccess(store: Store) {
  const acl = (route: Route, p: Principal): Access =>
    p === "owner"
      ? { read: true, send: true, epoch: 0 }
      : p === "marty"
        ? store.state.rooms[route].marty
        : { read: false, send: false, epoch: 0 };
  const allow = (
    route: Route,
    p: Principal,
    action: "read" | "send",
    epoch: number,
  ) => {
    const rule = acl(route, p);
    check(rule.epoch === epoch && rule[action]);
  };

  const canRead = (route: Route, principal: Principal, epoch: number) => {
    const rule = acl(route, principal);
    return rule.read && rule.epoch === epoch;
  };
  return { acl, allow, canRead };
}
