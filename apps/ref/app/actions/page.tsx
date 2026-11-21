import { css, type Handle, type RemixNode } from "remix/component";
import {
  uiActionStyles,
  uiControlStyles,
  uiPrimaryActionStyles,
  uiSecondaryActionStyles,
} from "@harrhy/ui";
import { archiveExportScopes } from "../middleware/archive-auth.ts";
import { routes } from "../routes.ts";
import type { BoardRecord } from "../data/directory-cell.ts";
import { browserAssets } from "../assets/build-manifest.ts";
import { refStyles, refThemeStyles } from "../styles.ts";

function Document(
  handle: Handle<{ title: string; moved?: boolean; children?: RemixNode }>,
) {
  return () => (
    <html lang="en" mix={[refThemeStyles, uiControlStyles, refStyles]}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#f6f6f4" />
        <title>{handle.props.title} · ref</title>
        <link rel="icon" href="/favicon.svg" />
      </head>
      <body>
        {handle.props.moved && <MoveNotice />}
        {handle.props.children}
      </body>
    </html>
  );
}

const moveNoticeStyle = css({
  position: "fixed",
  zIndex: 30,
  insetBlockStart: "max(0.75rem, env(safe-area-inset-top))",
  insetInline: "0.75rem",
  marginInline: "auto",
  width: "fit-content",
  maxWidth: "calc(100% - 1.5rem)",
  padding: "0.25rem 0.375rem 0.25rem 0.875rem",
  backgroundColor: "var(--ui-control-surface)",
  border: "1px solid var(--ui-line)",
  borderRadius: "0.625rem",
  boxShadow: "0 4px 18px rgb(34 35 33 / 16%)",
  "&:not([hidden])": { display: "flex", alignItems: "center", gap: "0.5rem" },
  "& p": { margin: 0, textAlign: "center", fontSize: "0.875rem" },
  "& button": {
    flexShrink: 0,
    width: "2.5rem",
    height: "2.5rem",
    border: 0,
    borderRadius: "0.375rem",
    background: "transparent",
    color: "inherit",
    fontSize: "1.25rem",
    cursor: "pointer",
  },
  "& button:hover": { backgroundColor: "var(--ui-control-hover)" },
  "& button:focus-visible": { outline: "2px solid var(--ui-focus)" },
});

function MoveNotice() {
  return () => (
    <div data-move-notice="" mix={moveNoticeStyle}>
      <p role="status">
        Ref is now on <strong>ref.harrhy.xyz</strong>, please update your
        bookmarks!
      </p>
      <button
        type="button"
        hidden
        data-dismiss-move-notice=""
        aria-label="Dismiss bookmark notice"
      >
        <span aria-hidden="true">×</span>
      </button>
      <script type="module" src="/assets/move-notice.js"></script>
    </div>
  );
}

export function AuthPage(handle: Handle<{ error?: string; moved?: string }>) {
  return () => (
    <Document title="Sign in" moved={!!handle.props.moved}>
      <main class="auth-page">
        <div class="auth-form">
          <h1 class="wordmark">ref</h1>
          <a
            class="auth-link"
            href={
              handle.props.moved
                ? `/auth/login?returnTo=${encodeURIComponent(handle.props.moved)}`
                : "/auth/login"
            }
            data-rmx-document
            mix={[uiActionStyles, uiPrimaryActionStyles]}
          >
            Sign in
          </a>
          {handle.props.error && (
            <p class="error" role="alert">
              {handle.props.error}
            </p>
          )}
        </div>
      </main>
    </Document>
  );
}

export function HomePage(
  handle: Handle<{ boards: BoardRecord[]; error?: string; moved?: boolean }>,
) {
  return () => (
    <Document title="Boards" moved={handle.props.moved}>
      <main class="home-page">
        <header class="site-header">
          <a class="wordmark" href="/">
            ref
          </a>
          <a
            href={routes.exportPage.href()}
            mix={[uiActionStyles, uiSecondaryActionStyles]}
          >
            Export archive
          </a>
          <form method="post" action="/logout">
            <button class="quiet-button" type="submit">
              Lock
            </button>
          </form>
        </header>
        <section class="home-content">
          <h1>Boards</h1>
          {handle.props.error && (
            <p class="error" role="alert">
              {handle.props.error}
            </p>
          )}
          <form method="post" action="/boards" class="new-board-form">
            <input
              name="title"
              placeholder="New board"
              aria-label="New board name"
              required
              maxLength={100}
            />
            <button type="submit" mix={[uiActionStyles, uiPrimaryActionStyles]}>
              Create
            </button>
          </form>
          <div class="board-list">
            {handle.props.boards.length === 0 ? (
              <p class="board-list-empty">
                No boards yet. Create one to start collecting references.
              </p>
            ) : (
              handle.props.boards.map((board) => (
                <a class="board-row" href={`/boards/${board.id}`}>
                  <span>{board.title}</span>
                  <time>{new Date(board.updatedAt).toLocaleDateString()}</time>
                </a>
              ))
            )}
          </div>
        </section>
      </main>
    </Document>
  );
}

