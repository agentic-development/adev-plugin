/**
 * Parse a repo-map.md markdown file (regex mode format) into structured symbols.
 *
 * Expected format:
 *   ### src/types.ts
 *   - interface User (line 1)
 *   - type TaskFilter (line 15)
 *
 * @param {string} markdownContent
 * @returns {{ symbols: Array<{ name: string, kind: string, file: string, line: number }> }}
 */
export function parseRepoMap(markdownContent) {
  const symbols = [];
  let currentFile = null;

  const fileHeadingPattern = /^###\s+(.+)$/;
  const symbolPattern = /^-\s+(\w+)\s+(\S+)\s+\(line\s+(\d+)\)$/;

  for (const rawLine of markdownContent.split('\n')) {
    const line = rawLine.trim();

    const fileMatch = line.match(fileHeadingPattern);
    if (fileMatch) {
      currentFile = fileMatch[1].trim();
      continue;
    }

    if (currentFile) {
      const symMatch = line.match(symbolPattern);
      if (symMatch) {
        symbols.push({
          name: symMatch[2],
          kind: symMatch[1],
          file: currentFile,
          line: parseInt(symMatch[3], 10),
        });
      }
    }
  }

  return { symbols };
}
