import tgpu from "typegpu";
import type { ParsedWorld } from "../core/index.js";
import { loadWorldAssets } from "../viewer/assets.js";
import type { WarningDetail, WorldSource } from "../viewer/types.js";
import { TypeGpuWorldRenderer } from "./renderer.js";
import { createSceneOverlay } from "./scene-overlay.js";
import type { CameraState, DistanceFog } from "./types.js";

export interface EmbeddedMapsScene {
  readonly world: ParsedWorld;
  readonly warnings: readonly WarningDetail[];
  /** Draw with a column-major WebGPU projection-view matrix and camera in BSP space. */
  draw(frame: {
    projectionView: Float32Array<ArrayBuffer>;
    camera: CameraState;
    timeSeconds: number;
    /** Non-indexed triangles: BSP XYZ, top-left-origin atlas UV (negative U for solid), display RGB. */
    overlay?: Float32Array<ArrayBuffer>;
  }): void;
  dispose(): void;
}

/** Owns the WebGPU renderer only; the host controls sizing, camera, and frame timing. */
export async function createEmbeddedMapsScene(options: {
  canvas: HTMLCanvasElement;
  source: WorldSource;
  /** Optional atlas; the caller retains ownership of this bitmap. */
  overlayAtlas?: ImageBitmap;
  /** Radial distances in BSP units for fading surfaces into the clear color. Off by default. */
  fog?: DistanceFog;
}): Promise<EmbeddedMapsScene> {
  if (!globalThis.navigator?.gpu)
    throw new Error("BSP rendering requires WebGPU");
  const { fog } = options;
  if (
    fog &&
    (!Number.isFinite(fog.start) ||
      !Number.isFinite(fog.end) ||
      fog.start < 0 ||
      fog.end <= fog.start)
  )
    throw new RangeError(
      "Fog requires finite BSP distances with 0 <= start < end",
    );
  const loaded = await loadWorldAssets(options.source, {
    fetch: globalThis.fetch.bind(globalThis),
    signal: new AbortController().signal,
    progress: () => {},
  });
  const root = await tgpu.init();
  let context: GPUCanvasContext | undefined;
  let renderer: TypeGpuWorldRenderer | undefined;
  let overlay: Awaited<ReturnType<typeof createSceneOverlay>> | undefined;
  let disposed = false;
  let deviceError: Error | undefined;
  void root.device.lost.then((info) => {
    if (!disposed)
      deviceError = new Error(
        `WebGPU device lost: ${info.message || info.reason}`,
      );
  });
  function dispose() {
    if (disposed) return;
    disposed = true;
    overlay?.dispose();
    renderer?.dispose();
    context?.unconfigure();
    root.destroy();
  }
  try {
    const format = navigator.gpu.getPreferredCanvasFormat();
    context = root.configureContext({
      canvas: options.canvas,
      format,
      alphaMode: "opaque",
    });
    renderer = new TypeGpuWorldRenderer(
      root,
      context,
      format,
      loaded,
      "nearest",
      [0.04, 0.03, 0.02, 1],
      fog,
    );
    await renderer.initialize();
    if (options.overlayAtlas)
      overlay = await createSceneOverlay(
        root.device,
        format,
        options.overlayAtlas,
      );
    if (deviceError) throw deviceError;
    const activeRenderer = renderer;
    return {
      world: loaded.world,
      warnings: loaded.warnings,
      draw(frame) {
        if (disposed) return;
        if (deviceError) throw deviceError;
        const { width, height } = options.canvas;
        if (!width || !height) return;
        activeRenderer.resize(width, height);
        const drawOverlay =
          frame.overlay?.length && overlay
            ? overlay.prepare(frame.projectionView, frame.overlay)
            : undefined;
        activeRenderer.render(
          frame.projectionView,
          frame.camera,
          frame.timeSeconds,
          drawOverlay,
        );
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
