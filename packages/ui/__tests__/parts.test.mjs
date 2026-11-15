import assert from "node:assert/strict";
import test from "node:test";
import "remix/node-tsx";
import { createElement as h } from "remix/component";
import { renderToString } from "remix/component/server";
const {
  Progress,
  Breadcrumbs,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Table,
  TableCaption,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  Heading,
  Text,
} = await import("../parts.tsx");
const { Accordion, AccordionItem, AccordionTrigger, AccordionContent } =
  await import("../disclosures.tsx");

test("native progress normalizes finite values and preserves unknown totals", async () => {
  for (const [value, max, expected] of [
    [-4, 100, 0],
    [150, 100, 100],
    [5, 10, 5],
    [12, 0, 12],
    [12, Infinity, 12],
  ]) {
    const html = await renderToString(
      h(Progress, { value, max, "aria-label": "Upload" }),
    );
    assert.match(html, new RegExp(`value="${expected}"`));
    assert.match(html, /aria-label="Upload"/);
  }
  for (const value of [null, NaN, Infinity, -Infinity]) {
    const html = await renderToString(
      h(Progress, { value, "aria-label": "Upload" }),
    );
    assert.doesNotMatch(html, /\svalue=/);
    assert.match(html, /max="100"/);
  }
});

test("native content parts preserve composition and no-script semantics", async () => {
  const html = await renderToString(
    h(
      "main",
      {},
      h(Heading, { level: 3, id: "title" }, "Uploads"),
      h(Text, { tone: "muted" }, "Choose files"),
      h(
        Breadcrumbs,
        {},
        h(
          BreadcrumbList,
          {},
          h(
            BreadcrumbItem,
            {},
            h(BreadcrumbSeparator),
            h(BreadcrumbPage, {}, "Uploads"),
          ),
        ),
      ),
      h(
        Table,
        {},
        h(TableCaption, {}, "Synthetic files"),
        h(TableHeader, {}, h(TableRow, {}, h(TableHead, {}, "File"))),
        h(
          TableBody,
          {},
          h(
            TableRow,
            {},
            h(TableHead, { scope: "row" }, "moss.png"),
            h(TableCell, {}, "128 KB"),
          ),
        ),
      ),
      h(
        Collapsible,
        { open: true },
        h(CollapsibleTrigger, {}, "Contents"),
        h(CollapsibleContent, {}, "Two files"),
      ),
    ),
  );
  assert.match(html, /<h3[^>]*id="title"/);
  assert.match(html, /<nav aria-label="Breadcrumb"/);
  assert.match(html, /<ol/);
  assert.match(html, /aria-current="page"/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /<caption[^>]*>Synthetic files<\/caption>/);
  assert.match(html, /scope="col"/);
  assert.match(html, /scope="row"/);
  assert.match(html, /<details open/);
  assert.match(html, /<summary/);
  assert.doesNotMatch(html, /rmx:h:|<script/);
});

test("official accordion links triggers and panels and marks closed panels inert in SSR", async () => {
  const html = await renderToString(
    h(
      Accordion,
      { defaultValue: "storage" },
      ...["storage", "sharing"].map((value) =>
        h(
          AccordionItem,
          { value },
          h(Heading, { level: 3 }, h(AccordionTrigger, {}, value)),
          h(AccordionContent, {}, `${value} details`),
        ),
      ),
    ),
  );
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /inert/);
  for (const [, id] of html.matchAll(/aria-controls="([^"]+)"/g))
    assert.ok(html.includes(`id="${id}"`));
  assert.match(html, /data-state="closed"/);
});
