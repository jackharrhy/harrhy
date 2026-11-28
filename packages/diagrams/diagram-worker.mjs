import { parentPort, workerData } from "node:worker_threads";
import { render } from "pele";

if (!parentPort) throw new Error("Diagram renderer requires a worker");

try {
  const result = render(workerData, {
    links: false,
    images: false,
    limit: 10000,
    outputLimit: 250000,
    maxEdges: 200,
    idPrefix: "harrhy-diagram-",
  });
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- Node MessagePort is not Window.
  parentPort.postMessage({ harrhyDiagram: true, svg: result.svg });
} catch {
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- Node MessagePort is not Window.
  parentPort.postMessage({ harrhyDiagram: true, svg: null });
}
