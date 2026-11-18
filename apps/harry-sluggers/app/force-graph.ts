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

  // Create force simulation
  const simulation = d3
    .forceSimulation<GraphNode>(nodes)
    .force(
      "link",
      d3
        .forceLink<GraphNode, GraphLink>(links)
        .id((d) => d.id)
        .distance((d) => {
          // Different distances for positive vs negative chemistry - increased for more spacing
          return d.type === "positive" ? 150 : 200;
        }),
    )
    .force(
      "charge",
      d3.forceManyBody<GraphNode>().strength((d) => {
        // Attraction for positive chemistry, repulsion for negative
        const positiveLinks = links
          .filter(
            (l) =>
              (l.source as GraphNode).id === d.id ||
              (l.target as GraphNode).id === d.id,
          )
          .filter((l) => l.type === "positive").length;
        const negativeLinks = links
          .filter(
            (l) =>
              (l.source as GraphNode).id === d.id ||
              (l.target as GraphNode).id === d.id,
          )
          .filter((l) => l.type === "negative").length;
        // Increased base repulsion for more spacing
        return -800 + positiveLinks * 100 - negativeLinks * 150;
      }),
    )
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collision", d3.forceCollide().radius(40))
    .alphaDecay(0.02); // Slower decay for more gradual settling

  // Create zoom behavior
  const zoom = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.1, 4])
    .on("zoom", (event) => {
      g.attr("transform", event.transform);
    });

  svg.call(zoom);

  // Create container group for zoom/pan
  const g = svg.append("g");

  // Draw links
  const link = g
    .append("g")
    .attr("class", "links")
    .selectAll<SVGLineElement, GraphLink>("line")
    .data(links)
    .enter()
    .append("line")
    .attr("stroke", (d) => (d.type === "positive" ? "#4ade80" : "#f87171"))
    .attr("stroke-width", 2)
    .attr("stroke-opacity", 0.6)
    .attr(
      "marker-end",
      (d) =>
        `url(#arrowhead-${d.type === "positive" ? "positive" : "negative"})`,
    );

  // Draw arrow markers for links (one for positive, one for negative)
  const defs = svg.append("defs");

  // Positive chemistry arrow (green)
  defs
    .append("marker")
    .attr("id", "arrowhead-positive")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 25)
    .attr("refY", 0)
    .attr("markerWidth", 6)
    .attr("markerHeight", 6)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-5L10,0L0,5")
    .attr("fill", "#4ade80");

  // Negative chemistry arrow (red)
  defs
    .append("marker")
    .attr("id", "arrowhead-negative")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 25)
    .attr("refY", 0)
    .attr("markerWidth", 6)
    .attr("markerHeight", 6)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-5L10,0L0,5")
    .attr("fill", "#f87171");

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

  // Update positions on simulation tick
  simulation.on("tick", () => {
    link
      .attr("x1", (d) => (d.source as GraphNode).x!)
      .attr("y1", (d) => (d.source as GraphNode).y!)
      .attr("x2", (d) => (d.target as GraphNode).x!)
      .attr("y2", (d) => (d.target as GraphNode).y!);

    node.attr("transform", (d) => `translate(${d.x},${d.y})`);
  });

  let hovered: string | null = null;
  let selected: string | null = null;
  function paint() {
    const active = hovered ?? selected;
    const connected = new Set([active]);
    for (const edge of links) {
      const from = (edge.source as GraphNode).id;
      const to = (edge.target as GraphNode).id;
      if (from === active) connected.add(to);
      if (to === active) connected.add(from);
    }
    link.attr("stroke-opacity", (edge) =>
      !active
        ? 0.6
        : (edge.source as GraphNode).id === active ||
            (edge.target as GraphNode).id === active
          ? 1
          : 0.2,
    );
    node
      .attr("aria-pressed", (d) => String(d.id === selected))
      .attr("opacity", (d) => (!active || connected.has(d.id) ? 1 : 0.3))
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
  return () => {
    simulation.stop();
    svg.on(".zoom", null);
  };
}
