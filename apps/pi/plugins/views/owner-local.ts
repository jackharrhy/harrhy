// Owner-local pane descriptors and device-only placement, separate from shared Views and their capture plumbing.
import { Access } from "@p2/app/v1";
import { type OwnerViewKind, OwnerViewKinds, useConnected, useObject, useRegistry } from "@p2/app/v1/web";
import { setLayout, show } from "./layout-store.ts";

/** A namespace which cannot be a shared View ID. */
export const ownerViewId = (kind: string): string => `@owner:${kind}`;

/** Eligible descriptors exist only while Access is live as owner, never from cached/offline useOwner hints. */
export function useOwnerViews() {
	const access = useObject(Access, {}, { variant: "owner" });
	const connected = useConnected();
	const kinds = useRegistry(OwnerViewKinds);
	return connected && access ? kinds : NO_OWNER_VIEWS;
}

const NO_OWNER_VIEWS: ReadonlyMap<string, OwnerViewKind> = new Map();

/** Opens one constant descriptor on this device; no shared view or automatic message context is created. */
export function openOwnerView(session: string, kind: string): void {
	const id = ownerViewId(kind);
	setLayout(session, (current) => ({ ...current, focus: { ...current.focus, [id]: 0 } }));
	show(session, id);
}
