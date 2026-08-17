---
kind: validate
charter: review
spec: .context-index/specs/features/review/configurable-reviewers-rev-4-context-pack-population.spec.md
plan: .context-index/specs/features/review/configurable-reviewers-rev-4-context-pack-population.plan.md
date: 2026-08-15
rigor_tier: quick
verdict: PASS_WITH_NOTES
---

# Validation Report: Amendment: Live Spec: Configurable Reviewer Registry (targeting rev 4)

> **Date:** 2026-08-15
> **Spec:** `.context-index/specs/features/review/configurable-reviewers-rev-4-context-pack-population.spec.md`
> **Plan:** `.context-index/specs/features/review/configurable-reviewers-rev-4-context-pack-population.plan.md`
> **Branch:** `adev/review-context-pack` (worktree `.adev/worktrees/review-context-pack`, base `d81166c8`)
> **Rigor tier:** `quick` (explicit `--tier quick`, precedence rule 1)
> **Overall Status:** **PASS_WITH_NOTES**

**Rigor-tier note.** Per the `graduated-rigor-tiers` contract, `quick` runs Check 1 (quality gates,
fail-fast) plus a single synthesized spec+constitution compliance check. Checks 1.5, 1.6, 8 and 9
are recorded as `SKIP — Skipped — quick rigor tier.` Check 11 is evaluated independently.

**Registry load.** `.context-index/governance/validate.yaml` loaded cleanly — 7 checks, no
`INVALID_CHECK_ID`, no cycle, no unknown-`after` warning. Domain resolved to `software`
(`source_level: default`) with one gate warning: `GATE_OVERRIDE — Governance gate 'integration-test'
overrides domain gate.` Workspace detection returned `null`, so workspace-aware validation is off and
no cross-repo `depends-on` resolution applies. Module heuristics for `review` were loaded (3
heuristics, cost/measurement guidance — none bearing on these checks).

---

## Check 1: Quality Gates — FAIL by exit code / **not attributable to this change**

Gate source: merged domain + governance gates.

### Check 1a — fast tier

| Gate | Command | Severity | Result |
|---|---|---|---|
| `quality-gate` | `npm test` | error | **FAIL (exit 1)** |
| `test` | `npm test` | error | **FAIL (exit 1)** (same command) |

### Check 1b — integration tier

`integration-test` (`npm run test:evals`, severity `warning`) — not executed; the fast tier did not
clear. Recorded as **SKIP**.

### Check 1c — e2e tier

No gates configured — **SKIP** ("e2e tier — no gates configured, skipped.").

### Failure attribution (the reason this is not a blocking FAIL)

`npm test` exits 1, but **every** failing file is environmental or pre-existing. Five files fail, and
all five were individually attributed:

| Failing file | Cause | Evidence |
|---|---|---|
| `tests/repomap/index.test.mjs` | `ENOENT … tree-sitter-typescript.wasm` | 62 occurrences of the missing-wasm path in the run log; this worktree has **no `node_modules/`** |
| `tests/repomap/parse.test.mjs` | same | same |
| `tests/repomap/non-code-references.integration.test.mjs` | same | same |
| `tests/repomap/render-non-code-sections.test.mjs` | same | same |
| `tests/skills/plan-task-immutability.test.mjs` | pre-existing, repo-wide | `detectMutatedPlans()` run against the **untouched main repo at HEAD** returns the **identical 25 violations**; none belong to the `review` charter or this arc |

Positive evidence that the change itself is green:

- **Arc-scoped suites, isolated run: 67 pass / 0 fail** — `tests/governance/context-pack.test.mjs`,
  `tests/governance/reviewer-prompt-inputs.test.mjs`,
  `tests/evals/configurable-governance/tier2-dispatch-shape.test.mjs`,
  `tests/evals/configurable-governance/configurable-governance.test.mjs`.
- **Whole suite minus the five environmentally-blocked files** (447 files, 5997 tests):
  **5994 pass / 1 fail**. The single failure —
  `tests/cli/diagnose.test.mjs:590` (golden-snapshot schema lock) — passes **29/29 standalone**;
  it is a parallel-contention artifact on a machine under heavy concurrent load.
