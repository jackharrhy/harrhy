// Owner-private list of registered URLs, with expiry enforced while the pane is open.
import { Access, BACKGROUND_CONTEXT, contribute, defineFacet, withCancel } from "@p2/app/v1";
import { OwnerViewKinds, RefreshIcon, useConnected, useObject } from "@p2/app/v1/web";
import { useEffect, useState } from "react";
import { type Preview, type PreviewRead, Previews } from "./contract.ts";
import "./style.css";

function PreviewsPane() {
	const access = useObject(Access, {}, { variant: "owner" });
	const connected = useConnected();
	return connected && access ? <PreviewList /> : null;
}

const NO_PREVIEWS: Preview[] = [];

function PreviewList() {
	const service = useObject(Previews, {}, { variant: "owner" });
	const [read, setRead] = useState<PreviewRead>();
	const [failed, setFailed] = useState(false);
	const [loading, setLoading] = useState(true);
	const [revision, setRevision] = useState(0);
	const [clock, setClock] = useState(Date.now);
	const now = Math.max(clock, Date.now());
	const previews = read?.items ?? NO_PREVIEWS;

	useEffect(() => {
		if (!service) return;
		const call = withCancel(BACKGROUND_CONTEXT);
		setLoading(true);
		setFailed(false);
		void service.list({ refresh: revision > 0 }, call.context).then(
			(value) => {
				if (call.context.abortSignal?.aborted) return;
				setRead(value);
				setLoading(false);
			},
			() => {
				if (call.context.abortSignal?.aborted) return;
				setFailed(true);
				setLoading(false);
			},
		);
		return () => call.cancel();
	}, [service, revision]);

	useEffect(() => {
		let next = Infinity;
		for (const { lease } of previews) if (lease.kind === "expires" && lease.at > now) next = Math.min(next, lease.at);
		if (next === Infinity) return;
		// Long leases must not overflow setTimeout's signed delay.
		const timer = setTimeout(() => setClock(Date.now()), Math.min(Math.max(0, next - Date.now()), 2 ** 31 - 1));
		return () => clearTimeout(timer);
	}, [previews, now]);

	return (
		<section className="registered-previews" aria-label="Previews">
			<header className="registered-previews-head">
				<h2>Previews</h2>
				<button
					type="button"
					className="icon-button"
					aria-label="Refresh previews"
					title="Refresh previews"
					disabled={loading}
					onClick={() => setRevision((value) => value + 1)}
				>
					<RefreshIcon />
				</button>
			</header>
			{loading && !read && <p className="empty-note">Reading preview metadata…</p>}
			{!loading && (failed || Boolean(read?.failures.length)) && (
				<output className="empty-note">
					{failed ? "Preview metadata unavailable." : read?.failures.join(" ")}
					{previews.length > 0 && " Showing the last successful list."}
				</output>
			)}
			{!loading && !failed && read?.failures.length === 0 && previews.length === 0 && (
				<p className="empty-note">No registered preview URLs.</p>
			)}
			{previews.length > 0 && (
				<ul className="registered-previews-list">
					{previews.map((preview) => (
						<PreviewRow key={preview.id} preview={preview} now={now} />
					))}
				</ul>
			)}
		</section>
	);
}

function PreviewRow({ preview, now }: { preview: Preview; now: number }) {
	const { lease, url } = preview;
	const expired = lease.kind === "expires" && lease.at <= now;
	return (
		<li className="registered-preview">
			{expired ? (
				<span className="registered-preview-url">{url}</span>
			) : (
				<a
					className="text-action registered-preview-url"
					href={url}
					target="_blank"
					rel="noopener noreferrer"
					onClick={(event) => {
						if (lease.kind === "expires" && lease.at <= Date.now()) event.preventDefault();
					}}
				>
					{url}
				</a>
			)}
			<div className="registered-preview-meta">
				{preview.name} · {preview.access} ·{" "}
				{lease.kind === "none" ? (
					"No expiry"
				) : lease.kind === "unknown" ? (
					"Expiry unknown"
				) : expired ? (
					"Expired"
				) : (
					<>Expires {new Date(lease.at).toLocaleString()}</>
				)}
			</div>
		</li>
	);
}

export default defineFacet((host) => {
	contribute(host, "p2.web-repositories", (self) =>
		self.contribute(OwnerViewKinds, { repositories: { title: "Previews", Pane: PreviewsPane } }),
	);
});
