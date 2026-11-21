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

## Xeet Rust/WebAssembly renderer

The optional browser renderer embeds [Xeet](https://github.com/rauchg/xeet) at commit `9207876df382ec29f8cd5a3d0cc3671d9a9fb61e`, Apache-2.0, with generated wasm-bindgen glue. [Build provenance](LICENSES/xeet/PROVENANCE.md) records source, tooling, asset substitutions and output hashes. Complete notices: [Xeet](LICENSES/xeet/XEET-LICENSE.txt), [vendored twitter-text](LICENSES/xeet/TWITTER-TEXT-LICENSE.txt), [Unicode](LICENSES/xeet/UNICODE-LICENSE.txt).

The WASM embeds unchanged Noto Sans Regular and Bold, Copyright 2022 The Noto Project Authors, [SIL OFL 1.1](LICENSES/xeet/NOTO-OFL.txt). They replace primary font roles; proprietary Chirp/Arial/platform fonts are not distributed. Original simple icon stand-ins replace X sprite geometry. This integration does not claim X pixel parity. No resolver or network wrapper is exposed by the Atlas adapter.