- The arc touches `lib/governance/*`, `templates/*`, `skills/review-specs/*`, `providers/*/skills/review-specs/*`
  and `tests/*`. None of these can reach the repomap tree-sitter loader or the plan-immutability detector.

**Deviation from strict fail-fast, recorded deliberately.** The skill's fail-fast rule exists because
"there is no value in checking spec compliance on code that does not compile or pass its own tests."
That rationale does not obtain here: the code under validation passes its own tests. Checks 2/4 were
therefore dispatched. This deviation is stated rather than hidden — **do not read this report as a
clean green gate.** A merge-time run on a host with `node_modules/` installed is still owed.

---

## Check 1.5: Source Manifest Verification — SKIP (quick rigor tier)

Skipped per tier. Run informationally anyway:
`Check 1.5: PASS — source manifest matches (sha: a21b7a6)`.

## Check 1.6: Code-Side Drift Warning — SKIP (quick rigor tier)

Skipped — quick rigor tier.

---

## Check 2 + Check 4: Synthesized Compliance Check — **PASS_WITH_NOTES**

Dispatched as one subagent per the `quick`-tier contract, carrying the verbatim prompt bodies from
`skills/validate/checks/validate.check-2-spec-compliance.md` and
`skills/validate/checks/validate.check-4-constitution.md`, under the anti-fabrication and
evidence-citation rules.

### Spec Compliance (Check 2)

| AC | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | `architecture` pack yields constitution + charter + sibling spec + ADR | PASS | `templates/review-specs/defaults.yaml:38-62`; `tests/governance/context-pack.test.mjs:354-359`. Live probe: 23 files / 185,030 bytes / 0 errors |
| 2 | `<charter-dir>` resolves; different charter dir → different file | PASS | `lib/governance/context-pack.mjs:463-479` (`expandTargetTokens`); `tests/governance/context-pack.test.mjs:150-158` |
| 3 | Three distinct per-reviewer file sets | PASS | `tests/governance/context-pack.test.mjs:341-353` — `new Set(sets).size === 3` |
| 4 | `CONTEXT_PACK_NO_TARGET` without `targetSpecPath` | PASS | `lib/governance/context-pack.mjs:209-216`, message byte-identical to §22e; `tests:173-178` |
| 5 | `=== foo ===` cannot forge a section | PASS | `lib/governance/context-pack.mjs:426-432` (`fenceBlock`); `tests:206-215` |
| 6 | Literal `<<<ADEV-PACK-` neutralized + warning | PASS | `lib/governance/context-pack.mjs:38-40, 411-417`; `tests:217-227` |
| 7 | **Package mode:** all stages fenced, legacy `## Target Spec:` count zero | PASS | `lib/governance/dispatch-shape.mjs:97-118` builds preamble+fence **above** the mode branch; consumed at `:122` (subagent), `:148-155` (runner), `:156-161` (adapter). `grep -rn "## Target Spec" lib/ skills/ providers/` → zero hits. `tier2-dispatch-shape.test.mjs:283-285` performs the AC-mandated scan |
| 8 | `adapter` (empty pack) still emits preamble + fenced spec | PASS | `dispatch-shape.mjs:156-161`, `contextPack: ""` at `:183`; `tier2:303-305`, `:287-291` |
| 9 | `base` renders with no `targetSpecPath` | PASS | `templates/review-specs/defaults.yaml:38-45` carries no token; `tests:325-330`. Live probe: 2 files, 0 errors |
| 10 | Denylist severity split | PASS | `lib/governance/context-pack.mjs:253` classifies from the expanded glob; `:273-291` warn-vs-error; `tests:117-135` covers both |
| 11 | Every `## Input` bullet maps to a titled include | PASS | `skills/review-specs/consistency-analyzer-prompt.md:15-23`; two undeliverable bullets removed; `tests/governance/reviewer-prompt-inputs.test.mjs:71-94` (2/2 pass isolated) |
| 12 | Determinism modulo nonce | PASS | `lib/governance/context-pack.mjs:309` byte-order sort with anti-`localeCompare` comment; `tests:291-300`, `:302-320` |
| 13 | `consistency` pack bounded + aggregate notice | PASS | `lib/governance/context-pack.mjs:353-385`. Live probe: 248,046 ≤ 262,144 bytes, real notice fence present (1,421 bytes). See Test Integrity |
| 14 | Per-file truncation marker | PASS | `lib/governance/context-pack.mjs:345-349`, byte-identical to §22l; `tests:229-235`, UTF-8 boundary pair `:237-250`/`:271-277` |
| 15 | `## Context Pack` block now emitted | PASS | `lib/governance/dispatch-shape.mjs:116-118`; `tier2:307-326` |
| 16 | Reviewer capability posture unchanged | PASS | `git diff HEAD -- templates/governance/profiles.yaml` **empty**; `profiles.yaml:16` `execute: deny`; reviewer profiles at `:31/:36/:41` carry only `extends: read-only` + `model.tier` |
| 17 | All quality gates pass | — | Check 1 (see attribution above) |
| 18 | No constitutional violations | PASS | Check 4 below |

