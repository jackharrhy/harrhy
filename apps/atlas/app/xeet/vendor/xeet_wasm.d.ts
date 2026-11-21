/* tslint:disable */
/* eslint-disable */

/**
 * Runs one request and returns a framed response buffer (see the module
 * docs). Bad input, a limit overrun or a stage failure comes back as an
 * error frame, never a trap.
 */
export function call(op: number, request: string): Uint8Array;

/**
 * The lazy packs a request needs that are not registered yet, as a JSON
 * array. A host calls this before rendering, fetches the result, and
 * registers every file in each pack.
 */
export function missing_packs(request: string): string;

/**
 * The lazy packs a request needs, as a JSON array.
 */
export function packs_for(request: string): string;

/**
 * Registers one font file from a lazy pack.
 *
 * The host slices the pack's blob into its files (the offsets are in
 * `packs.json`) and calls this once per file. The bytes are copied into
 * wasm memory and kept for the rest of the module's life, exactly like an
 * embedded face. The next render rebuilds the face table.
 */
export function register_font(file: string, data: Uint8Array | number[]): void;

/**
 * `xeet-resolve`, for a JS host.
 *
 * `input` is text, an x.com post URL or post JSON; `options` is the JSON
 * form of [`xeet_resolve::Options`]; `host` is the object `js.rs` documents
 * (a `fetch` function is the only required member). Resolves with the JSON
 * form of `Resolved`, rejects with `{code, status, message, fields?}`.
 */
export function resolve(input: string, options: string, host: any): Promise<any>;

/**
 * `POST /resolve-links`, for a JS host: one URL in, one link out.
 *
 * Rejects with the same `{code, status, message}` object as [`resolve`].
 */
export function resolve_links(url: string, options: string, host: any): Promise<any>;

/**
 * The upstream app version this build embeds, so a caller can record what
 * produced a render (PLAN.md §11: every preview says how fresh it is).
 */
export function upstream_version(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly call: (a: number, b: number, c: number) => [number, number];
    readonly missing_packs: (a: number, b: number) => [number, number];
    readonly packs_for: (a: number, b: number) => [number, number];
    readonly register_font: (a: number, b: number, c: number, d: number) => [number, number];
    readonly resolve: (a: number, b: number, c: number, d: number, e: any) => any;
    readonly resolve_links: (a: number, b: number, c: number, d: number, e: any) => any;
    readonly upstream_version: () => [number, number];
    readonly wasm_bindgen__convert__closures_____invoke__h659b94ea01202fec: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen__convert__closures_____invoke__h667c86bdbbdb61e7: (a: number, b: number, c: any, d: any) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_destroy_closure: (a: number, b: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
