import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { searchAll } from "../src/applications.mjs";
import { createZitadel } from "../src/zitadel.mjs";

export function delegatedScopeVocabulary(applications) {
  if (!Array.isArray(applications))
    throw new Error("Expected an application registry");
  const roles = new Set();
  for (const application of applications) {
    if (!application || typeof application !== "object")
      throw new Error("Invalid application policy");
    for (const field of ["delegatedRoles", "delegatedPermissions"]) {
      const values = application[field];
      if (
        values !== undefined &&
        (!Array.isArray(values) ||
          values.some(
            (role) =>
              typeof role !== "string" || !/^[a-z][a-z0-9-]{0,127}$/.test(role),
          ))
      )
        throw new Error("Invalid delegated scope vocabulary");
    }
    if (!application.delegatedRoles?.length) continue;
    for (const role of [
      ...application.delegatedRoles,
      ...(application.delegatedPermissions || []),
    ])
      roles.add(role);
  }
  return [...roles].toSorted((a, b) => a.localeCompare(b));
}

export async function configureDcrVocabulary({
  api,
  applications,
  projectId,
  roles,
  apply = false,
}) {
  if (
    typeof projectId !== "string" ||
    !/^[a-zA-Z0-9_-]{1,200}$/.test(projectId)
  )
    throw new Error("Expected an exact DCR project ID");
  const vocabulary = delegatedScopeVocabulary(applications);
  const selected =
    roles === undefined
      ? vocabulary
      : [...new Set(roles)].toSorted((a, b) => a.localeCompare(b));
  if (!selected.length || selected.some((role) => !vocabulary.includes(role)))
    throw new Error("Select only declared delegated role or permission keys");
  const projectPath = `/management/v1/projects/${encodeURIComponent(projectId)}`;
  const { project } = await api(projectPath, { management: true });
  if (
    project?.id !== projectId ||
    project.name !== "ZITADEL DCR" ||
    project.projectRoleAssertion
  )
    throw new Error(
      "Expected the exact ZITADEL DCR project without automatic role assertion",
    );
  const path = `${projectPath}/roles`;
  async function currentRoles() {
    const current = await searchAll(api, `${path}/_search`);
    if (current.some((role) => typeof role.key !== "string" || !role.key))
      throw new Error("Invalid native role inventory");
    return new Set(current.map((role) => role.key));
  }
  const before = await currentRoles();
  const missing = selected.filter((role) => !before.has(role));
  if (!apply)
    return {
      apply: false,
      existingRoleCount: before.size,
      missingRoles: missing,
    };
  const added = [];
  for (const role of missing) {
    try {
      await api(path, {
        management: true,
        method: "POST",
        body: { roleKey: role, displayName: `Delegated ${role} scope` },
      });
      added.push(role);
    } catch (error) {
      if (error.status !== 409 || !(await currentRoles()).has(role))
        throw error;
    }
  }
  const after = await currentRoles();
  if ([...before, ...selected].some((role) => !after.has(role)))
    throw new Error(
      "Native role readback did not preserve the existing and selected vocabulary",
    );
  return {
    apply: true,
    existingRoleCount: before.size,
    finalRoleCount: after.size,
    addedRoles: added,
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      "applications-file": { type: "string" },
      "project-id": { type: "string" },
      "api-origin": { type: "string" },
      "organization-id": { type: "string" },
      "credential-file": { type: "string" },
      role: { type: "string", multiple: true },
      apply: { type: "boolean", default: false },
    },
  });
  for (const key of [
    "applications-file",
    "project-id",
    "api-origin",
    "organization-id",
    "credential-file",
  ])
    if (!values[key]) throw new Error(`Missing --${key}`);
  const origin = new URL(values["api-origin"]);
  if (
    origin.protocol !== "https:" ||
    origin.href !== `${origin.origin}/` ||
    origin.username ||
    origin.password
  )
    throw new Error(
      "Expected an HTTPS API origin without a path, query or credentials",
    );
  const credentialFile = values["credential-file"];
  const api = createZitadel({
    baseUrl: origin.origin,
    organizationId: values["organization-id"],
    loginTokenFile: credentialFile,
    managementTokenFile: credentialFile,
  });
  const result = await configureDcrVocabulary({
    api,
    applications: JSON.parse(readFileSync(values["applications-file"], "utf8")),
    projectId: values["project-id"],
    roles: values.role,
    apply: values.apply,
  });
  console.log(JSON.stringify(result));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch(() => {
    console.error(
      "DCR vocabulary configuration failed; inspect the reviewed inputs and native role inventory before retrying.",
    );
    process.exitCode = 1;
  });
}
