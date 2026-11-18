import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { Agent, EnvHttpProxyAgent, getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { configureFetch } from "../../src/runtime/fetch.ts";

test("fetch stays direct by default; explicit proxy routes remote hosts but bypasses loopback", async () => {
	const previousDispatcher = getGlobalDispatcher();
	const previousFetch = globalThis.fetch;
	const keys = ["HARRHY_PI_HTTP_PROXY", "HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "NO_PROXY", "no_proxy"];
	const previousEnv = keys.map((key) => process.env[key]);
	const direct = createServer((request, response) => {
		assert.equal(request.httpVersion, "1.1");
		response.end("direct");
	});
	const proxied: string[] = [];
	const proxy = createServer((request, response) => {
		assert.equal(request.httpVersion, "1.1");
		proxied.push(request.url!);
		response.end("proxied");
	});
	const tunnels: string[] = [];
	proxy.on("connect", (request, socket) => {
		tunnels.push(request.url!);
		socket.end("HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
	});
	try {
		direct.listen(0, "::");
		proxy.listen(0, "127.0.0.1");
		await Promise.all([once(direct, "listening"), once(proxy, "listening")]);
		const port = (direct.address() as AddressInfo).port;
		const proxyUrl = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
		for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"]) process.env[key] = proxyUrl;
		for (const key of ["NO_PROXY", "no_proxy"]) process.env[key] = "*";
		delete process.env.HARRHY_PI_HTTP_PROXY;
		configureFetch();
		assert.ok(getGlobalDispatcher() instanceof Agent);
		assert.equal(await (await fetch(`http://127.0.0.1:${port}`)).text(), "direct");
		assert.deepEqual(proxied, []);
		await getGlobalDispatcher().close();

		process.env.HARRHY_PI_HTTP_PROXY = proxyUrl;
		configureFetch();
		assert.ok(getGlobalDispatcher() instanceof EnvHttpProxyAgent);
		assert.equal(await (await fetch("http://provider.invalid/test")).text(), "proxied");
		// The isolated fixture has no /etc/hosts or DNS. A localhost lookup failure
		// still proves it was bypassed: the synthetic proxy never resolves targets.
		try {
			assert.equal(await (await fetch(`http://localhost:${port}`)).text(), "direct");
		} catch (error) {
			assert.ok(error instanceof TypeError);
			assert.ok(["EAI_AGAIN", "ENOTFOUND"].includes((error.cause as NodeJS.ErrnoException)?.code ?? ""));
		}
		for (const host of ["127.0.0.1", "[::1]"]) {
			assert.equal(await (await fetch(`http://${host}:${port}`)).text(), "direct");
		}
		assert.deepEqual(proxied, ["http://provider.invalid/test"]);
		await assert.rejects(fetch("https://provider.invalid/test"), TypeError);
		assert.deepEqual(tunnels, ["provider.invalid:443"]);
	} finally {
		await getGlobalDispatcher().close();
		setGlobalDispatcher(previousDispatcher);
		globalThis.fetch = previousFetch;
		for (const [index, key] of keys.entries()) {
			if (previousEnv[index] === undefined) delete process.env[key];
			else process.env[key] = previousEnv[index];
		}
		direct.closeAllConnections();
		proxy.closeAllConnections();
		await Promise.all([new Promise<void>((resolve) => direct.close(() => resolve())), new Promise<void>((resolve) => proxy.close(() => resolve()))]);
	}
});
