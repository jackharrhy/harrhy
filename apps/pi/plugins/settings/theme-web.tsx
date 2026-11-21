import { BACKGROUND_CONTEXT } from "@p2/app/v1";
import { PiLogo, useObject, useOwner, useReadable } from "@p2/app/v1/web";
import { type CSSProperties, useEffect, useId, useState } from "react";
import { ThemeBranding } from "./theme-contract.ts";
import "./theme.css";

export function useBaseTint(owner: boolean) {
	const branding = useObject(ThemeBranding, owner ? {} : undefined);
	const tint = useReadable(branding?.tint);
	useEffect(() => {
		const root = document.documentElement;
		if (!owner || tint == null) return;
		root.style.setProperty("--pi-base-hue", String(tint));
		root.dataset.piTint = "custom";
		return () => {
			delete root.dataset.piTint;
			root.style.removeProperty("--pi-base-hue");
		};
	}, [owner, tint]);
}

function BrandImage({ logo, compact = false }: { logo: string; compact?: boolean }) {
	const [failed, setFailed] = useState(false);
	return failed ? <PiLogo compact={compact} /> : (
		<img className={`pi-logo ${compact ? "compact " : ""}custom-logo`} src={logo} alt="Instance logo"
			onError={() => setFailed(true)} />
	);
}

export function SidebarBrand() {
	const owner = useOwner();
	const logo = useReadable(useObject(ThemeBranding, owner ? {} : undefined)?.logo);
	return owner && logo ? <BrandImage key={logo} logo={logo} compact /> : <PiLogo compact />;
}

// The picker uses sRGB, but we store only its hue angle; the theme owns lightness and chroma.
function hueToHex(hue: number): string {
	const channel = (offset: number) => {
		const k = (offset + hue / 30) % 12;
		return Math.round(255 * (1 - Math.max(0, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, "0");
	};
	return `#${channel(0)}${channel(8)}${channel(4)}`;
}

function hexToHue(hex: string): number | undefined {
	const [r, g, b] = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
	const max = Math.max(r, g, b);
	const delta = max - Math.min(r, g, b);
	if (!delta) return undefined;
	const sector = max === r ? (g - b) / delta : max === g ? 2 + (b - r) / delta : 4 + (r - g) / delta;
	return (Math.round(sector * 60) + 360) % 360;
}

function TintPreview({ tint }: { tint: number | null }) {
	return (
		<div className="pi-tint-previews" role="group" aria-label="Tint preview">
			{(["light", "dark"] as const).map((scheme) => (
				<figure key={scheme} data-pi-theme-preview={scheme} data-pi-tint={tint === null ? undefined : "custom"}
					style={tint === null ? undefined : { "--pi-base-hue": String(tint) } as CSSProperties}>
					<figcaption>{scheme === "light" ? "Light" : "Dark"}</figcaption>
					<div className="pi-tint-preview-session">Trip planning</div>
					<p className="pi-tint-preview-message">Plan a weekend trip</p>
					<div className="pi-tint-preview-composer">Write a message…</div>
				</figure>
			))}
		</div>
	);
}

export function ThemeFields() {
	return useOwner() ? <OwnerThemeFields /> : null;
}

function OwnerThemeFields() {
	const branding = useObject(ThemeBranding, {});
	const tint = useReadable(branding?.tint);
	const logo = useReadable(branding?.logo);
	const [pick, setPick] = useState<string>();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const logoHelp = useId();
	const tintHelp = useId();
	const hue = pick === undefined ? undefined : hexToHue(pick);
	const save = async (operation: () => Promise<unknown>, clearTintDraft = false) => {
		setBusy(true);
		setError("");
		try {
			await operation();
			if (clearTintDraft) setPick(undefined);
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : "Could not save theme settings.");
		} finally {
			setBusy(false);
		}
	};
	if (!branding || tint === undefined || logo === undefined) return <output>Loading theme…</output>;
	return (
		<div className="pi-theme-fields">
			<p className="muted small">Change this instance’s owner-view colors without changing light or dark mode.</p>
			<label className="pi-tint-picker">
				Base tint
				<input type="color" value={pick ?? hueToHex(tint ?? 235)} aria-describedby={tintHelp} disabled={busy}
					onChange={(event) => setPick(event.currentTarget.value)} />
			</label>
			<p id={tintHelp} className="muted small">{pick !== undefined && hue === undefined
				? "Choose a color with a hue. Gray, black and white can’t be applied."
				: "Preview the hue before applying it. Lightness and saturation stay fixed."}</p>
			<TintPreview tint={hue ?? tint} />
			<div className="pi-theme-actions">
				<button type="button" disabled={busy || hue === undefined} onClick={() => {
					if (hue !== undefined) void save(() => branding.setTint({ tint: hue }, BACKGROUND_CONTEXT), true);
				}}>Apply tint</button>
				<button type="button" disabled={busy || (tint === null && pick === undefined)} onClick={() => {
					if (tint === null) setPick(undefined);
					else void save(() => branding.setTint({ tint: null }, BACKGROUND_CONTEXT), true);
				}}>Reset tint</button>
			</div>
			<div className="pi-theme-logo-preview">
				{logo ? <BrandImage key={logo} logo={logo} /> : <PiLogo />}
				<span className="muted small">Current sidebar logo</span>
			</div>
			<label>
				Sidebar logo
				<input type="file" accept="image/png,image/jpeg,image/webp" aria-describedby={logoHelp} disabled={busy}
					onChange={(event) => {
						const file = event.currentTarget.files?.[0];
						event.currentTarget.value = "";
						if (!file) return;
						void save(async () => {
							if (file.size > 500_000) throw new Error("Choose an image no larger than 500 kB.");
							const bytes = new Uint8Array(await file.arrayBuffer());
							await branding.setLogo({ base64: btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join("")) }, BACKGROUND_CONTEXT);
						});
					}}
				/>
			</label>
			<p id={logoHelp} className="muted small">PNG, JPEG or WebP. Up to 512 × 512 pixels and 500 kB.</p>
			<div className="pi-theme-actions">
				<button type="button" disabled={busy || logo === null} onClick={() => void save(() => branding.clearLogo(BACKGROUND_CONTEXT))}>Reset logo to Pi</button>
			</div>
			{error && <p role="alert">{error}</p>}
		</div>
	);
}