Forced verification of the behaviors most at risk of being claimed-but-not-done:

- **22a** — `lib/governance/dispatch-shape.mjs:76-79` genuinely passes
  `{ repoRoot: ctx.consumerRepoRoot, targetSpecPath: ctx.targetSpecPath }`.
- **22f ordering** — expansion at `context-pack.mjs:209`, `containsDotDot(effectiveGlob)` at `:235`:
  the guard runs strictly **after** expansion. Proven by `tests:180-185` with
  `targetSpecPath: "../outside/x.spec.md"` → `CONTEXT_PACK_TRAVERSAL`.
- **22g** — `randomBytes(12).toString("base64url")` at `context-pack.mjs:190`; test pins
  `/^[A-Za-z0-9_-]{16}$/`.
- **22p enumeration** — `defaults.yaml:63-73` enumerates `risk-policies.yaml` + `gates.yaml`; no
  `governance/*.yaml` wildcard exists anywhere under `templates/`.
- **Dual-file population claim — TRUE and consistent.** `lib/governance/review-config.mjs:64-74`
  contains `if (domainOverlay && Array.isArray(domainOverlay.reviewers)) baseReviewers = domainOverlay.reviewers;`
  with the comment "bundled reviewer entries are not used" — so
  `templates/domains/software/reviewers.yaml` genuinely **replaces** the bundled list and had to be
  repointed too. Both files name the identical three packs (`defaults.yaml:14,22,30` /
  `reviewers.yaml:10,18,26`), pinned by `tests/governance/context-pack.test.mjs:373-388`.
  `context_packs` are sourced only from `defaults.yaml` + project governance
  (`review-config.mjs:134`), so the domain file correctly carries no pack definitions.
- **Provider mirror parity** — `node --test tests/sync/provider-skill-parity.test.mjs` → 1/1 pass,
  no drift; the only delta from canonical is the injected per-provider `description` line.

### Scope Expansion Sub-Finding — **warning**

Six changed paths are absent from `source-manifest.files` (spec frontmatter lines 18-29):

1. `providers/codex/skills/review-specs/SKILL.md`
2. `providers/codex/skills/review-specs/consistency-analyzer-prompt.md`
3. `providers/opencode/skills/review-specs/SKILL.md`
4. `providers/opencode/skills/review-specs/consistency-analyzer-prompt.md`
5. `.context-index/specs/features/review/charter.md`
6. `.context-index/lifecycle-state/configurable-reviewers.jsonl`

Items 1-4 are **mechanically generated** from the two declared canonical files by
`scripts/sync-provider-skills.mjs`, with parity test-enforced — in-scope in substance, but the paths
are undeclared. Items 5-6 are lifecycle bookkeeping (`charter.md` flips two capability rows
`draft → implemented`; the `.jsonl` appends one `spec_amended` event), not implementation.

**Recommended action:** add the four `providers/*/skills/review-specs/*` paths to
`source-manifest.files`, or record a standing convention that generated provider mirrors inherit
their canonical source's scope. No revert warranted. Severity **warning** — raises the aggregate
from PASS to PASS_WITH_NOTES; does not fail Check 2.

### Test Integrity

