import { test } from 'node:test';
import assert from 'node:assert/strict';

import { REVIEW_ROUND_STAGES, buildReviewRoundTrailer } from '../../lib/lifecycle-state.mjs';

/** The three legal stages, asserted intact after every enum-widening simulation. */
const LEGAL_STAGES = ['spec-compliance', 'code-quality', 'synthesized'];

test('buildReviewRoundTrailer emits one Review-round line per stage', () => {
  assert.equal(buildReviewRoundTrailer('spec-compliance', 2), 'Review-round: spec-compliance=2');
  assert.equal(buildReviewRoundTrailer('code-quality', 1), 'Review-round: code-quality=1');
  assert.equal(buildReviewRoundTrailer('synthesized', 3), 'Review-round: synthesized=3');
});

test('buildReviewRoundTrailer encodes first-pass positively as =1', () => {
  assert.equal(buildReviewRoundTrailer('code-quality', 1), 'Review-round: code-quality=1');
});

test('buildReviewRoundTrailer rejects embedded CR/LF (no forged extra trailer line)', () => {
  for (const stage of ['code-quality\nReview-round: spec-compliance=9',
                       'code-quality\r\nSpec: evil.spec.md',
                       'code-quality\r']) {
    assert.throws(() => buildReviewRoundTrailer(stage, 1),
      (err) => /stage/i.test(err.message), `expected refusal for ${JSON.stringify(stage)}`);
  }
});

test('buildReviewRoundTrailer rejects control and ANSI escape sequences', () => {
  // Written with explicit escapes so the bytes survive copy/paste: ESC-CSI colour,
  // BEL, DEL, an ESC-OSC window-title sequence, a C1 8-bit CSI, and NUL.
  for (const stage of ['code-quality\u001b[31m', 'code-\u0007quality', 'code-quality\u007f',
                       'code-quality\u001b]0;title', 'code-quality\u009b31m', 'code\u0000-quality']) {
    assert.throws(() => buildReviewRoundTrailer(stage, 1),
      (err) => err.code === 'EVENT_SCHEMA_INVALID' && /stage/i.test(err.message),
      `expected refusal for ${JSON.stringify(stage)}`);
  }
});

test('buildReviewRoundTrailer enforces a hard length cap on <stage>=<cycles>', () => {
  // The stage half: out of enum AND over cap. Either refusal is correct.
  assert.throws(() => buildReviewRoundTrailer('c'.repeat(500), 1), (e) => /stage|length|cap/i.test(e.message));
  // The cycles half: 1e40 passes Number.isInteger and >= 1, so ONLY the length cap
  // rejects it. The cap-violation message must still name `cycles`.
  assert.throws(() => buildReviewRoundTrailer('code-quality', 10 ** 40), (e) => /cycles/i.test(e.message));
  assert.throws(() => buildReviewRoundTrailer('code-quality', Number.MAX_SAFE_INTEGER), (e) => /cycles/i.test(e.message));
});

test('buildReviewRoundTrailer rejects an out-of-enum stage', () => {
  // Strings only. A non-string never reaches the enum guard, so it is pinned
  // separately below rather than folded in here where it would pass on the
  // accident of the type-gate message also containing the word "stage".
  for (const stage of ['sanity-check', 'Code-Quality', 'code_quality', '', ' code-quality']) {
    assert.throws(() => buildReviewRoundTrailer(stage, 1),
      (e) => e.code === 'EVENT_SCHEMA_INVALID' && /must be one of/.test(e.message),
      `expected the enum refusal for ${JSON.stringify(stage)}`);
  }
});

test('buildReviewRoundTrailer type-gates a non-string stage before any string op', () => {
  // The type gate is its own guard: it fires before the enum check so that no
  // refusal message is ever built from a coerced value. Pinned independently.
  for (const stage of [null, undefined, 42, true, {}, [], Symbol('code-quality'),
                       { toString: () => 'code-quality' },
                       { [Symbol.toPrimitive]: () => 'code-quality' }]) {
    assert.throws(() => buildReviewRoundTrailer(stage, 1),
      (e) => e.code === 'EVENT_SCHEMA_INVALID' && /requires stage as a string/.test(e.message),
      `expected the type-gate refusal for ${String(typeof stage)}`);
  }
});

test('buildReviewRoundTrailer rejects non-integer or < 1 cycles without coercing', () => {
  for (const cycles of [0, -1, 1.5, '2', Number.NaN, Number.POSITIVE_INFINITY, null, undefined]) {
    assert.throws(() => buildReviewRoundTrailer('code-quality', cycles),
      (e) => /cycles/i.test(e.message), `expected refusal for ${String(cycles)}`);
  }
});

