import { spawnSync } from "node:child_process";

export function docker(...args) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    timeout: 120_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`docker ${args[0]} failed: ${result.stderr}`);
  return args[0] === "logs" ? result.stdout + result.stderr : result.stdout;
}

export function withImageContainer(image, options, check) {
  const id = docker(
    "create",
    "--network",
    "none",
    "--label",
    "dev.harrhy.purpose=ci-image-smoke",
    ...options,
    image,
  ).trim();
  try {
    check(id, () => docker("start", id));
  } catch (error) {
    try {
      process.stderr.write(docker("logs", id));
    } catch (logsError) {
      console.error(logsError);
    }
    throw error;
  } finally {
    docker("rm", "-f", "-v", id);
  }
}
