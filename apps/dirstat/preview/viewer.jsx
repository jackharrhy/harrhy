import { worldCamera } from "./world.mjs";
import { createRoot, css, on } from "remix/component";
import { nestedTreemap } from "./layout.mjs";
import { ScannerPointer } from "./scanner-pointer.jsx";

// Radio cyan plus the warm signal colors from its desktop header.
const regionColors = [
  "#10a8bf",
  "#e8ad19",
  "#46b34f",
  "#e55748",
  "#547de2",
  "#a264d1",
];
function regionColor(tile) {
  const color = regionColors[(tile.region ?? 0) % regionColors.length];
  return color;
}
const colors = {
  wav: ["#63abb3", "Audio"],
  png: ["#8aabc9", "Images"],
  pdf: ["#d9ae69", "Documents"],
  txt: ["#a5bb9a", "Text"],
};
const workspace = css({
  // Radio desktop palette; the file-type colors belong only to the data.
  "--ink": "#1f2a31",
  "--line": "#7b878c",
  "--paper": "#f8fbfb",
  "--wash": "#dce4e7",
  "--stripe": "#c7d0d4",
  "--accent": "#2aa7b8",
  "--selected": "#c9f4f8",
  background: "var(--wash)",
  color: "var(--ink)",
  font: "14px system-ui, sans-serif",
  boxSizing: "border-box",
  height: "100dvh",
  padding: 10,
  display: "grid",
  gap: 8,
  gridTemplateRows: "auto minmax(0, 1fr)",
  fontVariantNumeric: "tabular-nums",
  "& *": { boxSizing: "border-box" },
  "& button": { font: "inherit", color: "inherit", cursor: "pointer" },
  "& button:focus-visible": {
    outline: "2px solid var(--ink)",
    outlineOffset: -3,
  },
  "& ::selection": { background: "var(--selected)", color: "var(--ink)" },
  ".bar": {
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
    alignItems: "center",
    minHeight: 30,
    paddingInline: 7,
  },
  ".toolbar": { display: "grid", gap: 5, minWidth: 0 },
  ".start": {
    border: "1px solid var(--ink)",
    borderRadius: 3,
    padding: "5px 10px",
    background: "var(--selected)",
    fontWeight: 650,
    whiteSpace: "nowrap",
  },
  ".start:disabled": { background: "var(--stripe)", cursor: "default" },
  ".actions": {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  ".status": { textAlign: "right", fontWeight: 600 },
  ".scope": { fontWeight: 650 },
  ".fs": { paddingInline: 8, paddingBlock: 2 },
  ".tile-label": {
    transform: "scale(var(--label-scale, 1))",
    transformOrigin: "0 0",
    position: "absolute",
    top: 0,
    left: 0,
    display: "grid",
    textAlign: "left",
    maxWidth: "100%",
  },
  ".meta": { color: "#43545c", fontSize: 12 },
  ".workspace": {
    minHeight: 0,
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) clamp(18rem, 28vw, 25rem)",
    gap: 8,
  },
  ".camera": {
    position: "absolute",
    inset: 0,
    transformOrigin: "0 0",
    pointerEvents: "none",
  },
  ".world-canvas": { position: "absolute", inset: 0, pointerEvents: "none" },
  ".map": {
    position: "relative",
    minWidth: 0,
    minHeight: 0,
    background: "var(--stripe)",
    border: "1px solid var(--ink)",
    overflow: "hidden",
    touchAction: "none",
    cursor: "grab",
  },
  "& [data-renderer=pixi-webgl] .tile": {
    background: "transparent !important",
    borderColor: "transparent",
  },
  "& [data-renderer=pixi-webgl] .tile:hover": { borderColor: "#fff9" },
  ".empty": { padding: 14, margin: 0 },
  "& [data-replaying] :is(.tile, .folder, .outline)": {
    transition: ["left", "top", "width", "height"]
      .map((p) => `${p} 220ms cubic-bezier(.18,.72,.24,1)`)
      .concat("opacity 180ms ease-out")
      .join(", "),
  },
  ".tile": {
    position: "absolute",
    pointerEvents: "auto",
    padding: 0,
    border: "1px solid #1f2a3166",
    overflow: "hidden",
    backgroundImage:
      "radial-gradient(ellipse at 42% 36%, #ffffff81, #ffffff09 42%, #0b162282 100%)",
    "@starting-style": { opacity: 0 },
  },
  ".tile-label strong": { fontSize: 16, lineHeight: 1.1, fontWeight: 750 },
  ".tile:hover": { borderColor: "var(--ink)", zIndex: 1 },
  ".folder": {
    position: "absolute",
    zIndex: 2,
    pointerEvents: "none",
    border: "1px solid #1f2a3170",
  },
  ".major": { border: "2px solid #1f2a31" },
  ".tag": {
    pointerEvents: "auto",
    maxWidth: "100%",
    border: 0,
    padding: "3px 6px",
    background: "var(--ink)",
    color: "var(--paper)",
    fontSize: 12,
    borderRadius: "0 0 3px 0",
  },
  ".tag:focus-visible": { outlineColor: "var(--selected)" },
  ".outline": {
    position: "absolute",
    pointerEvents: "none",
    zIndex: 42,
    boxShadow: "inset 0 0 0 2px #fff, inset 0 0 0 4px #1f2a31",
  },
  ".side": {
    minHeight: 0,
    minWidth: 0,
    border: "1px solid var(--line)",
    background: "var(--paper)",
    display: "grid",
    gridTemplateRows: "auto minmax(0, 1fr)",
    overflow: "hidden",
  },
  ".columns": {
    borderBottom: "1px solid var(--stripe)",
    padding: "7px 10px",
    display: "flex",
    justifyContent: "space-between",
    fontSize: 12,
    fontWeight: 650,
  },
  ".tree": {
    overflow: "auto",
    scrollbarColor: "var(--line) var(--paper)",
    paddingBlock: 4,
  },
  ".tree ul": { listStyle: "none", padding: 0, margin: 0 },
  ".row": {
    minWidth: 0,
    display: "flex",
    alignItems: "stretch",
    minHeight: 30,
    paddingRight: 5,
  },
  ".row:has([aria-pressed=true])": { background: "var(--selected)" },
  ".row:hover": { background: "var(--wash)" },
  ".choice": {
    flex: "1 1 auto",
    minWidth: 0,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    border: 0,
    background: "none",
    textAlign: "left",
    padding: "0 4px",
  },
  ".disclosure, .mark": {
    flex: "0 0 22px",
    display: "grid",
    placeItems: "center",
    padding: 0,
    background: "none",
    border: 0,
  },
  ".swatch": {
    display: "inline-block",
    width: 9,
    height: 9,
    border: "1px solid #1f2a3155",
  },
  ".amount": { whiteSpace: "nowrap" },
  ".truncate": {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  ".path": { overflowWrap: "anywhere", minWidth: 0, fontWeight: 600 },
  ".detail": {
    alignItems: "start",
    background: "var(--paper)",
    border: "1px solid var(--line)",
    padding: "7px 10px",
    minWidth: 0,
  },
  ".legend": {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "4px 10px",
  },
  ".legend span": {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    whiteSpace: "nowrap",
  },
  "@media (max-width: 700px)": {
    "&": {
      height: "auto",
      minHeight: "100dvh",
      gridTemplateRows: "auto auto",
      alignContent: "start",
      padding: 6,
      gap: 6,
    },
    ".workspace": {
      gridTemplateColumns: "minmax(0, 1fr)",
      gridTemplateRows: "clamp(235px, 39dvh, 420px) minmax(205px, 36dvh)",
      gap: 6,
    },
    ".row": { minHeight: 44 },
    ".disclosure, .mark": { flexBasis: 32 },
    ".detail": { flexWrap: "wrap" },
  },
  "@media (prefers-reduced-motion: reduce)": {
    "& [data-replaying] :is(.tile, .folder, .outline)": { transition: "none" },
  },
});

const format = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
function size(bytes) {
  if (bytes === 0) return "0 B";
  if (bytes >= 1073741824) return `${format.format(bytes / 1073741824)} GiB`;
  return bytes >= 1048576
    ? `${format.format(bytes / 1048576)} MiB`
    : `${format.format(bytes / 1024)} KiB`;
}
function tileColor(tile) {
  return isLeaf(tile) || tile.id < 0 ? fileColor(tile) : regionColor(tile);
}

function position(box) {
  return { left: box.x, top: box.y, width: box.w, height: box.h };
}
const isLeaf = (node) => node.type === "file" || node.type === "summary";
function fileColor(node) {
  if (node.type === "summary") return "#b9a8c9";
  return colors[node.name.split(".").at(-1)]?.[0] ?? "#c7d0d4";
}

function TreeRow(handle) {
  let page = 0;
  return () => {
    const { node, selected, expanded, select, toggle } = handle.props;
    const dir = !isLeaf(node);
    const following =
      handle.props.revealPath.get(node.id) ??
      handle.props.followPath.get(node.id);
    const shownPage = following ? Math.floor(following.index / 40) : page;
    const open = expanded.has(node.id) || Boolean(following);
    return (
      <li data-tree-depth={node.depth}>
        <div class="row" style={{ paddingLeft: Math.min(node.depth, 18) * 8 }}>
          {dir ? (
            <button
              type="button"
              class="disclosure"
              aria-label={`${open ? "Collapse" : "Expand"} ${node.name}`}
              aria-expanded={open}
              mix={on("click", () => toggle(node.id))}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                stroke-width="1.4"
                aria-hidden="true"
              >
                <path d={open ? "m2 4 4 4 4-4" : "m4 2 4 4-4 4"} />
              </svg>
            </button>
          ) : (
            <span class="mark">
              <i class="swatch" style={{ background: fileColor(node) }} />
            </span>
          )}
          <button
            type="button"
            class="choice"
            data-row={node.id}
            aria-pressed={selected === node.id}
            mix={on("click", () => select(node.id))}
          >
            <span class="truncate" title={node.name}>
              {node.name}
            </span>
            <span class="meta amount">{size(node.bytes)}</span>
          </button>
        </div>
        {dir && open && node.children.length > 0 && (
          <ul>
            {node.children
              .slice(shownPage * 40, (shownPage + 1) * 40)
              .map((child) => (
                <TreeRow key={child.id} {...handle.props} node={child} />
              ))}
            {node.children.length > 40 && (
              <li class="row">
                <button
                  type="button"
                  disabled={shownPage === 0}
                  mix={on("click", () => {
                    handle.props.pauseFollow();
                    page = shownPage - 1;
                    handle.update();
                  })}
                >
                  Previous
                </button>
                <span>
                  {shownPage + 1} / {Math.ceil(node.children.length / 40)}
                </span>
                <button
                  type="button"
                  disabled={(shownPage + 1) * 40 >= node.children.length}
                  mix={on("click", () => {
                    handle.props.pauseFollow();
                    page = shownPage + 1;
                    handle.update();
                  })}
                >
                  Next
                </button>
              </li>
            )}
          </ul>
        )}
      </li>
    );
  };
}

function Inventory(handle) {
  let trail = [handle.props.folder];
  let cursors = [0];
  let rows = [],
    more = false,
    status = "Loading…";
  let sequence = 0;
  async function load() {
    const turn = ++sequence;
    status = "Loading…";
    handle.update();
    const folder = trail.at(-1);
    try {
      const response = await fetch(
        `/inventory?parent=${folder.id}&after=${cursors.at(-1)}`,
        {
          headers: { "X-DirStat-Scan": handle.props.scanId },
          signal: handle.signal,
        },
      );
      if (!response.ok) throw new Error("Inventory unavailable");
      const page = await response.json();
      if (turn !== sequence) return;
      rows = page.rows;
      more = page.more;
      status = rows.length ? "" : "No recorded children yet";
    } catch {
      if (handle.signal.aborted || turn !== sequence) return;
      rows = [];
      more = false;
      status = "Inventory unavailable. Start a new scan or retry.";
    }
    handle.update();
  }
  handle.queueTask(() => void load());
  return () => (
    <div>
      <div class="bar actions">
        <button
          type="button"
          class="start"
          mix={on("click", handle.props.close)}
        >
          Back to tree
        </button>
        {trail.length > 1 && (
          <button
            type="button"
            class="start"
            mix={on("click", () => {
              trail.pop();
              cursors = [0];
              void load();
            })}
          >
            Parent
          </button>
        )}
        <button
          type="button"
          class="start"
          mix={on("click", () => void load())}
        >
          Refresh
        </button>
      </div>
      <div class="bar meta">Named inventory · {trail.at(-1).name}</div>
      {status && (
        <div class="bar meta" role="status">
          {status}
        </div>
      )}
      <ul>
        {rows.map((row) => (
          <li key={row.id} class="row" data-inventory-row>
            {row.kind === "file" ? (
              <span class="choice">
                <span class="truncate">{row.name}</span>
                <span class="meta amount">{size(row.bytes)}</span>
              </span>
            ) : (
              <button
                type="button"
                class="choice"
                mix={on("click", () => {
                  trail.push(row);
                  cursors = [0];
                  void load();
                })}
              >
                <span class="truncate">{row.name} /</span>
                <span class="meta amount">
                  {row.bytes === 0 && handle.props.running
                    ? "Counting…"
                    : size(row.bytes)}
                </span>
              </button>
            )}
          </li>
        ))}
      </ul>
      <div class="bar actions">
        <button
          type="button"
          disabled={cursors.length < 2}
          mix={on("click", () => {
            cursors.pop();
            void load();
          })}
        >
          Previous 40
        </button>
        <button
          type="button"
          disabled={!more || !rows.length}
          mix={on("click", () => {
            cursors.push(rows.at(-1).id);
            void load();
          })}
        >
          Next 40
        </button>
      </div>
    </div>
  );
}

const newRoot = () => ({
  id: 0,
  name: "/",
  children: [],
  bytes: 0,
  files: 0,
  directFiles: 0,
  depth: 0,
});

function Viewer(handle) {
  let nodes = [newRoot()];
  const expanded = new Set([0]);
  let selected = 0,
    zoom = 0,
    cursor = 0,
    generation = 0;
  let status = "Ready to scan",
    running = false,
    finished = false;
  let visited = 0,
    skipped = 0,
    receipt = "";
  let width = 0,
    height = 0;
  let boxes = new Map(),
    tiles = [];
  let renderFrame = 0,
    wait = 0,
    timer;
  let connection;
  const zoomStack = [];
  let world;
  let focusRequested = false;
  let pendingPose;
  let previousAutoScale;
  let scanId;
  let snapshotMode = false;
  let requests = 0;
  let requestsLeft = 0;
  async function fetchChildren(folder) {
    if (folder.loaded || folder.loading || isLeaf(folder) || !snapshotMode)
      return;
    folder.loading = true;
    const id = scanId;
    requests++;
    try {
      const response = await fetch(`/snapshot?parent=${folder.id}`, {
        headers: { "X-DirStat-Scan": id },
        signal: handle.signal,
      });
      if (!response.ok) throw new Error("Snapshot unavailable");
      const rows = await response.json();
      if (id !== scanId || !snapshotMode) return;
      folder.children = rows.map((row, index) => {
        const child = {
          ...row,
          type: row.kind,
          index,
          parent: folder,
          children: [],
          depth: folder.depth + 1,
          region: folder.depth ? folder.region : index,
        };
        nodes[child.id] = child;
        return child;
      });
      folder.loaded = true;
    } catch {
      folder.loadFailed = true;
    } finally {
      folder.loading = false;
      requests--;
      renderSoon();
    }
  }
  async function restore() {
    const token = generation;
    try {
      const response = await fetch("/snapshot", { signal: handle.signal });
      if (!response.ok) return;
      const saved = await response.json();
      if (generation !== token || running) return;
      snapshotMode = true;
      scanId = saved.id;
      nodes = [newRoot()];
      nodes[0].bytes = saved.fileBytes;
      zoomStack.length = 0;
      selected = zoom = cursor = 0;
      inventoryFolder = undefined;
      expanded.clear();
      expanded.add(0);
      revealPath = followPath = new Map();
      previousAutoScale = undefined;
      camera = 1;
      disk = saved.disk;
      gaps = saved.gaps;
      skipped = saved.skipped ?? 0;
      status = "Saved scan";
      receipt = `Saved ${new Date(saved.savedAt).toLocaleString()} · ${format.format(saved.visited)} visited${saved.reasons?.length ? ` · ${saved.reasons.join(", ")}` : saved.reasons === null ? " · original gap breakdown unavailable" : ""}`;
      requestsLeft = width < 500 ? 42 : 80;
      renderSoon();
      void fetchChildren(nodes[0]);
    } catch {}
  }
  let inventoryFolder;
  function browse(folder) {
    pauseFollow();
    inventoryFolder = folder;
    handle.update();
  }
  let disk, gaps;
  let revealPath = new Map();
  let copyStatus = "";
  let follow = true;
  let camera = 0.48;
  let cameraStep = -Infinity;
  let followPath = new Map();
  let activePath = new Map();
  function layout() {
    activePath = new Map();
    for (let node = nodes[cursor]; node?.parent; node = node.parent)
      activePath.set(node.parent.id, node);
    if (running && follow) followPath = activePath;
    if (follow && zoom === 0) {
      const regions = nodes[0].children.filter((node) => node.bytes > 0).length;
      const next = !running
        ? 1
        : regions >= 8
          ? 1
          : regions >= 4
            ? 0.84
            : regions >= 2
              ? 0.66
              : 0.48;
      const now = performance.now();
      if (next > camera && (now - cameraStep > 600 || !running)) {
        camera = next;
        cameraStep = now;
      }
    }
    const focusPath = new Map(activePath);
    for (let node = nodes[zoom]; node?.parent; node = node.parent)
      focusPath.set(node.parent.id, node);
    ({ boxes, tiles } = nestedTreemap(
      nodes[0],
      width,
      height,
      focusPath,
      snapshotMode,
    ));
    world?.scene(width, height, tiles, boxes, tileColor);
    const focus = boxes.get(zoom);
    if (focusRequested && focus && world) {
      world.move(world.fit(focus));
      focusRequested = false;
    }
    if (pendingPose && world) {
      world.move(pendingPose);
      pendingPose = undefined;
    }
    if (follow && !zoom && previousAutoScale !== camera && world) {
      previousAutoScale = camera;
      world.move(
        {
          x: (width * (1 - camera)) / 2,
          y: (height * (1 - camera)) / 2,
          scale: camera,
        },
        running && !!boxes.size,
      );
    }
  }
  function pauseFollow() {
    follow = false;
    for (const id of followPath.keys()) expanded.add(id);
    followPath = new Map();
  }
  function renderSoon() {
    if (renderFrame) return;
    renderFrame = requestAnimationFrame(() => {
      renderFrame = 0;
      layout();
      if (snapshotMode && requestsLeft > 0 && requests < 4) {
        const candidates = tiles
          .filter(
            (tile) =>
              tile.id >= 0 &&
              !isLeaf(tile) &&
              !tile.loaded &&
              !tile.loading &&
              !tile.loadFailed,
          )
          .filter(
            (tile) => boxes.get(tile.id).w >= 30 && boxes.get(tile.id).h >= 24,
          )
          .toSorted(
            (a, b) =>
              boxes.get(b.id).w * boxes.get(b.id).h -
              boxes.get(a.id).w * boxes.get(a.id).h,
          );
        for (const folder of candidates.slice(
          0,
          Math.min(4 - requests, requestsLeft),
        )) {
          requestsLeft--;
          void fetchChildren(folder);
        }
      }
      if (running && follow && cursor) {
        const id = cursor;
        handle.queueTask((signal) => {
          if (signal.aborted) return;
          const row = document.querySelector(`[data-row="${id}"]`);
          const tree = row?.closest(".tree");
          if (!tree) return;
          const pane = tree.getBoundingClientRect();
          const bounds = row.getBoundingClientRect();
          if (bounds.bottom > pane.bottom)
            tree.scrollTop += bounds.bottom - pane.bottom;
          else if (bounds.top < pane.top)
            tree.scrollTop -= pane.top - bounds.top;
        });
      }
      handle.update();
    });
  }
  function reveal(id) {
    pauseFollow();
    revealPath = new Map();
    for (let node = nodes[id]; node?.parent; node = node.parent)
      revealPath.set(node.parent.id, node);
    handle.queueTask((signal) => {
      if (signal.aborted) return;
      document
        .querySelector(`[data-row="${id}"]`)
        ?.focus({ preventScroll: false });
    });
    handle.update();
  }
  function select(id, revealInTree = false) {
    pauseFollow();
    selected = id;
    copyStatus = "";
    if (revealInTree) reveal(id);
    handle.update();
  }
  function zoomIn(id) {
    if (id === zoom) return;
    zoomStack.push({ id: zoom, pose: world?.pose });
    focusRequested = true;
    zoomTo(id);
  }
  function zoomBack() {
    const previous = zoomStack.pop();
    if (!previous) return;
    focusRequested = false;
    pendingPose = previous.pose;
    zoomTo(previous.id);
  }
  window.addEventListener(
    "keydown",
    (event) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.key !== "Escape" ||
        !zoomStack.length
      )
        return;
      event.preventDefault();
      zoomBack();
    },
    { signal: handle.signal },
  );
  function zoomTo(id) {
    pauseFollow();
    revealPath = new Map();
    inventoryFolder = undefined;
    copyStatus = "";
    zoom = selected = id;
    camera = 1;
    expanded.add(id);
    requestsLeft = width < 500 ? 42 : 80;
    void fetchChildren(nodes[id]);
    renderSoon();
  }
  function toggle(id) {
    const wasOpen =
      expanded.has(id) || revealPath.has(id) || followPath.has(id);
    pauseFollow();
    revealPath = new Map();
    if (wasOpen) expanded.delete(id);
    else {
      expanded.add(id);
      void fetchChildren(nodes[id]);
    }
    handle.update();
  }
  handle.queueTask(() => {
    const observer = new ResizeObserver(([entry]) => {
      ({ width, height } = entry.contentRect);
      renderSoon();
    });
    const map = document.querySelector(".map");
    world = worldCamera(
      map,
      map.querySelector(".camera"),
      handle.signal,
      pauseFollow,
    );
    observer.observe(map);
    void restore();
    handle.signal.addEventListener("abort", () => observer.disconnect(), {
      once: true,
    });
  });
  handle.signal.addEventListener("abort", () => {
    cancelAnimationFrame(renderFrame);
    clearTimeout(timer);
    connection?.abort();
  });
  window.addEventListener("pagehide", () => connection?.abort(), {
    signal: handle.signal,
  });
  async function start() {
    if (running || wait) return;
    const run = ++generation;
    snapshotMode = false;
    running = true;
    finished = false;
    status = "Scanning…";
    nodes = [newRoot()];
    follow = true;
    previousAutoScale = undefined;
    camera = 0.48;
    cameraStep = performance.now();
    followPath = new Map();
    revealPath = new Map();
    disk = gaps = undefined;
    scanId = inventoryFolder = undefined;
    copyStatus = "";
    expanded.clear();
    expanded.add(0);
    zoomStack.length = 0;
    selected = zoom = cursor = visited = skipped = 0;
    receipt = "";
    layout();
    handle.update();
    connection = new AbortController();
    try {
      const response = await fetch("/start", {
        method: "POST",
        headers: { "X-DirStat-Action": "home-scan" },
        signal: AbortSignal.any([
          handle.signal,
          connection.signal,
          AbortSignal.timeout(250000),
        ]),
      });
      if (!response.ok) {
        if (response.status !== 429 && response.status !== 409)
          throw new Error("Scan unavailable");
        wait = Number(response.headers.get("Retry-After")) || 2;
        status =
          response.status === 409 ? "Another scan is running" : "Cooling down";
        function tick() {
          if (handle.signal.aborted || !wait) return;
          --wait;
          handle.update();
          if (wait) timer = setTimeout(tick, 1000);
        }
        timer = setTimeout(tick, 1000);
        return;
      }
      let pending = "",
        streamId;
      for await (const chunk of response.body.pipeThrough(
        new TextDecoderStream(),
      )) {
        if (run !== generation) return;
        pending += chunk;
        const lines = pending.split("\n");
        pending = lines.pop();
        for (const line of lines) {
          const frame = JSON.parse(line);
          if (frame.start && !streamId) {
            streamId = scanId = frame.id;
            continue;
          }
          if (!streamId || frame.id !== streamId) continue;
          if (frame.failed) throw new Error(frame.failed);
          if (frame.disk) {
            disk = frame.disk;
            continue;
          }
          visited = frame.visited;
          if (frame.done) {
            if (nodes[0].bytes !== frame.fileBytes)
              throw new Error("Totals did not reconcile");
            skipped = frame.skipped;
            gaps = frame.gaps;
            finished = true;
            status = frame.reasons.length
              ? "Scan finished · partial totals"
              : "Scan complete";
            receipt = `${format.format(visited)} visited · ${(frame.elapsedMs / 1000).toFixed(1)}s · ${format.format(frame.sampled)} of ${format.format(frame.files)} files drawn live · full named inventory${frame.reasons.length ? ` · ${frame.reasons.join(", ")}` : ""}`;
            continue;
          }
          for (const [id, parent, name, type] of frame.events) {
            const dir = nodes[parent];
            const node = {
              id,
              name,
              type,
              parent: dir,
              bytes: 0,
              files: 0,
              directFiles: 0,
              depth: dir.depth + 1,
              index: dir.children.length,
              region: dir.depth === 0 ? dir.children.length : dir.region,
              children: [],
            };
            nodes[id] = node;
            dir.children.push(node);
            cursor = id;
          }
          for (const [id, bytes, files] of frame.deltas) {
            if (!isLeaf(nodes[id])) nodes[id].directFiles += files;
            for (let node = nodes[id]; node; node = node.parent) {
              node.bytes += bytes;
              node.files += files;
            }
            if (!frame.events.length) cursor = id;
          }
        }
        renderSoon();
      }
      if (!finished) throw new Error("Incomplete scan");
    } catch (error) {
      if (!handle.signal.aborted)
        status = /ceiling|floor|quota/.test(error.message)
          ? `${error.message} · scan failed`
          : "Scan interrupted · partial totals";
      cursor = 0;
    } finally {
      running = false;
      if (!finished) void restore();
      renderSoon();
    }
  }
  return () => {
    const path = [];
    for (let node = nodes[selected]; node; node = node.parent)
      path.unshift(node.name);
    const fullPath = `/${path.slice(1).join("/")}`;
    const share = (bytes) =>
      `${format.format(nodes[0].bytes ? (bytes / nodes[0].bytes) * 100 : 0)}% of total`;
    let marked = nodes[cursor];
    while (marked?.parent && !boxes.has(marked.id)) marked = marked.parent;
    const markerId = boxes.has(marked?.id) ? marked.id : -1 - zoom;
    const region = cursor && boxes.get(markerId);
    const active = region && {
      x: region.x + region.w * (0.2 + (cursor % 13) / 22),
      y: region.y + region.h * (0.2 + (cursor % 17) / 29),
      w: 0,
      h: 0,
    };
    const outline = boxes.get(selected);
    return (
      <main mix={workspace} aria-label="DirStat">
        <header class="toolbar">
          <div class="bar">
            <div class="actions">
              <button
                type="button"
                class="start"
                disabled={running || wait > 0}
                mix={on("click", () => void start())}
              >
                {wait ? `Start scan (${wait}s)` : "Start scan"}
              </button>
              {running && !follow && (
                <button
                  type="button"
                  class="start"
                  mix={on("click", () => {
                    zoomStack.length = 0;
                    zoom = selected = 0;
                    expanded.clear();
                    expanded.add(0);
                    follow = true;
                    previousAutoScale = undefined;
                    renderSoon();
                  })}
                >
                  Follow scan
                </button>
              )}
              {zoom > 0 && (
                <button type="button" class="start" mix={on("click", zoomBack)}>
                  Up
                </button>
              )}
              {selected !== zoom &&
                !isLeaf(nodes[selected]) &&
                (snapshotMode || nodes[selected].children.length > 0) && (
                  <button
                    type="button"
                    class="start"
                    mix={on("click", () => zoomIn(selected))}
                  >
                    Zoom in
                  </button>
                )}
            </div>
            <span class="meta status" role="status">
              {status}
            </span>
          </div>
          {(nodes.length > 1 || snapshotMode) && (
            <div class="bar detail">
              <div>
                <div class="path" data-path>
                  {fullPath}
                </div>
                <div class="meta" data-size>
                  {size(nodes[selected].bytes)} estimated allocated ·{" "}
                  {share(nodes[selected].bytes)}
                  {skipped ? ` · ${format.format(skipped)} skipped` : ""}
                </div>
                <div class="meta">
                  {receipt ||
                    `${format.format(visited)} visited · ${size(nodes[0].bytes)} counted`}
                </div>
              </div>
              <div class="actions">
                <button
                  type="button"
                  class="start"
                  mix={on("click", () => reveal(selected))}
                >
                  Reveal in tree
                </button>
                <button
                  type="button"
                  class="start"
                  mix={on("click", async () => {
                    try {
                      await navigator.clipboard.writeText(fullPath);
                      copyStatus = "Path copied";
                    } catch {
                      copyStatus = "Clipboard unavailable";
                    }
                    handle.update();
                  })}
                >
                  Copy path
                </button>
                {scanId && !isLeaf(nodes[selected]) && (
                  <button
                    type="button"
                    class="start"
                    mix={on("click", () => browse(nodes[selected]))}
                  >
                    Browse all entries
                  </button>
                )}
                {copyStatus && (
                  <span class="meta" aria-live="polite">
                    {copyStatus}
                  </span>
                )}
              </div>
            </div>
          )}
          {disk && (
            <div class="meta fs">
              <strong>Root filesystem</strong> {size(disk.used)} used /{" "}
              {size(disk.capacity)} capacity · {size(disk.available)} available
              <br />
              <strong>Scan</strong> {size(nodes[0].bytes)} measured file
              allocation; not equivalent to filesystem use.
            </div>
          )}
          {gaps && (
            <div class="meta fs" data-gaps>
              {Object.entries(gaps)
                .filter(([, n]) => n)
                .map(([label, n]) => `${label}: ${format.format(n)}`)
                .join(" · ")}
            </div>
          )}
        </header>
        <div class="workspace">
          <section
            class="map"
            data-zoom={zoom}
            data-replaying={running ? "" : undefined}
            aria-label="Allocated file size treemap"
          >
            {!boxes.size && (
              <p class="empty">
                {running
                  ? "Waiting for discoveries…"
                  : "Start a scan to see disk usage."}
              </p>
            )}
            <div class="camera" data-camera>
              {tiles
                .filter((tile) => boxes.has(tile.id))
                .map((tile) => (
                  <button
                    key={tile.id}
                    type="button"
                    class="tile"
                    data-tile={tile.id}
                    data-depth={tile.depth}
                    data-directory={
                      tile.id >= 0 && !isLeaf(tile) ? "" : undefined
                    }
                    tabIndex={-1}
                    aria-label={`${tile.name}, ${size(tile.bytes)}`}
                    title={`${tile.name} · ${size(tile.bytes)} · ${share(tile.bytes)}${tile.detail ? ` · ${tile.detail}` : ""}`}
                    aria-pressed={selected === tile.id}
                    style={{
                      ...position(boxes.get(tile.id)),
                      zIndex: tile.depth,
                      backgroundColor: tileColor(tile),
                    }}
                    mix={[
                      on("click", () =>
                        tile.id < 0
                          ? browse(nodes[-1 - tile.id])
                          : tile.type === "summary"
                            ? browse(tile)
                            : select(tile.id, true),
                      ),
                      ...(tile.id >= 0 &&
                      !isLeaf(tile) &&
                      (snapshotMode || tile.children.length)
                        ? [
                            on("contextmenu", (event) => {
                              event.preventDefault();
                              zoomIn(tile.id);
                            }),
                          ]
                        : []),
                    ]}
                  >
                    {boxes.get(tile.id).w > 76 && boxes.get(tile.id).h > 28 && (
                      <span class="tag tile-label">
                        <span class="truncate">{tile.name}</span>
                        {boxes.get(tile.id).w >= 126 &&
                          boxes.get(tile.id).h >= 58 && (
                            <span>
                              <strong>{size(tile.bytes)}</strong> ·{" "}
                              {share(tile.bytes)}
                            </span>
                          )}
                        {tile.detail &&
                          boxes.get(tile.id).w > 205 &&
                          boxes.get(tile.id).h > 70 && (
                            <span>{tile.detail}</span>
                          )}
                      </span>
                    )}
                  </button>
                ))}
              {outline && (
                <div
                  class="outline"
                  data-outline={selected}
                  style={position(outline)}
                />
              )}
              {active && (
                <ScannerPointer
                  key={generation}
                  id={cursor}
                  tileId={markerId}
                  box={active}
                  complete={finished}
                />
              )}
            </div>
          </section>
          <section class="side" aria-label="Files and directories">
            <div class="columns">
              <span>Files &amp; directories</span>
              <span>Allocated</span>
            </div>
            <div class="tree">
              {inventoryFolder ? (
                <Inventory
                  key={inventoryFolder.id}
                  folder={inventoryFolder}
                  scanId={scanId}
                  running={running}
                  close={() => {
                    inventoryFolder = undefined;
                    handle.update();
                  }}
                />
              ) : (
                <ul>
                  {(nodes.length > 1 || snapshotMode) && (
                    <TreeRow
                      key={generation}
                      node={nodes[zoom]}
                      {...{
                        selected,
                        expanded,
                        select,
                        toggle,
                        followPath,
                        revealPath,
                        pauseFollow,
                      }}
                    />
                  )}
                </ul>
              )}
            </div>
          </section>
        </div>
      </main>
    );
  };
}

createRoot(document.getElementById("app")).render(<Viewer />);
