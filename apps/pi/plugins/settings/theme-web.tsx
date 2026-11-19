import { BACKGROUND_CONTEXT } from "@p2/app/v1";
import { PiLogo, useObject, useReadable } from "@p2/app/v1/web";
import { useEffect, useId, useState } from "react";
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

export function SidebarBrand() {
	const logo = useReadable(useObject(ThemeBranding, {})?.logo);
	return logo ? <img className="pi-logo compact custom-logo" src={logo} alt="Instance logo" /> : <PiLogo compact />;
}

export function ThemeFields() {
	const branding = useObject(ThemeBranding, {});
	const tint = useReadable(branding?.tint);
	const logo = useReadable(branding?.logo);
	const [pick, setPick] = useState<number>();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const logoHelp = useId();
	const hue = pick ?? tint ?? 235;
	const save = async (operation: () => Promise<unknown>) => {
		setBusy(true);
		setError("");
		try {
			await operation();
			setPick(undefined);
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
			<label>
				Base tint <output>{hue}°</output>
				<input type="range" min={0} max={359} value={hue} onChange={(event) => setPick(event.currentTarget.valueAsNumber)} />
			</label>
			<div className="pi-theme-actions">
				<button type="button" disabled={busy || pick === undefined} onClick={() => void save(() => branding.setTint({ tint: hue }, BACKGROUND_CONTEXT))}>Apply tint</button>
				<button type="button" disabled={busy || tint === null} onClick={() => void save(() => branding.setTint({ tint: null }, BACKGROUND_CONTEXT))}>Reset tint</button>
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
