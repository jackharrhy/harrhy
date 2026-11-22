// Settings › GitHub (owner): which repositories Pi may watch for checks, and whether its GitHub login works.
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
import { useRef, useState } from "react";
import { GithubChecksSettings } from "./contract.ts";

const NO_AUTOCORRECT = { autoCapitalize: "off", autoCorrect: "off", spellCheck: false } as const;

function GithubSheet() {
	const settings = useObject(GithubChecksSettings, {});
	const repos = useReadable(settings?.repos);
	const [repo, setRepo] = useState("");
	const input = useRef<HTMLInputElement>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string>();
	const [login, setLogin] = useState<{ ok: boolean; message: string }>();
	const run = (operation: () => Promise<unknown>, done?: () => void) => {
		setBusy(true);
		setError(undefined);
		operation()
			.then(done, (reason: unknown) => setError(errorText(reason)))
			.finally(() => setBusy(false));
	};
	return (
		<Sheet title="GitHub" onClose={closeLayers}>
			<p className="muted small">
				Agents can watch the checks of a pull request, branch or commit and be woken when they finish. They can watch
				only the repositories listed here. Pi reads GitHub with the login of the <code>gh</code> command on the Pi
				server.
			</p>
			<div className="list">
				<span className="label">Allowed repositories</span>
				{repos && repos.length === 0 && <p className="empty-note">None yet: agents cannot watch anything.</p>}
				{repos?.map((name) => (
					<div className="guest-row" key={name}>
						<span>{name}</span>
						<button
							type="button"
							className="text-action"
							aria-label={`Remove ${name}`}
							disabled={busy}
							onClick={() =>
								run(
									() => settings?.remove({ repo: name }, BACKGROUND_CONTEXT) ?? Promise.resolve(),
									() => input.current?.focus(),
								)
							}
						>
							Remove
						</button>
					</div>
				))}
				<form
					className="inline-form"
					onSubmit={(event) => {
						event.preventDefault();
						if (!settings || !repo.trim()) return;
						run(
							() => settings.allow({ repo }, BACKGROUND_CONTEXT),
							() => setRepo(""),
						);
					}}
				>
					<input
						ref={input}
						className="input"
						aria-label="Repository"
						placeholder="owner/name or owner/*"
						value={repo}
						onChange={(event) => setRepo(event.target.value)}
						{...NO_AUTOCORRECT}
					/>
					<button type="submit" className="button" disabled={busy || !settings || !repo.trim()}>
						Allow
					</button>
				</form>
			</div>
			<div className="list">
				<span className="label">Login</span>
				<div className="inline-form">
					<button
						type="button"
						className="button"
						disabled={busy || !settings}
						onClick={() =>
							run(async () => {
								setLogin(undefined);
								setLogin(await settings?.checkLogin({}, BACKGROUND_CONTEXT));
							})
						}
					>
						Check GitHub login
					</button>
					{login && (
						<span role="status" className={login.ok ? "muted small" : "error small"}>
							{login.message}
						</span>
					)}
				</div>
			</div>
			{error && (
				<p className="notice error" role="alert">
					{error}
				</p>
			)}
		</Sheet>
	);
}

/** Mounted from the page's start; opens when Settings › GitHub does. */
function GithubSheets() {
	const open = useSheet("github-checks");
	return useOwner() && open ? <GithubSheet /> : null;
}

export default defineFacet((host) => {
	contribute(host, "p2.web-github-checks", (self) => {
		self.contribute(SettingsSections, { "github-checks": { label: "GitHub", order: 61, Sheet: GithubSheets } });
	});
});
