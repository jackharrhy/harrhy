// Shared repository reads must not couple callers' cancellation or erase last-good data on failure.
import assert from "node:assert/strict";
import { test } from "node:test";
import { BACKGROUND_CONTEXT, withCancel } from "@p2/app/v1";
import { ReadCache } from "../../plugins/repositories/cache.ts";

test("coalesces reads and only cancels the underlying read after the last reader leaves", async () => {
	const cache = new ReadCache<number>();
	let calls = 0;
	let finish: ((value: number) => void) | undefined;
	let signal: AbortSignal | undefined;
	const load = (abort: AbortSignal) => {
		calls++;
		signal = abort;
		return new Promise<number>((resolve) => {
			finish = resolve;
		});
	};
	const one = withCancel(BACKGROUND_CONTEXT);
	const two = withCancel(BACKGROUND_CONTEXT);
	const first = cache.read("repo", "refresh", load, one.context);
	const second = cache.read("repo", "refresh", load, two.context);
	assert.equal(calls, 1);
	one.cancel();
	await assert.rejects(first, /abort/i);
	assert.equal(signal?.aborted, false);
	finish!(7);
	assert.equal(await second, 7);
	assert.equal(await cache.read("repo", "reuse", load, BACKGROUND_CONTEXT), 7);
	assert.equal(calls, 1);
	await assert.rejects(
		cache.read(
			"repo",
			"refresh",
			async () => {
				throw new Error("Git failed");
			},
			BACKGROUND_CONTEXT,
		),
		/Git failed/,
	);
	assert.equal(cache.peek("repo"), 7);
});

test("retention is bounded for both loaded and directly remembered observations", async () => {
	const cache = new ReadCache<number>();
	for (let index = 0; index < 128; index++) cache.remember(String(index), index);
	cache.remember("64", -64);
	assert.equal(cache.peek("64"), -64);
	assert.equal(cache.peek("0"), 0);
	assert.equal(await cache.read("new", "reuse", async () => 128, BACKGROUND_CONTEXT), 128);
	assert.equal(cache.peek("0"), undefined);
	assert.equal(cache.peek("1"), 1);
	cache.remember("newer", 129);
	assert.equal(cache.peek("1"), undefined);
	assert.equal(cache.peek("new"), 128);
});

test("last reader cancels the process and a later request starts a fresh read", async () => {
	const cache = new ReadCache<number>();
	const request = withCancel(BACKGROUND_CONTEXT);
	let aborted = false;
	const reading = cache.read(
		"repo",
		"refresh",
		(signal) =>
			new Promise<number>((_resolve, reject) =>
				signal.addEventListener(
					"abort",
					() => {
						aborted = true;
						reject(signal.reason);
					},
					{ once: true },
				),
			),
		request.context,
	);
	request.cancel();
	await assert.rejects(reading, /abort/i);
	assert.equal(aborted, true);
	assert.equal(await cache.read("repo", "reuse", async () => 9, BACKGROUND_CONTEXT), 9);
});
