import { arr, bool, obj, opt, str, union } from "@earendil-works/pi-schema";
import { literal, method, remote, serverHost } from "@p2/app/v1";

const SessionId = str({
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});
const Scope = union([arr(SessionId, { maxItems: 100 }), literal("all-private")]);
export const GrantFields = {
  discover: opt(Scope),
  send: opt(obj({ sessions: Scope, familiar: opt(bool()) })),
  receipts: opt(bool()),
};
export const Grant = obj(GrantFields);
export const Hash = str({ pattern: "^[a-f0-9]{64}$" });
export const Status = union([
  obj({ enabled: literal(false) }),
  obj({ enabled: literal(true), revision: str(), grant: Grant }),
]);
export const AdminMethods = {
  status: method(obj({}), Status),
  provision: method(obj({ grant: Grant, bearerHash: Hash }), Status),
  rotate: method(obj({ bearerHash: Hash }), Status),
  revoke: method(obj({}), Status),
};
export const LocalInboxAdmin = remote("p2.local-inbox-admin", {
  version: 1,
  params: {},
  hostAddress: serverHost,
  variants: { owner: { methods: AdminMethods } },
});
