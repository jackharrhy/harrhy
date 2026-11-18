#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { normalizeTitle, titleError, titleFromSubject } from "./title.ts";

const usage = `review submit --repo . --base REF --head REF [--title TITLE] [--json]
review list
review rename REVIEW_ID --title TITLE
review comments REVIEW_ID
review note REVIEW_ID --file INDEX --side old|new --line NUMBER --text TEXT
review reply REVIEW_ID THREAD_ID --text TEXT
review resolve REVIEW_ID THREAD_ID
review reopen REVIEW_ID THREAD_ID

Only submit synthetic repositories. File indices are zero-based in patch order.`;
const idPattern = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/;
const limit = 512 * 1024;

function requireTitle(value) {
  const title = normalizeTitle(value);
  if (!title) throw new Error(titleError);
  return title;
}

function snapshot({ repo = ".", base, head, title }) {
  if (!base || !head) throw new Error("submit requires --base and --head");
  const git = (...args) => {
    try {
      return execFileSync("git", ["--no-replace-objects", "-C", resolve(repo), ...args], {
        maxBuffer: limit,
        timeout: 15000,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          GIT_NO_LAZY_FETCH: "1",
          GIT_TERMINAL_PROMPT: "0",
        },
      });
    } catch (error) {
      if (error.code === "ENOBUFS") throw new Error("Patch exceeds 512 KiB", { cause: error });
      throw new Error(`Git ${args[0]} failed; check the repository and committed refs`, {
        cause: error,
      });
    }
  };
  const commit = (ref) =>
    git("rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`).toString().trim();
  const baseId = commit(base);
  const headId = commit(head);
  const mergeBase = git("merge-base", baseId, headId).toString().trim();
  const patch = new TextDecoder("utf-8", { fatal: true }).decode(
    git(
      "diff",
      "--no-ext-diff",
      "--no-textconv",
      "--no-color",
      "--src-prefix=a/",
      "--dst-prefix=b/",
      "--output-indicator-new=+",
      "--output-indicator-old=-",
      "--output-indicator-context= ",
      "--no-relative",
      "--submodule=short",
      "--ignore-submodules=none",
      "--unified=3",
      "--diff-algorithm=myers",
      mergeBase,
      headId,
      "--",
    ),
  );
  if (!patch) throw new Error("No committed changes from merge base to head");
  if (title === undefined) {
    const subject = git("show", "-s", "--format=%s", "--no-notes", headId, "--").toString();
    title = titleFromSubject(subject);
  }
  return { base: baseId, head: headId, mergeBase, patch, title };
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "--help") return console.log(usage);
  const string = { type: "string" };
  const commands = {
    submit: {
      count: 0,
      options: {
        repo: string,
        base: string,
        head: string,
        title: string,
        json: { type: "boolean" },
      },
    },
    list: { count: 0, options: {} },
    rename: { count: 1, options: { title: string } },
    comments: { count: 1, options: {} },
    note: {
      count: 1,
      options: { file: string, side: string, line: string, text: string },
    },
    reply: { count: 2, options: { text: string } },
    resolve: { count: 2, options: {} },
    reopen: { count: 2, options: {} },
  };
  if (!Object.hasOwn(commands, command)) throw new Error(usage);
  const { count, options } = commands[command];
  const { values, positionals } = parseArgs({
    args,
    options,
    allowPositionals: true,
  });
  if (positionals.length !== count || !positionals.every((id) => idPattern.test(id)))
    throw new Error(usage);
  const [id, thread] = positionals;
  const origin = process.env.HARRHY_REVIEW_ORIGIN || "http://127.0.0.1:9867";
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin))
    throw new Error("Expected a numeric loopback origin");
  let path = "/api/reviews";
  if (id) path += command === "rename" ? `/${id}` : `/${id}/threads`;
  if (thread) path += `/${thread}`;
  let body;
  if (command === "submit") {
    if (values.title !== undefined) values.title = requireTitle(values.title);
    body = snapshot(values);
  }
  if (command === "rename") body = { title: requireTitle(values.title) };
  if (command === "note") {
    if (
      !/^\d+$/.test(values.file ?? "") ||
      !/^\d+$/.test(values.line ?? "") ||
      !values.text ||
      !["old", "new"].includes(values.side)
    )
      throw new Error(usage);
    body = {
      file: Number(values.file),
      line: Number(values.line),
      side: values.side,
      text: values.text,
    };
  }
  if (command === "reply" && !values.text) throw new Error(usage);
  if (thread) body = { action: command, text: values.text };
  const response = await fetch(`${origin}${path}`, {
    ...(body && {
      method: command === "rename" ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json", "X-Harrhy-Review": "1" },
      body: JSON.stringify(body),
    }),
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.error ?? `HTTP ${response.status}`);
  }
  const result = await response.json();
  console.log(command === "submit" && !values.json ? result.url : JSON.stringify(result, null, 2));
}

try {
  await main();
} catch (error) {
  console.error(`review: ${error.message}`);
  process.exitCode = 1;
}
