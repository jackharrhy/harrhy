import assert from "node:assert/strict";
import test from "node:test";
import { createChessTable } from "../celld/chess-table.ts";
import { chessBot } from "../shared/chess-wire.ts";

const tableId = "chess-table";
const setup = (houseBot = false) =>
  createChessTable(
    { id: tableId, x: 0, y: 0, z: 0, yaw: 0, houseBot },
    () => 0.5,
  );

test("chess requires two seats and enforces turn, legality and checkmate", () => {
  const game = setup();
  game.command("white", { type: "chess-join", tableId });
  assert.equal(game.snapshot().turn, null);
  game.command("black", { type: "chess-join", tableId });
  const move = (
    id: string,
    lan: string,
    turnToken = game.snapshot().turnToken,
  ) => game.command(id, { type: "chess-move", tableId, move: lan, turnToken });
  assert.equal(move("black", "e7e5"), undefined);
  assert.equal(move("white", "e2e5"), undefined);
  assert.equal(move("white", "f2f3", 0), undefined);
  assert.ok(move("white", "f2f3"));
  assert.ok(move("black", "e7e5"));
  assert.ok(move("white", "g2g4"));
  assert.match(move("black", "d8h4")?.result ?? "", /Checkmate.*Black/);
  assert.equal(
    game.command("white", {
      type: "chess-rematch",
      tableId,
      turnToken: game.snapshot().turnToken,
    })?.turn,
    "white",
  );
});

test("only the bot table auto-seats a bot and delays its legal reply", () => {
  const game = setup(true);
  assert.deepEqual(
    game.command("white", { type: "chess-join", tableId })?.seats,
    ["white", chessBot],
  );
  assert.equal(
    game.command("stranger", { type: "chess-join", tableId }),
    undefined,
  );
  const token = game.snapshot().turnToken;
  const pending = game.command("white", {
    type: "chess-move",
    tableId,
    turnToken: token,
    move: "e2e4",
  });
  assert.equal(pending?.turn, chessBot);
  assert.equal(game.tick(100), undefined);
  assert.equal(game.tick(1299), undefined);
  const reply = game.tick(1300);
  assert.equal(reply?.turnToken, token + 2);
  assert.equal(reply?.turn, "white");
  assert.equal(reply?.pieces.find((p) => p.square === "e4")?.type, "p");
  assert.deepEqual(game.leave("white")?.seats, []);
  assert.equal(game.tick(5000), undefined);
});
