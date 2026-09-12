# Implementation Plan: Strategy Profile Contract — Entry-Point Boundary Rule (rev 3 amendment)

> **Methodology:** adev
> **Charter:** .context-index/specs/features/test-strategies/charter.md
> **Spec:** .context-index/specs/features/test-strategies/strategy-profile-contract-rev-3-entry-point-boundary-rule.spec.md
> **Review:** PASS_WITH_NOTES (2026-09-11)
> **Platform:** Node.js (ESM), JavaScript, node:test

**Goal:** Amend the `unit` strategy profile's `assertion_rules` field — and the docs that surface it — to state an entry-point boundary rule: a unit test's primary assertion must invoke the behavior under test through its public entry point (CLI subcommand, hook stdin/stdout+exit-code, or documented public library API) whenever one exists, with internal-function tests permitted only as a supplement.

**Architecture:** This is a prose-only amendment (per the spec's Out-of-Scope: no enforcement mechanism, no gaming-detector rule). It touches three source artifacts: the `unit` strategy profile markdown (`lib/test-strategies/profiles/unit.md`, consumed by `getStrategyProfile()` per `strategy-profile-contract.spec.md`), the hardcoded `UNIT_PROFILE` constant in `lib/test-strategies/profiles.mjs` (the fallback of last resort `getStrategyProfile()` returns whenever any profile file — not just unit's — is missing, unreadable, unparseable, or incomplete; its `assertion_rules` field is currently a character-identical copy of `unit.md`'s and must be kept in sync so the fallback path does not silently serve the pre-amendment rule), and `docs/test-strategies.md` (per BEH-4, so the rule is discoverable from docs, not just the profile). Per `spec-amendment-artifacts.spec.md` Behavior 6, the base spec `strategy-profile-contract.spec.md` itself is never modified — this amendment spec carries the delta and its own lifecycle.

Review notes (PASS_WITH_NOTES, 2 warnings, 0 blockers) are addressed as follows: **CON-1** (risk_level: medium reviewed at `--tier quick`) is not a plan concern — it is a review-tier/policy reconciliation the reviewer left to the operator, and does not affect task content. **SA-1** (the "documented public library API" entry-point category is undefined) is tightened in Task 1 below: the profile's `assertion_rules` text explicitly says a "public library API" means a function whose doc-comment states it is a public entry point (or that is listed in `docs/skill-reference.md`/`docs/cli-reference.md` as such) — see Task 1 for the exact wording — so the third taxonomy leg has a concrete anchor rather than being an unanchored judgment call.

---

## File Structure

**Modify:**
- `lib/test-strategies/profiles/unit.md:15` — extend the `assertion_rules` frontmatter field with the entry-point boundary rule (BEH-1, BEH-2, BEH-3)
- `lib/test-strategies/profiles.mjs:25-26` — apply the identical `assertion_rules` text to the hardcoded `UNIT_PROFILE.assertion_rules` field, so the fallback-of-last-resort path (returned whenever any strategy's profile file is missing/unreadable/malformed/incomplete) stays in sync with `unit.md` rather than silently serving the pre-amendment rule
- `docs/test-strategies.md:285` — expand the unit-task paragraph into a two-rule (mocking + entry-point) discussion so the rule is documented, not just profile-only (BEH-4)

**Create:**
- `tests/docs/test-strategies-docs.test.mjs` — content assertion that `docs/test-strategies.md` states the entry-point boundary rule alongside the mocking-boundary rule (BEH-4 coverage; no existing docs test file targets `docs/test-strategies.md`'s unit-strategy section)

**Reference (read, do not modify):**
- `tests/evals/test-strategies/test-strategies.test.mjs` — existing "Profile content: `<strategy>`" describe-block pattern (e.g. `Profile content: schema` at line 459) and the `p()`/`PROFILES_DIR` helpers this plan's Task 1 test extends
- `.context-index/specs/features/test-strategies/strategy-profile-contract.spec.md` — base spec Behavior 5 (`assertion_rules` contract) this amendment targets rev 3 of
- `.context-index/specs/cross-cutting/spec-amendment-artifacts.spec.md` — confirms the base spec file is not touched by this plan

---

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/test-strategies/strategy-profile-contract-rev-3-entry-point-boundary-rule.spec.md` (BEH-1, BEH-2, BEH-3)
- Charter: `.context-index/specs/features/test-strategies/charter.md` (capability: Strategy Profile Contract)
- Source files: `lib/test-strategies/profiles/unit.md` (full read — the file being edited), `lib/test-strategies/profiles.mjs` (full read — `UNIT_PROFILE` constant at lines 9-34 is a second file being edited, not just a signature reference; `assertion_rules` is a passthrough string field on both artifacts, no parsing logic to update)
- Sibling test: `tests/evals/test-strategies/test-strategies.test.mjs` (full read of the `Profile content: schema`/`contract` blocks at lines 459-524 — pattern to follow for the new `Profile content: unit` block; `p()` helper convention), `tests/lib/test-strategies/profiles.test.mjs` (full read — existing `assert.deepEqual(profile, UNIT_PROFILE)` fallback assertions this task's implementation must keep passing)
- Base spec (read-only): `.context-index/specs/features/test-strategies/strategy-profile-contract.spec.md` (Behavior 5 — `assertion_rules` contract this amendment extends)

### Task 2 Context
- Spec: `.context-index/specs/features/test-strategies/strategy-profile-contract-rev-3-entry-point-boundary-rule.spec.md` (BEH-4)
- Charter: `.context-index/specs/features/test-strategies/charter.md` (capability: Strategy Profile Contract)
- Source files: `docs/test-strategies.md` (full read of lines 255-294, the "In `/adev:write-test`" section)
- Sibling test pattern: `tests/docs/test-depth-policy-docs.test.mjs` (full read — `read()` helper + `assert.match` pattern this task's new test file follows)
- Depends on Task 1's finalized profile wording (docs should describe the same rule text, not diverge from it)

---

## Parallelization

- Group A (sequential): Task 1 → Task 2 (Task 2's doc wording restates Task 1's finalized `assertion_rules` text, so it should follow rather than run concurrently)

No independent groups — this is a 2-task, tightly-coupled prose amendment.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Entry-point boundary rule in unit profile | small | unit | — | 0 create, 2 modify, 1 test extend |
| 2 | Document entry-point boundary rule in docs | small | unit | Task 1 | 1 create, 1 modify |

---

## Task 1: Entry-point boundary rule in unit profile [specialist: none]

**Charter capability:** Strategy Profile Contract
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/test-strategies/profiles/unit.md:15`
- Modify: `lib/test-strategies/profiles.mjs:25-26` (`UNIT_PROFILE.assertion_rules` — the hardcoded fallback-of-last-resort copy)
- Test: `tests/evals/test-strategies/test-strategies.test.mjs` (extend)

**Tests:** `tests/evals/test-strategies/test-strategies.test.mjs` — behavior not yet covered by an existing suite for the `unit` profile's content (the file has `Profile content: <strategy>` blocks for schema/contract/fixture/policy/threshold/visual/smoke/integration but none for `unit` — only a generic required-fields check at line 446). Create a new `describe('Profile content: unit', ...)` block, plus a `UNIT_PROFILE` (imported constant) parity assertion in the same block so the fallback copy is covered by the same RED/GREEN cycle as the file-backed profile. `tests/lib/test-strategies/profiles.test.mjs`'s existing `assert.deepEqual(profile, UNIT_PROFILE)` fallback tests must continue to pass unmodified — they assert structural equality with whatever `UNIT_PROFILE` currently holds, so updating both sources in lockstep keeps them green without editing that file.

**Context to load:**
- `.context-index/specs/features/test-strategies/strategy-profile-contract.spec.md` (Behavior 5 — the field this amendment extends)
- `tests/evals/test-strategies/test-strategies.test.mjs:459-524` (existing profile-content test pattern to mirror)
- `lib/test-strategies/profiles.mjs:9-34` (`UNIT_PROFILE` constant — second edit site)

- [ ] **Write failing test**

Add a new describe block after the "Profile loading with fixtures" block (after line 453), mirroring the existing `Profile content: schema` pattern:

```javascript
// ============================================================================
// Profile content: unit
// ============================================================================
describe('Profile content: unit', () => {
  const p = () => getStrategyProfile('unit', PROFILES_DIR).profile;

  it('assertion rules retain the existing mocking-boundary rule', () => {
    assert.ok(p().assertion_rules.toLowerCase().includes('external boundar'),
      'Expected external-boundary mocking rule to remain present');
  });

  it('assertion rules state the entry-point boundary rule', () => {
    assert.ok(p().assertion_rules.toLowerCase().includes('entry point') ||
      p().assertion_rules.toLowerCase().includes('entry-point'),
      'Expected entry-point boundary rule');
  });

  it('assertion rules name all three entry-point categories', () => {
    const rules = p().assertion_rules.toLowerCase();
    for (const category of ['cli', 'hook', 'public library api']) {
      assert.ok(rules.includes(category), `Expected entry-point category: ${category}`);
    }
  });

  it('assertion rules permit internal-function tests as a supplement, not a replacement', () => {
    assert.ok(p().assertion_rules.toLowerCase().includes('supplement'),
      'Expected supplement-not-replacement scoping language (BEH-2)');
  });

  it('assertion rules scope the rule to behaviors that have a public entry point', () => {
    assert.ok(p().assertion_rules.toLowerCase().includes('no public entry point') ||
      p().assertion_rules.toLowerCase().includes('when a public entry point exists') ||
      p().assertion_rules.toLowerCase().includes('whenever'),
      'Expected the rule to be conditioned on a public entry point existing (BEH-3)');
  });

  it('the hardcoded UNIT_PROFILE fallback constant stays in sync with unit.md', () => {
    assert.strictEqual(UNIT_PROFILE.assertion_rules, p().assertion_rules,
      'UNIT_PROFILE (lib/test-strategies/profiles.mjs, the fallback of last resort for any ' +
      'strategy whose profile file is missing/unreadable/malformed/incomplete) must carry the ' +
      'same assertion_rules text as unit.md, or the fallback path silently serves the ' +
      'pre-amendment rule');
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/evals/test-strategies/test-strategies.test.mjs`
Expected: FAIL — the four entry-point/scoping assertions fail because `lib/test-strategies/profiles/unit.md`'s current `assertion_rules` value (`"Mock only at external boundaries (HTTP, DB, filesystem, external-API). Internal module mocking is forbidden."`) contains no entry-point language. The `UNIT_PROFILE` parity assertion passes at this point (both sources still hold the identical pre-amendment string) — it only becomes meaningful once `unit.md` is edited, where it will catch a regression if `profiles.mjs` is left behind. The overall `node --test` run reports FAIL either way, driven by the four failing assertions.

- [ ] **Implement**

Edit `lib/test-strategies/profiles/unit.md` frontmatter, replacing the `assertion_rules` line (line 15) with a multi-clause value covering the mocking rule (unchanged) plus the entry-point rule, scoping (BEH-2/BEH-3), and a concrete anchor for "documented public library API" (addresses review note SA-1):

```yaml
assertion_rules: "Mock only at external boundaries (HTTP, DB, filesystem, external-API). Internal module mocking is forbidden. Entry-point boundary: whenever a public entry point exists for the behavior under test — a CLI subcommand invoked as a subprocess, a hook's stdin/stdout + exit-code contract, or a function whose doc-comment or docs/skill-reference.md / docs/cli-reference.md entry explicitly documents it as a public library API — the test's primary assertion for that behavior MUST invoke it through that entry point. Internal-function-level tests remain permitted only as a supplement (e.g. covering branch combinations impractical to drive end-to-end), never as a replacement, for the public-entry-point test of the same behavior. When no public entry point exists for a behavior, this rule does not apply and a direct internal-function test is sufficient."
```

Then apply the byte-identical string to `UNIT_PROFILE.assertion_rules` in `lib/test-strategies/profiles.mjs` (lines 25-26), preserving the existing multi-line string-literal formatting:

```javascript
  assertion_rules:
    'Mock only at external boundaries (HTTP, DB, filesystem, external-API). Internal module mocking is forbidden. Entry-point boundary: whenever a public entry point exists for the behavior under test — a CLI subcommand invoked as a subprocess, a hook\'s stdin/stdout + exit-code contract, or a function whose doc-comment or docs/skill-reference.md / docs/cli-reference.md entry explicitly documents it as a public library API — the test\'s primary assertion for that behavior MUST invoke it through that entry point. Internal-function-level tests remain permitted only as a supplement (e.g. covering branch combinations impractical to drive end-to-end), never as a replacement, for the public-entry-point test of the same behavior. When no public entry point exists for a behavior, this rule does not apply and a direct internal-function test is sufficient.',
```

- [ ] **Verify test passes**

Run: `node --test tests/evals/test-strategies/test-strategies.test.mjs tests/lib/test-strategies/profiles.test.mjs`
Expected: PASS — all `Profile content: unit` assertions pass (including the `UNIT_PROFILE` parity check), all pre-existing tests in `test-strategies.test.mjs` (including `UNIT_PROFILE has all required fields` and the cross-strategy consistency check at line 742) continue to pass since no required fields were removed, and `profiles.test.mjs`'s existing `assert.deepEqual(profile, UNIT_PROFILE)` fallback assertions continue to pass unmodified since they compare against whatever `UNIT_PROFILE` currently holds.

- [ ] **Commit**

Branch (if not already created): `feat/test-strategies/entry-point-boundary-rule`

```bash
git add lib/test-strategies/profiles/unit.md lib/test-strategies/profiles.mjs tests/evals/test-strategies/test-strategies.test.mjs
git commit -m "feat(test-strategies): add entry-point boundary rule to unit profile

Spec: .context-index/specs/features/test-strategies/strategy-profile-contract-rev-3-entry-point-boundary-rule.spec.md
Plan-task: 1"
```

---

## Task 2: Document entry-point boundary rule in docs [specialist: none]

**Depends on:** Task 1
**Charter capability:** Strategy Profile Contract
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/docs/test-strategies-docs.test.mjs`
- Modify: `docs/test-strategies.md:285`

**Tests:** `tests/docs/test-strategies-docs.test.mjs` — new suite; no existing `tests/docs/*.test.mjs` file asserts on `docs/test-strategies.md`'s unit-strategy section (the closest neighbor, `test-depth-policy-docs.test.mjs`, only asserts the unrelated "floor is advisory" sentence).

**Context to load:**
- `tests/docs/test-depth-policy-docs.test.mjs` (full read — `read()` helper + `assert.match` idiom)
- `docs/test-strategies.md:255-294` (the "In `/adev:write-test`" section this task edits)
- Task 1's finalized `assertion_rules` wording (the doc prose should describe the same rule, in reader-friendly form, not diverge from the profile text)

- [ ] **Write failing test**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(p) {
  return readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
}

test("docs/test-strategies.md documents the entry-point boundary rule for unit tasks", () => {
  const doc = read("docs/test-strategies.md");
  assert.match(doc, /entry[- ]point/i);
});

test("docs/test-strategies.md documents the mocking-boundary and entry-point rules together", () => {
  const doc = read("docs/test-strategies.md");
  const unitSection = doc.slice(doc.indexOf("For a `unit` task"));
  assert.match(unitSection.slice(0, 1200), /mock/i);
  assert.match(unitSection.slice(0, 1200), /entry[- ]point/i);
});

test("docs/test-strategies.md scopes the entry-point rule to supplement-not-replacement", () => {
  const doc = read("docs/test-strategies.md");
  assert.match(doc, /supplement/i);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/docs/test-strategies-docs.test.mjs`
Expected: FAIL — `docs/test-strategies.md` line 285 currently reads only "For a `unit` task, behavior is identical to before — the unit profile codifies the existing rules." with no entry-point or supplement language.

- [ ] **Implement**

Replace the single sentence at `docs/test-strategies.md:285` with a two-rule breakdown that states both the existing mocking-boundary rule and the new entry-point boundary rule together, per BEH-4:

```markdown
For a `unit` task, behavior is identical to before — the unit profile codifies the existing rules:

- **Mocking boundary:** mock only at external boundaries (HTTP, DB, filesystem, external APIs). Internal module mocking is forbidden.
- **Entry-point boundary:** whenever a public entry point exists for the behavior under test — a CLI subcommand run as a subprocess, a hook's stdin/stdout + exit-code contract, or a function explicitly documented as a public library API (a doc-comment, or an entry in [`skill-reference.md`](skill-reference.md) / [`cli-reference.md`](cli-reference.md)) — a test's primary assertion for that behavior must invoke it through that entry point. Internal-function tests remain permitted as a **supplement** (e.g. covering branch combinations impractical to drive end-to-end through the CLI/hook), never as a **replacement**, for the public-entry-point test of the same behavior. When no public entry point exists for a behavior, this rule does not apply — a direct internal-function test is sufficient.
```

- [ ] **Verify test passes**

Run: `node --test tests/docs/test-strategies-docs.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add docs/test-strategies.md tests/docs/test-strategies-docs.test.mjs
git commit -m "docs(test-strategies): document unit entry-point boundary rule

Spec: .context-index/specs/features/test-strategies/strategy-profile-contract-rev-3-entry-point-boundary-rule.spec.md
Plan-task: 2"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

`governance/gates.yaml` exists — use its gate definitions:

- `test` (fast, error, required): `npm test`
- `integration-test` (integration, warning, not required): `npm run test:evals` — covers `tests/evals/test-strategies/test-strategies.test.mjs`, the file Task 1 extends
- All acceptance criteria from the spec satisfied:
  - `lib/test-strategies/profiles/unit.md`'s `assertion_rules` states the entry-point boundary rule (BEH-1), and `lib/test-strategies/profiles.mjs`'s `UNIT_PROFILE.assertion_rules` fallback constant carries the identical text so the fallback-of-last-resort path does not silently serve the pre-amendment rule
  - `docs/test-strategies.md` documents the rule under the unit strategy's assertion rules discussion (BEH-4)
  - Scope (BEH-2, BEH-3) is stated clearly enough that a supplementing internal-function test is not mistaken for a violation
  - No changes to `schema-strategy-profile.spec.md`, `contract-strategy-profile.spec.md`, or the other 6 non-unit profile specs (this plan touches none of them)
- No constitutional violations introduced
