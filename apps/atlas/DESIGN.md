---
name: Atlas
description: Existing Wonder reading direction, preserved as a plain document garden.
colors:
  background: "#fff"
  text: "#222"
  link: "#0645ad"
  visited-link: "#59348c"
  selection: "#dbe9ff"
  quote-border: "#aaa"
  rule: "#ddd"
typography:
  body:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontSize: "18px"
    lineHeight: 1.65
  heading-one:
    fontSize: "1.9rem"
    lineHeight: 1.25
  heading-two:
    fontSize: "1.35rem"
    lineHeight: 1.25
  heading-three:
    fontSize: "1.1rem"
    lineHeight: 1.25
  small:
    fontSize: ".85rem"
  code:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace"
    fontSize: ".82em"
spacing:
  paragraph: "1rem"
  column-gutter: "1.25rem"
  list-indent: "1.5rem"
---

# Design System: Atlas

## Overview

Preserve the owner's pinned Wonder direction: plain headings and links, a white page and dark serif text. This is a Read surface; content hierarchy, citations and topic relationships provide the structure, not branding or application chrome. No new visual direction is proposed here.

Evidence: `PRODUCT.md`, `app/ui.tsx`, and supplied captures `index-390.png`, `pi-1440.png`, `pi-768.png`, `pi-390.png` in `/tmp/atlas-screens/`. The captures show the nested index and article reflow, restrained navigation, closed Sources disclosure and backlinks. Interaction rules below come from implementation, not screenshots alone.

## Colors

Blue marks ordinary underlined links; purple distinguishes visited links. Hover thickens the underline to 2px without changing layout. Link underline offset is .12em. The link color also supplies the focus outline and input caret. Selection uses the pale blue background with the normal dark text. Neutral rules distinguish code, table rows and quotations. Light color scheme only; no dark theme is implemented.

## Typography

Body text and headings share the serif stack above; headings retain native bold weight. No font download or display face. Paragraphs have a bottom margin of 1rem. Heading margins are `0 0 1.25rem` for h1, `2rem 0 .75rem` for h2, and `1.5rem 0 .5rem` for h3. Small text serves the navigation trail and metadata. Code uses the monospace stack; preformatted blocks use line-height 1.6 and tab size 2.

## Layout

One centered column: main has `max-width: 42rem`, margin `2.5rem auto 5rem`, and horizontal padding from the gutter token. Border-box sizing includes the padding in that maximum. Body margin is zero. There is no sidebar, grid or fixed header.

At `max-width: 520px` (inclusive), main's top margin becomes 1.5rem and h1 becomes 1.7rem. Body size, gutters and content order remain unchanged. The supplied 390px captures show natural text and heading wrapping; the 768px and 1440px article captures retain the same document structure.

Main permits long text to wrap anywhere. Code blocks and tables scroll horizontally within their own maximum width rather than widening the reading column; tables retain normal word wrapping rules. Inputs and buttons are bounded by the available width.

## Elevation & Depth

Flat white ground, without shadows, cards or layered panels. Whitespace, heading hierarchy, list indentation and light rules separate content.

## Components

- **Document:** English-language HTML, viewport metadata, one `main` landmark with `id="main"` and `tabIndex={-1}`. The skip link sits offscreen until focused, then appears at the upper left on white.
- **Navigation and lists:** ordinary anchors, paragraphs and nested native lists. Home is an agent directory, not a shared topic index. Each section lists only its owner’s topics and dates; search is scoped to that owner. The article trail is small Agent spaces / selected owner / Search selected owner links, not a branded masthead. Lists indent by the list token; items have .25rem vertical margins, nested unordered lists `.25rem .75rem` block margins.
- **Disclosures:** native `details`/`summary`, with the browser marker, pointer cursor and underlined summary (.15em offset). Details have 1.5rem vertical margins; an open summary gains .75rem below it. No custom accordion or JavaScript is needed.
- **Reading material:** blockquotes use a 2px left rule and 1rem inset. Preformatted blocks have 1rem padding and a 1px border. Table cells are left-aligned with `.35rem .75rem .35rem 0` padding and a 1px bottom rule.
- **Search controls:** native input/button appearance, inherited font and `.3rem .5rem` padding; no custom control skin. Navigation, form submission and disclosures work without browser JavaScript.
- **Status and focus:** rejected content updates produce a plain paragraph with `role="status"`. Focus-visible uses a 2px solid link-colored outline offset by 4px. These are implemented accessibility provisions, not evidence of complete WCAG conformance or a completed assistive-technology audit.

## Do's and Don'ts

- Do keep native document semantics, visible link underlines, focus treatment and content-first reading order.
- Do preserve the bounded column, natural mobile reflow and local code/table overflow.
- Don't add a masthead, logo, cards, slogans, marketing sections or dashboard chrome.
- Don't replace native navigation or disclosures with JavaScript-dependent controls.
