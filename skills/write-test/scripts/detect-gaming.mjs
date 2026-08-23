/**
 * detect-gaming.mjs — Specification gaming violation scanner.
 *
 * Accepts an array of { path, content } objects and returns a list of
 * violations: [{ type, severity, file, line, matched }]
 *
 * Uses only Node.js built-in RegExp — no AST parser, no external deps.
 */

/**
 * Canonical patterns per spec (gaming-violation-detection.md).
 *
 * Each rule is applied line-by-line.
 * Rules with `sole: true` only fire when there is exactly one `expect(` in the test body.
 */
const PATTERNS = [
  // Vacuous matchers — blocking when sole assertion
  {
    type: 'vacuous-matcher',
    severity: 'blocking',
    regex: /\.toBeTruthy\(\)/,
    sole: true,
    description: 'toBeTruthy() as sole assertion',
  },
  {
    type: 'vacuous-matcher',
    severity: 'blocking',
    regex: /\.toBeDefined\(\)/,
    sole: true,
    description: 'toBeDefined() as sole assertion',
  },
  {
    type: 'vacuous-matcher',
    severity: 'blocking',
    regex: /\.toBeFalsy\(\)/,
    sole: true,
    description: 'toBeFalsy() as sole assertion',
  },
  {
    type: 'vacuous-matcher',
    severity: 'blocking',
    regex: /\.toBeUndefined\(\)/,
    sole: true,
    description: 'toBeUndefined() as sole assertion',
  },
  {
    type: 'vacuous-matcher',
    severity: 'blocking',
    regex: /\.toBeNull\(\)/,
    sole: true,
    description: 'toBeNull() as sole assertion',
  },
  // Always-true numeric comparisons — blocking (regardless of sole status)
  {
    type: 'vacuous-matcher',
    severity: 'blocking',
    regex: /\.toBeGreaterThanOrEqual\(\s*0\s*\)/,
    sole: false,
    description: 'toBeGreaterThanOrEqual(0)',
  },
  {
    type: 'vacuous-matcher',
    severity: 'blocking',
    regex: /\.toBeGreaterThan\(\s*-1\s*\)/,
    sole: false,
    description: 'toBeGreaterThan(-1)',
  },
  // Conditional skips — blocking
  {
    type: 'conditional-skip',
    severity: 'blocking',
    regex: /\.skip\(/,
    sole: false,
    description: '.skip( skip pattern',
  },
  {
    type: 'conditional-skip',
    severity: 'blocking',
    regex: /\bxit\s*\(/,
    sole: false,
    description: 'xit( disabled test',
  },
  {
    type: 'conditional-skip',
    severity: 'blocking',
    regex: /\bxdescribe\s*\(/,
    sole: false,
    description: 'xdescribe( disabled suite',
  },
  {
    type: 'conditional-skip',
    severity: 'blocking',
    regex: /\.todo\s*\(/,
    sole: false,
    description: '.todo( marked as todo',
  },
  // Unchecked not.toThrow() — blocking when sole assertion
  {
    type: 'vacuous-matcher',
    severity: 'blocking',
    regex: /\.not\.toThrow\(\)/,
    sole: true,
    description: 'not.toThrow() as sole assertion',
  },
  // Weak equality — advisory
  {
    type: 'weak-equality',
    severity: 'advisory',
    regex: /\.toMatchObject\(/,
    sole: false,
    description: 'toMatchObject used where toStrictEqual may be appropriate',
  },
];

/**
 * Multi-line patterns that require scanning the entire file content.
 * These detect patterns that span multiple lines.
 */
const MULTILINE_PATTERNS = [
  // try { expect } without rethrow — blocking
  {
    type: 'conditional-skip',
    severity: 'blocking',
    regex: /try\s*\{[^}]*expect[^}]*\}\s*catch\s*[^{]*\{[^}]*\}/s,
    description: 'try { expect } without rethrow in catch',
  },
  // if (x) { expect } without else — blocking
  {
    type: 'conditional-skip',
    severity: 'blocking',
    regex: /if\s*\([^)]+\)\s*\{[^}]*expect[^}]*\}(?!\s*else)/s,
    description: 'if (x) { expect } without else branch',
  },
];

/**
 * Count the number of `expect(` occurrences in a string.
 */
function countExpects(text) {
  let count = 0;
  let idx = 0;
  while ((idx = text.indexOf('expect(', idx)) !== -1) {
    count++;
    idx += 7;
  }
  return count;
}

/**
 * Scan an array of file objects for gaming violations.
 *
 * @param {Array<{path: string, content: string}>} files
 * @returns {Promise<Array<{type: string, severity: string, file: string, line: number, matched: string}>>}
 */
export async function detectGaming(files) {
  const violations = [];

  for (const { path: filePath, content } of files) {
    const lines = content.split('\n');
    const expectCount = countExpects(content);

    // Line-by-line pattern matching
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const rule of PATTERNS) {
        const match = line.match(rule.regex);
        if (!match) continue;

        // If this is a sole-assertion rule, only fire when there's exactly one expect
        if (rule.sole && expectCount !== 1) continue;

        violations.push({
          type: rule.type,
          severity: rule.severity,
          file: filePath,
          line: i + 1,
          matched: match[0],
        });
      }
    }

    // Multi-line pattern matching
    for (const rule of MULTILINE_PATTERNS) {
      const match = content.match(rule.regex);
      if (!match) continue;

      // Find the line number of the match
      const matchIndex = content.indexOf(match[0]);
      const linesBefore = content.slice(0, matchIndex).split('\n');
      const lineNumber = linesBefore.length;

      violations.push({
        type: rule.type,
        severity: rule.severity,
        file: filePath,
        line: lineNumber,
        matched: match[0].slice(0, 80).replace(/\n/g, ' '),
      });
    }
  }

  return violations;
}
