import type { AgentCatalog } from "./bridge.ts";
import type { QuoteEvidence, TargetBinding } from "./contract.ts";

export interface ReviewComment {
  readonly current?: boolean;
  readonly revision: number;
  readonly evidence: QuoteEvidence;
}
export interface ReviewBatch {
  readonly batchId: string;
  readonly target: TargetBinding;
  readonly items: readonly { id: string; revision: number }[];
  readonly comments: readonly QuoteEvidence[];
  readonly state: string;
  readonly chatUrl?: string;
}
export interface ReviewState {
  readonly csrf: string;
  readonly defaultTargetKey: string;
  readonly comments: readonly ReviewComment[];
  readonly batches: readonly ReviewBatch[];
}
export interface ReviewTarget extends TargetBinding {
  readonly sessionId?: string;
  readonly label: string;
  readonly glyph: { readonly paths: readonly { fill: string; d: string }[] };
}

/** No automatic mutation retry: a lost acknowledgement must be inspected first. */
export function createCommentBrowserApi(transport: typeof fetch = fetch) {
  let csrf: string | undefined;
  async function request(operation: string, body?: unknown): Promise<unknown> {
    const response = await transport(`/_atlas/comments/${operation}`, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers:
        body === undefined
          ? {}
          : {
              "Content-Type": "application/json",
              "X-Atlas-CSRF": csrf ?? "",
            },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 403) csrf = undefined;
      throw new Error(
        typeof data?.error === "string" ? data.error : "Comments unavailable",
      );
    }
    return data;
  }
  async function mutate(operation: string, body: unknown) {
    if (!csrf) throw new Error("Refresh review before changing comments");
    return request(operation, body);
  }
  return {
    async state(): Promise<ReviewState> {
      const state = (await request("state")) as ReviewState;
      csrf = state.csrf;
      return state;
    },
    catalog: () => request("targets") as Promise<AgentCatalog>,
    async targets(): Promise<readonly ReviewTarget[]> {
      return ((await request("targets")) as { targets: ReviewTarget[] })
        .targets;
    },
    save: (evidence: QuoteEvidence, expectedRevision: number) =>
      mutate("save", { evidence, expectedRevision }) as Promise<ReviewComment>,
    remove: (id: string, revision: number) =>
      mutate("remove", { id, revision }),
    send: (
      items: readonly { id: string; revision: number }[],
      target: TargetBinding,
    ) => mutate("send", { items, target }),
    retry: (batchId: string) => mutate("retry", { batchId }),
    receipt: (batchId: string) => mutate("receipt", { batchId }),
  };
}

export function originalBatch(
  state: ReviewState,
  comment: ReviewComment,
): ReviewBatch | undefined {
  return state.batches.find((batch) =>
    batch.items.some(
      (item) =>
        item.id === comment.evidence.id && item.revision === comment.revision,
    ),
  );
}
