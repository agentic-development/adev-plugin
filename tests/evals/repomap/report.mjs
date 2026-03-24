/**
 * Generate a markdown eval report comparing parser results against ground truth.
 *
 * @param {string} repoName
 * @param {string} repoUrl
 * @param {string} gitRef
 * @param {{ symbolCount: number, edgeCount: number }} groundTruth
 * @param {{ symbols: object, edges: object | null }} treeSitterResult
 * @param {{ symbols: object, edges: object | null }} regexResult
 * @returns {string} Markdown report
 */
export function generateReport(repoName, repoUrl, gitRef, groundTruth, treeSitterResult, regexResult) {
  const timestamp = new Date().toISOString();
  const lines = [];

  lines.push(`# Eval Report: ${repoName}`);
  lines.push('');
  lines.push(`> Generated: ${timestamp}`);
  lines.push(`> Repo: ${repoUrl} @ ${gitRef}`);
  lines.push(`> Ground truth: ${groundTruth.symbolCount} symbols, ${groundTruth.edgeCount} edges`);
  lines.push('');

  // Symbol Accuracy table
  lines.push('## Symbol Accuracy');
  lines.push('');
  lines.push('| Parser | Precision | Recall | Found | Missing | Extra |');
  lines.push('|--------|-----------|--------|-------|---------|-------|');

  const tsSymbols = treeSitterResult.symbols;
  lines.push(`| tree-sitter | ${tsSymbols.precision} | ${tsSymbols.recall} | ${tsSymbols.matched} | ${tsSymbols.missing.length} | ${tsSymbols.extra.length} |`);

  const rxSymbols = regexResult.symbols;
  lines.push(`| regex | ${rxSymbols.precision} | ${rxSymbols.recall} | ${rxSymbols.matched} | ${rxSymbols.missing.length} | ${rxSymbols.extra.length} |`);
  lines.push('');

  // Edge Accuracy table (tree-sitter only)
  lines.push('## Edge Accuracy (tree-sitter only)');
  lines.push('');

  if (treeSitterResult.edges) {
    const tsEdges = treeSitterResult.edges;
    lines.push('| Precision | Recall | Found | Missing | Extra |');
    lines.push('|-----------|--------|-------|---------|-------|');
    lines.push(`| ${tsEdges.precision} | ${tsEdges.recall} | ${tsEdges.matched} | ${tsEdges.missing.length} | ${tsEdges.extra.length} |`);
  } else {
    lines.push('No edge data available.');
  }
  lines.push('');

  // Missing/Extra symbol lists
  lines.push('## Missing Symbols (tree-sitter)');
  lines.push('');
  if (tsSymbols.missing.length === 0) {
    lines.push('None.');
  } else {
    for (const sym of tsSymbols.missing) {
      lines.push(`- ${sym.name} (${sym.file}:${sym.line})`);
    }
  }
  lines.push('');

  lines.push('## Extra Symbols (tree-sitter)');
  lines.push('');
  if (tsSymbols.extra.length === 0) {
    lines.push('None.');
  } else {
    for (const sym of tsSymbols.extra) {
      lines.push(`- ${sym.name} (${sym.file}:${sym.line})`);
    }
  }
  lines.push('');

  lines.push('## Missing Symbols (regex)');
  lines.push('');
  if (rxSymbols.missing.length === 0) {
    lines.push('None.');
  } else {
    for (const sym of rxSymbols.missing) {
      lines.push(`- ${sym.name} (${sym.file}:${sym.line})`);
    }
  }
  lines.push('');

  lines.push('## Extra Symbols (regex)');
  lines.push('');
  if (rxSymbols.extra.length === 0) {
    lines.push('None.');
  } else {
    for (const sym of rxSymbols.extra) {
      lines.push(`- ${sym.name} (${sym.file}:${sym.line})`);
    }
  }
  lines.push('');

  return lines.join('\n');
}