Assertion strength is **high**: exact string/regex matches on marker text, `deepEqual` on `files`
arrays, exact error/warning codes, exactly-one-occurrence counts
(`context-pack.test.mjs:256`), and negative assertions
(`!rendered.includes("=== docs/one.md ===")` at `:196`, `!rendered.includes("secret: yes")` at `:126`).
No `t.skip`, no `todo`, no conditional skips; every `try` is `try { … } finally { cleanup }` and none
swallows an assertion. The delimiter rewrites in `context-pack.test.mjs` and
`configurable-governance.test.mjs:218-225` **tightened** rather than loosened (bare
`/=== .*charter\.md ===/` → a nonce-interpolated fence regex), matching §22g — no
weakened-to-pass pattern.

**One genuine weakness (self-referential fixture class):**
`tests/governance/context-pack.test.mjs:369` asserts `assert.match(r.rendered, /role="truncation-notice"/)`
while rendering against `PLUGIN_ROOT`. The `review-base` sibling-spec glob pulls in **this very
amendment spec**, whose body at line 224 contains the literal string `role="truncation-notice"` — so
the assertion would pass even if truncation never fired. The companion assertion at `:370`
(`/pack truncated — \d+ of \d+ matched files omitted/`) **is** sound (the spec's literal reads
`<K> of <M>`, which `\d+` cannot match), so the test is not vacuous overall, and the real notice was
independently confirmed to fire for `consistency` today. Recommended tightening: assert on
`` `<<<ADEV-PACK-${r.nonce} role="truncation-notice">>>` ``.

**Two coverage gaps** (sub-requirements, not acceptance criteria):

- §22i's clause "the rendered-args block … MUST NOT be able to introduce an unfenced delimiter" is
  implemented (`dispatch-shape.mjs:255`, `neutralizeFenceTokens(rendered).body`) but **untested** —
  the tier2 fence-collision test exercises `targetSpecContent`, not `reviewer.args`.
- §22q is enforced only against reviewers resolved from bundled `defaults.yaml`, not the
  domain-overlay path. Equivalent today because both files name the same packs, but the coupling is
  unguarded.

### Constitution Compliance (Check 4) — **PASS**

- **Architecture boundaries: PASS** —
  `git diff HEAD --stat -- package.json package-lock.json .claude-plugin/plugin.json .cursor-plugin/plugin.json`
  returns **empty**: no new dependency, no plugin-registration change, no version bump (the CLAUDE.md
  rule that a bump in a feature PR is itself a violation is satisfied). No file under `hooks/` is
  touched, so the stdin/stdout JSON hook contract is untouched. `cli/` unmodified → no install-path
  change. No new skill directory (`skills/review-specs/` pre-existed), so no lifecycle-order change
  and the Load-Skill-Extensions rule for *new* skills does not apply.
- **Non-negotiable principles: PASS**
  - **#1 minimize deps** — nonce uses `randomBytes` from `node:crypto`
    (`lib/governance/context-pack.mjs:34`); budgeting uses `Buffer.byteLength`/`Buffer.subarray`
    (`:161-173`, `:397`). Both Node built-ins. `package.json` unchanged in this diff.
  - **#2 skills primarily markdown** — the `skills/review-specs/SKILL.md` diff is prose and inline-code
    references only; pack composition stays declarative YAML (`defaults.yaml:33-79`).
  - **#3 pure ESM** — every touched code file is `.mjs` with `import`/`export`; grep for
    `require(` / `module.exports` in changed lib and test files returns nothing.
  - **#4 hook protocol** — not touched.
  - **#5 version parity** — no manifest bumped.
