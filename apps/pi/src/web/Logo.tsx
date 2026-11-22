import { RemixMount } from "./RemixMount.tsx";
import { logo as logoNode } from "./remix/Logo.tsx";

/**
 * The instance's logo: Pi's mark, or `image` (the owner's custom logo) in its place, drawn by a Remix component.
 * `pending`: the choice is not known yet, so the logo's space stays empty instead of showing Pi's mark first.
 */
export function Logo({
	compact = false,
	image = null,
	pending = false,
}: {
	compact?: boolean;
	image?: string | null;
	pending?: boolean;
}) {
	return <RemixMount node={() => logoNode({ compact, image, pending })} />;
}
