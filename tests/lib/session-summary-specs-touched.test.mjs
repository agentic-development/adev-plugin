/**
 * issue-564 — `deriveSpecsTouched` unit coverage.
 *
 * Three defects are exercised here:
 *   1. Derivation gap  — `specs-touched` came only from `Spec:` trailers, so a
 *      commit that plainly edited a spec recorded `[]`.
 *   2. Count integrity — one input candidate must yield at most one output
 *      entry; nothing may fabricate extras.
 *   3. Containment     — filtering is an allow-list (positive shape + resolved
 *      containment), not a deny-list on `..` and `/`.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { deriveSpecsTouched } from "../../lib/session-summary.mjs";

const ROOT = "/tmp/adev-derive-specs-root";
const SPEC_A = ".context-index/specs/features/alpha/one.spec.md";
const SPEC_B = ".context-index/specs/features/beta/two.spec.md";

describe("deriveSpecsTouched — derivation (defect 1)", () => {
  it("populates from changed spec paths with no trailer present", () => {
    const out = deriveSpecsTouched({
      changedFiles: [SPEC_A, "src/index.mjs", "README.md"],
      trailers: [],
      projectRoot: ROOT,
    });
    assert.deepEqual(out, [SPEC_A]);
  });

  it("populates from trailers with no changed spec path present", () => {
    const out = deriveSpecsTouched({
      changedFiles: ["src/index.mjs"],
      trailers: [SPEC_B],
      projectRoot: ROOT,
    });
    assert.deepEqual(out, [SPEC_B]);
  });

  it("unions changed paths and trailers without duplicating the overlap", () => {
    const out = deriveSpecsTouched({
      changedFiles: [SPEC_A, SPEC_B],
      trailers: [SPEC_A],
      projectRoot: ROOT,
    });
    assert.deepEqual(out, [SPEC_A, SPEC_B], "changed paths first, then trailers, de-duplicated");
  });

  it("counts a spec DELETED by the commit (no existsSync gate)", () => {
    // `git diff-tree` reports deleted paths too, and a deleted spec was
    // genuinely touched. Nothing under ROOT exists on disk at all.
    const out = deriveSpecsTouched({
      changedFiles: [SPEC_A],
      projectRoot: ROOT,
    });
    assert.deepEqual(out, [SPEC_A]);
  });

  it("normalises a leading ./ rather than rejecting it", () => {
    const out = deriveSpecsTouched({ trailers: [`./${SPEC_A}`], projectRoot: ROOT });
    assert.deepEqual(out, [SPEC_A]);
  });

  it("trims surrounding whitespace on a trailer value", () => {
    const out = deriveSpecsTouched({ trailers: [`   ${SPEC_A}  `], projectRoot: ROOT });
    assert.deepEqual(out, [SPEC_A]);
  });

  it("ignores sibling lifecycle artifacts under .context-index/specs/", () => {
    const out = deriveSpecsTouched({
      changedFiles: [
        ".context-index/specs/features/alpha/one.plan.md",
        ".context-index/specs/features/alpha/one.review.md",
        ".context-index/specs/features/alpha/one.validate.md",
        ".context-index/specs/features/alpha/one.routing.json",
        ".context-index/specs/roadmap/2026-q1.md",
      ],
      projectRoot: ROOT,
    });
    assert.deepEqual(out, [], "only *.spec.md leaves count as specs");
  });

  it("returns [] for a commit touching neither specs nor trailers", () => {
    const out = deriveSpecsTouched({
      changedFiles: ["src/a.mjs", "tests/a.test.mjs"],
      trailers: [],
      projectRoot: ROOT,
    });
    assert.deepEqual(out, []);
  });
});

describe("deriveSpecsTouched — count integrity (defect 2)", () => {
  it("treats a comma-bearing candidate as ONE candidate, never splitting it", () => {
    // The hook used to join trailers with `,` and re-split on `,`, so a single
    // trailer reading `a,b` became two entries. The derivation must never
    // split on any in-value character: this candidate is one (invalid) path.
    const out = deriveSpecsTouched({
      trailers: [`${SPEC_A},${SPEC_B}`],
      projectRoot: ROOT,
    });
    assert.deepEqual(out, [], "one malformed candidate in → zero entries out, never two");
  });

  it("preserves the entry count across a batch of distinct valid trailers", () => {
    const trailers = [SPEC_A, SPEC_B, ".context-index/specs/cross-cutting/three.spec.md"];
    const out = deriveSpecsTouched({ trailers, projectRoot: ROOT });
    assert.equal(out.length, trailers.length);
    assert.deepEqual(out, trailers);
  });

  it("a comma-bearing trailer cannot inflate the count of a valid sibling trailer", () => {
    const out = deriveSpecsTouched({
      trailers: [`${SPEC_B},${SPEC_B}`, SPEC_A],
      projectRoot: ROOT,
    });
    assert.deepEqual(out, [SPEC_A], "exactly one valid trailer in → exactly one entry out");
  });

  it("rejects any candidate carrying a control character", () => {
    const nul = String.fromCharCode(0);
    const lf = String.fromCharCode(10);
    const us = String.fromCharCode(31);
    for (const ch of [nul, lf, us, String.fromCharCode(13), String.fromCharCode(127)]) {
      const candidate = `.context-index/specs/features/alpha/x${ch}y.spec.md`;
      assert.deepEqual(
        deriveSpecsTouched({ trailers: [candidate], projectRoot: ROOT }),
        [],
        `control char ${ch.charCodeAt(0)} must be rejected`,
      );
    }
  });
});

describe("deriveSpecsTouched — containment (defect 3)", () => {
  const rejected = [
    ["absolute POSIX path", "/etc/passwd.spec.md"],
    ["absolute path into the real specs dir", `${ROOT}/${SPEC_A}`],
    ["parent traversal", "../../other-repo/.context-index/specs/x.spec.md"],
    ["embedded traversal escaping the specs root", ".context-index/specs/../../.git/hooks/evil.spec.md"],
    // The pre-fix deny-list only rejected `..` and a leading `/`; a path with
    // neither slipped through into specs-touched for consumers to resolve.
    ["path with neither .. nor leading /", ".git/hooks/x"],
    ["dotfile shaped like a spec but outside the specs root", ".git/hooks/x.spec.md"],
    ["sibling directory with a colliding prefix", ".context-index/specs-archive/old.spec.md"],
    ["specs root itself", ".context-index/specs"],
    ["windows drive-absolute path", "C:/repo/.context-index/specs/x.spec.md"],
    ["backslash separators", ".context-index\\specs\\x.spec.md"],
    ["url", "https://example.com/.context-index/specs/x.spec.md"],
    ["home-relative path", "~/.context-index/specs/x.spec.md"],
    ["shell-substitution payload", "$(touch /tmp/pwned).spec.md"],
    ["non-string", 42],
    ["empty string", ""],
    ["whitespace only", "   "],
  ];

  for (const [label, candidate] of rejected) {
    it(`drops ${label}`, () => {
      assert.deepEqual(
        deriveSpecsTouched({ trailers: [candidate], changedFiles: [candidate], projectRoot: ROOT }),
        [],
      );
    });
  }

  it("accepts a deeply nested spec inside the specs root", () => {
    const deep = ".context-index/specs/features/a/b/c/d.spec.md";
    assert.deepEqual(deriveSpecsTouched({ trailers: [deep], projectRoot: ROOT }), [deep]);
  });
});

describe("deriveSpecsTouched — caps", () => {
  it("rejects (never truncates) an over-long candidate", () => {
    const long = `.context-index/specs/features/${"a".repeat(600)}.spec.md`;
    const out = deriveSpecsTouched({ trailers: [long], projectRoot: ROOT });
    assert.deepEqual(out, [], "a truncated path would be a *wrong* path");
  });

  it("truncates an over-large batch to a bounded, deterministic prefix", () => {
    const many = Array.from(
      { length: 200 },
      (_, i) => `.context-index/specs/features/f${i}.spec.md`,
    );
    const out = deriveSpecsTouched({ changedFiles: many, projectRoot: ROOT });
    assert.ok(out.length > 0 && out.length < many.length, "batch must be capped");
    assert.deepEqual(out, many.slice(0, out.length), "cap keeps the first N in order");
    // Deterministic across calls.
    assert.deepEqual(deriveSpecsTouched({ changedFiles: many, projectRoot: ROOT }), out);
  });
});

describe("deriveSpecsTouched — silence", () => {
  let warnings;
  let originalWarn;
  let originalError;

  beforeEach(() => {
    warnings = [];
    originalWarn = console.warn;
    originalError = console.error;
    console.warn = (...args) => warnings.push(["warn", ...args]);
    console.error = (...args) => warnings.push(["error", ...args]);
  });

  afterEach(() => {
    console.warn = originalWarn;
    console.error = originalError;
  });

  it("emits no diagnostic for the empty result — that is the correct outcome", () => {
    const out = deriveSpecsTouched({ changedFiles: ["src/a.mjs"], trailers: [], projectRoot: ROOT });
    assert.deepEqual(out, []);
    assert.deepEqual(warnings, [], "an empty specs-touched is normal, not an anomaly");
  });

  it("emits no diagnostic when candidates are rejected", () => {
    deriveSpecsTouched({ trailers: ["/etc/passwd", "../x", ".git/hooks/y"], projectRoot: ROOT });
    assert.deepEqual(warnings, []);
  });

  it("never throws on hostile input", () => {
    assert.doesNotThrow(() => deriveSpecsTouched());
    assert.doesNotThrow(() => deriveSpecsTouched({}));
    assert.doesNotThrow(() =>
      deriveSpecsTouched({ changedFiles: null, trailers: undefined, projectRoot: ROOT }),
    );
    assert.doesNotThrow(() =>
      deriveSpecsTouched({ changedFiles: [null, undefined, {}, []], projectRoot: ROOT }),
    );
  });
});
