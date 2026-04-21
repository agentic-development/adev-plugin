/**
 * Cross-Strategy Gaming Pattern Detection
 *
 * Detects universal test gaming patterns that apply regardless of strategy type.
 * Each pattern exposes a `detect(content)` function returning violation objects.
 */

const MAX_FILE_SIZE = 500 * 1024; // 500 KB

// ---------------------------------------------------------------------------
// Helper: find all line numbers where a regex matches
// ---------------------------------------------------------------------------

/**
 * @param {string} content
 * @param {RegExp} re - must have the `g` flag
 * @returns {{ line: number, match: string }[]}
 */
function lineMatches(content, re) {
  const lines = content.split('\n');
  const results = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (m) {
      results.push({ line: i + 1, match: m[0] });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Helper: extract balanced-brace blocks that start after a trigger pattern
// ---------------------------------------------------------------------------

/**
 * Given content and a start index pointing to `{`, extract the substring from
 * `{` to the matching `}`.  Returns null if unbalanced.
 * @param {string} content
 * @param {number} openIdx - index of the opening `{`
 * @returns {{ body: string, endIdx: number } | null}
 */
function extractBlock(content, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < content.length; i++) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') {
      depth--;
      if (depth === 0) return { body: content.slice(openIdx + 1, i), endIdx: i };
    }
  }
  return null;
}

// Detects assertion-like calls within a block body.
const ASSERTION_RE = /\b(?:assert|expect|should|assertEquals|assertEqual)\b/;

// ---------------------------------------------------------------------------
// Pattern 1: DISABLED_TESTS
// ---------------------------------------------------------------------------

