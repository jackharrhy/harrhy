export interface QuoteEvidence {
  readonly id: string;
  readonly articleUrl: string;
  readonly sourceSha256: string;
  readonly annotationProjectionSha256: string;
  readonly quote: {
    readonly exact: string;
    readonly prefix: string;
    readonly suffix: string;
    readonly start: number;
    readonly end: number;
  };
  readonly comment: string;
}

export interface TargetBinding {
  readonly key: string;
  readonly revision: number;
}

export interface CommentBatch {
  readonly payloadVersion: 1;
  readonly target: TargetBinding;
  readonly batchId: string;
  readonly payloadDigest: string;
  readonly comments: readonly QuoteEvidence[];
}

// Matches the bridge's canonical JSON: sorted object keys, unchanged array order.
export function canonicalComments(comments: readonly QuoteEvidence[]): string {
  return JSON.stringify(
    comments.map((item) => ({
      annotationProjectionSha256: item.annotationProjectionSha256,
      articleUrl: item.articleUrl,
      comment: item.comment,
      id: item.id,
      quote: {
        end: item.quote.end,
        exact: item.quote.exact,
        prefix: item.quote.prefix,
        start: item.quote.start,
        suffix: item.quote.suffix,
      },
      sourceSha256: item.sourceSha256,
    })),
  );
}
