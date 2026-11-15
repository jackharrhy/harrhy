# Self-hosted Artbin theme fonts

All files are local, SIL OFL 1.1, and used only when a rendered theme role needs them. No font service, npm font package, telemetry or remote font request is added. Clean/Radio retain their existing families; Atlas loads the font stylesheet only for Artbin-selected documents. All faces load on use with `font-display: swap`; no font is preloaded.

## Fraunces — display

By The Fraunces Project Authors; [OFL.txt](OFL.txt). Source: [undercasetype/Fraunces](https://github.com/undercasetype/Fraunces), commit `7ccdec31c6028118dce3e47fe864e3744460371d`, `fonts/variable/Fraunces[SOFT,WONK,opsz,wght].ttf`.

`fraunces-variable.woff2` is a lossless format conversion using FontTools 4.68.0 and Brotli 1.2.0, without subsetting or outline/axis changes. Verified axes: opsz 9–144, wght 100–900, SOFT 0–100, WONK 0–1. Headings and short expressive callouts use SOFT 30, WONK 1 and automatic optical sizing, with normal CSS weight. Fraunces is a serif/display face, not a body/sans family. SHA256: `fc99cbd4f77d9973f2966ea45fe75779278f1a05d6b5f329899f2e922396107b`.

## IBM Plex Sans — body and controls

Copyright © 2017 IBM Corp., Reserved Font Name “Plex”; [IBM-Plex-Sans-OFL.txt](IBM-Plex-Sans-OFL.txt). Exact upstream WOFF2 from [IBM/plex](https://github.com/IBM/plex), commit `bc6a7e4b37634eb79785d59781893db63ee3edcb`, `packages/plex-sans-variable/fonts/split/woff2/IBM Plex Sans Var-Roman-Latin1.woff2`.

Verified axes: wght 100–700; wdth 85–100 (default 100). No binary modification. CSS uses normal width and the `IBM Plex Sans` family alias. SHA256: `c9b893129ff599a5ac0e396344631ba5814bec464b5616b985bdc294c82b44e9`.

## IBM Plex Mono — code and small details

Copyright © 2017 IBM Corp., Reserved Font Name “Plex”; [IBM-Plex-Mono-OFL.txt](IBM-Plex-Mono-OFL.txt). Exact upstream WOFF2 at the same IBM commit: `packages/plex-mono-variable/fonts/split/woff2/IBM Plex Mono Var-Roman-Latin1.woff2` (32,576 bytes).

Verified axis: wght 100–700, default 400. No binary modification. CSS uses the `IBM Plex Mono` alias. SHA256: `632cb6cee5e90d89bd4354ff362bcffcef1384c19b603ddd2830561716e1f440`.

The official Latin1 files include common punctuation; CSS retains their upstream unicode range so unsupported characters use the named fallbacks. Only upright faces are shipped, not extra italics/families/all static weights. Production Artbin and its assets are unchanged. See [third-party notices](../../../THIRD_PARTY_NOTICES.md).
