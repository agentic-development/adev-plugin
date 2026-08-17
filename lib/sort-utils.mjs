/**
 * Small deterministic-sort comparator factories.
 *
 * Both shapes below were independently reimplemented inline in multiple
 * `.sort()` calls across `lib/repomap/` and `lib/retro/` (flagged by
 * /adev:codehealth's duplicate-logic pass, which normalizes property names
 * too — so matches held across different key names).
 *
 * Pure, no I/O — no external dependencies (constitution principle 1).
 *
 * @module lib/sort-utils
 */

/**
 * Ascending lexicographic comparator over two string keys: primary first,
 * secondary as tiebreaker.
 *
 * @param {string} primaryKey
 * @param {string} secondaryKey
 * @returns {(a: object, b: object) => number}
 */
export function compareByStringKeys(primaryKey, secondaryKey) {
  return (a, b) => {
    if (a[primaryKey] !== b[primaryKey]) {
      return a[primaryKey] < b[primaryKey] ? -1 : 1;
    }
    return a[secondaryKey] < b[secondaryKey] ? -1 : a[secondaryKey] > b[secondaryKey] ? 1 : 0;
  };
}

/**
 * Descending-count comparator, tiebroken by ascending string key — the
 * standard "top N by frequency" ranking shape.
 *
 * @param {string} key
 * @returns {(a: {count: number} & object, b: {count: number} & object) => number}
 */
export function compareByCountDescThenKey(key) {
  return (a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0;
  };
}
