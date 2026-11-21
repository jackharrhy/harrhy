import type { QuoteEvidence } from "./contract.ts";

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid comment evidence");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length || keys.some((key) => !Object.hasOwn(record, key)))
    throw new Error("Invalid comment fields");
  return record;
}
function string(value: unknown, min: number, max: number): string {
  if (typeof value !== "string" || value.length < min || value.length > max || value.includes("\0"))
    throw new Error("Invalid comment text");
  return value;
}
function digest(value: unknown): string {
  const result = string(value, 64, 64);
  if (!/^[0-9a-f]{64}$/.test(result)) throw new Error("Invalid source revision");
  return result;
}

export function parseEvidence(value: unknown, articleOrigin: string): QuoteEvidence {
  const item = object(value, [
    "id",
    "articleUrl",
    "sourceSha256",
    "annotationProjectionSha256",
    "quote",
    "comment",
  ]);
  const quote = object(item.quote, ["exact", "prefix", "suffix", "start", "end"]);
  const articleUrl = string(item.articleUrl, 1, 2048);
  const url = new URL(articleUrl);
  if (
    url.origin !== articleOrigin ||
    !["http:", "https:"].includes(url.protocol) ||
    url.href !== articleUrl ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/spaces\/[a-z][a-z0-9-]*\/(?:[a-zA-Z0-9_-]+\/)*$/.test(url.pathname)
  )
    throw new Error("Invalid article URL");
  const exact = string(quote.exact, 1, 4096);
  if (
    !Number.isSafeInteger(quote.start) ||
    !Number.isSafeInteger(quote.end) ||
    (quote.start as number) < 0 ||
    (quote.end as number) - (quote.start as number) !== exact.length
  )
    throw new Error("Invalid quote offsets");
  const comment = string(item.comment, 1, 4096);
  if (!comment.trim()) throw new Error("Empty comment");
  return {
    id: string(item.id, 1, 128),
    articleUrl,
    sourceSha256: digest(item.sourceSha256),
    annotationProjectionSha256: digest(item.annotationProjectionSha256),
    quote: {
      exact,
      prefix: string(quote.prefix, 0, 256),
      suffix: string(quote.suffix, 0, 256),
      start: quote.start as number,
      end: quote.end as number,
    },
    comment,
  };
}

export function matchesEvidence(
  evidence: QuoteEvidence,
  page: {
    readonly sourceDigest: string;
    readonly annotationDigest: string;
    readonly annotationText: string;
  },
): boolean {
  const { quote } = evidence;
  return (
    evidence.sourceSha256 === page.sourceDigest &&
    evidence.annotationProjectionSha256 === page.annotationDigest &&
    page.annotationText.slice(quote.start, quote.end) === quote.exact &&
    page.annotationText.slice(Math.max(0, quote.start - quote.prefix.length), quote.start) ===
      quote.prefix &&
    page.annotationText.slice(quote.end, quote.end + quote.suffix.length) === quote.suffix
  );
}
