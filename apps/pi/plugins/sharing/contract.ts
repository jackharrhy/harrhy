import { arr, bool, nul, num, obj, opt, type Static, str, union } from "@earendil-works/pi-schema";
import { evolve, literal, local, method, param, record, remote, serverHost } from "@p2/app/v1";

export const ModeSchema = union([literal("view"), literal("full")]);
export type ShareMode = Static<typeof ModeSchema>;

export const LinkSchema = obj({
	id: str(),
	session: str(),
	mode: ModeSchema,
	token: str(),
});
export type ShareLink = Static<typeof LinkSchema>;

/** A guest's current principal: the sessions shared with it now (see `GuestPrincipal`). */
export const GuestGrantSchema = obj({
	kind: literal("guest"),
	id: str(),
	name: str(),
	home: str(),
	sessions: record(ModeSchema),
	revision: num(),
});

export const ConnectedSchema = obj({
	id: str(),
	name: str(),
	sessions: record(ModeSchema),
});

/**
 * Share links, guests and their grants (server, tables of the server's store; links and grants keyed by their session). Host-internal. A guest holds one grant per
 * session shared with it; every change of its grants (share, join, removal, link reset, archive, restore) bumps its
 * revision and invalidates the objects of the older principal.
 *
 * Sessions are shared through links, for browsers on loopback or a tunnel host. A session has at most one link per
 * mode. Joining mints a cookie (the name is self-chosen); the same browser joining more links gains their sessions.
 */
const SharesV1 = local("p2.shares", {
	version: 1,
	params: {},
	members: {
		/** Every link (small: at most two per session). */
		links: arr(LinkSchema),
		/** The principal of a guest cookie value (`<id>.<secret>`), or null. */
		authenticate: method(obj({ cookie: str() }), union([GuestGrantSchema, nul()])),
		/** A guest's current principal, or null (nothing shared with it now). */
		grant: method(obj({ id: str() }), union([GuestGrantSchema, nul()])),
		/** The live link of a token, or null (reset, archived). */
		active: method(obj({ token: str() }), union([LinkSchema, nul()])),
		link: method(
			obj({
				session: str(),
				mode: ModeSchema,
				reset: bool(),
				remoteConfirmed: opt(bool()),
			}),
		),
		remove: method(obj({ session: str(), guestId: str() })),
		/**
		 * Joins through a link: the browser's guest (its cookie) gains the link's session; otherwise a new guest is
		 * created and `cookie` is its value. Throws when the link ended or the guest was removed from that session.
		 */
		join: method(obj({ token: str(), name: str(), cookie: opt(str()) }), obj({ session: str(), cookie: opt(str()) })),
	},
});

/** Ends all sharing of exactly one session. */
const SharesV2 = evolve(SharesV1, (e) => e.addMethod("disableSession", obj({ session: str() }), nul()));

export const Shares = evolve(SharesV2, (e) => e.addMethod("isShared", obj({ session: str() }), bool()));

/** Guests whose browsers are connected now (server, in memory). */
export const Presence = local("p2.share-presence", {
	/** 2: derived from the references to `GuestPresence` (no enter and leave). */
	version: 2,
	params: {},
	members: { guests: record(ConnectedSchema) },
});

/** Held by a guest's browser for its page's lifetime: marks the guest connected. Nothing for the owner. */
export const GuestPresence = remote("p2.guest-presence", {
	version: 1,
	params: {},
	hostAddress: serverHost,
	variants: { owner: {}, guest: {} },
});

/**
 * Sharing of one session (owner only): its links and connected guests.
 */
const SharingV1 = remote("p2.sharing", {
	version: 1,
	params: { session: param.str() },
	hostAddress: serverHost,
	variants: {
		owner: {
			state: {
				/** The remote environments (comma-separated) the session's conversations work on, or null: this host. */
				env: union([str(), nul()]),
				links: arr(obj({ mode: ModeSchema, token: str(), url: str() })),
				guests: arr(obj({ id: str(), name: str(), mode: ModeSchema })),
			},
			methods: {
				/** Creates the link of `mode`, or with `reset` replaces it (new token) and ends its guests' access. */
				link: method(
					obj({
						mode: ModeSchema,
						reset: opt(bool()),
						remoteConfirmed: opt(bool()),
					}),
				),
				/** Ends one guest's access to the session; a link keeps working for others. */
				remove: method(obj({ guestId: str() })),
			},
		},
	},
});

/** Owner-only session privacy: revoke every link and guest grant without archiving. */
export const Sharing = evolve(SharingV1, (e) => e.addMethod("owner", "disable", obj({}), nul()));