const DISABLED_TESTS = {
  id: 'DISABLED_TESTS',
  name: 'Disabled Tests',
  description:
    'Detects tests that are skipped or marked todo. Skipped tests do not exercise code and silently reduce coverage.',

  detect(content) {
    const SKIP_RE = /\.skip\(|xit\(|xdescribe\(|\.todo\(|test\.skip\(|it\.skip\(|describe\.skip\(/;
    const lines = content.split('\n');
    const violations = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(SKIP_RE);
      if (m) {
        violations.push({
          line: i + 1,
          match: m[0],
          message: `Disabled test found: ${m[0]}`,
        });
      }
    }
    return violations;
  },
};

// ---------------------------------------------------------------------------
// Pattern 2: EMPTY_ASSERTIONS
// ---------------------------------------------------------------------------

const EMPTY_ASSERTIONS = {
  id: 'EMPTY_ASSERTIONS',
  name: 'Empty Assertions',
  description:
    'Detects test functions that contain no assertion calls. A test without assertions always passes without verifying behaviour.',

  detect(content) {
    // Match test/it/describe block openers and scan their bodies.
    const TEST_OPEN_RE = /\b(?:test|it|describe)\s*\(/g;
    const violations = [];
    let m;

    while ((m = TEST_OPEN_RE.exec(content)) !== null) {
      // Find the callback's opening `{` — skip past the description string arg.
      const afterCall = content.indexOf('{', m.index + m[0].length);
      if (afterCall === -1) continue;

      const block = extractBlock(content, afterCall);
      if (!block) continue;

      if (!ASSERTION_RE.test(block.body)) {
        // Determine line number of the opener.
        const lineNum = content.slice(0, m.index).split('\n').length;
        violations.push({
          line: lineNum,
          match: m[0].trimEnd(),
          message: 'Test block contains no assertion calls',
        });
      }

      // Advance past this block to avoid re-scanning nested describes.
      TEST_OPEN_RE.lastIndex = block.endIdx + 1;
    }

    return violations;
  },
};

// ---------------------------------------------------------------------------
// Pattern 3: SWALLOWED_ASSERTIONS
// ---------------------------------------------------------------------------

const SWALLOWED_ASSERTIONS = {
  id: 'SWALLOWED_ASSERTIONS',
  name: 'Swallowed Assertions',
  description:
    'Detects try/catch blocks where the catch clause is empty or does not rethrow, which silently hides assertion failures.',

  detect(content) {
    const TRY_RE = /\btry\s*\{/g;
    const violations = [];
    let m;

    while ((m = TRY_RE.exec(content)) !== null) {
      const tryOpenIdx = content.indexOf('{', m.index);
      if (tryOpenIdx === -1) continue;

      const tryBlock = extractBlock(content, tryOpenIdx);
      if (!tryBlock) continue;

      // Only flag if the try body contains an assertion.
      if (!ASSERTION_RE.test(tryBlock.body)) {
        TRY_RE.lastIndex = tryBlock.endIdx + 1;
        continue;
      }

      // Find the catch clause immediately after the try block.
      const afterTry = tryBlock.endIdx + 1;
      const catchMatch = content.slice(afterTry, afterTry + 60).match(/^\s*catch\s*\([^)]*\)\s*\{/);
      if (!catchMatch) {
        TRY_RE.lastIndex = afterTry;
        continue;
      }

      const catchOpenIdx = content.indexOf('{', afterTry + catchMatch.index);
      if (catchOpenIdx === -1) {
        TRY_RE.lastIndex = afterTry;
        continue;
      }

      const catchBlock = extractBlock(content, catchOpenIdx);
      if (!catchBlock) {
        TRY_RE.lastIndex = afterTry;
        continue;
      }

      const catchBody = catchBlock.body.trim();
      const hasThrow = /\bthrow\b/.test(catchBody);

      if (!hasThrow) {
        const lineNum = content.slice(0, m.index).split('\n').length;
        violations.push({
          line: lineNum,
          match: 'try {',
          message: 'Assertion inside try block with catch that does not rethrow — assertion failure is swallowed',
        });
      }

      TRY_RE.lastIndex = catchBlock.endIdx + 1;
    }

    return violations;
  },
};

// ---------------------------------------------------------------------------
// Pattern 4: CONDITIONAL_ASSERTIONS
// ---------------------------------------------------------------------------

const CONDITIONAL_ASSERTIONS = {
  id: 'CONDITIONAL_ASSERTIONS',
  name: 'Conditional Assertions',
  description:
    'Detects if blocks that contain assertion calls but lack a corresponding else branch that also asserts or throws. The test may pass vacuously when the condition is false.',

  detect(content) {
    const IF_RE = /\bif\s*\(/g;
    const violations = [];
    let m;

    while ((m = IF_RE.exec(content)) !== null) {
      // Find the opening `{` of the if body.
      const openIdx = content.indexOf('{', m.index + m[0].length - 1);
      if (openIdx === -1) continue;

      const ifBlock = extractBlock(content, openIdx);
      if (!ifBlock) continue;

      // Only flag if-block that actually contains an assertion.
      if (!ASSERTION_RE.test(ifBlock.body)) {
        IF_RE.lastIndex = ifBlock.endIdx + 1;
        continue;
      }

      // Check for else branch immediately after the if block.
      const afterIf = ifBlock.endIdx + 1;
      const elseMatch = content.slice(afterIf, afterIf + 20).match(/^\s*else\s*[\{(]/);

      if (!elseMatch) {
        const lineNum = content.slice(0, m.index).split('\n').length;
        violations.push({
          line: lineNum,
          match: 'if (',
          message: 'Assertion inside if block with no else branch — test may pass vacuously when condition is false',
        });
        IF_RE.lastIndex = ifBlock.endIdx + 1;
        continue;
      }

      // Inspect the else body for assertions or throws.
      const elseBodyStart = content.indexOf('{', afterIf + elseMatch.index);
      if (elseBodyStart === -1) {
        IF_RE.lastIndex = ifBlock.endIdx + 1;
        continue;
      }

      const elseBlock = extractBlock(content, elseBodyStart);
      if (!elseBlock) {
        IF_RE.lastIndex = ifBlock.endIdx + 1;
        continue;
      }

      const elseHasAssertion = ASSERTION_RE.test(elseBlock.body) || /\bthrow\b/.test(elseBlock.body);

      if (!elseHasAssertion) {
        const lineNum = content.slice(0, m.index).split('\n').length;
        violations.push({
          line: lineNum,
          match: 'if (',
          message: 'Assertion inside if block but else branch contains no assertion or throw',
        });
      }

      IF_RE.lastIndex = (elseBlock ? elseBlock.endIdx : ifBlock.endIdx) + 1;
    }

    return violations;
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** All shared gaming patterns. */
export const SHARED_PATTERNS = [DISABLED_TESTS, EMPTY_ASSERTIONS, SWALLOWED_ASSERTIONS, CONDITIONAL_ASSERTIONS];

/**
 * Run all shared gaming patterns against a test file's content.
 *
 * @param {string} testFileContent
 * @returns {{ violations: Array<{ patternId: string, prefix: 'SHARED', line: number, match: string, message: string }>, clean: boolean }}
 */
export function detectSharedGamingPatterns(testFileContent) {
  if (Buffer.byteLength(testFileContent, 'utf8') > MAX_FILE_SIZE) {
    return {
      violations: [],
      clean: true,
      skipped: true,
      skipReason: 'File exceeds 500 KB size limit — skipped',
    };
  }

  const violations = [];

  for (const pattern of SHARED_PATTERNS) {
    const found = pattern.detect(testFileContent);
    for (const v of found) {
      violations.push({ patternId: pattern.id, prefix: 'SHARED', ...v });
    }
  }

  return { violations, clean: violations.length === 0 };
}
