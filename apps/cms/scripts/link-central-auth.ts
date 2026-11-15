import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

type Link = { id: number; subject: string };
type Manifest = {
  issuer: string;
  operator: Link[];
  sites: Record<string, Link[]>;
};

function reviewedIssuer(value: unknown): string {
  if (typeof value !== "string")
    throw new Error("A reviewed issuer is required");
  const url = URL.parse(value);
  if (
    !url ||
    url.origin !== value ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ))
  )
    throw new Error("Invalid reviewed issuer");
  return value;
}

function links(value: unknown): Link[] {
  if (!Array.isArray(value)) throw new Error("Invalid reviewed links");
  const ids = new Set<number>();
  const subjects = new Set<string>();
  return value.map((row) => {
    if (!row || typeof row !== "object") throw new Error("Invalid link");
    const { id, subject } = row as Record<string, unknown>;
    if (
      !Number.isSafeInteger(id) ||
      Number(id) <= 0 ||
      typeof subject !== "string" ||
      !subject ||
      subject.length > 512
    )
      throw new Error("Invalid local ID or subject");
    if (ids.has(Number(id)) || subjects.has(subject))
      throw new Error("Duplicate local ID or subject");
    ids.add(Number(id));
    subjects.add(subject);
    return { id: Number(id), subject };
  });
}

export function parseReviewedManifest(value: unknown): Manifest {
  if (!value || typeof value !== "object") throw new Error("Invalid manifest");
  const root = value as Record<string, unknown>;
  const issuer = reviewedIssuer(root.issuer);
  if (
    !root.sites ||
    typeof root.sites !== "object" ||
    Array.isArray(root.sites)
  )
    throw new Error("Site links are required");
  const sites = Object.fromEntries(
    Object.entries(root.sites).map(([site, rows]) => {
      if (!/^[a-z][a-z0-9-]*$/.test(site)) throw new Error("Invalid site ID");
      return [site, links(rows)];
    }),
  );
  if (!Object.keys(sites).length) throw new Error("Site links are required");
  const operator = links(root.operator);
  if (!operator.length) throw new Error("An operator link is required");
  return { issuer, operator, sites };
}

function check(database: DatabaseSync, rows: Link[], issuer: string) {
  const columns = database.prepare("PRAGMA table_info(users)").all() as {
    name: string;
  }[];
  if (
    !["auth_subject", "auth_issuer"].every((name) =>
      columns.some((column) => column.name === name),
    )
  )
    throw new Error("Apply the Auth schema migration first");
  for (const { id, subject } of rows) {
    const row = database
      .prepare("SELECT auth_subject,auth_issuer FROM users WHERE id=?")
      .get(id);
    if (!row) throw new Error(`Unknown local user ID ${id}`);
    if (row.auth_subject !== null && row.auth_subject !== subject)
      throw new Error(`Local user ID ${id} already has another subject`);
    if (row.auth_issuer !== null && row.auth_issuer !== issuer)
      throw new Error(`Local user ID ${id} already has another issuer`);
    const owner = database
      .prepare("SELECT id FROM users WHERE auth_subject=?")
      .get(subject);
    if (owner && Number(owner.id) !== id)
      throw new Error("Subject already belongs to another local user");
  }
}

export function applyReviewedLinks(
  targets: { name: string; path: string; rows: Link[] }[],
  apply: boolean,
  issuer: string,
) {
  reviewedIssuer(issuer);
  const databases: DatabaseSync[] = [];
  try {
    for (const target of targets) {
      if (!existsSync(target.path))
        throw new Error(`Missing ${target.name} database`);
      const database = new DatabaseSync(target.path);
      databases.push(database);
      check(database, target.rows, issuer);
    }
    if (apply)
      for (const [index, database] of databases.entries()) {
        database.exec("BEGIN IMMEDIATE");
        try {
          check(database, targets[index].rows, issuer);
          for (const { id, subject } of targets[index].rows)
            database
              .prepare(
                "UPDATE users SET auth_subject=?,auth_issuer=? WHERE id=?",
              )
              .run(subject, issuer, id);
          check(database, targets[index].rows, issuer);
          database.exec("COMMIT");
        } catch (error) {
          database.exec("ROLLBACK");
          throw error;
        }
      }
    return targets.map((target) => ({
      target: target.name,
      links: target.rows.length,
    }));
  } finally {
    for (const database of databases) database.close();
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === new URL(import.meta.url).pathname
) {
  const input = process.argv[2];
  if (
    !input ||
    ![3, 4].includes(process.argv.length) ||
    (process.argv[3] && process.argv[3] !== "--apply")
  )
    throw new Error(
      "Usage: node --import remix/node-tsx scripts/link-central-auth.ts /private/reviewed-links.json [--apply]",
    );
  if (statSync(input).mode & 0o077)
    throw new Error("The reviewed manifest must be private (mode 0600)");
  const reviewed = parseReviewedManifest(
    JSON.parse(readFileSync(input, "utf8")),
  );
  const root = resolve(process.env.HARRHY_CMS_DATA_DIR ?? "data");
  const targets = [
    {
      name: "operator",
      path: join(root, "operator", "operator.db"),
      rows: reviewed.operator,
    },
    ...Object.entries(reviewed.sites).map(([site, rows]) => ({
      name: site,
      path: join(root, site, "tea.db"),
      rows,
    })),
  ];
  const counts = applyReviewedLinks(
    targets,
    process.argv[3] === "--apply",
    reviewed.issuer,
  );
  console.log(
    JSON.stringify({ applied: process.argv[3] === "--apply", counts }),
  );
}
