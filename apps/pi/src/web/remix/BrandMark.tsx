/** @jsxImportSource remix/component */
// The Pi mark (stock, or the owner's custom logo) as a Remix component: the first piece of the page rendered with
// Remix's component runtime, mounted into the React app by RemixMount. Same markup and classes as the React version.
import { type Handle, on } from "remix/component";

export type BrandMarkProps = { compact?: boolean; logo?: string | null };

export function BrandMark(handle: Handle<BrandMarkProps>) {
	let failed = false;
	return () => {
		const { compact = false, logo = null } = handle.props;
		if (logo && !failed) {
			return (
				<img
					class={`pi-logo ${compact ? "compact " : ""}custom-logo`}
					src={logo}
					alt="Instance logo"
					mix={[
						on("error", () => {
							failed = true;
							handle.update();
						}),
					]}
				/>
			);
		}
		return (
			<svg class={`pi-logo ${compact ? "compact" : ""}`} viewBox="0 0 4 4" role="img" aria-label="Pi">
				<title>Pi</title>
				<rect class="pi-logo-coral" width="3" height="1" />
				<rect class="pi-logo-coral" x="2" y="1" width="1" height="1" />
				<rect class="pi-logo-blue" y="1" width="1" height="3" />
				<rect class="pi-logo-blue" x="1" y="2" width="1" height="1" />
				<rect class="pi-logo-yellow" x="3" y="2" width="1" height="2" />
			</svg>
		);
	};
}

export const brandMark = (props: BrandMarkProps) => <BrandMark {...props} />;
