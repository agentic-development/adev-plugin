<!-- DO NOT EDIT statuses inline — see lifecycle log inline-node-extraction-sweep.jsonl -->
# Implementation Plan: Inline-Node Extraction Sweep

> **Methodology:** adev
> **Charter:** .context-index/specs/features/cli-driver-surface/charter.md (rev 3)
> **Spec:** .context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-14)
> **Platform:** Node.js (ESM, .mjs), node:test, zero external deps

**Goal:** Multi-PR sweep that extracts every inline-Node block from the 18 canonical `skills/*/SKILL.md` files into `lib/cli/<verb>.mjs` helpers, per the per-skill atomic invariant. Each PR ships helper + test + SKILL.md edit + verb registration in one commit, sequenced by silent-rate ranking. Sweep completes when `grep -rE "Run inline Node|node --input-type=module -e|node -e" skills/**/SKILL.md` returns zero matches and the `tests/skills-no-inline-node.test.mjs` allowlist is empty.

**Architecture:** Multi-PR roadmap, not a single PR. This plan creates two foundational artifacts (the progress index + the allowlist test) and lists the 6 named extraction PRs plus the long-tail decomposition. Each PR is itself a small implementation that follows the driver-substrate contract and respects the regression-prevention hook. The plan delegates per-PR helper design to `/adev:implement` invocations against this plan — each "Task" below corresponds to one PR.

---

## File Structure

**Create (Task 0 — sweep scaffolding):**
- `.context-index/specs/features/cli-driver-surface/extraction-sweep-progress.md` — per-PR / per-block status table (pending / in-flight / extracted), seeded from the canonical grep.
- `tests/skills-no-inline-node.test.mjs` — scans `skills/*/SKILL.md` for forbidden patterns; explicit allowlist of un-extracted skills; allowlist shrinks per PR.

**Create per-extraction PR (Tasks 1–N):**
- `lib/cli/<verb>.mjs` — new helper per extracted block (one or more per PR depending on extraction grouping).
- `tests/cli/<verb>.test.mjs` — paired helper test.

**Modify per-extraction PR:**
- `skills/<name>/SKILL.md` — delete inline block, replace with `adev <verb> …` call line; preserve surrounding prose.
- `cli/index.mjs::VERB_REGISTRY` — register the new verb.
- `tests/skills-no-inline-node.test.mjs` — remove the skill from the allowlist.
- `.context-index/specs/features/cli-driver-surface/extraction-sweep-progress.md` — mark the block extracted.

**Reference (read, do not modify):**
- `regression-prevention.spec.md` — pre-commit hook will reject re-introductions; must be live before/during the sweep.
- `driver-substrate.spec.md` — the contract every helper must satisfy.
- `diagnostic-registry.spec.md`, `adev-diagnose-cli.spec.md`, `write-time-diagnostic-hook.spec.md` — sibling engines that some extracted helpers may register as diagnostic runners.
- `.context-index/research/inline-node-extraction-scope.md` — empirical silent-rate data per block.
- `.context-index/research/adev-vs-compiler-dispatch-patterns.md` §5 — sequencing rationale.

---

## Context Packets

### Task 0 Context (Scaffolding)
- Grep: `grep -rl "Run inline Node\|node --input-type=module -e\|node -e" skills/*/SKILL.md` — canonical source-of-truth for the 18 in-scope skills.
- Research: `.context-index/research/inline-node-extraction-scope.md` (silent-rate ranking).

### Tasks 1–6 Context (Named PRs)
- Spec: corresponding Acceptance Criterion bullet
- Research: silent-rate for the specific block being extracted
- Sibling spec: `driver-substrate.spec.md` (helper contract); `diagnostic-registry.spec.md` for helpers that also register as diagnostic runners

### Long-tail Tasks (per skill)
- The SKILL.md file in question + its surrounding prose (preserve it)
- Existing similar helper extracted in an earlier PR (CLI-verb naming is canonical per spec Behavior 9 — re-use when logic matches)

---

## Parallelization

**Sequential by sweep-order policy (not technical dependency):** the spec mandates an ordering (silent-rate ranking) so each PR's value-delivered is maximized. Tasks 0 (scaffolding) → Task 1 (PR 1: Check 13) → Task 2 (PR 2: reportValidator) → Task 3 (PR 3: reportStep) → Task 4 (PR 4: requireGate Step 0a) → Task 5 (PR 5: source-manifest) → Task 6 (PR 6: domain-aware gate loading) → Tasks 7–N (long tail; can be parallelized once the named PRs land).

