export function pageCount(total, pageSize) {
  return Math.floor(total / pageSize) + 1;
}
