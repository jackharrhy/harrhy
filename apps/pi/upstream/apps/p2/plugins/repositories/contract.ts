// Owner-private, on-demand observations of known repository locations; no worker or shared view state.
import { arr, bool, nul, num, obj, opt, type Static, str, union } from "@earendil-works/pi-schema";
import { evolve, LocationSchema, literal, method, propertiesOf, remote, serverHost } from "@p2/app/v1";

export const SeedSchema = obj({ id: str(), env: union([str(), nul()]), cwd: str(), label: str() });
export type Seed = Static<typeof SeedSchema>;
export const LocatedV1Schema = obj({
	session: str(),
	conversation: num(),
	title: str(),
	env: union([str(), nul()]),
	cwd: str(),
	archived: bool(),
	activity: str(),
});
export const LocatedSchema = obj({
	...propertiesOf(LocatedV1Schema),
	updatedAt: opt(num()),
	kind: opt(union([literal("session"), literal("branch"), literal("child")])),
});
export type Located = Static<typeof LocatedSchema>;
export const AssociationSchema = obj({
	session: str(),
	conversation: num(),
	cwd: str(),
	tree: union([str(), nul()]),
	qualification: str(),
});
export type Association = Static<typeof AssociationSchema>;
export const TreeV1Schema = obj({
	path: str(),
	head: str(),
	branch: str(),
	bare: bool(),
	detached: bool(),
	locked: opt(str()),
	prunable: opt(str()),
});
export const TreeSchema = obj({
	...propertiesOf(TreeV1Schema),
	presence: opt(union([literal("existing"), literal("missing"), literal("unavailable")])),
});
export type Tree = Static<typeof TreeSchema>;

export const ObservationSchema = obj({ common: str(), checked: num(), trees: arr(TreeSchema) });
export type Observation = Static<typeof ObservationSchema>;
export const ReadSchema = obj({
	data: union([obj({ common: str(), checked: num(), trees: arr(TreeV1Schema) }), nul()]),
	failure: union([str(), nul()]),
});
export type RepositoryRead = Static<typeof ReadSchema>;
export const StatusSchema = obj({ checked: num(), tracked: num(), untracked: num(), failure: union([str(), nul()]) });
export type TreeStatus = Static<typeof StatusSchema>;

/** Only the owner can bind or request a read; paths must come from current known seeds or their registered trees. */
const RepositoriesV1 = remote("p2.repositories", {
	version: 1,
	params: {},
	hostAddress: serverHost,
	variants: {
		owner: {
			state: { seeds: arr(SeedSchema), locations: arr(LocatedV1Schema) },
			methods: {
				inspect: method(obj({ seed: str(), refresh: bool() }), ReadSchema),
				associate: method(obj({ seed: str() }), arr(AssociationSchema)),
				status: method(obj({ seed: str(), tree: str() }), StatusSchema),
			},
		},
	},
});

export const PreviewEventSchema = obj({
	kind: union([literal("updated"), literal("touched"), literal("created")]),
	at: num(),
});
const PreviewV2Schema = obj({
	id: str(),
	name: str(),
	url: union([str(), nul()]),
	source: str(),
	session: union([str(), nul()]),
	location: union([LocationSchema, nul()]),
	lease: union([
		obj({ kind: literal("unknown") }),
		obj({ kind: literal("none") }),
		obj({ kind: literal("expires"), at: num() }),
	]),
	access: str(),
	note: str(),
});
export const PreviewSchema = obj({ ...propertiesOf(PreviewV2Schema), event: opt(PreviewEventSchema) });
export type Preview = Static<typeof PreviewSchema>;
export const PreviewReadSchema = obj({ checked: num(), items: arr(PreviewSchema), failures: arr(str()) });
export type PreviewRead = Static<typeof PreviewReadSchema>;
export const ScopeSchema = union([
	obj({ kind: literal("all") }),
	obj({ kind: literal("session"), id: str() }),
	obj({ kind: literal("preview"), id: str() }),
]);
export type Scope = Static<typeof ScopeSchema>;
export const ContextReadSchema = obj({
	repositories: arr(ObservationSchema),
	associations: arr(obj({ common: str(), ...propertiesOf(AssociationSchema) })),
	previewTrees: arr(
		obj({ preview: str(), cwd: str(), common: str(), tree: union([str(), nul()]), qualification: str() }),
	),
	failures: arr(obj({ location: str(), error: str() })),
});
export type ContextRead = Static<typeof ContextReadSchema>;

/** Version 2 supplies the linked Sessions/Worktrees/Previews inspector without changing shared Views. */
const RepositoriesV2 = evolve(RepositoriesV1, (e) =>
	e
		.addMethod(
			"owner",
			"context",
			obj({ scope: ScopeSchema, refresh: bool() }),
			obj({
				...propertiesOf(ContextReadSchema),
				repositories: arr(obj({ common: str(), checked: num(), trees: arr(TreeV1Schema) })),
			}),
		)
		.addMethod(
			"owner",
			"previews",
			obj({ refresh: bool() }),
			obj({ checked: num(), items: arr(PreviewV2Schema), failures: arr(str()) }),
		),
);

/** Version 3 adds precise metadata ages and observed path presence, without starting any workers. */
export const Repositories = evolve(RepositoriesV2, (e) =>
	e
		.state("owner", "locations", arr(LocatedSchema))
		.result("context", ContextReadSchema)
		.result("previews", PreviewReadSchema),
);
