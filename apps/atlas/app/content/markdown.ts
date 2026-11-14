import rehypeShiki from "@shikijs/rehype";
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

// Author HTML is restricted before Shiki adds trusted presentation styles.
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
      code: [["className", /^language-[a-zA-Z0-9_+-]+$/]],
      details: ["open"],
      ol: ["start"],
      td: [["align", "left", "right", "center"]],
      th: [["align", "left", "right", "center"]],
    },
    protocols: { href: ["http", "https", "mailto"] },
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
      "img",
    ],
  })
  .use(rehypeSlug, { prefix: "heading-" });

const stringify = unified()
  .use(rehypeShiki, {
    theme: "github-light",
    lazy: true,
    defaultLanguage: "text",
    fallbackLanguage: "text",
  })
  .use(rehypeStringify);

export async function renderMarkdown(
  source: string,
  resolveLink: (href: string) => string = (href) => href,
): Promise<{
  html: string;
  links: string[];
  text: string;
}> {
  const tree = (await processor.run(processor.parse(source))) as Root;
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
  const highlighted = await stringify.run(tree);
  return {
    html: stringify.stringify(highlighted),
    links: [...links],
    text: words.join(" ").replace(/\s+/g, " ").trim(),
  };
}
