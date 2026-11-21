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
  parentPort.postMessage({ atlasDiagram: true, svg: result.svg });
} catch {
  parentPort.postMessage({ atlasDiagram: true, svg: null });
}
