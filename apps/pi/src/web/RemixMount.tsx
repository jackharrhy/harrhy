import { createRoot, type RemixNode } from "remix/component";
import { useEffect, useRef } from "react";

/**
 * Renders a Remix component tree inside the React app, the bridge for moving the page to Remix piece by piece. The
 * Remix root owns the wrapper's children; React owns only the wrapper (`display: contents`, so it takes no part in the
 * layout). `node` is a function so the Remix element is built in a file that selects Remix's JSX runtime.
 */
export function RemixMount({ node }: { node: () => RemixNode }) {
	const container = useRef<HTMLSpanElement>(null);
	const root = useRef<ReturnType<typeof createRoot>>(undefined);
	useEffect(() => {
		const created = createRoot(container.current as HTMLElement);
		root.current = created;
		created.render(node());
		return () => {
			created.dispose();
			root.current = undefined;
		};
		// biome-ignore lint/correctness/useExhaustiveDependencies: mounted once; the next effect renders updates.
	}, []);
	useEffect(() => {
		root.current?.render(node());
	});
	return <span ref={container} style={{ display: "contents" }} />;
}
