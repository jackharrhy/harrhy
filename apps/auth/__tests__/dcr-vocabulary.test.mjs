import test from "node:test";
import assert from "node:assert/strict";
import {
  delegatedScopeVocabulary,
  configureDcrVocabulary,
} from "../scripts/configure-dcr.mjs";

const applications = [
  {
    id: "ref",
    delegatedRoles: ["admin", "member"],
    delegatedPermissions: ["boards-read", "boards-write"],
  },
  {
    id: "other",
    delegatedRoles: ["admin"],
    delegatedPermissions: ["content-read"],
  },
  { id: "browser-only", delegatedPermissions: ["not-delegated"] },
];
function fixture(
  initial = [
    "admin",
    "member",
    ...Array.from({ length: 12 }, (_, index) => `prior-${index}`),
  ],
) {
  const roles = new Set(initial);
  const calls = [];
  let project = {
    id: "dcr-project",
    name: "ZITADEL DCR",
    projectRoleAssertion: false,
  };
  let create;
  return {
    roles,
    calls,
    setProject: (value) => {
      project = value;
    },
    setCreate: (value) => {
      create = value;
    },
    async api(path, options = {}) {
      calls.push({ path, ...options });
      assert.equal(options.management, true);
      if (path === "/management/v1/projects/dcr-project") return { project };
      if (path.endsWith("/roles/_search")) {
        assert.equal(options.method, "POST");
        const offset = Number(options.body.query.offset);
        return {
          result: [...roles]
            .slice(offset, offset + 100)
            .map((key) => ({ key })),
        };
      }
      assert.equal(path, "/management/v1/projects/dcr-project/roles");
      assert.equal(options.method, "POST");
      assert.deepEqual(Object.keys(options.body).toSorted(), [
        "displayName",
        "roleKey",
      ]);
      if (create) return create(options.body.roleKey, roles);
      roles.add(options.body.roleKey);
      return {};
    },
  };
}

const run = (current, options = {}) =>
  configureDcrVocabulary({
    api: current.api,
    applications,
    projectId: "dcr-project",
    roles: ["boards-read", "boards-write"],
    ...options,
  });

test("DCR vocabulary includes declared permissions, deduplicates keys and excludes non-delegated apps", () => {
  assert.deepEqual(delegatedScopeVocabulary(applications), [
    "admin",
    "boards-read",
    "boards-write",
    "content-read",
    "member",
  ]);
  for (const invalid of [
    null,
    {},
    [{ delegatedRoles: "admin" }],
    [
      {
        delegatedRoles: ["admin"],
        delegatedPermissions: ["urn:zitadel:iam:org:project:role:boards-read"],
      },
    ],
  ])
    assert.throws(() => delegatedScopeVocabulary(invalid));
});

test("default plan makes no changes; scoped apply adds only two plain role definitions and preserves all 14 existing keys", async () => {
  const current = fixture();
  const before = [...current.roles];
  assert.deepEqual(await run(current), {
    apply: false,
    existingRoleCount: 14,
    missingRoles: ["boards-read", "boards-write"],
  });
  assert.equal(current.roles.size, 14);
  assert.equal(
    current.calls.filter((call) => call.path.endsWith("/roles")).length,
    0,
  );
  assert.deepEqual(await run(current, { apply: true }), {
    apply: true,
    existingRoleCount: 14,
    finalRoleCount: 16,
    addedRoles: ["boards-read", "boards-write"],
  });
  for (const key of before) assert(current.roles.has(key));
  assert(!current.roles.has("content-read"));
  const creates = current.calls.filter((call) => call.path.endsWith("/roles"));
  assert.deepEqual(
    creates.map((call) => call.body.roleKey),
    ["boards-read", "boards-write"],
  );
  assert.deepEqual(await run(current, { apply: true }), {
    apply: true,
    existingRoleCount: 16,
    finalRoleCount: 16,
    addedRoles: [],
  });
  assert.equal(
    current.calls.filter((call) => call.path.endsWith("/roles")).length,
    2,
  );
});

test("unscoped planning includes all declared membership and permission vocabulary", async () => {
  assert.deepEqual(
    (await run(fixture([]), { roles: undefined })).missingRoles,
    ["admin", "boards-read", "boards-write", "content-read", "member"],
  );
});

test("all inventory pages are read before planning; unsafe project or undeclared keys fail without writes", async () => {
  const paged = fixture(
    Array.from({ length: 114 }, (_, index) => `prior-${index}`),
  );
  assert.equal((await run(paged)).existingRoleCount, 114);
  assert.deepEqual(
    paged.calls
      .filter((call) => call.path.endsWith("/_search"))
      .map((call) => call.body.query.offset),
    ["0", "100"],
  );
  for (const project of [
    undefined,
    { id: "other-project", name: "ZITADEL DCR" },
    { id: "dcr-project", name: "Another app" },
    { id: "dcr-project", name: "ZITADEL DCR", projectRoleAssertion: true },
  ]) {
    const current = fixture();
    current.setProject(project);
    await assert.rejects(run(current, { apply: true }));
    assert.equal(
      current.calls.filter((call) => call.path.endsWith("/roles")).length,
      0,
    );
  }
  const invalid = fixture();
  await assert.rejects(run(invalid, { apply: true, roles: ["unknown"] }));
  assert.equal(invalid.calls.length, 0);
});

test("a concurrent existing role is read back; uncertain writes are not replayed and missing preservation fails verification", async () => {
  const raced = fixture();
  raced.setCreate((key, roles) => {
    roles.add(key);
    throw Object.assign(new Error("Already exists"), { status: 409 });
  });
  assert.deepEqual((await run(raced, { apply: true })).addedRoles, []);
  assert.equal(raced.roles.size, 16);
  const uncertain = fixture();
  uncertain.setCreate((key, roles) => {
    roles.add(key);
    throw new Error("Response lost");
  });
  await assert.rejects(run(uncertain, { apply: true }), /Response lost/);
  assert.equal(
    uncertain.calls.filter((call) => call.path.endsWith("/roles")).length,
    1,
  );
  const removed = fixture();
  removed.setCreate((key, roles) => {
    roles.add(key);
    roles.delete("admin");
    return {};
  });
  await assert.rejects(run(removed, { apply: true }), /preserve/);
});
