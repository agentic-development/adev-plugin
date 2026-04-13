/**
 * Timeline — date-based bar chart with brush for time-range filtering.
 * Pure DOM implementation (no D3 dependency for v1).
 */

export function initTimeline(graphData, { onBrush }) {
  const container = document.getElementById('timeline');

  // Collect all dated nodes
  const dated = graphData.nodes
    .filter(n => n.created)
    .map(n => ({ id: n.id, date: new Date(n.created), type: n.type }))
    .sort((a, b) => a.date - b.date);

  if (dated.length === 0) {
    container.innerHTML = '<span style="color:#64748b;font-size:11px">No dated nodes</span>';
    return;
  }

  const minDate = dated[0].date;
  const maxDate = dated[dated.length - 1].date;
  const range = maxDate - minDate || 86400000; // at least 1 day

  // Bucket into week-sized bins
  const bucketMs = 7 * 86400000;
  const bucketCount = Math.max(1, Math.ceil(range / bucketMs));
  const buckets = new Array(bucketCount).fill(0);
  for (const n of dated) {
    const idx = Math.min(Math.floor((n.date - minDate) / bucketMs), bucketCount - 1);
    buckets[idx]++;
  }

  const maxBucket = Math.max(...buckets);
  const barWidth = Math.max(3, Math.floor((container.clientWidth - 40) / bucketCount));

  // Render bars
  const barContainer = document.createElement('div');
  barContainer.className = 'timeline-bar';
  barContainer.style.left = '20px';
  barContainer.style.right = '20px';

  for (let i = 0; i < bucketCount; i++) {
    const bar = document.createElement('div');
    bar.className = 'timeline-tick';
    bar.style.width = `${barWidth}px`;
    bar.style.height = `${Math.max(4, (buckets[i] / maxBucket) * 36)}px`;
    bar.title = `${buckets[i]} nodes (week of ${formatDate(new Date(minDate.getTime() + i * bucketMs))})`;
    barContainer.appendChild(bar);
  }
  container.appendChild(barContainer);

  // Labels
  const labels = document.createElement('div');
  labels.className = 'timeline-labels';
  labels.innerHTML = `<span>${formatDate(minDate)}</span><span>${formatDate(maxDate)}</span>`;
  container.appendChild(labels);

  // Brush
  let brushStart = 0;
  let brushEnd = 1;
  const brush = document.createElement('div');
  brush.className = 'timeline-brush';
  brush.style.left = '20px';
  brush.style.right = '20px';

  const leftHandle = document.createElement('div');
  leftHandle.className = 'timeline-handle left';
  const rightHandle = document.createElement('div');
  rightHandle.className = 'timeline-handle right';
  brush.appendChild(leftHandle);
  brush.appendChild(rightHandle);
  container.appendChild(brush);

  // Drag logic
  let dragging = null;
  let dragStartX = 0;
  let dragStartLeft = 0;
  let dragStartRight = 0;

  const totalWidth = container.clientWidth - 40;

  function updateBrush() {
    brush.style.left = `${20 + brushStart * totalWidth}px`;
    brush.style.width = `${(brushEnd - brushStart) * totalWidth}px`;
  }

  function emitBrush() {
    const startDate = new Date(minDate.getTime() + brushStart * range);
    const endDate = new Date(minDate.getTime() + brushEnd * range);
    onBrush(startDate, endDate);
  }

  leftHandle.addEventListener('mousedown', e => {
    e.stopPropagation();
    dragging = 'left';
    dragStartX = e.clientX;
    dragStartLeft = brushStart;
  });

  rightHandle.addEventListener('mousedown', e => {
    e.stopPropagation();
    dragging = 'right';
    dragStartX = e.clientX;
    dragStartRight = brushEnd;
  });

  brush.addEventListener('mousedown', e => {
    dragging = 'move';
    dragStartX = e.clientX;
    dragStartLeft = brushStart;
    dragStartRight = brushEnd;
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const dx = (e.clientX - dragStartX) / totalWidth;

    if (dragging === 'left') {
      brushStart = Math.max(0, Math.min(brushEnd - 0.02, dragStartLeft + dx));
    } else if (dragging === 'right') {
      brushEnd = Math.min(1, Math.max(brushStart + 0.02, dragStartRight + dx));
    } else if (dragging === 'move') {
      const span = dragStartRight - dragStartLeft;
      let newStart = dragStartLeft + dx;
      let newEnd = dragStartRight + dx;
      if (newStart < 0) { newStart = 0; newEnd = span; }
      if (newEnd > 1) { newEnd = 1; newStart = 1 - span; }
      brushStart = newStart;
      brushEnd = newEnd;
    }

    updateBrush();
  });

  document.addEventListener('mouseup', () => {
    if (dragging) {
      dragging = null;
      emitBrush();
    }
  });

  updateBrush();
}

function formatDate(d) {
  return d.toISOString().slice(0, 10);
}
