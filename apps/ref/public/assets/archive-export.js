const token = document.querySelector("#archive-token");
const start = document.querySelector("#start-export");
const check = document.querySelector("#check-export");
const download = document.querySelector("#download-export");
const status = document.querySelector("#export-status");
const endpoint = "/api/archive/exports";
let job = null;
let pending = null;
let forgetTimer;

function updateControls() {
  const disabled = !!pending || !token.value.trim();
  start.disabled = disabled || job?.state === "building";
  check.disabled = disabled || !job;
  download.disabled = disabled || job?.state !== "ready";
}

function save(blob, disposition) {
  const link = document.createElement("a");
  link.download =
    /filename="?([\w.-]+)"?/i.exec(disposition)?.[1] ?? "ref-archive";
  link.href = URL.createObjectURL(blob);
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function run(action) {
  if (pending || !token.value.trim()) return;
  const request = new AbortController();
  pending = request;
  updateControls();
  status.textContent =
    action === download ? "Downloading archive…" : "Checking export…";
  try {
    const path =
      action === start
        ? endpoint
        : `${endpoint}/${encodeURIComponent(job.id)}${action === download ? "/download" : ""}`;
    const response = await fetch(path, {
      method: action === start ? "POST" : "GET",
      headers: { Authorization: `Bearer ${token.value.trim()}` },
      credentials: "omit",
      mode: "same-origin",
      redirect: "error",
      cache: "no-store",
      signal: request.signal,
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        token.value = "";
        status.textContent =
          "Access denied. Paste a current admin token with archive-read and try again.";
        token.focus();
      } else if (response.status === 404 || response.status === 410) {
        job = null;
        status.textContent = "Export not found or expired. Start a new export.";
      } else {
        status.textContent = `Export unavailable (HTTP ${response.status}). Try again later.`;
      }
      return;
    }
    if (action === download) {
      save(
        await response.blob(),
        response.headers.get("Content-Disposition") ?? "",
      );
      token.value = "";
      status.textContent =
        "Download started. Keep the archive somewhere private.";
      return;
    }
    const result = await response.json();
    if (
      typeof result.id !== "string" ||
      !/^[\w-]+$/.test(result.id) ||
      !["building", "ready", "failed"].includes(result.state)
    ) {
      throw new Error("Invalid export status");
    }
    job = result;
    status.textContent = {
      building: "Building archive. Check status in a moment.",
      ready: "Archive ready to download.",
      failed:
        "Export failed. Try again after this export expires (within 15 minutes).",
    }[job.state];
  } catch {
    if (!request.signal.aborted)
      status.textContent = "Could not complete the request. Try again.";
  } finally {
    pending = null;
    updateControls();
  }
}

for (const button of [start, check, download])
  button.addEventListener("click", () => run(button));
token.addEventListener("input", () => {
  clearTimeout(forgetTimer);
  forgetTimer = setTimeout(() => {
    token.value = "";
    updateControls();
  }, 5 * 60_000);
  updateControls();
});
window.addEventListener("pagehide", () => {
  clearTimeout(forgetTimer);
  token.value = "";
  pending?.abort();
  updateControls();
});
updateControls();
