import type { CursorRoom } from "../cursors/room.ts";
import { createContextKey } from "remix/router";
import type { IdentityConfig } from "@harrhy/identity";
import type { RefMcpAccess } from "../mcp/auth.ts";
import type { BoardCell } from "./board-cell.ts";
import type { DirectoryCell } from "./directory-cell.ts";
import type { ExportCell } from "./export-cell.ts";

export interface AppRuntimeService {
  exports: DurableObjectStub<ExportCell>;
  directory: DurableObjectStub<DirectoryCell>;
  board(id: string): DurableObjectStub<BoardCell>;
  liveBoard?: DurableObjectNamespace<CursorRoom>;
  media: R2Bucket;
}

export const AppRuntime = createContextKey<AppRuntimeService>();
export const ArchiveSubject = createContextKey<string | null>();
export const Authenticated = createContextKey<boolean>();
export const McpAccess = createContextKey<RefMcpAccess | null>();
export const CurrentSessionToken = createContextKey<string | null>();
export const AppIdentity = createContextKey<{
  config: IdentityConfig;
  origin: string;
  onAlternate?: boolean;
} | null>();

export function createRuntime(
  env: Env & {
    HARRHY_REF_LIVE_BOARD?: string;
    CURSORS?: DurableObjectNamespace<CursorRoom>;
  },
): AppRuntimeService {
  return {
    get exports() {
      return env.EXPORTS.getByName("main");
    },
    directory: env.DIRECTORY.getByName("main"),
    board(id: string) {
      return env.BOARDS.getByName(id);
    },
    liveBoard: env.HARRHY_REF_LIVE_BOARD === "1" ? env.CURSORS : undefined,
    media: env.MEDIA,
  };
}
