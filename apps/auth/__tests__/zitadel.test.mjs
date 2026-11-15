import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createZitadel } from "../src/zitadel.mjs";

test("only the verified native invalid-invitation contract permits rejection recovery", async () => {
  const directory = await mkdtemp(`${tmpdir()}/auth-zitadel-contract-`);
  let result = {
    status: 400,
    code: 3,
    message: "Invalid code (COMMAND-Wgn4q)",
  };
  const server = createServer((_request, response) => {
    response.writeHead(result.status, { "content-type": "application/json" });
    response.end(
      JSON.stringify({ code: result.code, message: result.message }),
    );
  });
  try {
    const tokenFile = `${directory}/token.json`;
    await writeFile(tokenFile, JSON.stringify({ token: "synthetic-only" }), {
      mode: 0o600,
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const api = createZitadel({
      baseUrl: `http://127.0.0.1:${server.address().port}`,
      loginTokenFile: tokenFile,
      managementTokenFile: tokenFile,
      organizationId: "synthetic",
    });
    const path = "/v2/users/synthetic/invite_code/verify";
    for (const [changes, endpoint, expected] of [
      [{}, path, true],
      [{ message: "Another error (COMMAND-other)" }, path, false],
      [{ code: 7 }, path, false],
      [{ status: 500 }, path, false],
      [{}, "/v2/users/synthetic/password", false],
    ]) {
      result = {
        status: 400,
        code: 3,
        message: "Invalid code (COMMAND-Wgn4q)",
        ...changes,
      };
      await assert.rejects(
        api(endpoint, {
          method: "POST",
          body: { verificationCode: "synthetic" },
        }),
        (error) => {
          assert.equal(error.invitationProofRejected, expected);
          assert.equal(error.message, "Identity service rejected the request");
          return true;
        },
      );
    }
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
