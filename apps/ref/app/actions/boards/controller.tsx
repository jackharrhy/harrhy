import { currentLog } from "@harrhy/logger";
import { createController } from "remix/router";
import { redirect } from "remix/response/redirect";
import { AppRuntime, AppIdentity, Authenticated } from "../../data/runtime.ts";
import { routes } from "../../routes.ts";
import { AuthPage, BoardPage } from "../page.tsx";

import { movedPath } from "../move.ts";

export default createController(routes.boards, {
  actions: {
    async create(context) {
      const log = currentLog();
      if (!context.get(Authenticated)) return redirect("/", 303);
      const form = context.get(FormData)!;
      const runtime = context.get(AppRuntime)!;
      const board = await runtime.directory.createBoard(
        String(form.get("title") ?? ""),
      );
      if (!board) return redirect("/?error=Enter+a+board+name", 303);
      log?.set({ "resource.boardId": board.id });
      await runtime.board(board.id).initialize(board.id);
      return redirect(`/boards/${board.id}`, 303);
    },
    async show(context) {
      const moved = movedPath(
        context.request,
        context.get(AppIdentity)?.onAlternate,
      );
      if (!context.get(Authenticated))
        return moved
          ? context.render(<AuthPage moved={moved} />)
          : redirect("/", 303);
      const board = await context
        .get(AppRuntime)!
        .directory.board(context.params.boardId);
      if (!board) return new Response("Board not found", { status: 404 });
      return context.render(
        <BoardPage
          board={board}
          liveBoard={!!context.get(AppRuntime)!.liveBoard}
          moved={!!moved}
          error={
            new URL(context.request.url).searchParams.get("error") ?? undefined
          }
        />,
      );
    },
    async rename(context) {
      if (!context.get(Authenticated))
        return new Response("Forbidden", { status: 403 });
      const form = context.get(FormData)!;
      const board = await context
        .get(AppRuntime)!
        .directory.renameBoard(
          context.params.boardId,
          String(form.get("title") ?? ""),
        );
      if (context.request.headers.get("Accept") === "application/json")
        return board
          ? Response.json({ title: board.title })
          : new Response("Could not rename board", { status: 400 });
      return redirect(
        board
          ? `/boards/${board.id}`
          : `/boards/${context.params.boardId}?error=Could+not+rename+board`,
        303,
      );
    },
  },
});
