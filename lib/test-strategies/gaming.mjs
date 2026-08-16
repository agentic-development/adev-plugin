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
// Helper: tokenizer-lite literal masking
// ---------------------------------------------------------------------------

/*
 * Every block-boundary pattern below matches regexes against the source and
 * counts braces to find block bodies. Doing that against raw source produces
 * false positives in two independent ways:
 *
 *   1. Prose inside a comment can look like a trigger — "…exclude it (+ the
 *      manifest)…" reads as an `it(` test-block opener.
 *   2. An unbalanced `{` inside a string literal shifts every subsequent
 *      block boundary, so a block appears to close before its assertions.
 *
 * `maskLiterals` neutralises both at once: it returns a string of exactly the
 * same length as the source in which the interiors *and* delimiters of
 * comments, string literals, template literals and regex literals are
 * replaced by spaces. Newlines are preserved, so every index and every line
 * number in the mask maps 1:1 onto the original source.
 *
 * These detectors gate a hard-blocking PreToolUse hook, where a false positive
 * stops an edit outright and the cheapest way out for an agent is to reword
 * the assertion until the gate goes quiet — indistinguishable from the gaming
 * this module exists to prevent. Precision therefore outranks recall, which
 * drives two deliberate choices:
 *
 *   - If the scan ends inside an unterminated construct the mask is not
 *     trustworthy, so `maskLiterals` returns null and every block-based
 *     detector fails open (returns no violations) rather than guessing.
 *   - Masked text is used only where a match *causes* a violation. Where a
 *     match *suppresses* one (an assertion present, a `throw` in a catch),
 *     the raw source is used, so masking can never manufacture a violation
 *     that the raw source would not have produced.
 */

/** Identifiers after which a `/` begins a regex literal, not a division. */
const REGEX_PRECEDING_KEYWORDS = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
  'throw', 'case', 'do', 'else', 'yield', 'await',
]);

const IDENT_CHAR_RE = /[A-Za-z0-9_$]/;

/**
 * Blank out comments, strings, template literals and regex literals,
 * preserving length and newline positions.
 *
 * @param {string} src
 * @returns {string|null} the mask, or null when the source could not be
 *   tokenised confidently (unterminated string/comment/regex/template).
 */
export function maskLiterals(src) {
  const n = src.length;
  const out = src.split('');
  /** Saved brace depths for each `${` interpolation we are nested inside. */
  const interpolationStack = [];
  let braceDepth = 0;
  let inTemplate = false;
  // Whether the previous significant token produced a value. A `/` after a
  // value is division; a `/` anywhere else opens a regex literal.
  let prevIsValue = false;
  let i = 0;

  const blank = (from, to) => {
    for (let k = from; k < to && k < n; k++) {
      if (out[k] !== '\n') out[k] = ' ';
    }
  };

  while (i < n) {
    const c = src[i];

    // --- inside a template literal's text portion --------------------------
    if (inTemplate) {
      if (c === '\\') {
        blank(i, i + 2);
        i += 2;
        continue;
      }
      if (c === '`') {
        blank(i, i + 1);
        i += 1;
        inTemplate = false;
        prevIsValue = true;
        continue;
      }
      if (c === '$' && src[i + 1] === '{') {
        // Interpolated code is real code: stop masking and tokenise it.
        blank(i, i + 2);
        interpolationStack.push(braceDepth);
        braceDepth = 0;
        inTemplate = false;
        prevIsValue = false;
        i += 2;
        continue;
      }
      blank(i, i + 1);
      i += 1;
      continue;
    }

    // --- code -------------------------------------------------------------
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
      i++;
      continue;
    }

    if (c === '/' && src[i + 1] === '/') {
      let end = src.indexOf('\n', i);
      if (end === -1) end = n;
      blank(i, end);
      i = end;
      continue;
    }

    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end === -1) return null;
      blank(i, end + 2);
      i = end + 2;
      continue;
    }

    if (c === "'" || c === '"') {
      let j = i + 1;
      let closed = false;
      while (j < n) {
        const d = src[j];
        if (d === '\\') {
          j += 2;
          continue;
        }
        // A raw newline inside a quoted string means we mis-tokenised
        // somewhere upstream; refuse to trust the mask.
        if (d === '\n') return null;
        if (d === c) {
          closed = true;
          break;
        }
        j++;
      }
      if (!closed) return null;
      blank(i, j + 1);
      i = j + 1;
      prevIsValue = true;
      continue;
    }

    if (c === '`') {
      blank(i, i + 1);
      i += 1;
      inTemplate = true;
      continue;
    }

    if (c === '/' && !prevIsValue) {
      let j = i + 1;
      let inCharClass = false;
      let closed = false;
      while (j < n) {
        const d = src[j];
        if (d === '\\') {
          j += 2;
          continue;
        }
        if (d === '\n') break;
        if (inCharClass) {
          if (d === ']') inCharClass = false;
        } else if (d === '[') {
          inCharClass = true;
        } else if (d === '/') {
          closed = true;
          break;
        }
        j++;
      }
      if (!closed) return null;
      let end = j + 1;
      while (end < n && /[a-z]/i.test(src[end])) end++;
      blank(i, end);
      i = end;
      prevIsValue = true;
      continue;
    }

    if (c === '{') {
      braceDepth++;
      prevIsValue = false;
      i++;
      continue;
    }

    if (c === '}') {
      if (braceDepth === 0 && interpolationStack.length > 0) {
        // Closes a `${…}` — resume masking the enclosing template literal.
        blank(i, i + 1);
        braceDepth = interpolationStack.pop();
        inTemplate = true;
        i++;
        continue;
      }
      braceDepth--;
      prevIsValue = false;
      i++;
      continue;
    }

    if (IDENT_CHAR_RE.test(c)) {
      let j = i;
      while (j < n && IDENT_CHAR_RE.test(src[j])) j++;
      prevIsValue = !REGEX_PRECEDING_KEYWORDS.has(src.slice(i, j));
      i = j;
      continue;
    }

    // Postfix `++` / `--` yield a value.
    if ((c === '+' || c === '-') && src[i + 1] === c) {
      prevIsValue = true;
      i += 2;
      continue;
    }

    if (c === ')' || c === ']') {
      prevIsValue = true;
      i++;
      continue;
    }

    prevIsValue = false;
    i++;
  }

  if (inTemplate || interpolationStack.length > 0) return null;
  return out.join('');
}