- **Coding standards: PASS** — camelCase functions throughout the new code (`expandTargetTokens`,
  `neutralizeFenceTokens`, `fenceBlock`, `truncateToBytes`, `sectionCost`, `defaultBudgets`,
  `isPositiveInt`); kebab-case new file `tests/governance/reviewer-prompt-inputs.test.mjs`.
  Import ordering is built-ins-then-relatives in all three touched code files
  (`context-pack.mjs:27-35`, `dispatch-shape.mjs:21-24`, `reviewer-prompt-inputs.test.mjs:1-7`).
  **SKILL.md anti-pattern sweep:** `grep -n "Run inline Node\|node -e\|node --input-type=module"
  skills/review-specs/SKILL.md` → **zero hits**. The two ` ```javascript ` blocks at `:303` and `:369`
  are **pre-existing** — the diff hunks touch only lines ~75-93 (Step 2) and ~200-212 (Step 4) and
  introduce no fenced JS. New Step 4 prose explicitly hands runtime semantics to the lib ("This
  composition is owned by `buildReviewerDispatches(...)` … do not hand-assemble the prompt"),
  strengthening the descriptive-reference boundary. No H3 section gained both an inline-Node block
  and an `adev <verb>` invocation.

---

## Check 8: Boundary Compliance — SKIP (quick rigor tier)

## Check 9: Transition Gates — SKIP (quick rigor tier)

## Check 11: Visual Verification — **SKIP (Case A)**

No UI files in the implementation diff (changed files are `.mjs`, `.yaml`, `.md`, `.json`, `.jsonl`
only — the UI glob set matched nothing) and no Playwright MCP server available. Per the four-case
trigger matrix this is Case A: *"No UI files in implementation diff — visual verification not
applicable."*

---

## Summary

**3 checks passed** (Check 2, Check 4, Check 11-as-SKIP), **1 check FAILed by exit code but was
attributed entirely to environment** (Check 1), **4 checks skipped by rigor tier** (1.5, 1.6, 8, 9).

**Overall: PASS_WITH_NOTES.** Every acceptance criterion is satisfied against code that was actually
read, and where cheap, executed. `targetSpecPath` is genuinely threaded; token expansion precedes the
traversal guard; the nonce and provenance preamble are built once above the mode branch so all three
dispatch stages inherit them with zero legacy `## Target Spec:` delimiters repo-wide; the byte budgets
and both truncation markers match the spec text byte-for-byte; and the dual-file population claim is
verified true with the two YAMLs consistent and test-pinned. Constitution compliance is clean.

### Non-blocking follow-ups

1. **Docs are now factually wrong.** `docs/governance.md:305` and `docs/configuration.md:594` both
   state the denylist unconditionally "fails load" / files are "rejected at load time", which
   Behavior 22p-bis changed (a wildcard-matched denylisted file is now a
   `CONTEXT_PACK_DENYLIST_SKIP` warning with a successful render). They also omit the new
   `<charter-dir>` / `<target-spec>` tokens, `exclude`, `max_file_bytes` / `max_total_bytes`, and
   nonce fencing. Updating internal documentation is autonomous per the constitution — fixable in-arc.
2. Tighten `tests/governance/context-pack.test.mjs:369` to assert the nonce-bearing fence.
3. Add a test for `renderArgs` fence neutralization (`dispatch-shape.mjs:255`) — implemented but
   uncovered.
4. Add the four `providers/*/skills/review-specs/*` paths to `source-manifest.files`, or record the
   generated-mirror convention.
5. The aggregate truncation notice is deliberately exempt from `max_total_bytes`
   (`context-pack.mjs:375-385`), so `rendered` can in principle exceed the cap by the notice's size.
   The AC holds today (248,046 of 262,144; notice 1,421 bytes) but only by margin — consider capping
   the omitted-path list or restating the AC as "≤ cap + notice".
6. **Re-run `npm test` on a host with `node_modules/` installed** before merge, to convert Check 1
   from attributed-FAIL to a genuine green.

### Environmental constraints recorded (not findings)

- `git commit` is blocked in this worktree by a PreToolUse merge-guard hook that reads the branch
  from the **session** cwd (the main repo, on `main`) rather than this worktree's branch
  (`adev/review-context-pack`). This is a hook bug. All of this arc's work is consequently
  **uncommitted** in the working tree. It was not bypassed.
- This worktree has no `node_modules/`, and the machine was under heavy contention from concurrent
  agents throughout the run.

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 12, and 13 have been
> relocated by `check-set-restructure.spec.md`. See `/adev:review-specs` (ADR compliance,
> cross-cutting compliance, specialist review, charter consistency — now Check 2's scope-expansion
> sub-finding), `/adev:hygiene` Audit Pass 20 (platform drift), `/adev:reconcile` lifecycle-sync
> (lifecycle reconciliation), and `hooks/post-validate-extract-heuristics.{sh,mjs}` (heuristic
> extraction). The gaps in the surviving inventory are intentional.
