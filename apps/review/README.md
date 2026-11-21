# review

A local inbox for reviewing synthetic Git diffs. `review submit` resolves two commits and captures a PR-style merge-base-to-head patch. The Worker receives only commit IDs and patch text, not a repository path or a command. Moving either ref does not change a saved review.

## Run locally

Use Node.js 26.13+ and the [qualified Celld binary](../../docs/celld-runtime.md#native-use). From the Harrhy root:

```sh
pnpm install --frozen-lockfile
export HARRHY_REVIEW_CELLD_BIN=/absolute/path/to/qualified/celld
pnpm --filter @harrhy/review dev
```

Open <http://127.0.0.1:9867>. From a **synthetic** Git checkout, run the workspace's CLI (use its absolute path, or `review` if it is on `PATH`):

```sh
review submit --repo . --base main --head example --title 'Change the demo color' --json
review list
review rename REVIEW_ID --title 'Use green in the demo'
review comments REVIEW_ID
review note REVIEW_ID --file 0 --side new --line 1 --text 'Check this example'
review reply REVIEW_ID THREAD_ID --text 'Looks good'
review resolve REVIEW_ID THREAD_ID
review reopen REVIEW_ID THREAD_ID
```

Omit `--json` on submit to print just the URL. Omit `--title` to use the subject of the resolved head commit. Titles are single-line, trimmed, and capped at 120 characters; longer default subjects are shortened. Older reviews without a title appear as **Untitled review**. Use **Rename** next to the title on a review page or `review rename` to change it without modifying the snapshot or any comments. The inbox shows the title, file count, and labeled abbreviated commit IDs separately. File indices are zero-based in patch order. Notes target old or new line numbers in displayed hunks. In the browser, select a line number to add an inline note, or comment on the whole file or review. Replies and resolve/reopen changes save immediately; resolved threads remain readable. Reload to see changes from another client. Deleting a review removes its snapshot and threads, not any repository data.

Files start expanded. Marking a file **Viewed** saves progress on the server and collapses it. A new snapshot starts with no files viewed; moving a ref never changes an existing snapshot or its progress. The local prototype has a single shared reviewer state.

## Boundaries

This app has no accounts. The supported launcher binds to IPv4 loopback; do not expose that launcher through a proxy or port forward. Host and browser Origin must match the configured numeric loopback origin. Mutations require a custom header. Local processes can still access the service. Use synthetic data only; do not submit company or other private material.

Review snapshots, titles, and comments live in one SQLite-backed Durable Object. Titles are stored in a separate table; opening an existing store adds that table without rewriting snapshots or threads. Celld keeps state in ignored `apps/review/.celld/dev` across restarts. Deleting a review removes live rows; it does not promise secure erasure from storage. Patches are limited to 512 KiB and 100 files, the inbox to 50 reviews, and each review to 100 threads of up to 25 messages (2,000 characters each). Binary data is not included. There is no Git write path, automated agent execution or live synchronization.

The managed gateway integration can set `HARRHY_REVIEW_BROWSER_ORIGIN` to one exact HTTPS origin. `HARRHY_REVIEW_ORIGIN` must remain the app socket’s numeric IPv4 loopback origin and match the upstream URL and Host. The gateway must authenticate every request before forwarding and isolate the app loopback socket in its private network namespace. Review does not authenticate gateway requests; this option only sets the expected browser Origin and the origin used for review links. Never publish the app socket. Hosted CLI is not supported.

`worker.ts` owns the Remix routes and request checks, `cell.ts` owns durable storage, and `page.tsx` / `browser.ts` use Harrhy UI styling and Pierre Diffs. CLI code lives in `cli.mjs`.

## Checks

```sh
pnpm --filter @harrhy/review check
pnpm --filter @harrhy/review smoke
```

The smoke requires the same Celld binary and Playwright Chromium (`pnpm --filter @harrhy/review exec playwright install chromium`). It runs on an ephemeral loopback port with a disposable store and synthetic Git repository. It exercises CLI and browser rename, untitled reviews, comment workflows, and persistence after a Celld restart.
