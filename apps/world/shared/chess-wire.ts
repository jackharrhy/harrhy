import type { PieceSymbol, Color, Square } from "chess.js";
import type { TablePlacement } from "./table-placement.ts";

export const chessBot = "random-bot";
export type ChessState = {
  type: "chess";
  table: TablePlacement;
  seats: string[];
  turn: string | null;
  turnToken: number;
  pieces: { square: Square; type: PieceSymbol; color: Color }[];
  legal: string[];
  check: boolean;
  result: string | null;
  lastMove?: string;
};
export type ChessCommand =
  | { type: "chess-join" | "chess-leave" | "chess-bot"; tableId: string }
  | { type: "chess-rematch"; tableId: string; turnToken: number }
  | { type: "chess-move"; tableId: string; turnToken: number; move: string };

export function validateChessCommand(value: unknown): ChessCommand | null {
  if (!value || typeof value !== "object") return null;
  const { type, tableId, move, turnToken } = value as Record<string, unknown>;
  if (typeof tableId !== "string" || !/^[a-z0-9-]{1,48}$/.test(tableId))
    return null;
  if (type === "chess-join" || type === "chess-leave" || type === "chess-bot")
    return { type, tableId };
  if (
    typeof turnToken !== "number" ||
    !Number.isSafeInteger(turnToken) ||
    turnToken < 0
  )
    return null;
  if (type === "chess-rematch") return { type, tableId, turnToken };
  if (
    type === "chess-move" &&
    typeof move === "string" &&
    /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)
  )
    return { type, tableId, turnToken, move };
  return null;
}
