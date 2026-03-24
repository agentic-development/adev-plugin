/**
 * Compare parser-extracted symbols against ground truth.
 * Matching by (name, file) pair, with file paths normalized to lowercase.
 *
 * @param {Array<{name: string, file: string}>} parserSymbols
 * @param {Array<{name: string, file: string}>} groundTruthSymbols
 * @returns {{ precision: number, recall: number, missing: Array, extra: Array, matched: number }}
 */
export function compareSymbols(parserSymbols, groundTruthSymbols) {
  const normalize = (sym) => `${sym.name}|${sym.file.toLowerCase()}`;

  const parserSet = new Set(parserSymbols.map(normalize));
  const truthSet = new Set(groundTruthSymbols.map(normalize));

  const matchedKeys = new Set();
  for (const key of parserSet) {
    if (truthSet.has(key)) {
      matchedKeys.add(key);
    }
  }

  const matched = matchedKeys.size;

  const missing = groundTruthSymbols.filter(s => !matchedKeys.has(normalize(s)));
  const extra = parserSymbols.filter(s => !matchedKeys.has(normalize(s)));

  const precision = parserSymbols.length === 0 ? 0 : matched / parserSymbols.length;
  // If ground truth is empty, recall is 1.0 (nothing to find)
  const recall = groundTruthSymbols.length === 0 ? 1.0 : matched / groundTruthSymbols.length;

  return { precision, recall, missing, extra, matched };
}

/**
 * Compare parser-extracted edges against ground truth.
 * Matching by (from, to) pair, with paths normalized to lowercase.
 *
 * @param {Array<{from: string, to: string}> | null} parserEdges
 * @param {Array<{from: string, to: string}>} groundTruthEdges
 * @returns {{ precision: number, recall: number, missing: Array, extra: Array, matched: number } | null}
 */
export function compareEdges(parserEdges, groundTruthEdges) {
  if (parserEdges === null) return null;

  const normalize = (edge) => `${edge.from.toLowerCase()}->${edge.to.toLowerCase()}`;

  const parserSet = new Set(parserEdges.map(normalize));
  const truthSet = new Set(groundTruthEdges.map(normalize));

  const matchedKeys = new Set();
  for (const key of parserSet) {
    if (truthSet.has(key)) {
      matchedKeys.add(key);
    }
  }

  const matched = matchedKeys.size;

  const missing = groundTruthEdges.filter(e => !matchedKeys.has(normalize(e)));
  const extra = parserEdges.filter(e => !matchedKeys.has(normalize(e)));

  const precision = parserEdges.length === 0 ? 0 : matched / parserEdges.length;
  const recall = groundTruthEdges.length === 0 ? 1.0 : matched / groundTruthEdges.length;

  return { precision, recall, missing, extra, matched };
}
