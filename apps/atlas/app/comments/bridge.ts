import type { CommentBatch, TargetBinding } from "./contract.ts";

interface AgentTarget extends TargetBinding {
  readonly sessionId?: string;
  readonly label: string;
  readonly glyph: {
    readonly paths: readonly { readonly fill: string; readonly d: string }[];
  };
}
export interface AgentCatalog {
  readonly targets: readonly AgentTarget[];
  readonly defaultSessionId?: string;
  readonly eligibleCount?: number;
  readonly omittedPrivacyCount?: number;
  readonly unavailable?: readonly {
    sessionId: string;
    label: string;
    reason: "not-writable" | "binding-disabled";
  }[];
}
interface BridgeReceipt {
  readonly batchId: string;
  readonly binding: TargetBinding;
  readonly payloadDigest?: string;
  readonly receipt: unknown;
  readonly chatUrl?: string;
}
export interface CommentBridge {
  targets(): Promise<readonly AgentTarget[]>;
  catalog?(): Promise<AgentCatalog>;
  publish(batch: CommentBatch): Promise<BridgeReceipt>;
  receipt(batch: CommentBatch): Promise<BridgeReceipt>;
}

// Only the native admitted receipt can name its original delivered conversation.
export function admittedChatUrl(value: unknown): string | undefined {
  const receipt = value as BridgeReceipt | null;
  if (
    (receipt?.receipt as { state?: unknown } | null)?.state !== "admitted" ||
    typeof receipt?.chatUrl !== "string"
  )
    return undefined;
  try {
    const url = new URL(receipt.chatUrl);
    if (
      url.origin !== "https://pi.jackharrhy.dev" ||
      url.username ||
      url.password ||
      !url.pathname.startsWith("/s/")
    )
      return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

function validateReceipt(value: unknown, batch: CommentBatch): BridgeReceipt {
  const result = value as BridgeReceipt | null;
  if (
    !result ||
    result.batchId !== batch.batchId ||
    result.binding?.key !== batch.target.key ||
    result.binding?.revision !== batch.target.revision ||
    (result.payloadDigest !== undefined &&
      result.payloadDigest !== batch.payloadDigest) ||
    !Object.hasOwn(result, "receipt")
  )
    throw new Error("Comment bridge receipt identity mismatch");
  return result;
}

const identifier = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 128;

export function createCommentBridge(
  options: { readonly endpoint: string; readonly token: string },
  transport: typeof fetch = fetch,
): CommentBridge {
  const endpoint = new URL(options.endpoint);
  if (
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.pathname !== "/" ||
    (endpoint.protocol !== "https:" &&
      !(
        endpoint.protocol === "http:" &&
        ["127.0.0.1", "[::1]", "localhost"].includes(endpoint.hostname)
      )) ||
    options.token.length < 32 ||
    /[\r\n]/.test(options.token)
  )
    throw new Error("Invalid private comment bridge configuration");
  async function request(path: string, body?: CommentBatch): Promise<unknown> {
    const response = await transport(new URL(path, endpoint), {
      method: body ? "POST" : "GET",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(
        path === "/atlas-feedback/targets" ? 120000 : 15000,
      ),
      headers: {
        Authorization: `Bearer ${options.token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Comment bridge request failed (${response.status})`);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Empty comment bridge response");
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 262144)
          throw new Error("Comment bridge response exceeds limit");
        chunks.push(chunk.value);
      }
    } finally {
      await reader.cancel();
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  }
  async function catalog(): Promise<AgentCatalog> {
    const result = (await request(
      "/atlas-feedback/targets",
    )) as Partial<AgentCatalog> | null;
    if (!result || !Array.isArray(result.targets) || result.targets.length > 64)
      throw new Error("Invalid comment targets");
    const targets = result.targets.map((target: AgentTarget) => {
      if (
        !target ||
        (target.sessionId !== undefined &&
          (typeof target.sessionId !== "string" ||
            !target.sessionId ||
            target.sessionId.length > 128)) ||
        typeof target.key !== "string" ||
        !/^[0-9a-f]{64}$/.test(target.key) ||
        !Number.isSafeInteger(target.revision) ||
        target.revision < 1 ||
        typeof target.label !== "string" ||
        !target.label.trim() ||
        target.label.length > 256 ||
        !Array.isArray(target.glyph?.paths) ||
        target.glyph.paths.length > 64
      )
        throw new Error("Invalid comment target");
      for (const shape of target.glyph.paths)
        if (
          !shape ||
          typeof shape.fill !== "string" ||
          !/^#[0-9a-fA-F]{6}$/.test(shape.fill) ||
          typeof shape.d !== "string" ||
          shape.d.length > 8192 ||
          !/^[MmLlHhVvCcSsQqTtAaZz0-9.,+\-\s]+$/.test(shape.d)
        )
          throw new Error("Invalid comment target glyph");
      return {
        ...(target.sessionId === undefined
          ? {}
          : { sessionId: target.sessionId }),
        key: target.key,
        revision: target.revision,
        label: target.label,
        glyph: {
          paths: target.glyph.paths.map(({ fill, d }) => ({ fill, d })),
        },
      };
    });
    if (
      result.defaultSessionId !== undefined &&
      !identifier(result.defaultSessionId)
    )
      throw new Error("Invalid default recipient");
    for (const count of [result.eligibleCount, result.omittedPrivacyCount])
      if (count !== undefined && (!Number.isSafeInteger(count) || count < 0))
        throw new Error("Invalid recipient count");
    if (
      result.eligibleCount !== undefined &&
      result.eligibleCount !== targets.length
    )
      throw new Error("Incomplete recipient catalog");
    if (
      result.unavailable !== undefined &&
      (!Array.isArray(result.unavailable) || result.unavailable.length > 256)
    )
      throw new Error("Invalid unavailable recipients");
    const unavailable = result.unavailable?.map((item) => {
      if (
        !item ||
        !identifier(item.sessionId) ||
        typeof item.label !== "string" ||
        !item.label.trim() ||
        item.label.length > 256 ||
        !["not-writable", "binding-disabled"].includes(item.reason)
      )
        throw new Error("Invalid unavailable recipient");
      return {
        sessionId: item.sessionId,
        label: item.label,
        reason: item.reason,
      };
    });
    if (
      new Set(targets.map((target) => target.sessionId ?? target.key)).size !==
      targets.length
    )
      throw new Error("Duplicate recipients");
    return {
      targets,
      ...(result.defaultSessionId === undefined
        ? {}
        : { defaultSessionId: result.defaultSessionId }),
      ...(result.eligibleCount === undefined
        ? {}
        : { eligibleCount: result.eligibleCount }),
      ...(result.omittedPrivacyCount === undefined
        ? {}
        : { omittedPrivacyCount: result.omittedPrivacyCount }),
      ...(unavailable === undefined ? {} : { unavailable }),
    };
  }
  return {
    catalog,
    targets: async () => (await catalog()).targets,
    publish: async (batch) =>
      validateReceipt(await request("/atlas-feedback/batches", batch), batch),
    receipt: async (batch) => {
      const query = new URLSearchParams({
        key: batch.target.key,
        revision: String(batch.target.revision),
        batchId: batch.batchId,
      });
      return validateReceipt(
        await request(`/atlas-feedback/receipt?${query}`),
        batch,
      );
    },
  };
}