export function ExportPage(handle: Handle<{ projectId: string }>) {
  const scopes = archiveExportScopes(handle.props.projectId);
  return () => (
    <Document title="Export archive">
      <main class="home-content">
        <a
          href={routes.home.href()}
          mix={[uiActionStyles, uiSecondaryActionStyles]}
        >
          Back to boards
        </a>
        <section
          mix={css({ marginTop: "2rem", maxWidth: "38rem", lineHeight: "1.5" })}
        >
          <h1>Export archive</h1>
          <p>
            Download a private copy of all shared boards and their stored media.
          </p>
          <p id="export-help">
            Sign in with your archive OAuth client and request a short-lived Ref
            access token with the admin and archive-read scopes. Paste that
            token below. Board sign-in alone cannot authorize an export. This
            tab clears the token after five minutes, on download, or when you
            leave.
          </p>
          <details>
            <summary>OAuth request details</summary>
            <p>
              Use the resource and issuer in Ref’s{" "}
              <a
                href="/.well-known/oauth-protected-resource/api/archive"
                mix={css({ textDecoration: "underline" })}
              >
                archive resource metadata
              </a>
              . Request these scopes:
            </p>
            <code mix={css({ overflowWrap: "anywhere" })}>
              {scopes.join(" ")}
            </code>
          </details>
          <div
            mix={css({ display: "grid", gap: "0.5rem", marginBlock: "1.5rem" })}
          >
            <label htmlFor="archive-token">Archive access token</label>
            <input
              id="archive-token"
              type="password"
              autoComplete="off"
              spellCheck={false}
              aria-describedby="export-help"
              maxLength={32768}
              required
            />
          </div>
          <div mix={css({ display: "flex", flexWrap: "wrap", gap: "0.5rem" })}>
            <button
              id="start-export"
              type="button"
              disabled
              mix={[uiActionStyles, uiPrimaryActionStyles]}
            >
              Start export
            </button>
            <button
              id="check-export"
              type="button"
              disabled
              mix={[uiActionStyles, uiSecondaryActionStyles]}
            >
              Check status
            </button>
            <button
              id="download-export"
              type="button"
              disabled
              mix={[uiActionStyles, uiSecondaryActionStyles]}
            >
              Download archive
            </button>
          </div>
          <p id="export-status" role="status"></p>
          <noscript>
            Enable JavaScript to authorize the export in this tab, or use the
            archive CLI.
          </noscript>
          <script type="module" src="/assets/archive-export.js"></script>
        </section>
      </main>
    </Document>
  );
}

export function BoardPage(
  handle: Handle<{
    board: BoardRecord;
    liveBoard?: boolean;
    error?: string;
    moved?: boolean;
  }>,
) {
  const board = handle.props.board;
  return () => (
    <Document title={board.title} moved={handle.props.moved}>
      <main
        id="board-app"
        data-board-id={board.id}
        data-live-board={handle.props.liveBoard ? "1" : undefined}
      >
        <header class="board-header">
          <a class="back-link" href="/" aria-label="Back to boards">
            ←
          </a>
          <form
            id="board-title-form"
            method="post"
            action={routes.boards.rename.href({ boardId: board.id })}
          >
            <input
              id="board-title"
              name="title"
              defaultValue={board.title}
              maxLength={100}
              required
              aria-label="Board name"
            />
          </form>
          <select id="card-picker" aria-label="Choose card" hidden>
            <option value="">Choose card</option>
          </select>
          <div id="connection" class="connection connecting" role="status">
            <span class="connection-dot"></span>
            <span class="connection-text">Connecting</span>
          </div>
          <button
            id="tool-add"
            class="header-add"
            type="button"
            mix={[uiActionStyles, uiPrimaryActionStyles]}
          >
            Add images
          </button>
          <details id="link-menu" class="add-link-menu">
            <summary mix={[uiActionStyles, uiSecondaryActionStyles]}>
              Add link
            </summary>
            <form id="link-form">
              <input
                id="link-url"
                name="url"
                type="url"
                placeholder="Paste a URL"
                aria-label="Link URL"
                required
              />
              <button type="submit">Add</button>
            </form>
          </details>
        </header>
        {handle.props.error && (
          <p class="error board-error" role="alert">
            {handle.props.error}
          </p>
        )}
        <div class="board-layout">
          <section
            id="viewport"
            class="viewport"
            aria-label="Image board"
            tabIndex={0}
          >
            <div id="world" class="world"></div>
            <div id="empty-state" class="empty-state">
              <p>Drop images or links here</p>
              <button id="empty-add" type="button">
                or choose files
              </button>
            </div>
            <div class="zoom-controls">
              <button
                id="scroll-mode"
                type="button"
                aria-label="Scroll mode: Pan"
                aria-pressed="false"
                title="Switch between scroll to zoom and scroll to pan. Ctrl/⌘ or pinch zooms. Shift-scroll pans horizontally."
              >
                Scroll: Zoom
              </button>
              <button
                id="tool-fit"
                type="button"
                title="Fit board"
                aria-label="Fit board"
              >
                □
              </button>
              <button id="zoom-out" type="button" aria-label="Zoom out">
                −
              </button>
              <span id="zoom-label">100%</span>
              <button id="zoom-in" type="button" aria-label="Zoom in">
                +
              </button>
            </div>
          </section>
          <aside id="inspector" class="inspector" hidden>
            <div class="inspector-top">
              <span>Image</span>
              <button
                id="inspector-close"
                type="button"
                aria-label="Close card details"
              >
                ×
              </button>
            </div>
            <div id="inspector-content" class="inspector-content"></div>
          </aside>
        </div>
        <input
          id="file-input"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          hidden
        />
        <div id="toast" class="toast" role="status"></div>
        <script type="module" src={browserAssets.board}></script>
      </main>
    </Document>
  );
}
