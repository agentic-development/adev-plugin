/**
 * PageRank ranker for tree-sitter repomap.
 *
 * Computes PageRank scores on the file-level dependency graph and
 * distributes scores to individual symbols based on reference counts.
 */

/**
 * Compute PageRank scores and build a SymbolIndex.
 *
 * @param {{generated: string, commit: string, nodes: Array<{path: string, exports: string[], module: string|null}>, edges: Array<{from: string, to: string, type: string, symbols: string[]}>}} graph
 * @param {Map<string, Array<{name: string, kind: string, line: number}>>} symbolDetails
 * @returns {{generated: string, commit: string, symbols: Array<{name: string, kind: string, file: string, line: number, score: number, references: number, module: string|null}>}}
 */
export function computeRanks(graph, symbolDetails) {
  const { generated, commit, nodes, edges } = graph;
  const n = nodes.length;

  if (n === 0) {
    return { generated, commit, symbols: [] };
  }

  // --- File-level PageRank ---

  const d = 0.85;
  const maxIter = 20;
  const convergenceThreshold = 0.001;

  // Build adjacency structures
  const pathIndex = new Map(); // path → index
  for (let i = 0; i < n; i++) {
    pathIndex.set(nodes[i].path, i);
  }

  // inbound[i] = list of node indices that link TO node i
  const inbound = Array.from({ length: n }, () => []);
  // outDegree[i] = number of edges FROM node i
  const outDegree = new Array(n).fill(0);

  for (const edge of edges) {
    const fromIdx = pathIndex.get(edge.from);
    const toIdx = pathIndex.get(edge.to);
    if (fromIdx === undefined || toIdx === undefined) continue;
    inbound[toIdx].push(fromIdx);
    outDegree[fromIdx]++;
  }

  // Initialize scores
  let scores = new Float64Array(n).fill(1 / n);

  for (let iter = 0; iter < maxIter; iter++) {
    const newScores = new Float64Array(n);

    // Collect dangling node score (nodes with outDegree === 0)
    let danglingSum = 0;
    for (let i = 0; i < n; i++) {
      if (outDegree[i] === 0) {
        danglingSum += scores[i];
      }
    }

    for (let i = 0; i < n; i++) {
      let inboundSum = 0;
      for (const j of inbound[i]) {
        inboundSum += scores[j] / outDegree[j];
      }
      // Standard PageRank with dangling node redistribution
      newScores[i] = (1 - d) / n + d * (inboundSum + danglingSum / n);
    }

    // Check convergence
    let diff = 0;
    for (let i = 0; i < n; i++) {
      diff += Math.abs(newScores[i] - scores[i]);
    }

    scores = newScores;

    if (diff < convergenceThreshold) {
      break;
    }
  }

  // --- Distribute file scores to symbols ---

  // For each file, count how many distinct files import each symbol
  // references[filePath][symbolName] = Set of importing file paths
  const symbolRefs = new Map();
  for (const node of nodes) {
    const refMap = new Map();
    for (const exp of node.exports) {
      refMap.set(exp, new Set());
    }
    symbolRefs.set(node.path, refMap);
  }

  for (const edge of edges) {
    const targetRefs = symbolRefs.get(edge.to);
    if (!targetRefs) continue;
    for (const sym of edge.symbols) {
      const refSet = targetRefs.get(sym);
      if (refSet) {
        refSet.add(edge.from);
      }
    }
  }

  // Build symbol entries
  const symbols = [];

  for (let i = 0; i < n; i++) {
    const node = nodes[i];
    const fileScore = scores[i];
    const details = symbolDetails.get(node.path) || [];
    const refs = symbolRefs.get(node.path);

    // Count total references for this file
    let totalRefs = 0;
    for (const detail of details) {
      const refSet = refs?.get(detail.name);
      totalRefs += refSet ? refSet.size : 0;
    }

    for (const detail of details) {
      const refSet = refs?.get(detail.name);
      const references = refSet ? refSet.size : 0;
      let symbolScore;

      if (totalRefs === 0) {
        // No references at all — distribute equally
        symbolScore = fileScore / details.length;
      } else if (references === 0) {
        // This symbol has zero refs but others in the file do
        symbolScore = 0;
      } else {
        symbolScore = fileScore * (references / totalRefs);
      }

      symbols.push({
        name: detail.name,
        kind: detail.kind,
        file: node.path,
        line: detail.line,
        score: symbolScore,
        references,
        module: node.module,
      });
    }
  }

  // Sort by score descending
  symbols.sort((a, b) => b.score - a.score);

  return { generated, commit, symbols };
}