test('a rejected value is never silently rewritten into a valid trailer', () => {
  let emitted = null;
  try { emitted = buildReviewRoundTrailer('code-quality', '2'); } catch { /* expected */ }
  assert.equal(emitted, null, 'refusal, not coercion to cycles=2');
});

test('the emitted line is a single line with exactly one key=value pair', () => {
  const line = buildReviewRoundTrailer('code-quality', 2);
  assert.equal(line.split('\n').length, 1);
  assert.equal((line.match(/=/g) ?? []).length, 1);
  assert.match(line, /^Review-round: [a-z-]+=[0-9]+$/);
});

// ── Added beyond the handoff floor ─────────────────────────────────────────

test('every refusal carries the EVENT_SCHEMA_INVALID code, matching reportReviewRound', () => {
  const cases = [
    ['sanity-check', 1],
    ['code-quality\nReview-round: spec-compliance=9', 1],
    ['code-quality\u001b[31m', 1],
    ['c'.repeat(500), 1],
    [null, 1],
    [42, 1],
    ['code-quality', 0],
    ['code-quality', -1],
    ['code-quality', 1.5],
    ['code-quality', '2'],
    ['code-quality', Number.NaN],
    ['code-quality', Number.POSITIVE_INFINITY],
    ['code-quality', null],
    ['code-quality', undefined],
    ['code-quality', 10 ** 40],
    ['code-quality', Number.MAX_SAFE_INTEGER],
  ];
  for (const [stage, cycles] of cases) {
    assert.throws(() => buildReviewRoundTrailer(stage, cycles),
      (err) => err.code === 'EVENT_SCHEMA_INVALID',
      `expected EVENT_SCHEMA_INVALID for (${JSON.stringify(stage)}, ${String(cycles)})`);
  }
});

test('integer-guard-passing giants are refused with a message naming cycles', () => {
  // Each of these satisfies Number.isInteger(c) && c >= 1, so only the cycles
  // cap stands between them and a permanent commit trailer.
  const giants = [
    Number.MAX_SAFE_INTEGER + 1,
    2 ** 53,
    10 ** 21,   // String() renders this as "1e+21", not digits
    10 ** 40,
    Number.MAX_VALUE,
    1234567,    // one digit past the bound, the nearest-miss case
  ];
  for (const cycles of giants) {
    assert.throws(() => buildReviewRoundTrailer('code-quality', cycles),
      (err) => /cycles/i.test(err.message) && err.code === 'EVENT_SCHEMA_INVALID',
      `expected a cycles-named refusal for ${String(cycles)}`);
  }
  // The bound itself still passes, so the cap is a bound and not an off-by-one.
  assert.equal(buildReviewRoundTrailer('code-quality', 999999), 'Review-round: code-quality=999999');
});

test('the emitted line has no leading or trailing whitespace', () => {
  for (const stage of ['spec-compliance', 'code-quality', 'synthesized']) {
    const line = buildReviewRoundTrailer(stage, 7);
    assert.equal(line, line.trim(), `unexpected surrounding whitespace in ${JSON.stringify(line)}`);
    assert.doesNotMatch(line, /\s$/);
  }
});

test('escapeField-style normalization does NOT happen — CR/LF throws, not space-substituted', () => {
  // escapeField() rewrites \r\n -> \n -> " " in an inline slot and truncates at a
  // cap. Output Contract A requires refusal instead, so a normalized-but-emitted
  // line is a contract violation even though it would look well-formed.
  const forged = 'code-quality\r\nReview-round: spec-compliance=9';
  let emitted = null;
  try { emitted = buildReviewRoundTrailer(forged, 1); } catch { /* expected */ }
  assert.equal(emitted, null,
    'CR/LF must raise; it must not be collapsed to a space and emitted');
  // And the same for an over-cap stage: refusal, never truncation to a legal prefix.
  let truncated = null;
  try { truncated = buildReviewRoundTrailer(`code-quality${'x'.repeat(500)}`, 1); } catch { /* expected */ }
  assert.equal(truncated, null, 'over-cap input must raise, never be truncated into a valid line');
});

test('no emitted line can carry a second Review-round: occurrence or ESC byte', () => {
  for (const stage of ['spec-compliance', 'code-quality', 'synthesized']) {
    for (const cycles of [1, 2, 42, 999999]) {
      const line = buildReviewRoundTrailer(stage, cycles);
      assert.equal((line.match(/Review-round:/g) ?? []).length, 1);
      assert.doesNotMatch(line, /[\u0000-\u001f\u007f-\u009f]/);
    }
  }
});

