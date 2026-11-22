// Sharing in the browser: the share sheet (owner), the guest's presence while its page is open, and the sharing
// commands of the command menu (commands.tsx).

import { BACKGROUND_CONTEXT, contribute, defineFacet } from "@p2/app/v1";
import {
	CommandPages,
	Commands,
	closeLayers,
	copyText,
	errorText,
	Sheet,
	Slots,
	useObject,
	useOwner,
	useReadable,
	useRoute,
	useSheet,
} from "@p2/app/v1/web";
import { useEffect, useState } from "react";
import { SHARING_COMMANDS, SHARING_PAGES } from "./commands.tsx";
import { GuestPresence, type ShareMode, Sharing } from "./contract.ts";
import { confirmsFirst, LINK_LABEL, linkUrl, resetLink } from "./links.ts";

/**
 * Two links per session (read-only; read/write: send and Stop) and the guests connected now.
 */
function ShareSheet({ session, onClose }: { session: string; onClose: () => void }) {
	const sharing = useObject(Sharing, { session });
	const links = useReadable(sharing?.links);
	const guests = useReadable(sharing?.guests);
	const remoteEnv = useReadable(sharing?.env);
	const [copied, setCopied] = useState<ShareMode>();
	const [confirming, setConfirming] = useState<{ reset: ShareMode } | { remove: string } | { remote: true }>();
	const [error, setError] = useState<string>();
	useEffect(() => {
		if (!copied) return;
		const timer = setTimeout(() => setCopied(undefined), 1500);
		return () => clearTimeout(timer);
	}, [copied]);
	const copy = async (mode: ShareMode, remoteConfirmed = false) => {
		if (!sharing) return;
		setError(undefined);
		if (!remoteConfirmed && confirmsFirst(mode, links, remoteEnv)) {
			setConfirming({ remote: true });
			return;
		}
		try {
			const url = await linkUrl(sharing, mode, remoteConfirmed);
			if (url !== undefined && (await copyText(url))) setCopied(mode);
		} catch (reason) {
			setError(errorText(reason));
		}
	};
	const confirm = () => {
		if (!sharing || !confirming) return;
		setConfirming(undefined);
		if ("remote" in confirming) {
			void copy("full", true);
			return;
		}
		const action =
			"reset" in confirming
				? resetLink(sharing, confirming.reset)
				: sharing.remove({ guestId: confirming.remove }, BACKGROUND_CONTEXT);
		action.catch((reason: unknown) => setError(errorText(reason)));
	};
	const cancel = (
		<button type="button" className="text-action" onClick={() => setConfirming(undefined)}>
			Cancel
		</button>
	);
	/** Remove, confirmed in place: a link guest is blocked from the session. */
	const removal = (id: string) =>
		confirming && "remove" in confirming && confirming.remove === id ? (
			<span className="inline-form">
				<button type="button" className="text-action danger" onClick={confirm}>
					Remove
				</button>
				{cancel}
			</span>
		) : (
			<button type="button" className="text-action" onClick={() => setConfirming({ remove: id })}>
				Remove
			</button>
		);
	return (
		<Sheet title="Share" onClose={onClose}>
			<p className="muted small">
				Anyone with a link can join this session and its subagents under a name they choose. Read/write lets them
				make the agent run commands and change files on{" "}
				{remoteEnv ? `the remote environment "${remoteEnv}"` : "this host"}.
			</p>
			<div className="list">
				{(["view", "full"] as const).map((mode) => {
					const exists = links?.some((link) => link.mode === mode) ?? false;
					return (
						<div className="share-row" key={mode}>
							<span>{LINK_LABEL[mode]}</span>
							{mode === "full" && confirming && "remote" in confirming ? (
								<>
									<span className="muted small">
										Guests can run commands on "{remoteEnv}". Create the link?
									</span>
									<button type="button" className="text-action danger" onClick={confirm}>
										Create
									</button>
									{cancel}
								</>
							) : confirming && "reset" in confirming && confirming.reset === mode ? (
								<>
									<span className="muted small">New link, disconnect its guests?</span>
									<button type="button" className="text-action danger" onClick={confirm}>
										Reset
									</button>
									{cancel}
								</>
							) : (
								<>
									{exists && (
										<button
											type="button"
											className="text-action"
											onClick={() => setConfirming({ reset: mode })}
										>
											Reset
										</button>
									)}
									<button
										type="button"
										className={`button ${copied === mode ? "done" : ""}`}
										disabled={links === undefined}
										onClick={() => void copy(mode)}
									>
										{copied === mode ? "Copied" : "Copy link"}
									</button>
								</>
							)}
						</div>
					);
				})}
			</div>
			<div className="list">
				<span className="label">Connected</span>
				{guests && !guests.length && <p className="empty-note">No guests connected.</p>}
				{guests?.map((guest) => (
					<div className="guest-row" key={guest.id}>
						<span>
							{guest.name}{" "}
							<small className="muted">· {guest.mode === "full" ? "read/write" : "read-only"}</small>
						</span>
						{removal(guest.id)}
					</div>
				))}
			</div>
			{error && (
				<p className="notice error" role="alert">
					{error}
				</p>
			)}
		</Sheet>
	);
}

/**
 * The open session's share sheet while it is the top layer (owner only); the Session sheet, the stats' guest count and
 * the command menu open it.
 */
function ShareButton() {
	const { session } = useRoute();
	const owner = useOwner();
	const open = useSheet("share") !== undefined;
	if (session === undefined || !owner) return null;
	return open ? <ShareSheet session={session} onClose={closeLayers} /> : null;
}

export default defineFacet((host) => {
	contribute(host, "p2.sharing-web", (self) => {
		// A guest counts as connected while its page holds this (the owner's variant does nothing).
		self.get(GuestPresence, {});
		self.contribute(Slots, { "session-actions": ShareButton });
		self.contribute(Commands, SHARING_COMMANDS);
		self.contribute(CommandPages, SHARING_PAGES);
	});
});