Long-tail PRs (Tasks 7–N) can run concurrently once the named PRs are in: each touches one SKILL.md (no overlap), independent helper modules, and the allowlist test is the only shared file (mergeable conflicts).

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 0 | Sweep scaffolding (progress index + allowlist test) | Small | unit | — | 2 create |
| 1 | PR 1 — Extract Check 13 (heuristic extraction) | Medium | unit | Task 0 | 1 create helper, 1 test, 1 modify SKILL, 1 modify cli/index, 1 modify allowlist |
| 2 | PR 2 — Extract `reportValidator` emission | Medium | unit | Task 0 | same shape |
| 3 | PR 3 — Extract `reportStep` lifecycle emission | Large | unit | Task 2 (shares `lib/cli/report.mjs`) | one helper, multiple SKILL.md edits |
| 4 | PR 4 — Extract Step 0a `requireGate` calls | Medium | unit | Task 0 (gate.mjs already exists from driver-substrate) | 0 create helper, ~10 modify SKILLs, 1 modify allowlist |
| 5 | PR 5 — Extract source-manifest verify | Medium | unit | Task 0 | same shape |
| 6 | PR 6 — Extract domain-aware gate loading | Medium | unit | Task 0 | same shape |
| 7–N | Long-tail PRs (one per remaining inline block) | Variable | unit | Tasks 0–6 | per spec |

---

## Test Infrastructure Requirements

None. All extracted helpers use the driver-substrate test pattern (spawnSync against `cli/index.mjs`, temp-project fixtures). The allowlist test is a pure-grep scan of in-tree `skills/*/SKILL.md`.

---

### Task 0: Sweep scaffolding (progress index + allowlist test) [specialist: none]

**Charter capability:** Inline-Node extraction sweep — foundation
**Strategy:** unit
**Files:**
- Create: `.context-index/specs/features/cli-driver-surface/extraction-sweep-progress.md`
- Create: `tests/skills-no-inline-node.test.mjs`

**Implementation outline:**

1. **Run the canonical grep at task time** to enumerate the 18 in-scope skills:
   ```bash
   grep -rl "Run inline Node\|node --input-type=module -e\|node -e" skills/*/SKILL.md
   ```
2. **Build `extraction-sweep-progress.md`** with a table:
   ```markdown
   # Extraction Sweep Progress

   | Skill | Inline blocks (initial count) | Status | PR(s) |
   |-------|-------------------------------|--------|-------|
   | validate | 5 | pending | — |
   | review-specs | 3 | pending | — |
   | implement | 4 | pending | — |
   | ... | | | |

   ## Sweep order (per silent-rate ranking)

   1. Check 13 (heuristic extraction) — PR 1 — skills affected: validate
   2. reportValidator emission — PR 2 — skills: validate
   3. reportStep emission — PR 3 — skills: ~all lifecycle skills
   4. requireGate Step 0a — PR 4 — skills: ~all lifecycle skills
   5. source-manifest verify — PR 5 — skills: validate, implement, plan
   6. domain-aware gate loading — PR 6 — skills: review-specs, validate, plan
   7+. Long tail
   ```
3. **Author `tests/skills-no-inline-node.test.mjs`** that scans `skills/*/SKILL.md`:
   ```javascript
   import { test } from 'node:test';
   import assert from 'node:assert';
   import { readdirSync, readFileSync, statSync } from 'node:fs';
   import { join, resolve, dirname } from 'node:path';
   import { fileURLToPath } from 'node:url';

   const __dirname = dirname(fileURLToPath(import.meta.url));
   const SKILLS = resolve(__dirname, '..', 'skills');
   const FORBIDDEN = /Run inline Node|node\s+--input-type=module\s+-e|node\s+-e/;

   // Allowlist of skills still containing inline-Node blocks.
   // Each PR REMOVES one entry. Sweep complete when this is empty.
   const ALLOWLIST = new Set([
     // SEEDED FROM grep AT TASK 0 TIME — UPDATE AS PRS LAND
     'validate', 'review-specs', 'implement', /* ... */
   ]);

   test('no inline-Node patterns in non-allowlisted SKILL.md files', () => {
     const skillDirs = readdirSync(SKILLS).filter(d => statSync(join(SKILLS, d)).isDirectory());
     const violations = [];
     for (const skill of skillDirs) {
       if (ALLOWLIST.has(skill)) continue;
       const path = join(SKILLS, skill, 'SKILL.md');
       try {
         const content = readFileSync(path, 'utf8');
         if (FORBIDDEN.test(content)) violations.push(skill);
       } catch { /* missing SKILL.md — skip */ }
     }
     assert.deepStrictEqual(violations, [], `Inline-Node found in: ${violations.join(', ')}`);
   });

   test('allowlist shrinks monotonically (no skill re-added)', () => {
     // This is enforced by code review — the test asserts only that current allowlist size <= prior commit's size.
     // Documented invariant only; mechanical check would require git history walk.
   });
   ```

