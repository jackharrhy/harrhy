export function clickerTimer(dialog: HTMLDialogElement) {
  const time = dialog.querySelector<HTMLElement>("#clicker-time");
  const toggle = dialog.querySelector<HTMLButtonElement>(
    "#clicker-timer-toggle",
  );
  const reset = dialog.querySelector<HTMLButtonElement>("#clicker-timer-reset");
  if (!time || !toggle || !reset) return;

  const key = "harrhy-slides:timer";
  let elapsed = 0;
  let startedAt: number | null = null;
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "null");
    if (Number.isFinite(saved?.elapsed) && saved.elapsed >= 0)
      elapsed = saved.elapsed;
    if (Number.isFinite(saved?.startedAt) && saved.startedAt > 0)
      startedAt = saved.startedAt;
  } catch {
    /* Storage is optional. */
  }

  const duration = () =>
    elapsed + (startedAt === null ? 0 : Math.max(0, Date.now() - startedAt));
  const paint = () => {
    const seconds = Math.floor(duration() / 1000);
    const minutes = Math.floor(seconds / 60);
    time.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    toggle.textContent = startedAt === null ? "Start" : "Stop";
  };
  const save = () => {
    try {
      localStorage.setItem(key, JSON.stringify({ elapsed, startedAt }));
    } catch {
      /* Keep working in memory. */
    }
    paint();
  };
  toggle.addEventListener("click", () => {
    if (startedAt === null) startedAt = Date.now();
    else {
      elapsed = duration();
      startedAt = null;
    }
    save();
  });
  reset.addEventListener("click", () => {
    elapsed = 0;
    startedAt = null;
    save();
  });
  paint();
  window.setInterval(() => {
    if (dialog.open && startedAt !== null) paint();
  }, 250);
  return paint;
}
