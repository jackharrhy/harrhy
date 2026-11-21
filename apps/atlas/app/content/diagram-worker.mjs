import { parentPort, workerData } from "node:worker_threads";
import { render } from "pele";

try {
  const result = render(workerData, {
    links: false,
    images: false,
    limit: 10000,
    outputLimit: 250000,
    maxEdges: 200,
    idPrefix: "atlas-diagram-",
  });
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- Node MessagePort is not Window.
  parentPort.postMessage({ atlasDiagram: true, svg: result.svg });
} catch {
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- Node MessagePort is not Window.
  parentPort.postMessage({ atlasDiagram: true, svg: null });
}
