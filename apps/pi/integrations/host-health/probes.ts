import { readFile, statfs } from "node:fs/promises";
import type { Metric } from "./contract.ts";

type Cpu = { busy: number; total: number };

export function cpuCounters(text: string): Cpu {
	const line = /^cpu\s+([^\n]+)/m.exec(text);
	const fields = line?.[1]?.trim().split(/\s+/).slice(0, 8).map(Number);
	if (!fields || fields.length !== 8 || fields.some((value) => !Number.isSafeInteger(value) || value < 0))
		throw new Error("Invalid aggregate CPU counters in /proc/stat");
	const total = fields.reduce((sum, value) => sum + value, 0);
	return { total, busy: total - fields[3]! - fields[4]! };
}

export function cpuBusy(before: Cpu | undefined, after: Cpu): number | undefined {
	if (!before) return;
	const total = after.total - before.total;
	const busy = after.busy - before.busy;
	if (total <= 0 || busy < 0 || busy > total) return;
	return 100 * busy / total;
}

export function memoryAvailable(text: string): number {
	const total = Number(/^MemTotal:\s+(\d+) kB$/m.exec(text)?.[1]);
	const available = Number(/^MemAvailable:\s+(\d+) kB$/m.exec(text)?.[1]);
	if (!(total > 0 && available >= 0 && available <= total)) throw new Error("Invalid memory figures in /proc/meminfo");
	return 100 * available / total;
}

export function hostProbes(): Record<Metric, () => Promise<number | undefined>> {
	let previous: { counters: Cpu; at: number } | undefined;
	return {
		"disk-root": async () => {
			const fs = await statfs("/", { bigint: true });
			return Number(fs.bavail * fs.bsize) / 1024 ** 3;
		},
		cpu: async () => {
			const before = previous;
			previous = undefined;
			previous = { counters: cpuCounters(await readFile("/proc/stat", "utf8")), at: performance.now() };
			return cpuBusy(before && previous.at - before.at <= 120_000 ? before.counters : undefined, previous.counters);
		},
		memory: async () => memoryAvailable(await readFile("/proc/meminfo", "utf8")),
	};
}
