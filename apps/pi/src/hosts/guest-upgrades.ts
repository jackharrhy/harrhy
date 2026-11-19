// Guest authentication crosses await boundaries before the socket can be registered.
import type { Duplex } from "node:stream";

export class GuestUpgrades {
	#revision = 0;
	readonly #sockets = new Map<string, Set<Duplex>>();

	/** Captures whether authentication can still be used after asynchronous work. */
	begin(): () => boolean {
		const revision = this.#revision;
		return () => revision === this.#revision;
	}

	/** Owns the transport before dispatch, including while the plugin is still preparing the upgrade. */
	track(id: string, socket: Duplex, current: () => boolean): boolean {
		if (!current() || socket.destroyed) {
			socket.destroy();
			return false;
		}
		const active = this.#sockets.get(id) ?? new Set<Duplex>();
		this.#sockets.set(id, active);
		active.add(socket);
		socket.once("close", () => {
			active.delete(socket);
			if (active.size === 0 && this.#sockets.get(id) === active) this.#sockets.delete(id);
		});
		return true;
	}

	/** Invalidates pending authentication and stops plugin transports before returning. */
	revoke(id: string): void {
		this.#revision++;
		const sockets = this.#sockets.get(id);
		this.#sockets.delete(id);
		for (const socket of sockets ?? []) socket.destroy();
	}
}
