import { execFileSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  statfs,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";

const [scanner, output] = process.argv.slice(2);
const parent = dirname(output);
const floor = BigInt(process.env.HARRHY_DIRSTAT_FREE_FLOOR ?? 134217728);
async function checkSpace() {
  for (const dir of [".", parent]) {
    const fs = await statfs(dir, { bigint: true });
    if (fs.bavail * fs.bsize < floor + 16n * 1024n * 1024n)
      throw new Error("disk free floor");
  }
}
await checkSpace();
const lock = ".dirstat-scan.lock";
await mkdir(lock); // One operator scan in this preview workspace; fail closed after an unclean exit.
let root;
async function publish(value) {
  await checkSpace();
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized) > 65536)
    throw new Error("recording byte limit");
  const temporary = `${output}.pending`;
  await writeFile(temporary, serialized, { mode: 0o600, flag: "wx" });
  await rename(temporary, output);
}
try {
  root = await mkdtemp("./fixture-");
  /** @type {[string, string, number[]][]} */
  const shelves = [
    ["Field recordings", "wav", [768, 152, 96, 64]],
    ["Night sky", "png", [456, 320, 128, 120]],
    ["Paper models", "pdf", [380, 160, 84, 56]],
    ["Print studio", "png", [248, 196, 152, 84]],
    ["Seed library", "pdf", [180, 96, 64, 52]],
    ["Weather logs", "txt", [224, 120, 80, 32]],
  ];
  for (const [shelf, ext, sizes] of shelves) {
    for (const [index, size] of sizes.entries()) {
      await checkSpace();
      const dir = join(root, shelf, index < 2 ? "Masters" : "Studies");
      await mkdir(dir, { recursive: true });
      await writeFile(
        join(
          dir,
          `${shelf.toLowerCase().replaceAll(" ", "-")}-${index + 1}.${ext}`,
        ),
        Buffer.alloc(size * 1024, 65),
      );
      await writeFile(
        join(dir, `notes-${index + 1}.txt`),
        Buffer.alloc((8 + index * 4) * 1024, 65),
      );
      await writeFile(
        join(dir, `contact-${index + 1}.png`),
        Buffer.alloc((20 + index * 8) * 1024, 65),
      );
    }
  }
  const extras = [
    ["Print studio/node_modules/cache", "synthetic-module.bin", 512],
    ["Seed library/.venv/lib", "synthetic-python.bin", 416],
    ["Weather logs/venv/lib", "synthetic-venv.bin", 176],
    ["Paper models/compiler-output/CMakeFiles", "synthetic-object.bin", 632],
    ["Paper models/build", "ordinary-build-note.txt", 64],
  ];
  for (const [path, name, size] of extras) {
    await checkSpace();
    const dir = join(root, path);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, name), Buffer.alloc(size * 1024, 65));
  }
  await writeFile(
    join(root, "Paper models/compiler-output/CMakeCache.txt"),
    `# This is the CMakeCache file.
# Synthetic fixture
`,
  );
  const lines = execFileSync(scanner, [root, "--aggregate"], {
    encoding: "utf8",
    timeout: 9000,
    maxBuffer: 65536,
  });
  const events = lines
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const finish = events.at(-1);
  const changes = events
    .filter((event) => event.type === "progress")
    .flatMap((event) => event.events);
  const leaves = changes.filter(
    (event) => event.type === "file" || event.type === "summary",
  );
  if (finish.type === "abort") throw new Error(finish.reason);
  if (
    events[0].version !== 3 ||
    finish.type !== "finish" ||
    finish.omitted ||
    finish.skipped ||
    leaves.length !== 77 ||
    leaves.filter((leaf) => leaf.type === "summary").length !== 4 ||
    leaves.reduce((sum, leaf) => sum + leaf.bytes, 0) !== finish.fileBytes
  ) {
    throw new Error("incomplete or inconsistent recording");
  }
  await publish({
    changes,
    fileBytes: finish.fileBytes,
    files: leaves.length,
    sourceFiles: finish.files,
  });
} catch (error) {
  const reason = error.message;
  console.error(`Synthetic scan aborted: ${reason}`);
  // Publish only the failure notice, not partial scanner output, if a prior recording exists.
  try {
    const previous = JSON.parse(await readFile(output, "utf8"));
    const known = ["entry limit", "time limit", "allocated byte limit"];
    await publish({
      ...previous,
      abortReason: known.includes(reason) ? reason : "recording rejected",
    });
  } catch {
    // Missing previous result or insufficient space: leave storage untouched.
  }
  process.exitCode = 1;
} finally {
  if (root) await rm(root, { recursive: true, force: true });
  await rm(lock, { recursive: true });
}
