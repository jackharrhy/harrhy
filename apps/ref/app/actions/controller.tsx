import { createController } from "remix/router";
import { redirect } from "remix/response/redirect";
import {
  AppRuntime,
  AppIdentity,
  Authenticated,
  CurrentSessionToken,
} from "../data/runtime.ts";
import { tokenHash } from "../data/crypto.ts";
import { clearSessionCookie } from "../middleware/session.ts";
import { routes } from "../routes.ts";
import { AuthPage, ExportPage, HomePage } from "./page.tsx";

import { movedPath } from "./move.ts";

export default createController(routes, {
  actions: {
    async home(context) {
      const error =
        new URL(context.request.url).searchParams.get("error") ?? undefined;
      const moved = movedPath(
        context.request,
        context.get(AppIdentity)?.onAlternate,
      );
      if (!context.get(Authenticated))
        return context.render(<AuthPage error={error} moved={moved} />);
      const boards = await context.get(AppRuntime)!.directory.listBoards();
      return context.render(
        <HomePage boards={boards} error={error} moved={!!moved} />,
      );
    },
    exportPage(context) {
      if (!context.get(Authenticated)) return redirect(routes.home.href(), 303);
      return context.render(
        <ExportPage projectId={context.get(AppIdentity)!.config.projectId} />,
      );
    },
    async logout(context) {
      const token = context.get(CurrentSessionToken);
      const runtime = context.get(AppRuntime)!;
      if (token) {
        await runtime.directory.endSession(token);
        const hash = await tokenHash(token);
        const boards = await runtime.directory.listBoards();
        await Promise.allSettled(
          boards.map((board) => runtime.board(board.id).closeSession(hash)),
        );
      }
      return redirect("/", {
        status: 303,
        headers: {
          "Set-Cookie": clearSessionCookie(context.request),
          "Clear-Site-Data": '"cache"',
        },
      });
    },
  },
});
