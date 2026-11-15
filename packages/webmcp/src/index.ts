export type WebMcpObject = Readonly<Record<string, unknown>>;

export interface WebMcpAnnotations {
  readonly readOnlyHint?: boolean;
  readonly untrustedContentHint?: boolean;
  readonly consequentialHint?: boolean;
  readonly debugging?: boolean;
}

export interface WebMcpTool {
  readonly name: string;
  readonly title?: string;
  readonly description: string;
  readonly inputSchema?: WebMcpObject;
  readonly outputSchema?: WebMcpObject;
  readonly annotations?: WebMcpAnnotations;
  execute(
    input: WebMcpObject,
    context: { readonly signal: AbortSignal },
  ): unknown;
}

interface ModelContext {
  registerTool(
    tool: WebMcpTool,
    options: { readonly signal: AbortSignal },
  ): void | Promise<void>;
}

export interface WebMcpRegistration {
  readonly supported: boolean;
  readonly ready: Promise<void>;
  dispose(): void;
}

export function registerWebMcpTools(
  document: Document,
  tools: readonly WebMcpTool[],
  options: { readonly signal?: AbortSignal } = {},
): WebMcpRegistration {
  const modelContext = (
    document as Document & { readonly modelContext?: ModelContext }
  ).modelContext;
  const controller = new AbortController();
  const view = document.defaultView;
  function dispose() {
    controller.abort();
    view?.removeEventListener("pagehide", dispose);
    options.signal?.removeEventListener("abort", dispose);
  }
  if (!modelContext?.registerTool) {
    return { supported: false, ready: Promise.resolve(), dispose };
  }
  view?.addEventListener("pagehide", dispose, { once: true });
  options.signal?.addEventListener("abort", dispose, { once: true });
  if (options.signal?.aborted) dispose();
  const ready = (async () => {
    try {
      controller.signal.throwIfAborted();
      await Promise.all(
        tools.map(async (tool) => {
          controller.signal.throwIfAborted();
          await modelContext.registerTool(
            {
              ...tool,
              execute(input, context) {
                const signal = AbortSignal.any([
                  controller.signal,
                  context.signal,
                ]);
                signal.throwIfAborted();
                return tool.execute(input, { signal });
              },
            },
            { signal: controller.signal },
          );
        }),
      );
      controller.signal.throwIfAborted();
    } catch (cause) {
      dispose();
      throw new Error("WebMCP tool registration failed", { cause });
    }
  })();
  return { supported: true, ready, dispose };
}
