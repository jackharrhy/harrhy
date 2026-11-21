import { expect, it, vi } from "vitest";
import {
  PROJECT_ROLES_SCOPE,
  projectAudienceScope,
  roleScope,
  type TokenPrincipal,
} from "@harrhy/identity";
import worker from "../worker.ts";

vi.mock("cloudflare:workers", () => ({ DurableObject: Object }));
const introspect = vi.hoisted(() => vi.fn());
vi.mock("@harrhy/identity", async (original) => ({
  ...(await original<typeof import("@harrhy/identity")>()),
  createIdentityClient: () => ({ introspect }),
}));

it("passes only the freshly authorized subject to the singleton for every export request", async () => {
  const principal: TokenPrincipal = {
    principalType: "user",
    subject: "first-user",
    clientId: "fixture-cli",
    expiresAt: Date.now() / 1000 + 600,
    audiences: new Set(["project"]),
    roles: new Set(["admin", "archive-read"]),
    scopes: new Set([
      "openid",
      projectAudienceScope("project"),
      PROJECT_ROLES_SCOPE,
      roleScope("admin"),
      roleScope("archive-read"),
    ]),
  };
  introspect.mockResolvedValue(principal);
  const job = {
    id: crypto.randomUUID(),
    state: "building",
    expiresAt: Date.now() + 600_000,
  };
  const service = {
    start: vi.fn().mockResolvedValue(job),
    status: vi.fn().mockResolvedValue(null),
    readPage: vi.fn().mockResolvedValue({
      state: "ready",
      bytes: new TextEncoder().encode("fixture bytes"),
      size: 13,
      next: 2,
    }),
  };
  const env = {
    AUTH_PUBLIC_ORIGIN: "https://ref.example",
    AUTH_ISSUER: "https://issuer.example",
    AUTH_CLIENT_ID: "browser",
    AUTH_PROJECT_ID: "project",
    AUTH_ORGANIZATION_ID: "org",
    AUTH_INTROSPECTION_CLIENT_ID: "resource",
    AUTH_INTROSPECTION_SECRET: "fixture",
    DIRECTORY: { getByName: () => ({ session: async () => true }) },
    EXPORTS: { getByName: vi.fn().mockReturnValue(service) },
  };
  function request(path: string, method: string, bearer = true) {
    const headers = new Headers({ Cookie: `ref_session=${"0".repeat(64)}` });
    if (bearer) headers.set("Authorization", "Bearer fixture-token");
    return worker.fetch(
      new Request(`https://ref.example${path}`, { headers, method }),
      env as unknown as Env,
    );
  }
  const jobs = "/api/archive/exports";
  const status = `${jobs}/${job.id}`;
  const download = `${status}/download`;
  for (const [path, method] of [
    [jobs, "POST"],
    [status, "GET"],
    [download, "GET"],
  ]) {
    expect((await request(path, method, false)).status).toBe(401);
  }
  expect(env.EXPORTS.getByName).not.toHaveBeenCalled();
  const started = await request(jobs, "POST");
  expect(started.status).toBe(202);
  expect(await started.json()).toEqual(job);
  expect(service.start).toHaveBeenCalledWith("first-user");
  expect((await request("/api/archive/boards", "POST")).status).toBe(403);
  introspect.mockResolvedValue({ ...principal, subject: "second-user" });
  expect((await request(`${status}?subject=first-user`, "GET")).status).toBe(
    404,
  );
  expect(service.status).toHaveBeenCalledWith("second-user", job.id);
  introspect.mockResolvedValue({ ...principal, roles: new Set(["admin"]) });
  expect((await request(download, "GET")).status).toBe(403);
  expect(service.readPage).not.toHaveBeenCalled();
  introspect.mockResolvedValue(principal);
  expect(await (await request(download, "GET")).text()).toBe("fixture bytes");
  expect(service.readPage).toHaveBeenCalledWith("first-user", job.id, 1);
  expect(env.EXPORTS.getByName.mock.calls).toEqual([
    ["main"],
    ["main"],
    ["main"],
  ]);
  expect(introspect).toHaveBeenCalledTimes(5);
});