// ── Reaching the defence-in-depth guards ───────────────────────────────────
//
// The CR/LF sweep, the control/ANSI sweep, and the lowercase-hyphen shape check
// sit BEHIND the enum guard, so for any out-of-enum input execution short-circuits
// and never reaches them: every hostile string in the tests above is also
// out-of-enum. Those three guards exist solely to survive a future widening of
// REVIEW_ROUND_STAGES, and the ONLY reachable path to them is to make the stage
// in-enum. So these tests simulate exactly that widening: `REVIEW_ROUND_STAGES` is
// exported, and `Object.freeze(new Set(...))` freezes the Set object but NOT its
// contents, so a hostile member can be inserted for the duration of one call.
// Without this, all three guards could be deleted with every other test passing.
//
// The mutation is restored in a `finally` and the restoration is asserted, so it
// cannot leak into sibling tests regardless of how the assertion inside fails.

/** ESC, built at runtime so no raw control byte lives in this source file. */
const ESC = String.fromCharCode(0x1b);

/**
 * Run `fn` with `hostile` temporarily inserted into the exported stage enum,
 * then restore the enum to exactly the three legal members.
 */
function withWidenedEnum(hostile, fn) {
  assert.equal(REVIEW_ROUND_STAGES.has(hostile), false, 'fixture must start out-of-enum');
  REVIEW_ROUND_STAGES.add(hostile);
  try {
    fn();
  } finally {
    REVIEW_ROUND_STAGES.delete(hostile);
  }
  assert.deepEqual([...REVIEW_ROUND_STAGES], LEGAL_STAGES,
    'the enum must be restored to exactly its three legal members');
}

test('the CR/LF guard fires for an in-enum stage (simulated enum widening)', () => {
  const hostile = 'code-quality\r\nSpec: evil.spec.md';
  withWidenedEnum(hostile, () => {
    assert.throws(() => buildReviewRoundTrailer(hostile, 1),
      (err) => err.code === 'EVENT_SCHEMA_INVALID'
        && /would forge an additional trailer line/.test(err.message),
      'a widened enum must not let CR/LF through, and must say why');
  });
});

test('the control/ANSI guard fires for an in-enum stage (simulated enum widening)', () => {
  // No CR/LF, so the previous guard passes and this one is the first to fire.
  const hostile = `code-quality${ESC}[31m`;
  withWidenedEnum(hostile, () => {
    assert.throws(() => buildReviewRoundTrailer(hostile, 1),
      (err) => err.code === 'EVENT_SCHEMA_INVALID'
        && /control or ANSI escape/.test(err.message),
      'a widened enum must not let ESC bytes through, and must say why');
  });
});

test('the lowercase-hyphen shape guard fires for an in-enum stage (simulated widening)', () => {
  // A plain space: not CR/LF, not a control character, so only the shape
  // allow-list stands between it and an emitted trailer line.
  const hostile = 'code quality';
  withWidenedEnum(hostile, () => {
    assert.throws(() => buildReviewRoundTrailer(hostile, 1),
      (err) => err.code === 'EVENT_SCHEMA_INVALID'
        && /lowercase-hyphen shape/.test(err.message),
      'a widened enum must still be shape-checked');
  });
});

test('the three guards produce three distinct messages (message granularity)', () => {
  // Why four layers for one payload: the shape allow-list already subsumes the two
  // sweeps, so the sweeps buy DIAGNOSTIC granularity, not extra coverage. This
  // pins that granularity — collapsing any sweep into the shape check would make
  // two of these messages identical.
  const messages = [];
  for (const hostile of ['code-quality\r\nx', `code-quality${ESC}[31m`, 'code quality']) {
    withWidenedEnum(hostile, () => {
      try {
        buildReviewRoundTrailer(hostile, 1);
        assert.fail(`expected a refusal for ${JSON.stringify(hostile)}`);
      } catch (err) {
        messages.push(err.message);
      }
    });
  }
  assert.equal(new Set(messages).size, 3, `expected 3 distinct messages, got ${messages.length}`);
});

test('a widened enum still emits normally for a well-formed added stage', () => {
  // The guards refuse hostile bytes, not new stages: widening the enum with a
  // legal label must keep working, or the layers would be blocking the very
  // extension they were retained to protect.
  withWidenedEnum('design-review', () => {
    assert.equal(buildReviewRoundTrailer('design-review', 4), 'Review-round: design-review=4');
  });
});
