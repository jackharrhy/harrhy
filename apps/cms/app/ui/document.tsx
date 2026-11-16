import { VisualTools } from "../actions/public/visual-tools.tsx";
import { themeRoot } from "@harrhy/ui/theme";
import { adminTheme } from "./admin-theme.ts";
import { css, type Handle, type RemixNode } from "remix/component";
import { ImportMap } from "remix/component/server";
import { getContext } from "remix/middleware/async-context";
import { getCspNonce } from "remix/middleware/csp";
import { entryScript } from "../assets.ts";
import { adminCoreStyles } from "./admin-core-styles.ts";
import { adminEditorStyles } from "./admin-editor-styles.ts";
import { adminLibraryStyles } from "./admin-library-styles.ts";
import { adminWorkspaceStyles } from "./admin-workspace-styles.ts";

export function Document(
  handle: Handle<{
    title: string;
    children: RemixNode;
    head?: RemixNode;
    styles?: ReturnType<typeof css>[];
    admin?: boolean;
    background?: string;
    static?: boolean;
    publicScript?: string;
    visualEditing?: boolean;
    editorSession?: boolean;
    visualSlug?: string;
  }>,
) {
  return () => {
    const nonce = getCspNonce(getContext());
    return (
      <html
        lang="en"
        mix={
          handle.props.admin
            ? [
                adminTheme,
                themeRoot,
                adminCoreStyles,
                adminEditorStyles,
                adminLibraryStyles,
                adminWorkspaceStyles,
                ...(handle.props.styles ?? []),
              ]
            : [
                ...(handle.props.styles ?? []),
                ...(handle.props.visualEditing ? [visualFieldStyles] : []),
              ]
        }
      >
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>{handle.props.title}</title>
          {handle.props.admin && (
            <>
              <link
                rel="preload"
                href="/fonts/InterVariable.woff2"
                as="font"
                type="font/woff2"
                crossOrigin="anonymous"
              />
              <link rel="stylesheet" href="/fonts.css" />
            </>
          )}
          {!handle.props.admin &&
            !handle.props.static &&
            handle.props.publicScript && (
              <script
                src={handle.props.publicScript}
                nonce={nonce}
                defer
              ></script>
            )}
          {handle.props.head}
          {(handle.props.admin || handle.props.editorSession) &&
            !handle.props.static && <ImportMap value={entryScript.importMap} />}
          {handle.props.admin &&
            !handle.props.static &&
            entryScript.preloads.map((href) => (
              <link rel="modulepreload" href={href} />
            ))}
          {(handle.props.admin || handle.props.editorSession) &&
            !handle.props.static && (
              <script
                type="module"
                src={entryScript.href}
                nonce={nonce}
              ></script>
            )}
        </head>
        <body
          className={handle.props.admin ? "cms" : "site"}
          style={{ backgroundColor: handle.props.background }}
          data-tea-visual-loading={handle.props.visualEditing ? "" : undefined}
        >
          {handle.props.visualEditing ? (
            <div
              data-tea-visual-content
              inert
              mix={css({ display: "contents" })}
            >
              {handle.props.children}
            </div>
          ) : (
            handle.props.children
          )}
          {handle.props.editorSession && !handle.props.static && (
            <VisualTools
              active={Boolean(handle.props.visualEditing)}
              slug={handle.props.visualSlug ?? ""}
            />
          )}
        </body>
      </html>
    );
  };
}

const visualFieldStyles = css({
  "& body[data-tea-visual-loading] [data-preview-key]": {
    pointerEvents: "none",
  },
  "& .tea-editable-field:hover, & .tea-editable-field:focus-visible": {
    outline: "2px solid #006c9c",
    outlineOffset: "3px",
    cursor: "pointer",
  },
});
