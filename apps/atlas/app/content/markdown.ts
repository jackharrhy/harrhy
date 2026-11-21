import { rehypeHighlight } from "@harrhy/ui/rehype-highlight";
import { prepareDiagrams } from "./diagrams.ts";
import type { Root } from "hast";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";

// Author HTML is restricted before Pierre adds trusted presentation styles.
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(() => (tree: Root) => {
    // Preserve generated GFM task state before parsing any author HTML inputs.
    visit(tree, "element", (node, index, parent) => {
      if (
        node.tagName === "input" &&
        node.properties.type === "checkbox" &&
        parent &&
        index !== undefined
      ) {
        parent.children[index] = {
          type: "text",
          value: node.properties.checked ? "[x]" : "[ ]",
        };
      }
    });
  })
  .use(rehypeRaw)
  .use(rehypeSanitize, {
    tagNames: [
      "a",
      "blockquote",
      "br",
      "code",
      "dd",
      "del",
      "details",
      "div",
      "dl",
      "dt",
      "em",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "hr",
      "img",
      "i",
      "b",
      "kbd",
      "li",
      "ol",
      "p",
      "pre",
      "s",
      "samp",
      "span",
      "strong",
      "sub",
      "summary",
      "sup",
      "table",
      "tbody",
      "td",
      "th",
      "thead",
      "tr",
      "ul",
    ],
    attributes: {
      a: ["href", "title"],
      img: ["src", "alt", "title"],
      code: [["className", /^language-[a-zA-Z0-9_+-]+$/]],
      details: ["open"],
      ol: ["start"],
      td: [["align", "left", "right", "center"]],
      th: [["align", "left", "right", "center"]],
    },
    protocols: { href: ["http", "https", "mailto"], src: ["http", "https"] },
    strip: [
      "script",
      "style",
      "iframe",
      "object",
      "embed",
      "svg",
      "math",
      "form",
      "button",
      "input",
      "select",
      "textarea",
      "video",
      "audio",
      "picture",
    ],
  })
  .use(rehypeSlug, { prefix: "heading-" });

const stringify = unified()
  .use(rehypeHighlight, {
    theme: "github-light",
  })
  .use(rehypeStringify);

export async function renderMarkdown(
  source: string,
  resolveLink: (href: string) => string = (href) => href,
  resolveImage: (source: string) => string | undefined = () => undefined,
): Promise<{
  html: string;
  links: string[];
  text: string;
  annotationText: string;
}> {
  const tree = (await processor.run(processor.parse(source))) as Root;
  visit(tree, "element", (node, index, parent) => {
    if (node.tagName !== "img" || !parent || index === undefined) return;
    const src =
      typeof node.properties.src === "string"
        ? resolveImage(node.properties.src)
        : undefined;
    if (!src) {
      parent.children.splice(index, 1);
      return index;
    }
    node.properties = {
      src,
      alt: typeof node.properties.alt === "string" ? node.properties.alt : "",
      ...(typeof node.properties.title === "string"
        ? { title: node.properties.title }
        : {}),
      loading: "lazy",
      decoding: "async",
    };
  });
  const links = new Set<string>();
  const words: string[] = [];
  visit(tree, (node) => {
    if (node.type === "element" && node.tagName === "a") {
      const href = node.properties.href;
      if (typeof href === "string") {
        node.properties.href = resolveLink(href);
        links.add(node.properties.href as string);
      }
    }
    if (node.type === "text") words.push(node.value);
  });
  visit(tree, "element", (node) => {
    if (node.tagName === "th") node.properties.scope = "col";
  });
  visit(tree, "element", (node, index, parent) => {
    if (node.tagName === "table" && parent && index !== undefined) {
      parent.children[index] = {
        type: "element",
        tagName: "div",
        properties: {
          className: ["atlas-table"],
          role: "region",
          ariaLabel: "Markdown table",
          tabIndex: 0,
        },
        children: [node],
      };
      return "skip";
    }
  });
  await prepareDiagrams(tree);
  const highlighted = await stringify.run(tree);
  const annotationWords: string[] = [];
  visit(highlighted, (node) => {
    if (node.type === "element" && node.properties.dataAtlasDiagram)
      return "skip";
    if (
      node.type === "element" &&
      node.tagName === "p" &&
      node.children.length === 1 &&
      node.children[0]?.type === "text" &&
      /^\[\[widget:[a-z][a-z0-9-]*\]\]$/.test(node.children[0].value)
    )
      return "skip";
    if (node.type === "text") annotationWords.push(node.value);
  });
  return {
    html: stringify.stringify(highlighted),
    links: [...links],
    text: words.join(" ").replace(/\s+/g, " ").trim(),
    annotationText: annotationWords.join(""),
  };
}
