import assert from "node:assert/strict";
import test from "node:test";
import { parseResumeToken } from "../shared/protocol.ts";
import { parsePoolCommand } from "../shared/pool-wire.ts";

test("only an explicit hello with an opaque v4 token can resume", () => {
  const resumeToken = crypto.randomUUID();
  assert.equal(
    parseResumeToken(JSON.stringify({ type: "hello", resumeToken })),
    resumeToken,
  );
  assert.equal(
    parseResumeToken(JSON.stringify({ type: "pool-join", resumeToken })),
    null,
  );
  assert.equal(
    parseResumeToken(
      JSON.stringify({ type: "hello", resumeToken: "house-bot" }),
    ),
    null,
  );
});

test("cue presence permits zero power; striking does not", () => {
  const cue = {
    type: "pool-cue",
    tableId: "east",
    yaw: 0,
    power: 0,
    turnToken: 5,
  };
  assert.deepEqual(parsePoolCommand(JSON.stringify(cue)), cue);
  assert.equal(
    parsePoolCommand(JSON.stringify({ ...cue, type: "pool-shot" })),
    null,
  );
  assert.equal(parsePoolCommand(JSON.stringify({ ...cue, yaw: null })), null);
  assert.equal(
    parsePoolCommand(JSON.stringify({ ...cue, turnToken: -1 })),
    null,
  );
});