// Single-entry memo: the gate runs every detector over the same before/after
// content, and each detector needs the same mask.
let maskCache = { src: null, mask: null };

/**
 * @param {string} content
 * @returns {string|null}
 */
function getMask(content) {
  if (maskCache.src === content) return maskCache.mask;
  const mask = maskLiterals(content);
  maskCache = { src: content, mask };
  return mask;
}

// ---------------------------------------------------------------------------
// Helper: extract balanced-brace blocks that start after a trigger pattern
// ---------------------------------------------------------------------------

/**
 * Given content and a start index pointing to `{`, extract the substring from
 * `{` to the matching `}`.  Returns null if unbalanced.
 *
 * Callers pass the masked source so that braces inside strings, comments,
 * template literals and regexes cannot shift the block boundary. `openIdx`
 * and `endIdx` index into the original source identically, so a caller can
 * slice the raw body with `raw.slice(openIdx + 1, endIdx)`.
 *
 * @param {string} content
 * @param {number} openIdx - index of the opening `{`
 * @returns {{ body: string, openIdx: number, endIdx: number } | null}
 */
function extractBlock(content, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < content.length; i++) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') {
      depth--;
      if (depth === 0) return { body: content.slice(openIdx + 1, i), openIdx, endIdx: i };
    }
  }
  return null;
}

/**
 * The block's body as it appears in the original, unmasked source. Used for
 * checks that *suppress* a violation, so masking can never create one.
 * @param {string} raw
 * @param {{ openIdx: number, endIdx: number }} block
 * @returns {string}
 */
function rawBody(raw, block) {
  return raw.slice(block.openIdx + 1, block.endIdx);
}

/**
 * Index of the `)` matching the `(` that opens at `openParenIdx - 1`.
 *
 * Callers pass the masked source, so parentheses inside strings, comments and
 * regexes are already gone. Without this, a trigger's "body" was resolved with
 * a bare `indexOf('{')`, which walks past the end of the construct: a braceless
 * `if (!x) return;` would adopt the next unrelated block in the file as its
 * body and report that block's missing else. Returns -1 when unbalanced.
 *
 * @param {string} content
 * @param {number} afterOpenIdx - index just past the opening `(`
 * @returns {number}
 */
