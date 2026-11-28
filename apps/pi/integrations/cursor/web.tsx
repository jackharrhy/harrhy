// Settings › Cursor (owner): the API key (write-only), the default model and runtime, the repositories cloud agents may use,
// and whether agents may change files.
import { BACKGROUND_CONTEXT, contribute, defineFacet } from "@p2/app/v1";
import {
	closeLayers,
	errorText,
	SettingsSections,
	Sheet,
	Switch,
	useObject,
	useOwner,
	useReadable,
	useSheet,
} from "@p2/app/v1/web";
import { useRef, useState } from "react";
import { CursorSettings } from "./contract.ts";

const NO_AUTOCORRECT = { autoCapitalize: "off", autoCorrect: "off", spellCheck: false } as const;
type Models = { id: string; name: string }[];

function CursorSheet() {
	const settings = useObject(CursorSettings, {});
	const keyStored = useReadable(settings?.keyStored);
	const keyFromEnv = useReadable(settings?.keyFromEnv);
	const model = useReadable(settings?.model);
	const runtime = useReadable(settings?.runtime);
	const repos = useReadable(settings?.repos);
	const allowLocalEdits = useReadable(settings?.allowLocalEdits);
	const allowCloudEdits = useReadable(settings?.allowCloudEdits);
	const sandbox = useReadable(settings?.sandbox);
	const autoResume = useReadable(settings?.autoResume);
	const maxRuns = useReadable(settings?.maxRuns);
	const maxPerSession = useReadable(settings?.maxPerSession);
	const survival = useReadable(settings?.workerSurvival);
	const [key, setKey] = useState("");
	const [repo, setRepo] = useState("");
	const [models, setModels] = useState<Models>([]);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string>();
	const [tested, setTested] = useState<{ ok: boolean; message: string }>();
	const input = useRef<HTMLInputElement>(null);
	const run = (operation: () => Promise<unknown>, done?: () => void) => {
		setBusy(true);
		setError(undefined);
		operation()
			.then(done, (reason: unknown) => setError(errorText(reason)))
			.finally(() => setBusy(false));
	};
	const chosenModel = model ?? "";
	const options = models.some((entry) => entry.id === chosenModel) || chosenModel === "" ? models : [{ id: chosenModel, name: chosenModel }, ...models];
	const keyNote = keyStored
		? "A key is stored. It is never shown again."
		: keyFromEnv
			? "No key stored: using CURSOR_API_KEY from the Pi server's environment."
			: "No key yet: cloud Cursor and legacy SDK recovery need a key. Local ACP uses Cursor CLI sign-in.";
	return (
		<Sheet title="Cursor" onClose={closeLayers}>
			<p className="muted small">
				Agents can hand a task to a Cursor agent. The prompt and whatever the agent reads go to Cursor, and a cloud
				agent clones a repository into a Cursor VM: check your team&apos;s privacy mode first.
			</p>
			<div className="list">
				<span className="label">API key</span>
				<p className="muted small">{keyNote}</p>
				<form
					className="inline-form"
					onSubmit={(event) => {
						event.preventDefault();
						if (!settings || !key.trim()) return;
						run(
							() => settings.setKey({ key }, BACKGROUND_CONTEXT),
							() => {
								setKey("");
								setTested(undefined);
							},
						);
					}}
				>
					<input
						className="input"
						type="password"
						aria-label="API key"
						placeholder={keyStored ? "Replace the key" : "Paste a Cursor API key"}
						value={key}
						onChange={(event) => setKey(event.target.value)}
						autoComplete="off"
						{...NO_AUTOCORRECT}
					/>
					<button type="submit" className="button" disabled={busy || !settings || !key.trim()}>
						Save key
					</button>
				</form>
				<div className="inline-form">
					<button
						type="button"
						className="button"
						disabled={busy || !settings}
						onClick={() =>
							run(async () => {
								setTested(undefined);
								setTested(await settings?.testKey({}, BACKGROUND_CONTEXT));
							})
						}
					>
						Test key
					</button>
					{keyStored && (
						<button
							type="button"
							className="text-action"
							disabled={busy}
							onClick={() => run(async () => void (await settings?.clearKey({}, BACKGROUND_CONTEXT)))}
						>
							Remove key
						</button>
					)}
					{tested && <output className={tested.ok ? "muted small" : "error small"}>{tested.message}</output>}
				</div>
			</div>
			<div className="list">
				<span className="label">Defaults</span>
				<label className="field">
					<span className="label">Model</span>
					<select
						className="input"
						aria-label="Default model"
						value={chosenModel}
						disabled={busy || !settings}
						onChange={(event) =>
							run(() => settings?.setDefaults({ model: event.target.value, runtime: runtime ?? "local" }, BACKGROUND_CONTEXT) ?? Promise.resolve())
						}
					>
						<option value="">Use Cursor default</option>
						{options.map((entry) => (
							<option key={entry.id} value={entry.id}>
								{entry.name === entry.id ? entry.id : `${entry.name} (${entry.id})`}
							</option>
						))}
					</select>
				</label>
				<div className="inline-form">
					<button
						type="button"
						className="button"
						disabled={busy || !settings}
						onClick={() =>
							run(async () => {
								const found = await settings?.listModels({}, BACKGROUND_CONTEXT);
								if (found && !found.ok) throw new Error(found.message);
								setModels(found?.models ?? []);
							})
						}
					>
						Load models
					</button>
				</div>
				<label className="field">
					<span className="label">Runtime</span>
					<select
						className="input"
						aria-label="Default runtime"
						value={runtime ?? "local"}
						disabled={busy || !settings}
						onChange={(event) =>
							run(
								() =>
									settings?.setDefaults(
										{ model: chosenModel, runtime: event.target.value === "cloud" ? "cloud" : "local" },
										BACKGROUND_CONTEXT,
									) ?? Promise.resolve(),
							)
						}
					>
						<option value="local">Local: on this machine</option>
						<option value="cloud">Cloud: a Cursor VM</option>
					</select>
				</label>
			</div>
			<div className="list">
				<span className="label">Allowed repositories (cloud agents)</span>
				{repos && repos.length === 0 && <p className="empty-note">None yet: cloud agents cannot start.</p>}
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
				<span className="label">Changing files</span>
				<Switch
					label="Allow local agents to edit files"
					checked={allowLocalEdits ?? false}
					disabled={busy || !settings}
					onChange={(allow) => run(() => settings?.setAllowLocalEdits({ allow }, BACKGROUND_CONTEXT) ?? Promise.resolve())}
				/>
				<p className="muted small">
					Off: Pi requests ask or plan mode from the Cursor CLI. On: agent mode can also use unsandboxed shell and file tools.
				</p>
				<label className="field">
					<span className="label">Sandbox local agents</span>
					<select
						className="input"
						aria-label="Sandbox local agents"
						value={sandbox ?? "when-possible"}
						disabled={busy || !settings}
						onChange={(event) => {
							const mode = event.target.value === "required" ? "required" : event.target.value === "off" ? "off" : "when-possible";
							run(() => settings?.setSandbox({ mode }, BACKGROUND_CONTEXT) ?? Promise.resolve());
						}}
					>
						<option value="when-possible">When possible</option>
						<option value="required">Required</option>
						<option value="off">Off</option>
					</select>
				</label>
				<p className="muted small">New local runs use unsandboxed Cursor ACP. Required blocks them. The SDK sandbox applies only when resuming older SDK runs.</p>
				<Switch
					label="Allow cloud agents to change repositories"
					checked={allowCloudEdits ?? false}
					disabled={busy || !settings}
					onChange={(allow) => run(() => settings?.setAllowCloudEdits({ allow }, BACKGROUND_CONTEXT) ?? Promise.resolve())}
				/>
				<p className="muted small">Off: cloud agents only plan. On: agent mode, on a branch of the agent&apos;s own, no pull request opened.</p>
			</div>
			<div className="list">
				<span className="label">Runs at once</span>
				{[
					["Runs at once, all sessions", maxRuns ?? 6, (value: number) => ({ maxRuns: value, maxPerSession: Math.min(maxPerSession ?? 4, value) })],
					["Runs at once per session", maxPerSession ?? 4, (value: number) => ({ maxRuns: Math.max(maxRuns ?? 6, value), maxPerSession: value })],
				].map(([label, value, change]) => (
					<label className="field" key={String(label)}>
						<span className="label">{String(label)}</span>
						<select
							className="input"
							aria-label={String(label)}
							value={Number(value)}
							disabled={busy || !settings}
							onChange={(event) =>
								run(() => settings?.setLimits((change as (value: number) => { maxRuns: number; maxPerSession: number })(Number(event.target.value)), BACKGROUND_CONTEXT) ?? Promise.resolve())
							}
						>
							{Array.from({ length: 12 }, (_, index) => index + 1).map((count) => (
								<option key={count} value={count}>
									{count}
								</option>
							))}
						</select>
					</label>
				))}
				<p className="muted small">
					More than this many runs are refused with a message saying so. A session cannot have more than the total. At most 12.
				</p>
			</div>
			<div className="list">
				<span className="label">Interrupted runs</span>
				<Switch
					label="Auto-resume interrupted runs"
					checked={autoResume ?? false}
					disabled={busy || !settings}
					onChange={(allow) => run(() => settings?.setAutoResume({ allow }, BACKGROUND_CONTEXT) ?? Promise.resolve())}
				/>
				<p className="muted small">
					Off: an interrupted run waits for the agent to call cursor_resume. On: Pi resumes it by itself, at most twice per run,
					telling the Cursor agent what interrupted it.
				</p>
				<output className="muted small" aria-label="Worker survival">
					Detached workers:{" "}
					{survival?.status === "survives"
						? "outlived the last Pi stop"
						: survival?.status === "killed"
							? "were killed at the last Pi stop"
							: "not observed yet"}
					{survival?.detail ? `. ${survival.detail}` : ""}
				</output>
			</div>
			{error && (
				<p className="notice error" role="alert">
					{error}
				</p>
			)}
		</Sheet>
	);
}

/** Mounted from the page's start; opens when Settings › Cursor does. */
function CursorSheets() {
	const open = useSheet("cursor");
	return useOwner() && open ? <CursorSheet /> : null;
}

export default defineFacet((host) => {
	contribute(host, "p2.web-cursor", (self) => {
		self.contribute(SettingsSections, { cursor: { label: "Cursor", order: 62, Sheet: CursorSheets } });
	});
});
