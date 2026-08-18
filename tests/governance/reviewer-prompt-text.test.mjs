/**
 * `prompt_text:` — inline reviewer prompt bodies.
 *
 * adev-plugin-xg1f.4: `resolveReviewerPath` treats `prompt:` as ALWAYS a path.
 * A domain extension that writes prose directly into `prompt:` (as both
 * `extensions/data-engineering/domain/reviewers.yaml` and
 * `extensions/process-automation/domain/reviewers.yaml` did) gets that prose
 * resolved as a filename and fails load with `FILE_MISSING` — taking down the
 * whole review panel, bundled reviewers included, because
 * `skills/review-specs/SKILL.md` aborts on any loader error.
 *
 * `prompt_text:` is a sibling field, mutually exclusive with `prompt:`: a
 * reviewer supplies exactly one. It carries prose directly — no
 * `resolveReviewerPath` call, no `existsSync` check — and flows straight
 * through to `dispatch-shape.mjs` as the prompt body.
 */

import { test, describe, afterEach } from "node:test";
import { strict as assert } from "node:assert";

import { loadReviewConfig } from "../../lib/governance/review-config.mjs";
import { buildReviewerDispatches } from "../../lib/governance/dispatch-shape.mjs";
import { loadProfiles } from "../../lib/profiles/index.mjs";
import * as claudeCode from "../../lib/profiles/adapters/claude-code.mjs";
import { stampMarker } from "../../lib/governance/registry-marker.mjs";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";

const tempDirs = [];
function tmp() {
  const d = createTempDir();
  tempDirs.push(d);
  return d;
}
afterEach(() => {
  while (tempDirs.length) cleanupTempDir(tempDirs.pop());
});

function writeReview(repo, body) {
  writeFixture(
    repo,
    ".context-index/governance/review.yaml",
    stampMarker(body, "2026-08-15T00:00:00Z"),
  );
}

function hasCode(issues, code) {
  return issues.some((i) => i.code === code);
}

// Deliberately prose that WOULD fail `resolveReviewerPath` if it were ever
// routed there — commas, spaces, no plugin:/relative-path shape at all — so a
// regression that starts resolving `prompt_text` as a path fails loudly with
// FILE_MISSING rather than silently.
const INLINE_PROSE =
  "Review data contracts for schema completeness, SLA definitions, freshness " +
  "guarantees, and data quality thresholds. Verify that all output schemas are " +
  "fully defined with types, nullability, and primary keys.";

describe("review-config — prompt_text", () => {
  test("prompt_text is accepted and produces a subagent reviewer with no path resolution attempted", () => {
    const repo = tmp();
    writeReview(
      repo,
      `reviewers:
  - id: data-contract-reviewer
    name: "Data Contract Reviewer"
    dispatch: always
    prompt_text: "${INLINE_PROSE}"
    profile: reviewer-capable
    context_pack: base
    severity_cap: blocker
`,
    );
    const r = loadReviewConfig(repo);
    assert.equal(r.errors.length, 0, JSON.stringify(r.errors, null, 2));
    const reviewer = r.reviewers.find((x) => x.id === "data-contract-reviewer");
    assert.ok(reviewer, "reviewer not found in loaded registry");
    assert.equal(reviewer.mode, "subagent");
    assert.equal(reviewer.promptText, INLINE_PROSE);
    assert.equal(reviewer.promptPath, undefined);
  });

  test("prompt: continues to resolve as a path exactly as before (regression)", () => {
    const repo = tmp();
    writeReview(
      repo,
      `reviewers:
  - id: security-reviewer
    prompt: plugin:review-specs/security-reviewer-prompt.md
    profile: reviewer-capable
`,
    );
    const r = loadReviewConfig(repo);
    assert.equal(r.errors.length, 0, JSON.stringify(r.errors, null, 2));
    const reviewer = r.reviewers.find((x) => x.id === "security-reviewer");
    assert.equal(reviewer.mode, "subagent");
    assert.ok(reviewer.promptPath.endsWith("security-reviewer-prompt.md"));
    assert.equal(reviewer.promptText, undefined);
  });

  test("both prompt and prompt_text present is a validation error", () => {
    const repo = tmp();
    writeReview(
      repo,
      `reviewers:
  - id: hybrid
    prompt: "plugin:review-specs/structural-architect-prompt.md"
    prompt_text: "${INLINE_PROSE}"
`,
    );
    const r = loadReviewConfig(repo);
    assert.ok(hasCode(r.errors, "REVIEWER_MODE_CONFLICT"));
  });

  test("prompt_text and package present is also a validation error", () => {
    const repo = tmp();
    writeReview(
      repo,
      `reviewers:
  - id: hybrid-pkg
    prompt_text: "${INLINE_PROSE}"
    package:
      skill: "plugin:review-specs/SKILL.md"
`,
    );
    const r = loadReviewConfig(repo);
    assert.ok(hasCode(r.errors, "REVIEWER_MODE_CONFLICT"));
  });

  test("neither prompt, prompt_text, nor package present is REVIEWER_MODE_MISSING", () => {
    const repo = tmp();
    writeReview(
      repo,
      `reviewers:
  - id: empty
    dispatch: always
`,
    );
    const r = loadReviewConfig(repo);
    assert.ok(hasCode(r.errors, "REVIEWER_MODE_MISSING"));
  });
});

describe("dispatch-shape — prompt_text reviewer", () => {
  function ctxFor(repo) {
    const loaded = loadProfiles(repo);
    assert.equal(loaded.errors.length, 0, JSON.stringify(loaded.errors));
    return {
      profiles: loaded.profiles,
      contextPacks: { base: { include: [] } },
      consumerRepoRoot: repo,
      adapter: claudeCode,
      targetSpecPath: "specs/review/target.spec.md",
      targetSpecContent: "# Target\n",
    };
  }

  test("promptText flows into the prompt body with no filesystem read attempted", () => {
    const repo = tmp();
    const reviewer = {
      id: "data-contract-reviewer",
      name: "Data Contract Reviewer",
      mode: "subagent",
      promptText: INLINE_PROSE,
      profile: "reviewer-capable",
      context_pack: "base",
    };
    const res = buildReviewerDispatches(reviewer, ctxFor(repo));
    assert.equal(res.errors.length, 0, JSON.stringify(res.errors, null, 2));
    const dispatch = res.dispatches[0];
    assert.ok(dispatch.prompt.includes(INLINE_PROSE));
    // A path-mode reviewer with no such file on disk would surface DISPATCH_READ
    // here; asserting its absence is how this test would catch a regression
    // that routes promptText through readTextSafe(reviewer.promptPath, ...).
    assert.ok(!res.errors.some((e) => e.code === "DISPATCH_READ"));
  });
});
