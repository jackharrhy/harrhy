// Settings › Peers (owner): link this Pi to another one over SSH, approve requests from others, and choose what each peer
// may reach.
import { BACKGROUND_CONTEXT, contribute, defineFacet } from "@p2/app/v1";
import {
	closeLayers,
	errorText,
	SettingsSections,
	Sheet,
	useObject,
	useOwner,
	useReadable,
	useSheet,
} from "@p2/app/v1/web";
import { useState } from "react";
import { Peers } from "./contract.ts";

const NO_AUTOCORRECT = {
	autoCapitalize: "off",
	autoCorrect: "off",
	spellCheck: false,
} as const;
const POLICIES = [
	["none", "Nothing"],
	["familiar", "The Familiar only"],
	["all-private", "Every private session"],
] as const;

type Candidate = { instanceId: string; name: string; port: number };

function PeersSheet() {
	const peers = useObject(Peers, {});
	const self = useReadable(peers?.self);
	const linked = useReadable(peers?.peers);
	const incoming = useReadable(peers?.incoming);
	const [target, setTarget] = useState("");
	const [found, setFound] = useState<{
		target: string;
		candidates: Candidate[];
	}>();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string>();
	const run = (operation: () => Promise<unknown>, done?: () => void) => {
		setBusy(true);
		setError(undefined);
		operation()
			.then(done, (reason: unknown) => setError(errorText(reason)))
			.finally(() => setBusy(false));
	};
	return (
		<Sheet title="Peers" onClose={closeLayers}>
			<p className="muted small">
				Link this Pi to another Pi over SSH, so their agents can message each
				other. This Pi asks, the other Pi's owner approves in its own Settings,
				and both ends keep one SSH connection while the link lasts. The SSH
				login must already work from this machine without a password.
			</p>
			{self && (
				<p className="muted small">
					This Pi is <strong>{self.name}</strong> ({self.id.slice(0, 8)}).
				</p>
			)}
			{incoming && incoming.length > 0 && (
				<div className="list">
					<span className="label">Requests</span>
					{incoming.map((request) => (
						<div className="guest-row" key={request.id}>
							<span>
								<strong>{request.name}</strong> wants to link with this Pi
							</span>
							<span className="inline-form">
								<button
									type="button"
									className="button"
									disabled={busy}
									onClick={() =>
										run(
											() =>
												peers?.approve(
													{ id: request.id },
													BACKGROUND_CONTEXT,
												) ?? Promise.resolve(),
										)
									}
								>
									Approve
								</button>
								<button
									type="button"
									className="text-action"
									disabled={busy}
									onClick={() =>
										run(
											() =>
												peers?.deny({ id: request.id }, BACKGROUND_CONTEXT) ??
												Promise.resolve(),
										)
									}
								>
									Deny
								</button>
							</span>
						</div>
					))}
				</div>
			)}
			<div className="list">
				<span className="label">Linked</span>
				{linked && linked.length === 0 && (
					<p className="empty-note">No peers yet.</p>
				)}
				{linked?.map((peer) => (
					<div className="guest-row" key={peer.id}>
						<span>
							<strong>{peer.name}</strong>{" "}
							<small className="muted">
								·{" "}
								{peer.state === "requested"
									? peer.error
										? "can't link"
										: `waiting for ${peer.name}'s owner`
									: peer.link === "up"
										? "connected"
										: peer.link === "connecting"
											? "connecting…"
											: "offline"}
								{peer.ssh ? ` · ${peer.ssh}` : " · it reached this Pi"}
							</small>
							{peer.error && <small className="error"> {peer.error}</small>}
						</span>
						<span className="inline-form">
							{peer.state === "connected" && (
								<select
									className="input"
									aria-label={`What ${peer.name} may reach here`}
									value={peer.policy}
									disabled={busy}
									onChange={(event) =>
										run(
											() =>
												peers?.setPolicy(
													{
														id: peer.id,
														policy: event.target
															.value as (typeof POLICIES)[number][0],
													},
													BACKGROUND_CONTEXT,
												) ?? Promise.resolve(),
										)
									}
								>
									{POLICIES.map(([value, label]) => (
										<option key={value} value={value}>
											{label}
										</option>
									))}
								</select>
							)}
							<button
								type="button"
								className="text-action"
								aria-label={`Remove ${peer.name}`}
								disabled={busy}
								onClick={() =>
									run(
										() =>
											peers?.remove({ id: peer.id }, BACKGROUND_CONTEXT) ??
											Promise.resolve(),
									)
								}
							>
								Remove
							</button>
						</span>
					</div>
				))}
			</div>
			<div className="list">
				<span className="label">Add a peer</span>
				<form
					className="inline-form"
					onSubmit={(event) => {
						event.preventDefault();
						if (!peers || !target.trim()) return;
						const login = target.trim();
						run(async () => {
							setFound(undefined);
							setFound({
								target: login,
								candidates: await peers.find(
									{ target: login },
									BACKGROUND_CONTEXT,
								),
							});
						});
					}}
				>
					<input
						className="input"
						aria-label="SSH login"
						placeholder="user@host"
						value={target}
						onChange={(event) => setTarget(event.target.value)}
						{...NO_AUTOCORRECT}
					/>
					<button
						type="submit"
						className="button"
						disabled={busy || !peers || !target.trim()}
					>
						Find
					</button>
				</form>
				{found && found.candidates.length === 0 && (
					<p className="empty-note">
						No Pi with peers found on {found.target}. It needs a version that
						has this feature.
					</p>
				)}
				{found?.candidates.map((candidate) => (
					<div className="guest-row" key={candidate.instanceId}>
						<span>
							{candidate.name}{" "}
							<small className="muted">· port {candidate.port}</small>
						</span>
						<button
							type="button"
							className="button"
							disabled={busy}
							onClick={() =>
								run(
									() =>
										peers?.request(
											{ target: found.target, candidate },
											BACKGROUND_CONTEXT,
										) ?? Promise.resolve(),
									() => {
										setFound(undefined);
										setTarget("");
									},
								)
							}
						>
							Request link
						</button>
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

/** Mounted from the page's start; opens when Settings › Peers does. */
function PeersSheets() {
	const open = useSheet("peers");
	return useOwner() && open ? <PeersSheet /> : null;
}

export default defineFacet((host) => {
	contribute(host, "p2.web-peers", (self) => {
		self.contribute(SettingsSections, {
			peers: { label: "Peers", order: 62, Sheet: PeersSheets },
		});
	});
});
