/**
 * Context Index Visualization — Main Application
 *
 * Orchestrates graph loading, rendering, filtering, and interaction.
 */

import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import dagre from 'cytoscape-dagre';
import { setCytoscape, createGraph, runLayout, filterByTypes, searchNodes } from './graph-renderer.mjs';
import { initDetailPanel } from './detail-panel.mjs';
import { initFilters } from './filters.mjs';
import { initTimeline } from './timeline.mjs';

// Register layout extensions
cytoscape.use(fcose);
cytoscape.use(dagre);

// Pass cytoscape to renderer
setCytoscape(cytoscape);

// ---------------------------------------------------------------------------
// Load data
// ---------------------------------------------------------------------------

const container = document.getElementById('graph-container');
container.innerHTML = '<div class="loading-overlay">Loading graph data...</div>';

let graphData;
try {
  const resp = await fetch('dist/graph-data.json');
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  graphData = await resp.json();
} catch (err) {
  container.innerHTML = `
    <div class="loading-overlay">
      Failed to load graph-data.json<br>
      <small style="color:#94a3b8">Run <code>node viz/build.mjs</code> first to generate the data.</small>
    </div>`;
  throw err;
}

container.innerHTML = '';

// ---------------------------------------------------------------------------
// Header stats
// ---------------------------------------------------------------------------

document.getElementById('project-name').textContent = graphData.metadata.projectName;
document.getElementById('graph-stats').textContent =
  `${graphData.metadata.nodeCount} nodes \u00b7 ${graphData.metadata.edgeCount} edges`;

// ---------------------------------------------------------------------------
// Analytics overlay
// ---------------------------------------------------------------------------

const analyticsDiv = document.createElement('div');
analyticsDiv.className = 'analytics-badge';
const a = graphData.analytics || {};
const orphanCount = a.orphanSpecs?.length || 0;
analyticsDiv.innerHTML = `
  <span class="stat">Coverage: <strong>${(parseFloat(a.coverageRatio || 0) * 100).toFixed(0)}%</strong></span>
  <span class="stat">Orphan specs: <strong>${orphanCount}</strong></span>
  <span class="stat">Stale: <strong>${a.staleNodes?.length || 0}</strong></span>
`;
container.appendChild(analyticsDiv);

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------

const detailPanel = initDetailPanel({
  onRelatedClick(nodeId) {
    const node = cy.getElementById(nodeId);
    if (node && node.length > 0) {
      cy.animate({ center: { eles: node }, zoom: 2 }, { duration: 300 });
      node.emit('tap');
    }
  },
});

// ---------------------------------------------------------------------------
// Graph
// ---------------------------------------------------------------------------

const cy = createGraph(container, graphData, {
  onNodeSelect(nodeData) {
    if (!nodeData) {
      detailPanel.hide();
      return;
    }
    // Find edges for this node
    const nodeEdges = graphData.edges.filter(
      e => e.source === nodeData.id || e.target === nodeData.id
    );
    detailPanel.show(nodeData, nodeEdges);
  },
});

// Initial layout
runLayout(cy, 'fcose');

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

const { visibleTypes } = initFilters(graphData, {
  onFilterChange(types) {
    filterByTypes(cy, types);
  },
});

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

const searchInput = document.getElementById('search-input');
let searchTimeout;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    searchNodes(cy, searchInput.value.trim());
  }, 200);
});

// ---------------------------------------------------------------------------
// Layout switcher
// ---------------------------------------------------------------------------

const layoutSelect = document.getElementById('layout-select');
layoutSelect.addEventListener('change', () => {
  runLayout(cy, layoutSelect.value);
});

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

initTimeline(graphData, {
  onBrush(startDate, endDate) {
    cy.nodes().forEach(node => {
      const created = node.data('created');
      if (!created) {
        node.style('display', 'element');
        return;
      }
      const d = new Date(created);
      const visible = d >= startDate && d <= endDate;
      const typeVisible = visibleTypes.has(node.data('type'));
      node.style('display', visible && typeVisible ? 'element' : 'none');
    });
  },
});
