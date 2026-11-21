# Third-party notices

## Annotation text fragments

`app/comments/fragments.ts` adapts the text-boundary splitting and wrapping pattern from [Hypothesis client `72526e9c`](https://github.com/hypothesis/client/blob/72526e9c8a671ec32cb3fe8c78f7e0082ab8016d/src/annotator/highlighter.ts). Copyright 2013–2019 Hypothes.is Project and contributors. The complete upstream BSD project terms and MIT Annotator subcomponent notice are retained in [LICENSES/Hypothesis.txt](LICENSES/Hypothesis.txt). The full client, sidebar, RPC, PDF and anchoring implementations are not embedded.

## Fonts

Atlas redistributes the same Artbin-theme font assets as the shared UI Explorer, separately licensed from application source:

- Fraunces — Copyright 2018 The Fraunces Project Authors. SIL Open Font License 1.1: [license](public/fonts/OFL.txt).
- IBM Plex Sans — Copyright © 2017 IBM Corp., Reserved Font Name “Plex”. SIL Open Font License 1.1: [license](public/fonts/IBM-Plex-Sans-OFL.txt).
- IBM Plex Mono — Copyright © 2017 IBM Corp., Reserved Font Name “Plex”. SIL Open Font License 1.1: [license](public/fonts/IBM-Plex-Mono-OFL.txt).

[Font provenance](public/fonts/README.md) records pinned sources, transformations and checksums. No other Explorer or Artbin assets are copied. JavaScript package licenses remain with their installed distributions.

## Diagram renderer

[Pele 1.13.0](https://github.com/obsidianmd/pele) renders Mermaid syntax to static SVG in a bounded server worker. Copyright 2026 kepano, MIT. Its distribution also includes a Lucide reset-icon ISC notice; Atlas does not mount zoom controls. Both notices are retained in [LICENSES/Pele.txt](LICENSES/Pele.txt). No Mermaid.js runtime or remote scripts are bundled into articles.
