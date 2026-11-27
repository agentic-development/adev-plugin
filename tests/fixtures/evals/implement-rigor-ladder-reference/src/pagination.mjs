export function pageCount(total, pageSize) {
  return total === 0 ? 0 : Math.ceil(total / pageSize);
}

export function paginate(items, { page = 1, pageSize = 20 } = {}) {
  const total = items.length;
  const count = pageCount(total, pageSize);
  const inRange = Number.isInteger(page) && page >= 1 && page <= count;
  const start = (page - 1) * pageSize;
  return { items: inRange ? items.slice(start, start + pageSize) : [], page, pageSize, pageCount: count, total };
}
