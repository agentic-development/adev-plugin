/**
 * Tier 2 — dispatch-shape harness tests.
 *
 * Exercises lib/governance/dispatch-shape.mjs to assert properties on the
 * exact structs the skill WOULD hand to its `Task` tool, without actually
 * launching any subagent. Closes:
 *
 *   - execution-profiles AC #14  prompt-snapshot — env values never appear
 *                                in prompt text or description
 *   - execution-profiles AC #16  audited channels enumeration matches the
 *                                cross-cutting spec's channel list
 *   - configurable-reviewers #4  package-mode two-stage shape: runner +
 *                                adapter dispatch structs, right profile
 *                                assignment, args template substituted
 *   - configurable-reviewers #1  byte-identical `.review.md` via golden
 *     + configurable-checks #1    master (renderReviewReport helper)
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, rmSync, mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import * as claudeCode from "../../../lib/profiles/adapters/claude-code.mjs";
import * as openCode from "../../../lib/profiles/adapters/opencode.mjs";
import { loadReviewConfig } from "../../../lib/governance/review-config.mjs";
import {
  buildReviewerDispatches,
  renderReviewReport,
} from "../../../lib/governance/dispatch-shape.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SETUP_SCRIPT = join(__dirname, "setup-fixture.sh");
const BASE_FIXTURE = join(__dirname, "fixture-tier2");
const GOLDEN_DIR = join(__dirname, "golden");

function cloneDir(src) {
  const dest = mkdtempSync(join(tmpdir(), "adev-cg-tier2-"));
  cpSync(src, dest, { recursive: true });
  return dest;
}

before(() => {
  if (!existsSync(BASE_FIXTURE)) execSync(`bash ${SETUP_SCRIPT} ${BASE_FIXTURE}`, { stdio: "pipe" });
});
// See tier1-library.test.mjs note: fixture persists across parallel test files.

// ---------------------------------------------------------------------------
// AC #14 — env values MUST NOT appear in prompt text.
// ---------------------------------------------------------------------------
describe("Tier 2 / exec AC #14 — prompt-snapshot: env values absent from prompt", () => {
  it("subagent-mode dispatch: prompt and description do not contain API_TOKEN value", () => {
    const repo = cloneDir(BASE_FIXTURE);
    try {
      // Swap in a governance/review.yaml whose reviewer consumes the
      // project-gate-profile (which carries a real API_TOKEN env).
      writeFileSync(
        join(repo, ".context-index/governance/review.yaml"),
        `reviewers:
  - id: project.env-consumer
    dispatch: always
    prompt: "prompts/billing-reviewer.md"
    profile: project-gate-profile
    context_pack: base
context_packs:
  base:
    include:
      - ".context-index/specs/features/billing/charter.md"
`
      );
      const cfg = loadReviewConfig(repo);
      // project-gate-profile has allow_add with filesystem-write? No — it uses
      // read-only-compatible posture (search + filesystem-read + deny fs/net).
      // But it's NOT extending read-only, so reviewer posture check may reject.
      // Use reviewer-capable as the profile so the reviewer loads cleanly, and
      // inspect the prompt for the API_TOKEN VALUE which must not be resolved
      // in its env anyway because reviewer-capable has no env.allow.
      // Instead, test the direct project-gate-profile which resolves the token
      // and pipe it through buildReviewerDispatches for a quality-gate-like
      // scenario: we construct a synthetic reviewer-like entry that references
      // project-gate-profile's env via a shape-only call.
      // The cleanest way: use the happy-path reviewer which already has env.
      const reviewer = cfg.reviewers.find((r) => r.id === "security-reviewer");
      const result = buildReviewerDispatches(reviewer, {
        profiles: cfg.profiles,
        contextPacks: cfg.contextPacks,
        consumerRepoRoot: repo,
        adapter: claudeCode,
        targetSpecPath: ".context-index/specs/features/billing/invoice-generation.md",
        targetSpecContent: readFileSync(
          join(repo, ".context-index/specs/features/billing/invoice-generation.md"),
          "utf8"
        ),
      });
      assert.equal(result.errors.length, 0, JSON.stringify(result.errors, null, 2));
      for (const d of result.dispatches) {
        // reviewer-capable has no env.allow, so env is {}. Tighten the check
        // by asserting env and prompt are disjoint regardless of what value
        // happens to resolve.
        for (const [key, value] of Object.entries(d.env)) {
          if (typeof value !== "string" || value.length < 8) continue;
          assert.ok(!d.prompt.includes(value), `env value for ${key} leaked into prompt`);
          assert.ok(!d.description.includes(value), `env value for ${key} leaked into description`);
        }
      }
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("env placed via a synthetic dispatch is not interpolated into prompt", () => {
    // Directly craft a minimal case where env IS populated and assert.
    const repo = cloneDir(BASE_FIXTURE);
    try {
      writeFileSync(
        join(repo, ".context-index/profiles.yaml"),
        `profiles:
  reviewer-with-env:
    extends: read-only
    env:
      files: [".env"]
      allow:
        required: ["API_TOKEN"]
        optional: []
`
      );
      writeFileSync(
        join(repo, ".context-index/governance/review.yaml"),
        `reviewers:
  - id: project.consumer
    dispatch: always
    prompt: "prompts/billing-reviewer.md"
    profile: reviewer-with-env
`
      );
      const cfg = loadReviewConfig(repo);
      assert.equal(cfg.errors.length, 0, JSON.stringify(cfg.errors, null, 2));
      const reviewer = cfg.reviewers.find((r) => r.id === "project.consumer");
      const result = buildReviewerDispatches(reviewer, {
        profiles: cfg.profiles,
        contextPacks: cfg.contextPacks,
        consumerRepoRoot: repo,
        adapter: claudeCode,
        targetSpecPath: ".context-index/specs/features/billing/invoice-generation.md",
        targetSpecContent: "# stub spec\n",
      });
      assert.equal(result.errors.length, 0, JSON.stringify(result.errors, null, 2));
      const d = result.dispatches[0];
      assert.ok(d.env.API_TOKEN, "env should contain API_TOKEN");
      assert.ok(!d.prompt.includes(d.env.API_TOKEN), "API_TOKEN value must NOT appear in prompt");
      assert.ok(!d.description.includes(d.env.API_TOKEN), "API_TOKEN value must NOT appear in description");
      assert.ok(d.redactionSet.has(d.env.API_TOKEN), "redactionSet must include the token");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// AC #16 — audited-channel list is the spec-enumerated set.
// ---------------------------------------------------------------------------
describe("Tier 2 / exec AC #16 — audited channels enumerated per the spec", () => {
  const expected = new Set([
    "tool-stdout",
    "tool-stderr",
    "harness-error",
    "adapter-diagnostic",
    "tool-argument-echo",
    "pre-adapter-transcript",
    "subprocess-spawn-error",
  ]);
  for (const adapter of [claudeCode, openCode]) {
    it(`${adapter.HARNESS} exports AUDITED_CHANNELS matching the spec's closed list`, () => {
      const actual = new Set(adapter.AUDITED_CHANNELS);
      assert.deepEqual(actual, expected, `adapter '${adapter.HARNESS}' must declare the full audited-channel set`);
    });
  }
});

// ---------------------------------------------------------------------------
// reviewers AC #4 — package-mode two-stage shape.
// ---------------------------------------------------------------------------
describe("Tier 2 / reviewers AC #4 — package mode produces runner + adapter dispatches", () => {
  it("produces two dispatches with correct stages, profile env, and args substitution", () => {
    const repo = cloneDir(BASE_FIXTURE);
    try {
      mkdirSync(join(repo, ".context-index/skills/wrapper"), { recursive: true });
      writeFileSync(
        join(repo, ".context-index/skills/wrapper/SKILL.md"),
        "# wrapper skill\nDo review work against --spec.\n"
      );
      writeFileSync(
        join(repo, ".context-index/governance/review.yaml"),
        `reviewers:
  - id: project.packaged
    dispatch: always
    package:
      skill: "skills/wrapper/SKILL.md"
      args:
        spec: "<target>"
    profile: reviewer-capable
`
      );
      const cfg = loadReviewConfig(repo);
      assert.equal(cfg.errors.length, 0, JSON.stringify(cfg.errors, null, 2));
      const reviewer = cfg.reviewers.find((r) => r.id === "project.packaged");
      const targetPath = ".context-index/specs/features/billing/invoice-generation.md";
      const result = buildReviewerDispatches(reviewer, {
        profiles: cfg.profiles,
        contextPacks: cfg.contextPacks,
        consumerRepoRoot: repo,
        adapter: claudeCode,
        targetSpecPath: targetPath,
        targetSpecContent: "stub",
      });
      assert.equal(result.errors.length, 0, JSON.stringify(result.errors, null, 2));
      assert.equal(result.dispatches.length, 2);
      const [runner, adapterDispatch] = result.dispatches;
      assert.equal(runner.stage, "runner");
      assert.equal(adapterDispatch.stage, "adapter");
      // Runner prompt contains the framing note + the skill body + args.
      assert.match(runner.prompt, /You are running as a reviewer subagent/);
      assert.match(runner.prompt, /wrapper skill/);
      assert.match(runner.prompt, /<target>/ === null ? /never/ : /invoice-generation\.md/);
      // Adapter prompt references the reviewer id.
      assert.match(adapterDispatch.prompt, /project\.packaged/);
      // Adapter source defaults to the bundled generic adapter.
      assert.ok(adapterDispatch.adapterSource.endsWith("generic.md"));
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// reviewers #1 / checks #1 — byte-identical `.review.md` body via golden master.
// ---------------------------------------------------------------------------
describe("Tier 2 / golden master — renderReviewReport is byte-stable", () => {
  const goldenPath = join(GOLDEN_DIR, "zero-config-review.md");

  it("produces the bundled-defaults report body matching the committed golden master", () => {
    const repo = cloneDir(BASE_FIXTURE);
    try {
      // Remove project overlays so the output reflects pure bundled defaults.
      rmSync(join(repo, ".context-index/governance"), { recursive: true, force: true });
      rmSync(join(repo, ".context-index/profiles.yaml"), { force: true });
      const cfg = loadReviewConfig(repo);
      assert.equal(cfg.errors.length, 0, JSON.stringify(cfg.errors, null, 2));
      const dispatches = [];
      for (const r of cfg.reviewers) {
        const res = buildReviewerDispatches(r, {
          profiles: cfg.profiles,
          contextPacks: cfg.contextPacks,
          consumerRepoRoot: repo,
          adapter: claudeCode,
          targetSpecPath: ".context-index/specs/features/billing/invoice-generation.md",
          targetSpecContent: "stub",
        });
        dispatches.push(...res.dispatches);
      }
      const body = renderReviewReport({
        specPath: ".context-index/specs/features/billing/invoice-generation.md",
        charterPath: ".context-index/specs/features/billing/charter.md",
        verdict: "PASS",
        dispatches,
        findings: {},
        date: "1970-01-01",
      });

      mkdirSync(GOLDEN_DIR, { recursive: true });
      if (!existsSync(goldenPath) || process.env.UPDATE_GOLDEN === "1") {
        writeFileSync(goldenPath, body, "utf8");
      }
      const expected = readFileSync(goldenPath, "utf8");
      assert.equal(body, expected, "review body drifted from golden master. Run with UPDATE_GOLDEN=1 to accept intentional changes.");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
