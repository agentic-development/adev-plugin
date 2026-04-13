/**
 * Detail Panel — shows node metadata and relationships when a node is clicked.
 */

const statusColors = {
  draft: '#94a3b8',
  'review-pending': '#f59e0b',
  'review-passed': '#3b82f6',
  implemented: '#10b981',
  validated: '#22c55e',
  open: '#f97316',
  closed: '#6b7280',
  blocked: '#ef4444',
  approved: '#3b82f6',
  accepted: '#22c55e',
  complete: '#22c55e',
  'in-progress': '#f59e0b',
};

export function initDetailPanel({ onRelatedClick }) {
  const panel = document.getElementById('detail-panel');
  const title = document.getElementById('detail-title');
  const body = document.getElementById('detail-body');
  const closeBtn = document.getElementById('detail-close');

  closeBtn.addEventListener('click', () => {
    panel.classList.add('collapsed');
  });

  return {
    show(nodeData, edges) {
      panel.classList.remove('collapsed');
      title.textContent = nodeData.fullTitle || nodeData.id;
      body.innerHTML = renderDetail(nodeData, edges, onRelatedClick);
    },
    hide() {
      panel.classList.add('collapsed');
      title.textContent = 'Select a node';
      body.innerHTML = '<p class="hint">Click a node in the graph to view its details.</p>';
    },
  };
}

function renderDetail(data, edges, onRelatedClick) {
  const sections = [];

  // Type + Status
  sections.push(`
    <div class="detail-section">
      <h3>Identity</h3>
      <div class="detail-field">
        <span class="label">Type</span>
        <span class="value">${data.type}</span>
      </div>
      <div class="detail-field">
        <span class="label">ID</span>
        <span class="value" title="${data.id}">${data.id}</span>
      </div>
      ${data.status ? `
      <div class="detail-field">
        <span class="label">Status</span>
        <span class="status-badge" style="background:${statusColors[data.status] || '#64748b'}; color:#fff">
          ${data.status}
        </span>
      </div>` : ''}
    </div>
  `);

  // Dates
  if (data.created || data.updated) {
    sections.push(`
      <div class="detail-section">
        <h3>Dates</h3>
        ${data.created ? `<div class="detail-field"><span class="label">Created</span><span class="value">${data.created}</span></div>` : ''}
        ${data.updated ? `<div class="detail-field"><span class="label">Updated</span><span class="value">${data.updated}</span></div>` : ''}
      </div>
    `);
  }

  // Content preview
  if (data.contentPreview) {
    const escaped = data.contentPreview
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
    sections.push(`
      <div class="detail-section">
        <h3>Content Preview</h3>
        <div style="font-size:12px;color:#cbd5e1;line-height:1.5;max-height:200px;overflow-y:auto;white-space:pre-wrap">${escaped}</div>
      </div>
    `);
  }

  // Metadata
  const metaKeys = Object.keys(data).filter(k =>
    !['id', 'label', 'fullTitle', 'type', 'status', 'created', 'updated', 'color', 'contentPreview'].includes(k)
    && data[k] != null && data[k] !== ''
  );
  if (metaKeys.length > 0) {
    const rows = metaKeys.map(k => {
      let val = data[k];
      if (Array.isArray(val)) val = val.join(', ');
      if (typeof val === 'object') val = JSON.stringify(val);
      return `<div class="detail-field"><span class="label">${k}</span><span class="value" title="${val}">${val}</span></div>`;
    }).join('');
    sections.push(`<div class="detail-section"><h3>Metadata</h3>${rows}</div>`);
  }

  // Related nodes (from edges)
  const related = [];
  for (const e of edges) {
    if (e.source === data.id) related.push({ id: e.target, type: e.type, dir: 'out' });
    if (e.target === data.id) related.push({ id: e.source, type: e.type, dir: 'in' });
  }

  if (related.length > 0) {
    // Group by edge type
    const groups = {};
    for (const r of related) {
      const key = `${r.dir === 'in' ? '\u2190' : '\u2192'} ${r.type}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    }

    let html = '<div class="detail-section"><h3>Related</h3>';
    for (const [label, items] of Object.entries(groups)) {
      html += `<div style="margin-bottom:8px"><span style="font-size:11px;color:#94a3b8">${label}</span><ul class="related-list">`;
      for (const item of items.slice(0, 20)) {
        html += `<li data-node-id="${item.id}">${item.id}</li>`;
      }
      if (items.length > 20) html += `<li style="color:#94a3b8">... and ${items.length - 20} more</li>`;
      html += '</ul></div>';
    }
    html += '</div>';
    sections.push(html);
  }

  // Attach click handlers after rendering
  setTimeout(() => {
    for (const li of document.querySelectorAll('.related-list li[data-node-id]')) {
      li.addEventListener('click', () => onRelatedClick(li.dataset.nodeId));
    }
  }, 0);

  return sections.join('');
}