function matchingParen(content, afterOpenIdx) {
  let depth = 1;
  for (let i = afterOpenIdx; i < content.length; i++) {
    if (content[i] === '(') depth++;
    else if (content[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
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
    // Scan the mask, not the raw source: an `it (` inside comment prose is not
    // a test opener, and a stray `{` inside a string must not move the block
    // boundary. A mask we could not trust means no violations (fail open).
    const masked = getMask(content);
    if (masked === null) return [];

    // Match test/it/describe block openers and scan their bodies.
    const TEST_OPEN_RE = /\b(?:test|it|describe)\s*\(/g;
    const violations = [];
    let m;

    while ((m = TEST_OPEN_RE.exec(masked)) !== null) {
      // The callback's `{` must live inside this call's own argument list.
      // Searching the whole file would let `test.todo('x')` or an
      // expression-bodied `test('x', () => assert.ok(1))` adopt some later,
      // unrelated block as its body.
      const callEnd = matchingParen(masked, m.index + m[0].length);
      if (callEnd === -1) continue;

      // Find the callback's opening `{` — skip past the description string arg.
      const afterCall = masked.indexOf('{', m.index + m[0].length);
      if (afterCall === -1 || afterCall > callEnd) {
        TEST_OPEN_RE.lastIndex = callEnd + 1;
        continue;
      }

      const block = extractBlock(masked, afterCall);
      if (!block) continue;

      // An assertion present suppresses the violation, so look for one in the
      // raw body: a test whose assertions live inside an embedded fixture
      // string is not what this pattern is hunting.
      if (!ASSERTION_RE.test(rawBody(content, block))) {
        // Determine line number of the opener.
        const lineNum = masked.slice(0, m.index).split('\n').length;
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
    const masked = getMask(content);
    if (masked === null) return [];

    const TRY_RE = /\btry\s*\{/g;
    const violations = [];
    let m;

    while ((m = TRY_RE.exec(masked)) !== null) {
      const tryOpenIdx = masked.indexOf('{', m.index);
      if (tryOpenIdx === -1) continue;

      const tryBlock = extractBlock(masked, tryOpenIdx);
      if (!tryBlock) continue;

      // Only flag if the try body contains an assertion. This *causes* the
      // violation, so require a real one — not one quoted inside a string.
      if (!ASSERTION_RE.test(tryBlock.body)) {
        TRY_RE.lastIndex = tryBlock.endIdx + 1;
        continue;
      }

      // Find the catch clause immediately after the try block.
      const afterTry = tryBlock.endIdx + 1;
      const catchMatch = masked.slice(afterTry, afterTry + 60).match(/^\s*catch\s*\([^)]*\)\s*\{/);
      if (!catchMatch) {
        TRY_RE.lastIndex = afterTry;
        continue;
      }

      const catchOpenIdx = masked.indexOf('{', afterTry + catchMatch.index);
      if (catchOpenIdx === -1) {
        TRY_RE.lastIndex = afterTry;
        continue;
      }

      const catchBlock = extractBlock(masked, catchOpenIdx);
      if (!catchBlock) {
        TRY_RE.lastIndex = afterTry;
        continue;
      }

      // A rethrow *suppresses* the violation, so read the raw catch body.
      const catchBody = rawBody(content, catchBlock).trim();
      const hasThrow = /\bthrow\b/.test(catchBody);

      if (!hasThrow) {
        const lineNum = masked.slice(0, m.index).split('\n').length;
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
    const masked = getMask(content);
    if (masked === null) return [];

    const IF_RE = /\bif\s*\(/g;
    const violations = [];
    let m;

    while ((m = IF_RE.exec(masked)) !== null) {
      // The body must be a brace block that directly follows the condition.
      // A braceless `if (!x) return;` has no block of its own, and adopting
      // the next `{` in the file reports that unrelated block's missing else.
      const condEnd = matchingParen(masked, m.index + m[0].length);
      if (condEnd === -1) continue;

      let openIdx = condEnd + 1;
      while (openIdx < masked.length && /\s/.test(masked[openIdx])) openIdx++;
      if (masked[openIdx] !== '{') {
        IF_RE.lastIndex = condEnd + 1;
        continue;
      }

      const ifBlock = extractBlock(masked, openIdx);
      if (!ifBlock) continue;

      // Only flag if-block that actually contains an assertion. This *causes*
      // the violation, so require a real one, not one quoted in a string.
      if (!ASSERTION_RE.test(ifBlock.body)) {
        IF_RE.lastIndex = ifBlock.endIdx + 1;
        continue;
      }

      // Check for else branch immediately after the if block.
      const afterIf = ifBlock.endIdx + 1;
      const elseMatch = masked.slice(afterIf, afterIf + 20).match(/^\s*else\s*[\{(]/);

      if (!elseMatch) {
        const lineNum = masked.slice(0, m.index).split('\n').length;
        violations.push({
          line: lineNum,
          match: 'if (',
          message: 'Assertion inside if block with no else branch — test may pass vacuously when condition is false',
        });
        IF_RE.lastIndex = ifBlock.endIdx + 1;
        continue;
      }

      // Inspect the else body for assertions or throws.
      const elseBodyStart = masked.indexOf('{', afterIf + elseMatch.index);
      if (elseBodyStart === -1) {
        IF_RE.lastIndex = ifBlock.endIdx + 1;
        continue;
      }

      const elseBlock = extractBlock(masked, elseBodyStart);
      if (!elseBlock) {
        IF_RE.lastIndex = ifBlock.endIdx + 1;
        continue;
      }

      // An assertion or throw in the else branch *suppresses* the violation,
      // so read the raw body.
      const elseRaw = rawBody(content, elseBlock);
      const elseHasAssertion = ASSERTION_RE.test(elseRaw) || /\bthrow\b/.test(elseRaw);

      if (!elseHasAssertion) {
        const lineNum = masked.slice(0, m.index).split('\n').length;
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
// Integration-specific gaming patterns
// ---------------------------------------------------------------------------

/**
 * BOUNDARY_MOCKING: Detects jest.mock / sinon.stub / nock calls targeting
 * known infrastructure SDK module paths or driver objects.
 * Uses line-pattern matching on import path strings and stub targets.
 */
const BOUNDARY_MOCKING = {
  id: 'BOUNDARY_MOCKING',
  name: 'Boundary Mocking',
  description:
    'Detects mocking of the specific external system that the module under test wraps. Using jest.mock, nock, sinon.stub, or msw to intercept the declared infrastructure boundary is a gaming violation in integration tests.',

  detect(content) {
    // Match jest.mock / vi.mock with SDK/infra module paths
    const MOCK_RE = /(?:jest|vi)\.mock\(\s*['"`]([^'"`]+)['"`]/g;
    const STUB_RE = /sinon\.stub\s*\(\s*(\w+)\s*,\s*['"`](query|send|request|connect|execute)['"`]/g;
    const NOCK_RE = /\bnock\s*\(/g;

    const INFRA_PATHS = [
      /@aws-sdk/, /pg/, /mysql2/, /mongodb/, /ioredis/, /kafkajs/, /amqplib/,
      /stripe/, /twilio/, /sendgrid/, /@google-cloud/, /@azure/,
    ];

    const violations = [];

    let m;
    while ((m = MOCK_RE.exec(content)) !== null) {
      const modulePath = m[1];
      if (INFRA_PATHS.some((re) => re.test(modulePath))) {
        const lineNum = content.slice(0, m.index).split('\n').length;
        violations.push({
          line: lineNum,
          match: m[0].slice(0, 60),
          message: `Boundary mocking detected: mocking infrastructure module '${modulePath}' in an integration test is a gaming violation`,
        });
      }
    }

    while ((m = STUB_RE.exec(content)) !== null) {
      const lineNum = content.slice(0, m.index).split('\n').length;
      violations.push({
        line: lineNum,
        match: m[0].slice(0, 60),
        message: `Boundary mocking detected: sinon.stub on infrastructure driver method '${m[2]}' is a gaming violation`,
      });
    }

    while ((m = NOCK_RE.exec(content)) !== null) {
      const lineNum = content.slice(0, m.index).split('\n').length;
      violations.push({
        line: lineNum,
        match: 'nock(',
        message: 'Boundary mocking detected: nock() intercepts HTTP — use real HTTP calls in integration tests',
      });
    }

    return violations;
  },
};

/**
 * CI_BYPASS: Detects tests that skip execution when process.env.CI is set.
 */
const CI_BYPASS = {
  id: 'CI_BYPASS',
  name: 'CI Bypass',
  description:
    'Detects if (process.env.CI) skip/return patterns. Integration tests must run in CI when credentials are available — bypassing them in CI defeats the purpose of the strategy.',

  detect(content) {
    const CI_RE = /if\s*\(\s*process\.env\.CI\s*\)/g;
    const violations = [];
    let m;
    while ((m = CI_RE.exec(content)) !== null) {
      const lineNum = content.slice(0, m.index).split('\n').length;
      violations.push({
        line: lineNum,
        match: 'if (process.env.CI)',
        message: 'CI bypass detected: integration tests must run in CI when credentials are available',
      });
    }
    return violations;
  },
};

/**
 * CREDENTIAL_ABSENT_PASS: Detects integration tests that use known SDK
 * constructors without any env var guard. Tests that pass without credentials
 * are not exercising the real infrastructure path.
 */
const CREDENTIAL_ABSENT_PASS = {
  id: 'CREDENTIAL_ABSENT_PASS',
  name: 'Credential-Absent Pass',
  description:
    'Detects integration tests that instantiate infrastructure SDK clients without any credential guard. Tests must fail fast with a clear error when required env vars are missing.',

  detect(content) {
    // Look for SDK constructors without a preceding env var guard in the same file
    const SDK_RE = /new\s+(?:S3Client|DynamoDBClient|SQSClient|SNSClient|Client)\s*\(/g;
    const ENV_GUARD_RE = /process\.env\.\w+.*(?:throw|Error|required|missing)/gi;

    // Only flag if the file contains SDK instantiation but no env var guard
    const hasSDKUsage = SDK_RE.test(content);
    SDK_RE.lastIndex = 0; // reset after .test()
    const hasEnvGuard = ENV_GUARD_RE.test(content);

    if (!hasSDKUsage || hasEnvGuard) return [];

    // Find all SDK constructor locations
    const violations = [];
    let m;
    while ((m = SDK_RE.exec(content)) !== null) {
      const lineNum = content.slice(0, m.index).split('\n').length;
      violations.push({
        line: lineNum,
        match: m[0],
        message: 'Credential-absent pass risk: SDK client instantiated without env var guard. Add: if (!process.env.REQUIRED_VAR) throw new Error("... is required")',
      });
    }
    return violations;
  },
};

/**
 * AGENT_SKIP: Detects integration tests that skip when infrastructure is
 * unavailable instead of failing hard. The agent must never add skip guards
 * autonomously — only the user may configure skip behavior via on_fail: skip
 * in the spec's infra_requirements block.
 */
const AGENT_SKIP = {
  id: 'AGENT_SKIP',
  name: 'Agent-Initiated Skip',
  description:
    'Detects skip guards added by the agent to bypass infrastructure unavailability. ' +
    'Integration tests must FAIL (not skip) when infrastructure is down. ' +
    'Only the user may configure skip behavior via on_fail: skip in infra_requirements.',

  detect(content) {
    const violations = [];

    // Pattern 1: describe.skipIf or it.skipIf with infra-related conditions
    const SKIP_IF_RE = /(?:describe|it|test)\.skipIf\s*\(/g;
    let m;
    while ((m = SKIP_IF_RE.exec(content)) !== null) {
      const lineNum = content.slice(0, m.index).split('\n').length;
      violations.push({
        line: lineNum,
        match: m[0],
        message: 'Agent-initiated skip: describe.skipIf detected — integration tests must fail hard, not skip. Only the user may add skip behavior via on_fail: skip.',
      });
    }

    // Pattern 2: canConnect / skipUnless / hasCredentials used as skip condition
    const GUARD_RE = /\b(canConnect|skipUnless|hasCredentials)\b/g;
    while ((m = GUARD_RE.exec(content)) !== null) {
      // Only flag if used in a skip context (not in a comment)
      const lineStart = content.lastIndexOf('\n', m.index) + 1;
      const line = content.slice(lineStart, content.indexOf('\n', m.index));
      const trimmed = line.trimStart();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
      const lineNum = content.slice(0, m.index).split('\n').length;
      violations.push({
        line: lineNum,
        match: m[0],
        message: `Agent-initiated skip: '${m[1]}' guard detected — integration tests must fail hard when infrastructure is unavailable.`,
      });
    }

    // Pattern 3: { skip: '...<infra keyword>...' } option on describe/it
    const SKIP_OPTION_RE = /skip:\s*(?:!?\w+\s*&&\s*)?['"]([^'"]*)['"]/g;
    const INFRA_KEYWORDS = /postgres|database|connect|credential|infra|unavailable|offline|not.?running/i;
    while ((m = SKIP_OPTION_RE.exec(content)) !== null) {
      if (INFRA_KEYWORDS.test(m[1])) {
        const lineNum = content.slice(0, m.index).split('\n').length;
        violations.push({
          line: lineNum,
          match: m[0],
          message: `Agent-initiated skip: infrastructure-conditional skip detected ('${m[1].slice(0, 60)}') — tests must fail hard, not skip.`,
        });
      }
    }

    return violations;
  },
};

/** Integration-specific gaming patterns. */
export const INTEGRATION_PATTERNS = [BOUNDARY_MOCKING, CI_BYPASS, CREDENTIAL_ABSENT_PASS, AGENT_SKIP];

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
