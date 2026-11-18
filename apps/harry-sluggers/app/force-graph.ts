// Port of Sluggers Super Draft's players.chemistry-graph route at 3c60135.
import * as d3 from "d3";
import type { GraphData } from "./graph-data.ts";
type GraphNode = d3.SimulationNodeDatum & {
  id: string;
  character: string;
  player?: string;
};
type GraphLink = d3.SimulationLinkDatum<GraphNode> & {
  type: "positive" | "negative";
};
export function mountGraph(element: SVGSVGElement, data: GraphData) {
  const { width, height } = element.getBoundingClientRect();
  const svg = d3.select(element).attr("viewBox", `0 0 ${width} ${height}`);
  // Create nodes from characters with chemistry
  const nodeCharacters = new Set<string>();
  for (const chem of data.edges) {
    nodeCharacters.add(chem.character1);
    nodeCharacters.add(chem.character2);
  }

  const nodes: GraphNode[] = Array.from(nodeCharacters).map((character) => ({
    id: character,
    character,
    player: data.icons[character],
    x: width / 2 + (Math.random() - 0.5) * Math.min(width, height) * 0.4,
    y: height / 2 + (Math.random() - 0.5) * Math.min(width, height) * 0.4,
  }));

  // Create links from chemistry relationships
  const links: GraphLink[] = data.edges.map((chem) => ({
    source: chem.character1,
    target: chem.character2,
    type: chem.relationship,
  }));

  // Create node map for link resolution
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Resolve link sources and targets
  links.forEach((link) => {
    link.source = nodeMap.get(link.source as string)!;
    link.target = nodeMap.get(link.target as string)!;
  });

  const linkForce = d3
    .forceLink<GraphNode, GraphLink>()
    .id((d) => d.id)
    .distance((d) => (d.type === "positive" ? 150 : 200));
  const chargeForce = d3.forceManyBody<GraphNode>();
  const simulation = d3
    .forceSimulation<GraphNode>([])
    .force("link", linkForce)
    .force("charge", chargeForce)
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collision", d3.forceCollide().radius(40))
    .alphaDecay(0.07)
    .stop();
  function reweight(visibleNodes: GraphNode[], visibleEdges: GraphLink[]) {
    const weights = new Map(visibleNodes.map((node) => [node.id, -800]));
    for (const edge of visibleEdges) {
      const from = (edge.source as GraphNode).id,
        to = (edge.target as GraphNode).id;
      const delta = edge.type === "positive" ? 100 : -150;
      weights.set(from, (weights.get(from) ?? -800) + delta);
      if (from !== to) weights.set(to, (weights.get(to) ?? -800) + delta);
    }
    linkForce.links([]);
    simulation.nodes(visibleNodes);
    linkForce.links(visibleEdges);
    chargeForce.strength((d) => weights.get(d.id) ?? -800);
  }
  reweight(nodes, links);
  simulation.alpha(1).tick(64);

  const canvas = document.createElement("canvas");
  canvas.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;pointer-events:none";
  canvas.setAttribute("aria-hidden", "true");
  element.before(canvas);
  const context = canvas.getContext("2d");
  const scale = Math.min(devicePixelRatio, 2);
  let transform = d3.zoomIdentity;
  let edgeFrame = 0;
  const resize = new ResizeObserver(() => scheduleEdges());
  resize.observe(element);

  // Create zoom behavior
  const zoom = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.1, 4])
    .on("zoom", (event) => {
      transform = event.transform;
      g.attr("transform", transform.toString());
      scheduleEdges();
    });

  svg.call(zoom);

  // Create container group for zoom/pan
  const g = svg.append("g");

  let hovered: string | null = null;
  let selected: string | null = null;
  const hidden = new Set<string>();
  const visibleNode = (id: string) =>
    !hidden.has("miis") || !/\bmii\b/i.test(id);
  let visibleLinks = links;
  function scheduleEdges() {
    if (!edgeFrame)
      edgeFrame = requestAnimationFrame(() => {
        edgeFrame = 0;
        drawEdges();
      });
  }
  function drawEdges() {
    if (!context) return;
    const w = Math.round(element.clientWidth * scale),
      h = Math.round(element.clientHeight * scale);
    if (!w || !h) return;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    context.resetTransform();
    context.clearRect(0, 0, w, h);
    // Match the SVG viewBox's default centered meet behavior on resize.
    const fit = Math.min(w / width, h / height);
    context.setTransform(
      fit * transform.k,
      0,
      0,
      fit * transform.k,
      (w - width * fit) / 2 + fit * transform.x,
      (h - height * fit) / 2 + fit * transform.y,
    );
    const active = hovered ?? selected;
    for (const type of ["positive", "negative"] as const) {
      const color = type === "positive" ? "#4ade80" : "#f87171";
      for (const emphasized of active ? [false, true] : [false]) {
        const arrows = new Path2D();
        context.beginPath();
        context.strokeStyle = context.fillStyle = color;
        context.lineWidth = 2;
        context.globalAlpha = active ? (emphasized ? 1 : 0.2) : 0.6;
        for (const edge of visibleLinks) {
          if (edge.type !== type) continue;
          const from = edge.source as GraphNode,
            to = edge.target as GraphNode;
          if (
            !!active &&
            (from.id === active || to.id === active) !== emphasized
          )
            continue;
          const x = from.x ?? 0,
            y = from.y ?? 0,
            endX = to.x ?? 0,
            endY = to.y ?? 0;
          const length = Math.hypot(endX - x, endY - y);
          if (length < 26) continue;
          const ux = (endX - x) / length,
            uy = (endY - y) / length;
          const tx = endX - 25 * ux,
            ty = endY - 25 * uy,
            bx = tx - 8 * ux,
            by = ty - 8 * uy;
          context.moveTo(x, y);
          context.lineTo(tx, ty);
          arrows.moveTo(tx, ty);
          arrows.lineTo(bx - 4 * uy, by + 4 * ux);
          arrows.lineTo(bx + 4 * uy, by - 4 * ux);
          arrows.closePath();
        }
        context.stroke();
        // oxlint-disable-next-line unicorn/no-array-fill-with-reference-type -- Canvas fill, not Array.fill.
        context.fill(arrows, "nonzero");
      }
    }
  }

  // Draw nodes
  const node = g
    .append("g")
    .attr("class", "nodes")
    .selectAll<SVGGElement, GraphNode>("g")
    .data(nodes)
    .enter()
    .append("g")
    .attr("class", "node")
    .call(
      d3
        .drag<SVGGElement, GraphNode>()
        .on("start", (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }),
    );

  // Add circles for nodes
  node
    .append("circle")
    .attr("r", 25)
    .attr("fill", "#374151")
    .attr("stroke", "#6b7280")
    .attr("stroke-width", 2);

  // Add player icons as images
  node
    .append("image")
    .attr("x", -15)
    .attr("y", -15)
    .attr("width", 30)
    .attr("height", 30)
    .attr("href", (d) => {
      return d.player ?? null;
    })
    .attr("preserveAspectRatio", "xMidYMid meet")
    .style("pointer-events", "none");

  // Add labels
  node
    .append("text")
    .attr("dy", 35)
    .attr("text-anchor", "middle")
    .attr("fill", "#e5e7eb")
    .attr("font-size", "10px")
    .attr("font-family", "sans-serif")
    .text((d) => d.character);

  function draw() {
    scheduleEdges();
    node.attr("transform", (d) => `translate(${d.x},${d.y})`);
  }
  let lastDraw = 0;
  simulation
    .on("tick", () => {
      const now = performance.now();
      if (now - lastDraw < 32) return;
      lastDraw = now;
      draw();
    })
    .on("end", draw);
  draw();
  // Start with the settled layout in view; retain the original D3 pan/zoom.
  const bounds = g.node()?.getBBox();
  if (bounds?.width && bounds.height) {
    const k = Math.min(
      1,
      width / (bounds.width + 48),
      height / (bounds.height + 48),
    );
    svg.call(
      zoom.transform,
      d3.zoomIdentity
        .translate(
          width / 2 - k * (bounds.x + bounds.width / 2),
          height / 2 - k * (bounds.y + bounds.height / 2),
        )
        .scale(k),
    );
  }
  function paint() {
    const active = hovered ?? selected;
    const connected = new Set<string>();
    if (active)
      for (const edge of visibleLinks) {
        const from = (edge.source as GraphNode).id,
          to = (edge.target as GraphNode).id;
        if (from === active) connected.add(to);
        if (to === active) connected.add(from);
      }
    scheduleEdges();
    node
      .attr("aria-pressed", (d) => String(d.id === selected))
      .attr("opacity", (d) =>
        !active || active === d.id || connected?.has(d.id) ? 1 : 0.3,
      )
      .select("circle")
      .attr("fill", (d) =>
        d.id === selected
          ? "#60a5fa"
          : d.id === hovered
            ? "#93c5fd"
            : "#374151",
      );
  }
  function toggle(id: string) {
    selected = selected === id ? null : id;
    paint();
  }
  node
    .attr("tabindex", 0)
    .attr("role", "button")
    .attr("aria-label", (d) => d.character)
    .on("pointerenter focus", (_, d) => {
      hovered = d.id;
      paint();
    })
    .on("pointerleave blur", () => {
      hovered = null;
      paint();
    })
    .on("click", (event, d) => {
      event.stopPropagation();
      toggle(d.id);
    })
    .on("keydown", (event, d) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggle(d.id);
      }
    });
  paint();
  return {
    filter(key: string, show: boolean) {
      if (show) hidden.delete(key);
      else hidden.add(key);
      visibleLinks = links.filter(
        (edge) =>
          !hidden.has(edge.type) &&
          visibleNode((edge.source as GraphNode).id) &&
          visibleNode((edge.target as GraphNode).id),
      );
      reweight(
        nodes.filter((d) => visibleNode(d.id)),
        visibleLinks,
      );
      simulation.alpha(0.7).restart();
      canvas.dataset.positive = String(
        visibleLinks.filter((edge) => edge.type === "positive").length,
      );
      canvas.dataset.negative = String(
        visibleLinks.filter((edge) => edge.type === "negative").length,
      );
      node.attr("display", (d) => (visibleNode(d.id) ? null : "none"));
      if (selected && !visibleNode(selected)) selected = null;
      if (hovered && !visibleNode(hovered)) hovered = null;
      paint();
    },
    dispose() {
      simulation.stop();
      resize.disconnect();
      cancelAnimationFrame(edgeFrame);
      canvas.remove();
      svg.on(".zoom", null);
    },
  };
}
