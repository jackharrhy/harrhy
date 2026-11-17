// The three projections preserve many-to-many context without turning session links into preview/tree ownership.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ContextRead, Located, Preview } from "../../plugins/repositories/contract.ts";
import {
	latestActivity,
	locationGroups,
	locationsForTree,
	previewsForSession,
	previewsForTree,
	sessionActivity,
	sessionMatches,
	worktreesOf,
} from "../../plugins/repositories/model.ts";
import type { Session } from "../../plugins/sessions/contract.ts";

const locations: Located[] = [
	{ session: "one", conversation: 1, title: "One", env: null, cwd: "/work/src", archived: false, activity: "Working" },
	{ session: "two", conversation: 1, title: "Two", env: null, cwd: "/work", archived: false, activity: "Idle" },
	{ session: "one", conversation: 2, title: "Child", env: null, cwd: "/linked", archived: false, activity: "Idle" },
];
const context: ContextRead = {
	repositories: [
		{
			common: "/work/.git",
			checked: 1,
			trees: ["/work", "/linked", "/unoccupied"].map((path) => ({
				path,
				head: "abc",
				branch: "same-label",
				bare: false,
				detached: false,
			})),
		},
	],
	associations: locations.map((location) => ({
		session: location.session,
		conversation: location.conversation,
		cwd: location.cwd,
		common: "/work/.git",
		tree: location.cwd === "/linked" ? "/linked" : "/work",
		qualification: "Resolved directory",
	})),
	previewTrees: [
		{ preview: "ui", cwd: "/work/app", common: "/work/.git", tree: "/work", qualification: "Resolved directory" },
	],
	failures: [],
};
const previews: Preview[] = [
	{
		id: "ui",
		name: "UI",
		url: "https://ui.example/",
		session: "one",
		location: { env: null, cwd: "/work/app" },
		source: "Declared",
		lease: { kind: "unknown" },
		access: "Private",
		note: "",
	},
	{
		id: "atlas",
		name: "Atlas",
		url: "https://atlas.example/",
		session: "one",
		location: null,
		source: "Declared",
		lease: { kind: "none" },
		access: "Private",
		note: "Static release",
	},
];

test("all registered trees remain distinct, shared session context is many-to-many, and unoccupied trees remain visible", () => {
	const trees = worktreesOf(context);
	assert.equal(trees.length, 3);
	assert.equal(new Set(trees.map((tree) => tree.id)).size, 3);
	assert.deepEqual(
		locationsForTree(trees[0]!, locations, context).map((row) => row.session),
		["one", "two"],
	);
	assert.equal(locationsForTree(trees[1]!, locations, context)[0]?.conversation, 2);
	assert.deepEqual(locationsForTree(trees[2]!, locations, context), []);
	assert.equal(sessionActivity("one", locations), "Working");
	assert.equal(sessionActivity("two", locations), "Idle");
	assert.equal(sessionActivity("unknown", locations), "Stopped");
	assert.equal(
		sessionActivity(
			"one",
			locations.map((location) => ({ ...location, activity: "Failed" })),
		),
		"Failed",
	);
});

test("canonical tree groups combine subdirectory aliases and parent/children, not same-commonDir sibling trees or unresolved hosts", () => {
	const rows: Located[] = [
		...locations.map((row, index) => ({ ...row, updatedAt: index + 10 })),
		{ ...locations[0]!, conversation: 3, title: "Alias child", cwd: "/alias/apps/ui", kind: "child", updatedAt: 40 },
		{ ...locations[0]!, conversation: 4, cwd: "/gone", updatedAt: undefined },
		{ ...locations[0]!, conversation: 5, env: "other-host", cwd: "/work", updatedAt: undefined },
	];
	const evidence: ContextRead = {
		...context,
		associations: [
			...context.associations,
			{
				session: "one",
				conversation: 3,
				cwd: "/alias/apps/ui",
				common: "/work/.git",
				tree: "/work",
				qualification: "Resolved through a different path",
			},
		],
	};
	const groups = locationGroups(rows, evidence);
	assert.equal(groups.length, 4);
	assert.deepEqual(
		groups[0]!.locations.map((row) => row.title),
		["One", "Two", "Alias child"],
	);
	assert.equal(groups[1]!.worktree?.tree.path, "/linked");
	assert.equal(groups[2]!.worktree, undefined);
	assert.equal(groups[3]!.worktree, undefined);
	assert.equal(latestActivity(groups[0]!.locations), 40);
	assert.equal(latestActivity(groups[2]!.locations), undefined);
	assert.equal(latestActivity([]), undefined);
	assert.equal(
		locationGroups(rows, undefined).some((group) => group.worktree),
		false,
	);
});

test("a session-only preview is never assigned to its current worktree; moved path evidence invalidates joins", () => {
	const tree = worktreesOf(context)[0]!;
	assert.deepEqual(
		previewsForTree(tree, previews, context).map((preview) => preview.id),
		["ui"],
	);
	assert.deepEqual(
		previewsForSession("one", locations, previews, context).map((preview) => preview.id),
		["ui", "atlas"],
	);
	assert.deepEqual(
		previewsForSession("two", locations, previews, context).map((preview) => preview.id),
		["ui"],
	);
	assert.deepEqual(previewsForTree(tree, [{ ...previews[0]!, location: { env: null, cwd: "/moved" } }], context), []);
	assert.deepEqual(
		locationsForTree(
			tree,
			locations.map((location) => ({ ...location, cwd: "/moved" })),
			context,
		),
		[],
	);
	const session: Session = {
		id: "one",
		title: "One",
		cwd: "/work",
		env: null,
		createdAt: 1,
		updatedAt: 1,
		archivedAt: null,
		pinned: false,
		model: { provider: "fake", modelId: "fake" },
		thinkingLevel: "off",
		main: 1,
		branches: [],
	};
	assert.equal(sessionMatches(session, locations, previews, "atlas.example"), true);
	assert.equal(sessionMatches(session, locations, previews, "not-a-metadata-value"), false);
});
