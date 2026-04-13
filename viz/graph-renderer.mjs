/**
 * Graph Renderer — Cytoscape.js setup, styles, and layout management.
 */

let _cytoscape;

export function setCytoscape(cy) { _cytoscape = cy; }

export function createGraph(container, graphData, { onNodeSelect }) {
  const cy = _cytoscape({
    container,
    elements: buildElements(graphData),
    style: buildStyle(graphData.typeRegistry),
    layout: { name: 'preset' }, // we'll run layout after init
    minZoom: 0.1,
    maxZoom: 5,
  });

  // Click handlers
  cy.on('tap', 'node', evt => {
    const node = evt.target;
    console.log('Node clicked:', node.data('id'), node.data('fullTitle'));
    highlightConnected(cy, node);
    onNodeSelect(node.data());
  });

  cy.on('tap', evt => {
    if (evt.target === cy) {
      clearHighlight(cy);
      onNodeSelect(null);
    }
  });

  // Keyboard navigation
  let currentNodeIndex = -1;
  document.addEventListener('keydown', evt => {
    // Skip if user is typing in search
    if (evt.target.tagName === 'INPUT' || evt.target.tagName === 'SELECT') return;

    const visibleNodes = cy.nodes(':visible');
    if (visibleNodes.length === 0) return;

    if (evt.key === 'Tab') {
      evt.preventDefault();
      if (evt.shiftKey) {
        currentNodeIndex = (currentNodeIndex - 1 + visibleNodes.length) % visibleNodes.length;
      } else {
        currentNodeIndex = (currentNodeIndex + 1) % visibleNodes.length;
      }
      const node = visibleNodes[currentNodeIndex];
      cy.animate({ center: { eles: node }, duration: 200 });
      highlightConnected(cy, node);
      onNodeSelect(node.data());
    } else if (evt.key === 'Enter' && currentNodeIndex >= 0) {
      const node = visibleNodes[currentNodeIndex];
      cy.animate({ center: { eles: node }, zoom: 2, duration: 300 });
    } else if (evt.key === 'Escape') {
      currentNodeIndex = -1;
      clearHighlight(cy);
      onNodeSelect(null);
    }
  });

  return cy;
}

function buildElements(graphData) {
  const { nodes, edges, typeRegistry } = graphData;
  const nodeElements = nodes.map(n => ({
    group: 'nodes',
    data: {
      id: n.id,
      label: truncate(n.title, 30),
      fullTitle: n.title,
      type: n.type,
      status: n.status,
      created: n.created,
      updated: n.updated,
      ...n.metadata,
      color: typeRegistry.nodeTypes[n.type]?.color || '#888',
    },
  }));

  const edgeElements = edges.map((e, i) => ({
    group: 'edges',
    data: {
      id: `e${i}`,
      source: e.source,
      target: e.target,
      type: e.type,
      color: typeRegistry.edgeTypes[e.type]?.color || '#555',
      lineStyle: typeRegistry.edgeTypes[e.type]?.style || 'solid',
    },
  }));

  return [...nodeElements, ...edgeElements];
}

function buildStyle(typeRegistry) {
  const shapeMap = {};
  for (const [type, def] of Object.entries(typeRegistry.nodeTypes)) {
    shapeMap[type] = def.shape || 'ellipse';
  }

  return [
    {
      selector: 'node',
      style: {
        label: 'data(label)',
        'background-color': 'data(color)',
        color: '#e2e8f0',
        'text-valign': 'bottom',
        'text-halign': 'center',
        'font-size': '10px',
        'text-margin-y': 4,
        width: 28,
        height: 28,
        'border-width': 2,
        'border-color': 'data(color)',
        'text-max-width': '80px',
        'text-wrap': 'ellipsis',
        'text-outline-color': '#0f172a',
        'text-outline-width': 2,
      },
    },
    // Per-type shapes
    ...Object.entries(shapeMap).map(([type, shape]) => ({
      selector: `node[type = "${type}"]`,
      style: { shape },
    })),
    // Status border colors
    { selector: 'node[status = "draft"]', style: { 'border-color': '#94a3b8' } },
    { selector: 'node[status = "review-pending"]', style: { 'border-color': '#f59e0b' } },
    { selector: 'node[status = "review-passed"]', style: { 'border-color': '#3b82f6' } },
    { selector: 'node[status = "implemented"]', style: { 'border-color': '#10b981' } },
    { selector: 'node[status = "validated"]', style: { 'border-color': '#22c55e' } },
    { selector: 'node[status = "open"]', style: { 'border-color': '#f97316' } },
    { selector: 'node[status = "closed"]', style: { 'border-color': '#6b7280', opacity: 0.6 } },
    { selector: 'node[status = "blocked"]', style: { 'border-color': '#ef4444' } },
    // Edges
    {
      selector: 'edge',
      style: {
        'line-color': 'data(color)',
        'target-arrow-color': 'data(color)',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        width: 1.5,
        'arrow-scale': 0.7,
        opacity: 0.5,
      },
    },
    {
      selector: 'edge[lineStyle = "dashed"]',
      style: { 'line-style': 'dashed' },
    },
    // Highlighted
    {
      selector: 'node.highlighted',
      style: {
        'border-width': 3,
        'border-color': '#fff',
        'z-index': 10,
      },
    },
    {
      selector: 'edge.highlighted',
      style: {
        width: 2.5,
        opacity: 1,
        'z-index': 10,
      },
    },
    {
      selector: 'node.faded',
      style: { opacity: 0.15 },
    },
    {
      selector: 'edge.faded',
      style: { opacity: 0.05 },
    },
    {
      selector: 'node.search-match',
      style: {
        'border-width': 3,
        'border-color': '#fbbf24',
      },
    },
  ];
}

export function runLayout(cy, name = 'fcose') {
  const opts = name === 'dagre'
    ? {
        name: 'dagre',
        rankDir: 'TB',
        spacingFactor: 1.2,
        animate: true,
        animationDuration: 400,
      }
    : {
        name: 'fcose',
        quality: 'default',
        animate: true,
        animationDuration: 400,
        nodeRepulsion: 8000,
        idealEdgeLength: 80,
        edgeElasticity: 0.1,
        gravity: 0.25,
        gravityRange: 3.8,
        numIter: 2500,
      };

  cy.layout(opts).run();
}

function highlightConnected(cy, node) {
  clearHighlight(cy);
  const neighborhood = node.closedNeighborhood();
  cy.elements().addClass('faded');
  neighborhood.removeClass('faded');
  node.addClass('highlighted');
  neighborhood.edges().addClass('highlighted');
}

function clearHighlight(cy) {
  cy.elements().removeClass('faded highlighted');
}

export function filterByTypes(cy, visibleTypes) {
  cy.nodes().forEach(node => {
    const type = node.data('type');
    if (visibleTypes.has(type)) {
      node.style('display', 'element');
    } else {
      node.style('display', 'none');
    }
  });
}

export function searchNodes(cy, query) {
  cy.nodes().removeClass('search-match faded');
  if (!query) return;

  const q = query.toLowerCase();
  const matches = cy.nodes().filter(n =>
    n.data('fullTitle')?.toLowerCase().includes(q) ||
    n.data('id')?.toLowerCase().includes(q)
  );

  if (matches.length > 0) {
    cy.nodes().addClass('faded');
    matches.removeClass('faded').addClass('search-match');
    matches.connectedEdges().removeClass('faded');
  }
}

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1) + '\u2026' : str;
}
