import { RemixMount } from "./RemixMount.tsx";
import { brandMark } from "./remix/BrandMark.tsx";

/** The Pi mark, or `logo` (the owner's custom image) in its place; rendered by a Remix component. */
export function PiLogo({ compact = false, logo = null }: { compact?: boolean; logo?: string | null }) {
	return <RemixMount node={() => brandMark({ compact, logo })} />;
}