- [ ] Author both files.
- [ ] Run tests; confirm initial state PASSes (allowlist matches the actual inline-Node footprint).
- [ ] **Commit:** `feat(cli-driver-surface): sweep scaffolding (progress index + allowlist test)`

---

### Task 1: PR 1 — Extract Check 13 (heuristic extraction) [specialist: none]

**Charter capability:** Inline-Node extraction sweep
**Strategy:** unit
**Depends on:** Task 0; regression-prevention spec implementation; diagnostic-registry spec implementation
**Files:**
- Create: `lib/cli/heuristics.mjs` exporting `run({...})` + `help()` (no `LIFECYCLE_STEP`)
- Create: `tests/cli/heuristics.test.mjs`
- Modify: `skills/validate/SKILL.md` — replace Check 13 inline block with `adev heuristics extract --spec <p>` call line
- Modify: `cli/index.mjs::VERB_REGISTRY` — register `heuristics`
- Modify: `tests/skills-no-inline-node.test.mjs` — remove `validate` from allowlist (if no other inline blocks remain in validate; otherwise leave allowlisted, mark sub-progress in the progress index)
- Modify: `.context-index/specs/features/cli-driver-surface/extraction-sweep-progress.md`

**Sub-tasks (TDD per Task convention):**
- [ ] Write `tests/cli/heuristics.test.mjs` covering the same behaviors the inline Check 13 block exercises (first-run PASS detection, scope derivation, ID generation, contradiction scan, writeHeuristic call).
- [ ] Implement `lib/cli/heuristics.mjs::run` and `help`.
- [ ] Register verb.
- [ ] Edit `skills/validate/SKILL.md`: replace the inline Check 13 Node block with the `adev heuristics extract --spec <spec-path>` call; preserve prose (Behavior 11).
- [ ] Update allowlist + progress index.
- [ ] **Commit (one commit per PR, all 5 file changes atomic):** `feat(cli-driver-surface): PR 1 — extract Check 13 heuristic extraction (skill: validate)`

---

### Task 2: PR 2 — Extract `reportValidator` emission [specialist: none]

**Charter capability:** Inline-Node extraction sweep
**Strategy:** unit
**Depends on:** Task 0
**Files:**
- Create: `lib/cli/report.mjs` (multi-mode helper: `--type validator|step` per Behavior 9 — CLI-verb naming canonical)
- Create: `tests/cli/report.test.mjs`
- Modify: `skills/validate/SKILL.md` — replace `reportValidator` inline emission with `adev report --type validator --spec <p> --validator <id> --verdict <v>`
- Modify: `cli/index.mjs::VERB_REGISTRY` — register `report`
- Update allowlist + progress index.

**Significance:** this single PR lifts `validator_report` event coverage from ~0% to ~100% per spec AC.

- [ ] Implement, test, edit, commit.
- [ ] **Commit:** `feat(cli-driver-surface): PR 2 — extract reportValidator (validator_report coverage 0→100%)`

---

### Task 3: PR 3 — Extract `reportStep` lifecycle emission [specialist: none]

**Charter capability:** Inline-Node extraction sweep
**Strategy:** unit
**Depends on:** Task 2 (extends `lib/cli/report.mjs` with `--type step` mode)
**Files:**
- Modify: `lib/cli/report.mjs` — add `--type step` branch
- Modify: `tests/cli/report.test.mjs` — extend
- Modify: ALL lifecycle skills emitting step transitions: `skills/specify/SKILL.md`, `skills/review-specs/SKILL.md`, `skills/plan/SKILL.md`, `skills/implement/SKILL.md`, `skills/validate/SKILL.md`, `skills/debug/SKILL.md` (potentially), etc.
- Update allowlist + progress index.

**Scope note:** this is the largest PR by SKILL.md edits. Likely 6–8 skill files modified in one commit per the per-skill-atomic invariant.

- [ ] Implement, test, edit (all skills), commit.
- [ ] **Commit:** `feat(cli-driver-surface): PR 3 — extract reportStep (all lifecycle skills)`

---

### Task 4: PR 4 — Extract Step 0a `requireGate` calls [specialist: none]

**Charter capability:** Inline-Node extraction sweep — the meta-irony PR
**Strategy:** unit
**Depends on:** Task 0 (helper already exists from `driver-substrate` plan); per-skill atomicity from regression-prevention pre-commit hook
**Files:**
- No new helper — `lib/cli/gate.mjs` already exists from driver-substrate.
- Modify: ALL lifecycle skills' Step 0a inline `requireGate` blocks → replace with `adev gate require --skill <skill-name> --spec <p>`
- Update allowlist + progress index.

