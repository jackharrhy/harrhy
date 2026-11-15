// Synthetic native setup only. Scenario assertions stay in the callers.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createJellyfinProvisioning } from "../../src/jellyfin-provisioning.mjs";

export async function createJellyfinNativeFixture({ network } = {}) {
  const image =
    "jellyfin/jellyfin@sha256:fea863d0cd9ec445985d9c75fc6ed64e38a1d2766cf0c250a33d553f4fc1b771";
  const name = `harrhy-jellyfin-provision-test-${randomBytes(6).toString("hex")}`;
  const docker = (...args) =>
    execFileSync("docker", args, {
      encoding: "utf8",
      timeout: 30000,
      maxBuffer: 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  let owned = false;
  let phase = "start";
  let lastStatus;
  try {
    docker(
      "run",
      "--detach",
      "--rm",
      "--name",
      name,
      ...(network ? ["--network", network] : []),
      "--publish",
      "127.0.0.1::8096",
      "--tmpfs",
      "/config",
      "--tmpfs",
      "/cache",
      "--tmpfs",
      "/synthetic-media",
      image,
    );
    owned = true;
    const bindings = JSON.parse(
      docker(
        "inspect",
        "--format",
        '{{json (index .NetworkSettings.Ports "8096/tcp")}}',
        name,
      ),
    );
    assert.equal(bindings.length, 1);
    assert.equal(bindings[0].HostIp, "127.0.0.1");
    const baseUrl = `http://127.0.0.1:${bindings[0].HostPort}`;
    async function api(
      path,
      { method = "GET", body, token, json = true } = {},
    ) {
      const response = await fetch(`${baseUrl}/${path}`, {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(5000),
        headers: {
          Accept: 'application/json; profile="PascalCase"',
          ...(body ? { "Content-Type": "application/json" } : {}),
          Authorization: `MediaBrowser Client="Auth isolated contract", Device="Synthetic", DeviceId="synthetic-contract", Version="1"${token ? `, Token="${token}"` : ""}`,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      lastStatus = response.status;
      assert.ok(response.ok, `native request failed in ${phase}`);
      return json ? response.json() : undefined;
    }
    phase = "startup";
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      try {
        await api("Startup/Configuration");
        ready = true;
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    assert.ok(ready, "isolated provider startup timed out");
    assert.equal((await api("System/Info/Public")).Version, "12.4.0");
    const password = randomBytes(32).toString("base64url");
    phase = "startup-configuration";
    await api("Startup/Configuration", {
      method: "POST",
      body: {
        ServerName: "Synthetic provisioning contract",
        UICulture: "en-US",
        MetadataCountryCode: "US",
        PreferredMetadataLanguage: "en",
      },
      json: false,
    });
    phase = "startup-user";
    await api("Startup/User");
    await api("Startup/User", {
      method: "POST",
      body: { Name: "synthetic-owner", Password: password },
      json: false,
    });
    phase = "startup-complete";
    await api("Startup/Complete", { method: "POST", json: false });
    phase = "owner-sign-in";
    const session = await api("Users/AuthenticateByName", {
      method: "POST",
      body: { Username: "synthetic-owner", Pw: password },
    });
    assert.ok(session.AccessToken);
    const token = session.AccessToken;
    phase = "library";
    await api(
      "Library/VirtualFolders?name=Synthetic&collectionType=movies&refreshLibrary=false",
      {
        method: "POST",
        body: { LibraryOptions: { PathInfos: [{ Path: "/synthetic-media" }] } },
        token,
        json: false,
      },
    );
    const libraries = await api("Library/VirtualFolders", { token });
    assert.equal(libraries.length, 1);
    const adapter = createJellyfinProvisioning(
      { baseUrl, writeTokenFile: "/synthetic/in-memory-only" },
      { readToken: async () => token },
    );
    return {
      name,
      baseUrl,
      api,
      session,
      token,
      password,
      libraries,
      adapter,
      close() {
        if (owned) {
          docker("stop", "--time", "5", name);
          owned = false;
        }
      },
    };
  } catch {
    if (owned) docker("stop", "--time", "5", name);
    throw new Error(
      `Isolated Jellyfin setup failed during ${phase} (last HTTP status ${lastStatus ?? "none"}); no provider response or credentials are logged.`,
    );
  }
}
