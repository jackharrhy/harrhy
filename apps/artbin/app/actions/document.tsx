import type { Handle, RemixNode } from "remix/component";
import { ImportMap } from "remix/component/server";
import { getContext } from "remix/middleware/async-context";
import { getCspNonce } from "remix/middleware/csp";

import { documentImportMap, entryScript } from "../assets.ts";
import { movedNotice } from "../login-destination.ts";
import { Alert } from "../ui/primitives.tsx";
import { documentStyle } from "../ui/styles.ts";

export interface DocumentProps {
  children?: RemixNode;
  head?: RemixNode;
  title?: string;
}

export function Document(handle: Handle<DocumentProps>) {
  return () => {
    const nonce = getCspNonce(getContext());
    const {
      children,
      head,
      title = "artbin: texture and asset repository",
    } = handle.props;

    return (
      <html lang="en" mix={documentStyle}>
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link
            rel="icon"
            type="image/svg+xml"
            href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎨</text></svg>"
          />
          <title>{title}</title>
          <link rel="stylesheet" href="/assets/hui/fonts.css" />
          <link
            rel="preload"
            href="/assets/hui/fonts/ibm-plex-sans-latin.woff2"
            as="font"
            type="font/woff2"
            crossOrigin="anonymous"
          />
          {head}
          <ImportMap value={documentImportMap} nonce={nonce} />
          {entryScript.preloads.map((href) => (
            <link key={href} rel="modulepreload" href={href} />
          ))}
          <script type="module" src={entryScript.href} nonce={nonce}></script>
        </head>
        <body>
          {movedNotice(getContext().request) ? (
            <Alert tone="info">Artbin has a new browser address.</Alert>
          ) : null}
          {children}
        </body>
      </html>
    );
  };
}