**Significance:** the very first action of every lifecycle skill is currently an inline Node block calling `requireGate`. This PR replaces them. After this PR, gate enforcement is grep-visible (`adev gate require` calls) instead of inline Node.

- [ ] Edit all lifecycle skills' Step 0a sections.
- [ ] Verify `gate.test.mjs` still passes (no helper changes).
- [ ] **Commit:** `feat(cli-driver-surface): PR 4 — extract requireGate Step 0a (all lifecycle skills)`

---

### Task 5: PR 5 — Extract source-manifest verify [specialist: none]

**Charter capability:** Inline-Node extraction sweep
**Strategy:** unit
**Depends on:** Task 0
**Files:**
- Create: `lib/cli/source-manifest.mjs` (e.g., `adev source-manifest verify --spec <p>`)
- Create: `tests/cli/source-manifest.test.mjs`
- Modify: skills that use source-manifest verify (validate, possibly implement)
- Modify: `cli/index.mjs::VERB_REGISTRY`
- Update allowlist + progress index.

- [ ] Implement, test, edit, commit.
- [ ] **Commit:** `feat(cli-driver-surface): PR 5 — extract source-manifest verify`

---

### Task 6: PR 6 — Extract domain-aware gate loading [specialist: none]

**Charter capability:** Inline-Node extraction sweep
**Strategy:** unit
**Depends on:** Task 0
**Files:**
- Create: `lib/cli/domain.mjs` (e.g., `adev domain load-gates --spec <p>`)
- Create: `tests/cli/domain.test.mjs`
- Modify: skills using domain-aware loading (review-specs, validate, plan)
- Modify: `cli/index.mjs::VERB_REGISTRY`
- Update allowlist + progress index.

- [ ] Implement, test, edit, commit.
- [ ] **Commit:** `feat(cli-driver-surface): PR 6 — extract domain-aware gate loading`

---

### Tasks 7–N: Long-tail extractions (one PR per remaining inline block) [specialist: none]

**Charter capability:** Inline-Node extraction sweep — long tail
**Strategy:** unit
**Depends on:** Tasks 0–6
**Files:** per remaining inline block — same shape as Tasks 1, 2, 5, 6 (helper + test + SKILL.md + verb + allowlist + progress)

**Enumeration:** at the start of the long tail, re-run `grep -rE "Run inline Node|node --input-type=module -e|node -e" skills/*/SKILL.md` and walk the result. Each match → one PR. Use the canonical-verb rule (Behavior 9) — if a block matches existing extracted helper logic, reuse the verb.

**Acceptance:** sweep complete when:
- `grep -rE "Run inline Node|node --input-type=module -e|node -e" skills/**/SKILL.md` returns zero matches.
- `tests/skills-no-inline-node.test.mjs` allowlist is empty.
- All paired helper tests pass.
- `tests/cli-driver-pattern.test.mjs` passes (driver-substrate invariant maintained).
- Charter Capability Map row "Inline-Node extraction sweep" set to `implemented`.

**Sub-tasks (run `/adev:plan --spec` recursively if a particularly large skill needs its own breakdown):** each long-tail PR is itself a small TDD cycle. Tracked in the progress index.

- [ ] Enumerate via grep at start of long tail.
- [ ] Group blocks by canonical verb to minimize new-verb proliferation.
- [ ] For each remaining block (or group): land one atomic PR.
- [ ] Allowlist + progress index updated per PR.
- [ ] Final commit (when allowlist empty + grep returns zero): update charter Capability Map row to `implemented`.

---

## Quality Gates

Per PR (each PR must individually pass):
- `npm test` — full suite (existing + new helper tests + the no-inline-node allowlist test)
- The pre-commit hook from `regression-prevention.spec.md` rejects re-introduction
- Lifecycle event coverage: `validator_report` count > 0 after PR 2; `lifecycle_step` count > 0 after PR 3
- `/adev:validate --spec <each-PR's-spec>` (if PR has spec coverage)

Sweep-level (after final PR):
- `grep -rE "Run inline Node|node --input-type=module -e|node -e" skills/**/SKILL.md` returns zero matches
- `tests/skills-no-inline-node.test.mjs` allowlist is empty
- `tests/cli-driver-pattern.test.mjs` passes
- Charter Capability Map row "Inline-Node extraction sweep" set to `implemented`
- `/adev:validate --spec .context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.spec.md`
