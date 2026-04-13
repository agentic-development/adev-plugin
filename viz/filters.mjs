/**
 * Filters — type filter chips and search integration.
 */

export function initFilters(graphData, { onFilterChange }) {
  const container = document.getElementById('filter-chips');
  const { typeRegistry, nodes } = graphData;

  // Count nodes per type
  const counts = {};
  for (const n of nodes) {
    counts[n.type] = (counts[n.type] || 0) + 1;
  }

  // Types with hidden: true start inactive
  const visibleTypes = new Set(
    Object.entries(typeRegistry.nodeTypes)
      .filter(([, def]) => !def.hidden)
      .map(([type]) => type)
  );

  // Render chips
  for (const [type, def] of Object.entries(typeRegistry.nodeTypes)) {
    const count = counts[type] || 0;
    if (count === 0) continue;

    const chip = document.createElement('div');
    chip.className = 'chip' + (def.hidden ? ' inactive' : '');
    chip.dataset.type = type;
    chip.setAttribute('role', 'checkbox');
    chip.setAttribute('aria-checked', def.hidden ? 'false' : 'true');
    chip.setAttribute('aria-label', `Toggle ${def.label} nodes (${count})`);
    chip.setAttribute('tabindex', '0');
    chip.innerHTML = `<span class="dot" style="background:${def.color}"></span>${def.label} <span class="count">${count}</span>`;

    function toggleChip() {
      if (visibleTypes.has(type)) {
        visibleTypes.delete(type);
        chip.classList.add('inactive');
        chip.setAttribute('aria-checked', 'false');
      } else {
        visibleTypes.add(type);
        chip.classList.remove('inactive');
        chip.setAttribute('aria-checked', 'true');
      }
      onFilterChange(new Set(visibleTypes));
    }

    chip.addEventListener('click', toggleChip);
    chip.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleChip(); }
    });

    container.appendChild(chip);
  }

  // Apply initial filter to hide hidden types
  onFilterChange(new Set(visibleTypes));

  return { visibleTypes };
}
