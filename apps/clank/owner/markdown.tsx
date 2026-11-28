import { CodeBlock } from "@harrhy/ui/code";
import { Lexer, type Token, type Tokens } from "marked";
import { css, type Handle, type RemixNode } from "remix/component";

const prose = css({
  overflowWrap: "anywhere",
  "& p": { margin: "0 0 1em" },
  "& > :last-child": { marginBlockEnd: 0 },
  "& a": { color: "inherit", textUnderlineOffset: "3px" },
  "& blockquote": {
    marginInline: 0,
    paddingInlineStart: "12px",
    borderInlineStart: "2px solid var(--hui-border)",
  },
});

function link(href: string) {
  try {
    const url = new URL(href);
    if (["https:", "http:", "mailto:"].includes(url.protocol)) return url.href;
  } catch {
    // Conversation text has no document-relative base URL.
  }
}

function render(tokens: Token[] = [], inLink = false): RemixNode {
  return tokens.map((token, key) => {
    switch (token.type) {
      case "space":
        return null;
      case "paragraph":
        return <p key={key}>{render(token.tokens, inLink)}</p>;
      case "strong":
        return <strong key={key}>{render(token.tokens, inLink)}</strong>;
      case "em":
        return <em key={key}>{render(token.tokens, inLink)}</em>;
      case "del":
        return <del key={key}>{render(token.tokens, inLink)}</del>;
      case "codespan":
        return <code key={key}>{token.text}</code>;
      case "br":
        return <br key={key} />;
      case "hr":
        return <hr key={key} />;
      case "heading":
        return <h3 key={key}>{render(token.tokens, inLink)}</h3>;
      case "blockquote":
        return (
          <blockquote key={key}>{render(token.tokens, inLink)}</blockquote>
        );
      case "code":
        return (
          <CodeBlock
            key={key}
            label={token.lang || "Code"}
            source={token.text}
          />
        );
      case "list": {
        const items = (token as Tokens.List).items.map((item, i) => (
          <li key={i}>{render(item.tokens, inLink)}</li>
        ));
        return token.ordered ? (
          <ol key={key} start={Number(token.start)}>
            {items}
          </ol>
        ) : (
          <ul key={key}>{items}</ul>
        );
      }
      case "link": {
        const href = !inLink && link(token.href);
        const label = render(token.tokens, true);
        return href ? (
          <a key={key} href={href} target="_blank" rel="noopener noreferrer">
            {label}
          </a>
        ) : (
          <span key={key}>{label}</span>
        );
      }
      case "text":
        return token.tokens ? render(token.tokens, inLink) : token.text;
      default:
        return token.raw;
    }
  });
}

export function Markdown(handle: Handle<{ text: string }>) {
  let previous: string | undefined;
  let body: RemixNode;
  return () => {
    const { text } = handle.props;
    if (text !== previous) {
      body = render(Lexer.lex(text, { gfm: true, breaks: true }));
      previous = text;
    }
    return <div mix={prose}>{body}</div>;
  };
}
