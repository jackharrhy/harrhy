# Live root filesystem preview

n**Local prototype only.** The loopback host has no application authentication.
Before any future network exposure, require authenticated sessions and explicit
owner-bound authorization for starting scans and reading all named metadata,
including saved receipts and child summaries. Keep exact Origin and CSRF
controls on writes and verify anonymous and non-owner denial before exposure.
Tailnet membership is not a substitute. This repository registers no route and
has no DirStat deployment workflow.

Start opens a fresh scan of the local root. Anyone who can reach the prototype
preview can request a scan and see named metadata. It never starts on page
load. Celld serves the document and viewer; the loopback host streams NDJSON
and serves the current scan’s inventory. Closing the stream cancels the walk.

The Bubblewrap launcher verifies the root device and inode and requires a
read-only mount. Directory access is descriptor-relative; symlinks, mount
crossings, special entries and known sensitive paths are excluded. Dot entries
are eligible unless excluded by policy. `/root` and sensitive state under
`/var` are excluded. No file contents are opened. Hardlinks are attributed to
the first accepted path; later names are indexed at zero attributed bytes.
Root `statvfs` usage is not equivalent to measured regular-file allocation.

The walker finishes when permitted directories are exhausted. Every accepted
name is indexed in the private store, including names inside collapsed directories.
Only the live visualization projects a subset: up to 15,000 file tiles, plus
bounded nested boxes. Unsampled bytes still count. A grouped tile opens its
folder’s complete named inventory, with 40-row pages; **Browse all entries**
works from the selected directory. Follow scan and the camera respond to actual
streamed discoveries and pause for manual navigation.

There is one scan and one saved inventory at a time. Set `HARRHY_DIRSTAT_STORE`
to a private absolute directory on separately budgeted storage outside the disposable runtime stage. The
0600 pending SQLite database is separate from the saved one. After clean
walker exit and reconciliation, the host commits the receipt and index,
fsyncs the database, atomically renames it over `latest.sqlite`, and fsyncs the
store directory. Pending data is discarded on cancellation, error or next
service startup. A reload requests the saved receipt and never starts a scan
or replays discoveries. Inventory and child-summary requests use the scan ID
and are `no-store`. Completion logs numeric counters only.

Saved views load size-ranked child summaries for large boxes in bounded
batches. Each request serves up to 64 children; the viewport and rectangle
area determine how many to draw. Small and grouped entries remain browseable
with 40-row keyset pages. Desktop saved views draw up to 320 tiles; narrow
views draw up to 150. Cushion shading and size labels do not change weights.

Resource ceilings fail explicitly rather than pretending to complete: 240
seconds, 8 million encountered entries, depth 128, 512 GiB counted allocation,
2 GiB of walker output and 512 MiB of SQLite pages. The host checks an initial
1 GiB minimum free space before staging and enforces a 512 MiB free-space floor while streaming.
Scanning is serialized, backpressured and subject to the existing admission
cooldown. Unreadable metadata is counted and marks the result partial even when
traversal itself exhausts the permitted tree.

The treemap uses PixiJS 8.23.0 (WebGL) for its shared cushion texture and
persistent world sprites. The camera moves that scene and its DOM hit targets
together. Drag pans, wheel zooms about the pointer, and right-click or Zoom in
fits a folder; Escape restores the previous pose. A DOM fallback remains when
WebGL initialization fails. Camera rendering is demand-driven, and the scanner
wake is local to the pointer rather than a scene filter.
