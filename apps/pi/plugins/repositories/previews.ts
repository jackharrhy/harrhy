// Optional owner-supplied preview declarations and Infra lease metadata; never probes, mutates or starts services.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { arr, bool, compile, int, num, obj, opt, type Static, str } from "@earendil-works/pi-schema";
import { LocationSchema, literal, record } from "@p2/app/v1";
import { optionalText } from "@p2/app/v1/node";
import { isMap, parseDocument } from "yaml";
import type { ForwardSchema } from "../ports/contract.ts";
import { type Preview, PreviewEventSchema, type PreviewRead } from "./contract.ts";

const ConfigSchema = obj({
	infra: opt(obj({ registry: str(), domain: str(), routes: opt(obj({ file: str(), routers: arr(str()) })) })),
	previews: opt(
		arr(
			obj({
				id: str(),
				name: str(),
				url: str(),
				session: opt(str()),
				location: opt(LocationSchema),
				expiresAt: opt(num()),
				nonExpiring: opt(bool()),
				access: opt(str()),
				note: opt(str()),
				event: opt(PreviewEventSchema),
			}),
		),
	),
});
const configValidator = compile(ConfigSchema);
const routerValidator = compile(obj({ rule: str(), entryPoints: arr(str()), service: str() }, { open: true }));
const serviceValidator = compile(
	obj({ loadBalancer: obj({ servers: arr(obj({ url: str() }, { open: true })) }, { open: true }) }, { open: true }),
);
const registryValidator = compile(
	obj({
		version: literal(1),
		leases: record(
			obj({
				owner: str(),
				purpose: str(),
				port: int({ minimum: 1024, maximum: 65535 }),
				paths: arr(str()),
				prefixes: arr(str()),
				expires_at: int({ minimum: 1 }),
			}),
		),
	}),
);

/** Reads only configured metadata sources and existing p2 forwards, preserving explicit provenance and unknown links. */
export async function readPreviews(
	directory: string,
	forwards: readonly Static<typeof ForwardSchema>[],
): Promise<PreviewRead> {
	const text = await optionalText(join(directory, "work-context.json"));
	let input: unknown;
	try {
		input = text === undefined ? {} : JSON.parse(text);
	} catch {
		throw new Error("Invalid work-context.json syntax");
	}
	if (!configValidator.check(input)) throw new Error("Invalid work-context.json metadata");
	const items: Preview[] = forwards.map((forward) => ({
		id: `forward:${forward.id}`,
		name: forward.name ?? `Port ${forward.port}`,
		url: forward.url ? safeURL(forward.url) : forward.publicUrl ? safeURL(forward.publicUrl) : null,
		source: "p2 forward",
		session: forward.session ?? null,
		location: null,
		lease: { kind: "unknown" },
		access: forward.url ? "Owner sign-in" : forward.publicUrl ? "Public (existing forward)" : "Address unavailable",
		note: "Opening session reported by p2; worktree at registration is not recorded.",
	}));
	if (input.infra) {
		if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(input.infra.domain))
			throw new Error("Invalid Infra preview domain");
		let registry: unknown;
		try {
			registry = JSON.parse(await readFile(input.infra.registry, "utf8"));
		} catch {
			throw new Error("Infra preview registry unavailable; no routes or services were changed");
		}
		if (!registryValidator.check(registry)) throw new Error("Unsupported Infra preview registry schema");
		for (const [name, lease] of Object.entries(registry.leases)) {
			if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(name)) throw new Error("Invalid Infra preview label");
			const url = safeURL(`https://${name}.${input.infra.domain}/`);
			items.push({
				id: `infra:${name}`,
				name,
				url,
				source: "Infra lease",
				session: null,
				location: null,
				lease: { kind: "expires", at: lease.expires_at * 1000 },
				access: "Private Tailnet",
				note: `${lease.purpose}. Registry owner label: ${lease.owner}; not a session identity.`,
			});
		}
	}
	if (input.infra?.routes) {
		const document = parseDocument(await readFile(input.infra.routes.file, "utf8"));
		if (document.errors.length) throw new Error("Invalid configured Infra routes metadata");
		for (const id of input.infra.routes.routers) {
			const routerNode = document.getIn(["http", "routers", id]);
			const router: unknown = isMap(routerNode) ? routerNode.toJSON() : routerNode;
			// Only explicit allowlisted literal-host, private routers and their loopback services are metadata inputs.
			if (router === undefined) continue;
			if (!routerValidator.check(router) || router.entryPoints.length !== 1 || router.entryPoints[0] !== "pitailnet")
				throw new Error(`Unsupported configured private router: ${id}`);
			const match = /^Host\(`([a-z0-9.-]+)`\)$/.exec(router.rule);
			const serviceNode = document.getIn(["http", "services", router.service]);
			const service: unknown = isMap(serviceNode) ? serviceNode.toJSON() : serviceNode;
			if (
				!match ||
				!match[1]!.endsWith(`.${input.infra.domain}`) ||
				!serviceValidator.check(service) ||
				!service.loadBalancer.servers.length
			)
				throw new Error(`Unsupported configured static route: ${id}`);
			for (const server of service.loadBalancer.servers) {
				const upstream = new URL(safeURL(server.url));
				if (upstream.hostname !== "127.0.0.1" && upstream.hostname !== "[::1]")
					throw new Error(`Configured static route is not loopback: ${id}`);
			}
			const url = safeURL(`https://${match[1]}/`);
			if (items.some((item) => item.url === url)) continue;
			items.push({
				id: `infra-static:${id}`,
				name: match[1]!.slice(0, -(input.infra.domain.length + 1)),
				url,
				source: "Infra static route",
				session: null,
				location: null,
				lease: { kind: "none" },
				access: "Private Tailnet",
				note: "Canonical private route; session and served worktree are not recorded.",
			});
		}
	}
	const ids = new Set<string>();
	const urls = new Set<string>();
	for (const declared of input.previews ?? []) {
		if (ids.has(declared.id)) throw new Error("Duplicate preview declaration ID");
		ids.add(declared.id);
		if (declared.nonExpiring && declared.expiresAt !== undefined)
			throw new Error("A preview declaration cannot be nonexpiring and have an expiry");
		const url = safeURL(declared.url);
		if (urls.has(url)) throw new Error("Duplicate preview declaration URL");
		urls.add(url);
		// Exact URL identity joins a declaration to its provider; titles, owner labels and port guesses never do.
		const index = items.findIndex((item) => item.url !== null && safeURL(item.url) === url);
		const provider = index < 0 ? undefined : items[index];
		const item: Preview = {
			id: `declared:${declared.id}`,
			name: declared.name,
			url,
			source: provider ? `${provider.source} · declared association` : "Declared link",
			session: declared.session ?? provider?.session ?? null,
			location: declared.location ?? null,
			lease:
				provider?.lease ??
				(declared.nonExpiring
					? { kind: "none" }
					: declared.expiresAt !== undefined
						? { kind: "expires", at: declared.expiresAt }
						: { kind: "unknown" }),
			access: provider?.access ?? declared.access ?? "Access not specified",
			note: declared.note ?? "Explicit declaration; not inferred from the session's current location.",
			...(declared.event ? { event: declared.event } : {}),
		};
		if (index < 0) items.push(item);
		else items[index] = item;
	}
	return { checked: Date.now(), items, failures: [] };
}

/** URL declarations are an untrusted configuration boundary; credentials and executable schemes are never links. */
function safeURL(value: string): string {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error("Invalid preview URL in metadata");
	}
	if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password)
		throw new Error("Unsafe preview URL in metadata");
	return url.href;
}
