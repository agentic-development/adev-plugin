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
