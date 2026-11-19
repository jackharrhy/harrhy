import { Chess } from "chess.js";
import {
  chessBot,
  type ChessCommand,
  type ChessState,
} from "../shared/chess-wire.ts";

export function createChessTable(
  table: ChessState["table"],
  random = Math.random,
) {
  let botDue: number | undefined;
  const game = new Chess();
  let seats: string[] = [];
  let turnToken = 0;
  let lastMove: string | undefined;
  function snapshot(): ChessState {
    const result = game.isCheckmate()
      ? `Checkmate · ${game.turn() === "w" ? "Black" : "White"} wins`
      : game.isStalemate()
        ? "Draw · stalemate"
        : game.isThreefoldRepetition()
          ? "Draw · repetition"
          : game.isInsufficientMaterial()
            ? "Draw · insufficient material"
            : game.isDrawByFiftyMoves()
              ? "Draw · fifty moves"
              : null;
    const turn =
      seats.length === 2 && !result ? seats[game.turn() === "w" ? 0 : 1] : null;
    return {
      type: "chess",
      table,
      seats: [...seats],
      turn,
      turnToken,
      pieces: game
        .board()
        .flat()
        .filter((p) => p !== null),
      legal: turn ? game.moves({ verbose: true }).map((m) => m.lan) : [],
      check: game.isCheck(),
      result,
      lastMove,
    };
  }
  let state = snapshot();
  function update() {
    turnToken++;
    return (state = snapshot());
  }
  function reset() {
    botDue = undefined;
    game.reset();
    lastMove = undefined;
    return update();
  }
  function leave(id: string) {
    if (!seats.includes(id)) return;
    seats = seats.filter((p) => p !== id && p !== chessBot);
    return reset();
  }
  function move(lan: string) {
    lastMove = game.move({
      from: lan.slice(0, 2),
      to: lan.slice(2, 4),
      promotion: lan[4],
    }).san;
    return update();
  }
  function command(id: string, cmd: ChessCommand) {
    switch (cmd.type) {
      case "chess-join":
        if (seats.length >= 2 || seats.includes(id)) return;
        seats.push(id);
        if (table.houseBot) seats.push(chessBot);
        return update();
      case "chess-leave":
        return leave(id);
      case "chess-rematch":
        if (!seats.includes(id) || !state.result || cmd.turnToken !== turnToken)
          return;
        return reset();
      case "chess-move":
        if (
          id !== state.turn ||
          cmd.turnToken !== turnToken ||
          !state.legal.includes(cmd.move)
        )
          return;
        return move(cmd.move);
    }
  }
  return {
    kind: "chess" as const,
    table,
    command,
    snapshot: () => state,
    hasSeat: (id: string) => seats.includes(id),
    leave,
    tick(now: number) {
      if (state.turn !== chessBot) return;
      botDue ??= now + 700 + random() * 1000;
      if (now < botDue) return;
      botDue = undefined;
      return move(state.legal[Math.floor(random() * state.legal.length)]);
    },
  };
}
