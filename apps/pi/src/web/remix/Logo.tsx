/** @jsxImportSource remix/component */
// The instance logo as a Remix component: the first piece of the page rendered with Remix's component runtime, mounted
// into the React app by RemixMount. The classes are the logo's styles in style.css and the theme plugin.
import { type Handle, on } from "remix/component";

export type LogoProps = { compact?: boolean; image?: string | null; pending?: boolean };

export function Logo(handle: Handle<LogoProps>) {
	let failed = false;
	return () => {
		const { compact = false, image = null, pending = false } = handle.props;
		const size = compact ? "compact" : "";
		if (pending) return <span class={`pi-logo ${size}`} aria-hidden="true" />;
		if (image && !failed) {
			return (
				<img
					class={`pi-logo ${size} custom-logo`}
					src={image}
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
			<svg class={`pi-logo ${size}`} viewBox="0 0 4 4" role="img" aria-label="Pi">
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

export const logo = (props: LogoProps) => <Logo {...props} />;
