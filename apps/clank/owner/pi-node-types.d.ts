import "node:path";

// Pi’s compat source uses the Node 22 name; the workspace uses Node 26 types.
declare module "node:path" {
  export type PlatformPath = typeof posix;
}
