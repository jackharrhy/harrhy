// Process-local last-good observations with shared reads and per-request cancellation.
import { awaitWithContext, type Context } from "@p2/app/v1";

type Pending<T> = { promise: Promise<T>; controller: AbortController; readers: number };

/** A cache owned by one loaded facet; the last departing reader cancels an unfinished read. */
export class ReadCache<T> {
	private readonly values = new Map<string, T>();
	private readonly pending = new Map<string, Pending<T>>();

	/** The last successful observation, including after a failed refresh. */
	peek(key: string): T | undefined {
		return this.values.get(key);
	}

	/** Retains at most 128 successful observations, evicting the oldest key when a new one arrives. */
	remember(key: string, value: T): void {
		this.values.set(key, value);
		if (this.values.size > 128) this.values.delete(this.values.keys().next().value!);
	}

	/** Reuses a success or joins one in-flight read without coupling callers' cancellation. */
	async read(
		key: string,
		policy: "reuse" | "refresh",
		load: (signal: AbortSignal) => Promise<T>,
		context: Context,
	): Promise<T> {
		context.abortSignal?.throwIfAborted();
		const cached = this.values.get(key);
		if (policy === "reuse" && cached !== undefined) return cached;
		let pending = this.pending.get(key);
		if (!pending) {
			const controller = new AbortController();
			const promise = load(controller.signal).then((value) => {
				controller.signal.throwIfAborted();
				this.remember(key, value);
				return value;
			});
			pending = { promise, controller, readers: 0 };
			this.pending.set(key, pending);
		}
		const entry = pending;
		entry.readers++;
		try {
			return await awaitWithContext(entry.promise, context);
		} finally {
			entry.readers--;
			if (entry.readers === 0 && this.pending.get(key) === entry) {
				this.pending.delete(key);
				entry.controller.abort();
			}
		}
	}
}
