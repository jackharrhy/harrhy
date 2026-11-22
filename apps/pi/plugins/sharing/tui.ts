// Sharing in the TUI (p2-tui-port.md P11a), after the web's share sheet. A TUI guest counts as connected while its
// worker holds GuestPresence, as a guest's web page does (section 4.1; the owner's variant does nothing), held from a
// slot surface (after the link is live), not during facet load. The guest's name and access show in the header and,
// read-only, in place of the editor (the chat surface).
//
// `/share` (owner): the session's two links and the guests connected now. Enter copies a link (creating it first)
// through the launcher's `copy` (its consent screen shows the link); a first read/write link on a remote environment is
// confirmed first. Ctrl+R resets a link (new token, its guests lose access), Ctrl+D removes a guest; both confirmed.

import { BACKGROUND_CONTEXT, follow, liveIn, whenLive } from "@p2/app/v1";
import type { TuiCommand, TuiContext } from "@p2/app/v1/tui";
import { confirm, grantNotice, ListOverlay, type ListRow, lineText, TuiScope, tuiFacet } from "@p2/app/v1/tui";
import { GuestPresence, type ShareMode, Sharing } from "./contract.ts";

const LABEL: Record<ShareMode, string> = { view: "Read-only", full: "Read/write" };
type Link = { mode: ShareMode; token: string; url: string };
type Guest = { id: string; name: string; mode: ShareMode };

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

function openShare(ctx: TuiContext): void {
	const session = ctx.identity.session;
	if (!session) return;
	const sharing = ctx.host.hold(Sharing, { session }, BACKGROUND_CONTEXT);
	const owner = () => liveIn(sharing, "owner");
	let links: Link[] | undefined;
	let guests: Guest[] = [];
	let env: string | null = null;
	let status = "";
	const stops = [
		follow(sharing.links, (value) => {
			links = value ?? undefined;
			ctx.requestRender();
		}),
		follow(sharing.guests, (value) => {
			guests = value ?? [];
			ctx.requestRender();
		}),
		follow(sharing.env, (value) => {
			env = value ?? null;
			ctx.requestRender();
		}),
	];
	void whenLive(sharing).catch((error: unknown) => {
		status = message(error);
		ctx.requestRender();
	});
	const fail = (error: unknown) => {
		status = message(error);
		ctx.requestRender();
	};
	/** The link of `mode`, created first when missing (and confirmed for read/write on a remote environment). */
	const linkOf = async (mode: ShareMode): Promise<string | undefined> => {
		const service = owner();
		if (service?.variant !== "owner") return undefined;
		const existing = links?.find((link) => link.mode === mode)?.url;
		if (existing) return existing;
		const remote = mode === "full" && env !== null;
		if (
			remote &&
			!(await confirm(ctx, [
				"Create a read/write link?",
				`Guests can make the agent run commands and change files on the remote environment "${lineText(env ?? "")}".`,
			]))
		)
			return undefined;
		await service.link({ mode, ...(remote ? { remoteConfirmed: true } : {}) }, BACKGROUND_CONTEXT);
		// The answer follows its state: the new link is in `links` when the call resolves.
		return service.links.value.find((link) => link.mode === mode)?.url;
	};
	const copy = async (mode: ShareMode) => {
		status = "";
		const url = await linkOf(mode);
		if (!url) return;
		const result = await ctx.grant("copy", { text: url, label: `${LABEL[mode]} share link` });
		grantNotice(ctx, `${LABEL[mode]} link copied`, result);
	};
	const reset = async (mode: ShareMode) => {
		const service = owner();
		if (service?.variant !== "owner" || !links?.some((link) => link.mode === mode)) return;
		if (
			!(await confirm(ctx, [
				`New ${LABEL[mode].toLowerCase()} link?`,
				"Guests who joined through the old one lose access.",
			]))
		)
			return;
		await service.link(
			{ mode, reset: true, ...(env !== null && mode === "full" ? { remoteConfirmed: true } : {}) },
			BACKGROUND_CONTEXT,
		);
		ctx.notify(`${LABEL[mode]} link reset`);
	};
	const remove = async (guest: Guest) => {
		const service = owner();
		if (service?.variant !== "owner") return;
		if (
			!(await confirm(ctx, [
				`Remove ${lineText(guest.name)}?`,
				"This identity is blocked; the link keeps working for others.",
			]))
		)
			return;
		await service.remove({ guestId: guest.id }, BACKGROUND_CONTEXT);
		ctx.notify(`Removed ${lineText(guest.name)}`);
	};
	const linkMode = (row: ListRow | undefined): ShareMode | undefined =>
		row?.key === "link:view" ? "view" : row?.key === "link:full" ? "full" : undefined;
	const guestOf = (row: ListRow | undefined) => guests.find((guest) => `guest:${guest.id}` === row?.key);
	const overlay = ctx.overlay(
		"share",
		new ListOverlay(ctx, {
			title: () => `Share · ${guests.length} guest${guests.length === 1 ? "" : "s"} connected`,
			rows: () => [
				...(["view", "full"] as const).map((mode) => {
					const exists = links?.some((link) => link.mode === mode) ?? false;
					return {
						key: `link:${mode}`,
						label: `${LABEL[mode]} link`,
						detail: links === undefined ? "…" : exists ? "enter copies" : "enter creates and copies",
						...(mode === "full" ? { color: "warning" as const } : {}),
					};
				}),
				...guests.map((guest) => ({
					key: `guest:${guest.id}`,
					label: `${guest.name} (unverified name)`,
					detail: guest.mode === "full" ? "read/write" : "read-only",
					color: "muted" as const,
				})),
			],
			onSelect: (row) => {
				const mode = linkMode(row);
				if (mode) void copy(mode).catch(fail);
			},
			actions: [
				{
					key: "ctrl+r",
					label: "reset link",
					run: (row) => {
						const mode = linkMode(row);
						if (mode) void reset(mode).catch(fail);
					},
				},
				{
					key: "ctrl+d",
					label: "remove guest",
					run: (row) => {
						const guest = guestOf(row);
						if (guest) void remove(guest).catch(fail);
					},
				},
			],
			footer: () => [
				ctx.theme.current.fg(
					"dim",
					`  Anyone with a link joins this session and its subagents under a name they choose. Read/write lets them make the agent run commands and change files on ${env ? `the remote environment "${lineText(env)}"` : "this host"}.`,
				),
				...(status ? [ctx.theme.current.fg("error", `  ${lineText(status)}`)] : []),
			],
			onClose: () => {
				for (const stop of stops) stop();
				sharing.release();
				overlay.close();
			},
		}),
		{ width: "100%", anchor: "bottom-center" },
	);
}

export const SHARE_COMMANDS: Record<string, TuiCommand> = {
	"p2.share": {
		title: "Share this session",
		category: "Session",
		when: "owner && chat && !overlay",
		slash: { name: "share" },
		run: (ctx) => openShare(ctx),
	},
};

export default tuiFacet(
	"widget-above:sharing",
	(runtime) => {
		const scope = new TuiScope(runtime);
		scope.watch(GuestPresence, {}, () => {});
		return { render: () => [], invalidate() {}, dispose: () => scope.dispose() };
	},
	SHARE_COMMANDS,
);
