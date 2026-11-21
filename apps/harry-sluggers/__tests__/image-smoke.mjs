import assert from "node:assert/strict";
import {
  docker,
  withImageContainer,
} from "../../../scripts/ci/image-container.mjs";

export function smokeSluggers(image) {
  withImageContainer(image, [], (id, start) => {
    start();
    const exitCode = Number(docker("wait", id).trim());
    assert.ok(
      Number.isInteger(exitCode) && exitCode > 0,
      "Unexpected startup without a database",
    );
    assert.match(
      docker("logs", id),
      /HARRHY_SLUGGERS_DATABASE_URL is required/,
    );
    console.log(
      "Sluggers default CMD fails closed without database configuration",
    );
  });
}
