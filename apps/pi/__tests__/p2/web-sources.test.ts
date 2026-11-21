// The pages' base bundle builds from sources, as the server process runs them: none of its files comes from a workspace
// package's `dist/`, which a checkout that never builds them (the phone) lacks. A package whose `exports` name only
// `dist/` (pi-ai's `./utils/*`) broke the base there while CI, with `dist/`, passed. (Plugins' web scripts read no
// workspace package: the app's packages are host packages to them.)
import assert from "node:assert/strict";
import { relative } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { buildBase, WEB_PREFIX } from "@earendil-works/chord/surfaces";
import { WEB_ENTRY, WEB_RESOLUTION } from "../../src/hosts/web/base.ts";

const REPOSITORY = fileURLToPath(new URL("../../compat/", import.meta.url));

/** The files of `paths` under a workspace package's `dist/`, relative to the repository. */
const fromDist = (paths: Iterable<string>): string[] =>
	[...paths].map((path) => relative(REPOSITORY, path)).filter((path) => /^packages\/[^/]+\/dist\//.test(path));

describe("the pages' code from sources", () => {
	it("builds the base bundle without a package's dist/", async () => {
		const base = await buildBase(WEB_ENTRY, "browser", WEB_PREFIX, WEB_RESOLUTION);
		assert.deepEqual(fromDist(base.inputs.keys()), []);
	});
});
