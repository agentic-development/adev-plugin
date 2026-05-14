<!-- DO NOT EDIT statuses inline — see lifecycle log domain-aware-skill-integration.jsonl -->
# Implementation Plan: Domain-Aware Skill Integration

> **Methodology:** adev
> **Charter:** .context-index/specs/features/domain-profiles/charter.md
> **Spec:** .context-index/specs/features/domain-profiles/domain-aware-skill-integration.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-10)
> **Platform:** Node.js, JavaScript (ESM), node:test

**Goal:** Implement domain-aware config loading for all lifecycle skills, replacing hardcoded defaults with domain profile overlays merged via deterministic companion code.

**Architecture:** Each skill integration point gets a dedicated merge module in `lib/domains/` that accepts pre-loaded overlay data and governance data, returning a merged config object. The existing modules (`lib/governance/review-config.mjs`, `lib/governance/validate-config.mjs`, `lib/lifecycle-gate-config.mjs`, `lib/test-strategies/profiles.mjs`) are refactored to delegate their defaults to domain profiles instead of using hardcoded constants. Skills call `resolveDomain()` once at startup, then pass the result to the appropriate merge function. Markdown overlays (charter, spec) use H2 heading-based section matching implemented in a shared merge module. The "wiring" tasks update skill SKILL.md files to include domain-aware startup instructions and update existing lib modules to accept domain config parameters.

**Review notes addressed:** SA-1 (template merge modules at `lib/domains/merge-template-overlay.mjs`), SA-2 (provenance tracking via `__source` field), SA-3 (gate-config and test-config explicitly have no governance layer), SA-4 (standardized `merge*()` naming with thin `load*Config()` wrappers), CA-4 (use `mergeDomainGates()` to avoid collision with `resolveGateConfig()`), CA-5 (severity defaults flow from domain gate overlay per-gate `severity` field), SEC-2 (argv-list enforcement for gate commands).

---

## File Structure

**Create:**
- `lib/domains/merge-template-overlay.mjs` -- H2 section matching for charter and spec overlays
- `lib/domains/merge-reviewers.mjs` -- Merge domain reviewers + governance reviewers
- `lib/domains/merge-gates.mjs` -- Merge domain gates + governance gates
- `lib/domains/merge-verification.mjs` -- Load and validate verification config
- `lib/domains/merge-gate-config.mjs` -- Load domain gate config (file exclusions, bash passthrough)
- `lib/domains/merge-test-config.mjs` -- Load domain test config (permitted tools, gaming thresholds)
- `tests/lib/domains/merge-template-overlay.test.mjs` -- Tests for H2 section matching
- `tests/lib/domains/merge-reviewers.test.mjs` -- Tests for reviewer merging
- `tests/lib/domains/merge-gates.test.mjs` -- Tests for gate merging
- `tests/lib/domains/merge-verification.test.mjs` -- Tests for verification config
- `tests/lib/domains/merge-gate-config.test.mjs` -- Tests for gate config
- `tests/lib/domains/merge-test-config.test.mjs` -- Tests for test config
- `tests/lib/domains/integration.test.mjs` -- Integration tests for domain-aware config loading

**Modify:**
- `lib/governance/review-config.mjs` -- Remove `BUNDLED_REVIEWER_IDS`, delegate to domain profile via `mergeReviewers()`
- `lib/governance/validate-config.mjs` -- Remove `DEFAULT_SEVERITY_BY_KIND`, accept domain severity defaults as parameter
- `lib/lifecycle-gate-config.mjs` -- Remove `DEFAULT_FILE_EXCLUSIONS` and `DEFAULT_BASH_PASSTHROUGH`, accept domain gate config as parameter
- `lib/test-strategies/profiles.mjs` -- Remove hardcoded `permitted_tools` from `UNIT_PROFILE`, accept domain test config
- `skills/brainstorm/SKILL.md` -- Add domain-aware charter overlay loading instructions
- `skills/specify/SKILL.md` -- Add domain-aware spec overlay loading instructions
- `skills/review-specs/SKILL.md` -- Add domain-aware reviewer dispatch instructions
- `skills/validate/SKILL.md` -- Add domain-aware gate loading instructions
- `skills/implement/SKILL.md` -- Add domain-aware verification config instructions
- `skills/write-test/SKILL.md` -- Add domain-aware test config instructions

**Reference (read, do not modify):**
- `lib/domains/resolve.mjs` -- `resolveDomain()` function
- `lib/domains/overlay.mjs` -- `loadOverlay()` function
- `lib/domains/constants.mjs` -- Overlay type constants
- `.context-index/governance/review.yaml` -- Governance reviewer format
- `.context-index/governance/gates.yaml` -- Governance gate format
- `tests/lib/domains/resolve.test.mjs` -- Existing test patterns
- `tests/lib/domains/overlay.test.mjs` -- Existing test patterns

---

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/domain-profiles/domain-aware-skill-integration.spec.md` (Behaviors 2-4, template overlay)
- Charter: `.context-index/specs/features/domain-profiles/charter.md` (capability: Charter Template Overlay, Spec Template Overlay)
- Source files: `lib/domains/overlay.mjs` (loadOverlay API), `lib/domains/constants.mjs` (overlay types)

### Task 2 Context
- Spec: `.context-index/specs/features/domain-profiles/domain-aware-skill-integration.spec.md` (Behaviors 5-9, reviewer merge)
- Charter: `.context-index/specs/features/domain-profiles/charter.md` (capability: Domain-Aware Reviewer Dispatch)
- Source files: `lib/governance/review-config.mjs` (current reviewer loading, `BUNDLED_REVIEWER_IDS`, `__source` tracking lines 307-324), `.context-index/governance/review.yaml` (reviewer schema)
- Review notes: SA-2 (provenance tracking), SA-4 (function naming), CA-4 (naming collision)

### Task 3 Context
- Spec: `.context-index/specs/features/domain-profiles/domain-aware-skill-integration.spec.md` (Behaviors 10-11, gate merge)
- Charter: `.context-index/specs/features/domain-profiles/charter.md` (capability: Domain-Aware Quality Gates)
- Source files: `lib/governance/validate-config.mjs` (current gate loading, `DEFAULT_SEVERITY_BY_KIND`), `.context-index/governance/gates.yaml` (gate schema)
- Review notes: CA-4 (naming), CA-5 (severity defaults), SEC-2 (argv-list enforcement)

### Task 4 Context
- Spec: `.context-index/specs/features/domain-profiles/domain-aware-skill-integration.spec.md` (Behaviors 12-16, verification config)
- Charter: `.context-index/specs/features/domain-profiles/charter.md` (capability: Domain-Aware Verification)
- Review notes: SEC-4 (symlink edge case -- v1 limitation, match against logical paths)

### Task 5 Context
- Spec: `.context-index/specs/features/domain-profiles/domain-aware-skill-integration.spec.md` (Behaviors 17-18, gate config)
- Charter: `.context-index/specs/features/domain-profiles/charter.md` (capability: Domain-Aware Lifecycle Gates)
- Source files: `lib/lifecycle-gate-config.mjs` (current `DEFAULT_FILE_EXCLUSIONS`, `DEFAULT_BASH_PASSTHROUGH`)

### Task 6 Context
- Spec: `.context-index/specs/features/domain-profiles/domain-aware-skill-integration.spec.md` (Behaviors 19-20, test config)
- Charter: `.context-index/specs/features/domain-profiles/charter.md` (capability: Domain-Aware Test Config)
- Source files: `lib/test-strategies/profiles.mjs` (current `UNIT_PROFILE.permitted_tools`)

### Task 7 Context
- Spec: `.context-index/specs/features/domain-profiles/domain-aware-skill-integration.spec.md` (AC lines 181-184)
- Source files: `lib/governance/review-config.mjs`, `lib/governance/validate-config.mjs`, `lib/lifecycle-gate-config.mjs`, `lib/test-strategies/profiles.mjs`
- Review notes: SA-2 (provenance tracking migration), CA-5 (severity default flow)

### Task 8 Context
- Spec: `.context-index/specs/features/domain-profiles/domain-aware-skill-integration.spec.md` (Behaviors 2-3, charter overlay)
- Source files: `skills/brainstorm/SKILL.md`, `lib/domains/merge-template-overlay.mjs`

### Task 9 Context
- Spec: `.context-index/specs/features/domain-profiles/domain-aware-skill-integration.spec.md` (Behavior 4, spec overlay)
- Source files: `skills/specify/SKILL.md`, `lib/domains/merge-template-overlay.mjs`

### Task 10 Context
- Spec: `.context-index/specs/features/domain-profiles/domain-aware-skill-integration.spec.md` (Behavior 5, reviewer dispatch)
- Source files: `skills/review-specs/SKILL.md`, `lib/domains/merge-reviewers.mjs`

### Task 11 Context
- Spec: `.context-index/specs/features/domain-profiles/domain-aware-skill-integration.spec.md` (Behavior 10, gate loading)
- Source files: `skills/validate/SKILL.md`, `lib/domains/merge-gates.mjs`

### Task 12 Context
- Spec: `.context-index/specs/features/domain-profiles/domain-aware-skill-integration.spec.md` (Behavior 12, verification)
- Source files: `skills/implement/SKILL.md`, `lib/domains/merge-verification.mjs`

### Task 13 Context
- Spec: `.context-index/specs/features/domain-profiles/domain-aware-skill-integration.spec.md` (Behaviors 17-18, gate config)
- Source files: `hooks/` directory, `lib/domains/merge-gate-config.mjs`, `lib/lifecycle-gate-config.mjs`

### Task 14 Context
- Spec: `.context-index/specs/features/domain-profiles/domain-aware-skill-integration.spec.md` (Behaviors 19-20, test config)
- Source files: `skills/write-test/SKILL.md`, `skills/implement/SKILL.md`, `lib/domains/merge-test-config.mjs`

### Task 15 Context
- Spec: `.context-index/specs/features/domain-profiles/domain-aware-skill-integration.spec.md` (Behavior 21, immutability)
- All merge modules from Tasks 1-6

### Task 16 Context
- Spec: `.context-index/specs/features/domain-profiles/domain-aware-skill-integration.spec.md` (all behaviors)
- All merge modules, all skill modifications, governance files

### Task 17 Context
- Spec: `.context-index/specs/features/domain-profiles/domain-aware-skill-integration.spec.md` (AC lines 198-199)

---

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

### Heuristic: Use session JSONL for token measurement, not file-size estimates (confidence: medium)
- **Pattern:** When evaluating token consumption or cost of adev skills, parse real session JSONL files from ~/.claude/projects/ (message.usage fields: input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens). Dispatch paired A/B subagents and compare their JSONL data for controlled experiments.
- **Anti-pattern:** Estimate tokens using bytes/4 or hardcoded assumptions about thinking budgets and cache hit rates. These overstate savings by 2-2.5x vs real measurements.
- **Evidence:** 1 observations

### Heuristic: Cache reads are 71% of session cost -- minimize context accumulation (confidence: medium)
- **Pattern:** When optimizing token cost, focus on reducing what accumulates in conversation context (output echoes, artifact dumps, verbose subagent returns). Every output token persists as a cache read on all subsequent turns, creating multiplicative amplification.
- **Anti-pattern:** Focus on reducing input token counts (SKILL.md sizes, context packets). Input is <1% of cost; cache reads at 0.1x pricing dominate due to volume (98% of all tokens processed).
- **Evidence:** 1 observations

### Heuristic: Summarized skill output produces equivalent artifact quality (confidence: medium)
- **Pattern:** When a skill writes an artifact to disk (plan, review, validation report), instruct it to return only a structured summary to the conversation. The artifact on disk will be equally complete -- the summarization instruction affects echo volume, not reasoning.
- **Anti-pattern:** Assume that shorter output means lower quality artifacts. The model reasons the same way regardless of how much it echoes back. A/B eval showed 12/12 rubric parity with 36% cost savings.
- **Evidence:** 1 observations

---

## Parallelization

- Group A (independent): Task 1 (template overlay merge)
- Group B (independent): Task 2 (reviewer merge)
- Group C (independent): Task 3 (gate merge)
- Group D (independent): Task 4 (verification merge)
- Group E (independent): Task 5 (gate config merge)
- Group F (independent): Task 6 (test config merge)
- Group G (sequential): Task 7 (refactor existing modules -- depends on Tasks 2, 3, 5, 6)
- Group H (sequential): Tasks 8-14 (skill wiring -- depend on Tasks 1-7 respectively)
- Group I (sequential): Task 15 (immutability tests -- depends on Tasks 1-6)
- Group J (sequential): Task 16 (integration tests -- depends on Tasks 1-14)
- Group K (sequential): Task 17 (documentation -- depends on Tasks 1-14)

Groups A-F can run in parallel. Group G depends on B, C, E, F. Group H depends on A-G. Groups I, J, K depend on prior groups.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Template overlay merge (H2 section matching) | medium | unit | -- | 2 create |
| 2 | Reviewer merge function | medium | unit | -- | 2 create |
| 3 | Gate merge function | small | unit | -- | 2 create |
| 4 | Verification config merge function | small | unit | -- | 2 create |
| 5 | Gate config merge function | small | unit | -- | 2 create |
| 6 | Test config merge function | small | unit | -- | 2 create |
| 7 | Refactor existing modules to delegate to domain profiles | medium | unit | Task 2, 3, 5, 6 | 0 create, 4 modify |
| 8 | Wire domain resolution into brainstorm | small | unit | Task 1 | 0 create, 1 modify |
| 9 | Wire domain resolution into specify | small | unit | Task 1 | 0 create, 1 modify |
| 10 | Wire domain resolution into review-specs | small | unit | Task 2, 7 | 0 create, 1 modify |
| 11 | Wire domain resolution into validate | small | unit | Task 3, 7 | 0 create, 1 modify |
| 12 | Wire domain resolution into implement | small | unit | Task 4 | 0 create, 1 modify |
| 13 | Wire domain resolution into lifecycle gate hooks | medium | unit | Task 5, 7 | 0 create, 2 modify |
| 14 | Wire domain resolution into write-test/implement | small | unit | Task 6, 7 | 0 create, 2 modify |
| 15 | Immutability invariant tests | small | unit | Task 1-6 | 0 create, 6 modify |
| 16 | Integration tests | large | unit | Task 1-14 | 1 create |
| 17 | Documentation updates | small | unit | Task 7-14 | 0 create, 2 modify |

---

### Task 1: Template Overlay Merge (H2 Section Matching) [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=3
**Rationale:** Well-specified H2 section matching with detailed behaviors and test expectations; existing overlay.mjs provides a close pattern but string-based section parsing is a novel composition.

**Charter capability:** Charter Template Overlay, Spec Template Overlay
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/domains/merge-template-overlay.mjs`
- Create: `tests/lib/domains/merge-template-overlay.test.mjs`

**Tests:** `tests/lib/domains/merge-template-overlay.test.mjs`

**Context to load:**
- Spec Behaviors 2-4 (charter overlay, spec overlay, H2 heading matching)
- `lib/domains/overlay.mjs` (loadOverlay API for reference)

- [x] **Write failing test**

```javascript
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { mergeTemplateOverlay } from '../../../lib/domains/merge-template-overlay.mjs';

describe('mergeTemplateOverlay', () => {
  it('should replace matching H2 sections from overlay', () => {
    const base = '## Section A\nBase content A\n\n## Section B\nBase content B\n';
    const overlay = '## Section A\nOverlay content A\n';
    const result = mergeTemplateOverlay(base, overlay);
    assert.ok(result.includes('Overlay content A'));
    assert.ok(!result.includes('Base content A'));
    assert.ok(result.includes('Base content B'));
  });

  it('should append non-matching H2 sections from overlay', () => {
    const base = '## Section A\nBase content A\n';
    const overlay = '## Section C\nNew content C\n';
    const result = mergeTemplateOverlay(base, overlay);
    assert.ok(result.includes('Base content A'));
    assert.ok(result.includes('New content C'));
  });

  it('should never mutate the base string input', () => {
    const base = '## Section A\nBase content A\n';
    const overlay = '## Section A\nOverlay content A\n';
    const baseCopy = base;
    mergeTemplateOverlay(base, overlay);
    assert.equal(base, baseCopy);
  });

  it('should return base unchanged when overlay is null', () => {
    const base = '## Section A\nBase content A\n';
    const result = mergeTemplateOverlay(base, null);
    assert.equal(result, base);
  });

  it('should return base unchanged when overlay is empty', () => {
    const base = '## Section A\nBase content A\n';
    const result = mergeTemplateOverlay(base, '');
    assert.equal(result, base);
  });

  it('should preserve preamble content before first H2', () => {
    const base = '# Title\n\nPreamble text.\n\n## Section A\nContent A\n';
    const overlay = '## Section A\nNew A\n';
    const result = mergeTemplateOverlay(base, overlay);
    assert.ok(result.includes('# Title'));
    assert.ok(result.includes('Preamble text'));
    assert.ok(result.includes('New A'));
    assert.ok(!result.includes('Content A'));
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/lib/domains/merge-template-overlay.test.mjs`
Expected: FAIL -- module not found

- [x] **Implement**

Create `lib/domains/merge-template-overlay.mjs` with:
- `mergeTemplateOverlay(base, overlay)` -- pure function, returns new string
- H2 heading matching: overlay sections with matching `## Heading` replace base sections
- Non-matching overlay sections appended after all base sections
- Preserves preamble content before first H2 heading
- Never mutates inputs (strings are immutable in JS, but ensure no side effects)

- [x] **Verify test passes**

Run: `node --test tests/lib/domains/merge-template-overlay.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add lib/domains/merge-template-overlay.mjs tests/lib/domains/merge-template-overlay.test.mjs
git commit -m "feat(domain-profiles): add H2 section-matching template overlay merge

Spec: .context-index/specs/features/domain-profiles/domain-aware-skill-integration.spec.md
Plan-task: 1"
```

---

### Task 2: Reviewer Merge Function [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=3
**Rationale:** Detailed merge behaviors with provenance tracking, merge_strategy, and defaults; overlay.mjs and review-config.mjs provide strong reference patterns.

**Charter capability:** Domain-Aware Reviewer Dispatch
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/domains/merge-reviewers.mjs`
- Create: `tests/lib/domains/merge-reviewers.test.mjs`

**Tests:** `tests/lib/domains/merge-reviewers.test.mjs`

**Context to load:**
- Spec Behaviors 5-9 (reviewer merge, merge_strategy, id override, missing id skip)
- `lib/governance/review-config.mjs` (current `BUNDLED_REVIEWER_IDS`, `__source` tracking)
- `.context-index/governance/review.yaml` (reviewer schema)
- Review notes SA-2 (provenance tracking), SA-4 (use `merge*()` naming)

- [x] **Write failing test**

```javascript
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { mergeReviewers } from '../../../lib/domains/merge-reviewers.mjs';

describe('mergeReviewers', () => {
  it('should merge domain and governance reviewers (append mode)', () => {
    const domain = { reviewers: [{ id: 'r1', dispatch: 'always' }] };
    const governance = { reviewers: [{ id: 'g1', dispatch: 'triggered' }] };
    const result = mergeReviewers(domain, governance);
    assert.equal(result.reviewers.length, 2);
  });

  it('should override domain reviewer when governance has same id', () => {
    const domain = { reviewers: [{ id: 'r1', dispatch: 'always' }] };
    const governance = { reviewers: [{ id: 'r1', dispatch: 'triggered' }] };
    const result = mergeReviewers(domain, governance);
    assert.equal(result.reviewers.length, 1);
    assert.equal(result.reviewers[0].dispatch, 'triggered');
    assert.equal(result.reviewers[0].__source, 'governance');
  });

  it('should use replace strategy to drop base reviewers', () => {
    const domain = { reviewers: [{ id: 'r1' }], merge_strategy: 'replace' };
    const governance = { reviewers: [{ id: 'g1' }] };
    const result = mergeReviewers(domain, governance);
    assert.equal(result.reviewers.length, 2);
    assert.ok(result.warnings.some(w => w.message.includes('replaced base reviewers')));
  });

  it('should skip entries missing id with OVERLAY_MERGE_WARN', () => {
    const domain = { reviewers: [{ dispatch: 'always' }, { id: 'r1' }] };
    const result = mergeReviewers(domain, null);
    assert.equal(result.reviewers.length, 1);
    assert.ok(result.warnings.some(w => w.code === 'OVERLAY_MERGE_WARN'));
  });

  it('should treat unknown merge_strategy as append with warning', () => {
    const domain = { reviewers: [{ id: 'r1' }], merge_strategy: 'invalid' };
    const result = mergeReviewers(domain, null);
    assert.equal(result.reviewers.length, 1);
    assert.ok(result.warnings.some(w => w.code === 'OVERLAY_MERGE_WARN'));
  });

  it('should apply defaults for missing optional fields', () => {
    const domain = { reviewers: [{ id: 'r1' }] };
    const result = mergeReviewers(domain, null);
    assert.equal(result.reviewers[0].dispatch, 'always');
    assert.equal(result.reviewers[0].profile, 'reviewer-capable');
    assert.equal(result.reviewers[0].severity_cap, 'blocker');
    assert.equal(result.reviewers[0].context_pack, 'base');
  });

  it('should track entry provenance (__source)', () => {
    const domain = { reviewers: [{ id: 'r1' }] };
    const governance = { reviewers: [{ id: 'g1' }] };
    const result = mergeReviewers(domain, governance);
    assert.equal(result.reviewers[0].__source, 'domain');
    assert.equal(result.reviewers[1].__source, 'governance');
  });

  it('should handle null domain and null governance', () => {
    const result = mergeReviewers(null, null);
    assert.equal(result.reviewers.length, 0);
    assert.ok(result.warnings.length > 0);
  });

  it('should return new object, never mutate inputs', () => {
    const domain = Object.freeze({ reviewers: Object.freeze([Object.freeze({ id: 'r1' })]) });
    const governance = Object.freeze({ reviewers: Object.freeze([Object.freeze({ id: 'g1' })]) });
    assert.doesNotThrow(() => mergeReviewers(domain, governance));
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/lib/domains/merge-reviewers.test.mjs`
Expected: FAIL

- [x] **Implement**

Create `lib/domains/merge-reviewers.mjs` with:
- `mergeReviewers(domainOverlay, governanceOverlay)` -- pure merge function accepting pre-loaded data
- `loadReviewerConfig(domain, repoRoot, pluginRoot)` -- thin I/O wrapper calling `loadOverlay()` + reading governance + calling `mergeReviewers()`
- Entry provenance tracking via `__source` field (`"domain"` or `"governance"`)
- `merge_strategy: replace` support with warning
- Reviewer entry validation (skip missing `id`, apply defaults for optional fields)
- Warning objects: `{ code: string, message: string }`

- [x] **Verify test passes**

Run: `node --test tests/lib/domains/merge-reviewers.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add lib/domains/merge-reviewers.mjs tests/lib/domains/merge-reviewers.test.mjs
git commit -m "feat(domain-profiles): add reviewer merge function with provenance tracking

Spec: .context-index/specs/features/domain-profiles/domain-aware-skill-integration.spec.md
Plan-task: 2"
```

---

### Task 3: Gate Merge Function [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=4
**Rationale:** Small scope with explicit ID-based merge, argv-list enforcement, and severity defaults; follows same merge pattern as Task 2 with simpler logic.

**Charter capability:** Domain-Aware Quality Gates
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/domains/merge-gates.mjs`
- Create: `tests/lib/domains/merge-gates.test.mjs`

**Tests:** `tests/lib/domains/merge-gates.test.mjs`

**Context to load:**
- Spec Behaviors 10-11 (gate merge by id, governance override warning)
- `.context-index/governance/gates.yaml` (gate schema)
- Review notes SEC-2 (argv-list enforcement), CA-5 (severity defaults)

- [x] **Write failing test**

```javascript
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { mergeGates } from '../../../lib/domains/merge-gates.mjs';

describe('mergeGates', () => {
  it('should merge domain and governance gates by id', () => {
    const domain = { gates: [{ id: 'test', command: ['npm', 'test'] }] };
    const governance = { gates: [{ id: 'lint', command: ['npm', 'run', 'lint'] }] };
    const result = mergeGates(domain, governance);
    assert.equal(result.gates.length, 2);
  });

  it('should override domain gate when governance has same id with warning', () => {
    const domain = { gates: [{ id: 'test', command: ['npm', 'test'] }] };
    const governance = { gates: [{ id: 'test', command: ['npm', 'run', 'test:ci'] }] };
    const result = mergeGates(domain, governance);
    assert.equal(result.gates.length, 1);
    assert.deepEqual(result.gates[0].command, ['npm', 'run', 'test:ci']);
    assert.ok(result.warnings.some(w => w.message.includes('overrides domain gate')));
  });

  it('should skip entries missing id or command with INVALID_GATE', () => {
    const domain = { gates: [{ command: ['npm', 'test'] }, { id: 'test' }, { id: 'lint', command: ['eslint', '.'] }] };
    const result = mergeGates(domain, null);
    assert.equal(result.gates.length, 1);
    assert.ok(result.warnings.filter(w => w.code === 'INVALID_GATE').length >= 2);
  });

  it('should reject shell-form command strings with INVALID_GATE', () => {
    const domain = { gates: [{ id: 'test', command: 'npm test' }] };
    const result = mergeGates(domain, null);
    assert.equal(result.gates.length, 0);
    assert.ok(result.warnings.some(w => w.code === 'INVALID_GATE'));
  });

  it('should return new object, never mutate inputs', () => {
    const domain = Object.freeze({ gates: Object.freeze([Object.freeze({ id: 'test', command: Object.freeze(['npm', 'test']) })]) });
    assert.doesNotThrow(() => mergeGates(domain, null));
  });

  it('should preserve severity from domain overlay', () => {
    const domain = { gates: [{ id: 'test', command: ['npm', 'test'], severity: 'warning' }] };
    const result = mergeGates(domain, null);
    assert.equal(result.gates[0].severity, 'warning');
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/lib/domains/merge-gates.test.mjs`
Expected: FAIL

- [x] **Implement**

Create `lib/domains/merge-gates.mjs` with:
- `mergeGates(domainOverlay, governanceOverlay)` -- pure merge function
- `loadDomainGates(domain, repoRoot, pluginRoot)` -- thin I/O wrapper
- ID-based merge: governance gates with matching IDs override domain gates
- Entry validation: skip entries missing `id` or `command` with `INVALID_GATE`
- Argv-list enforcement: reject string-form `command` values with `INVALID_GATE` (SEC-2)
- Override warning emission with gate `id` and source path
- Severity defaults preserved from domain overlay (CA-5)

- [x] **Verify test passes**

Run: `node --test tests/lib/domains/merge-gates.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add lib/domains/merge-gates.mjs tests/lib/domains/merge-gates.test.mjs
git commit -m "feat(domain-profiles): add gate merge function with argv-list enforcement

Spec: .context-index/specs/features/domain-profiles/domain-aware-skill-integration.spec.md
Plan-task: 3"
```

---

### Task 4: Verification Config Merge Function [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=4
**Rationale:** Well-specified validation/normalization with explicit type enum, pattern rejection rules, and tool validation; follows established merge module pattern.

**Charter capability:** Domain-Aware Verification
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/domains/merge-verification.mjs`
- Create: `tests/lib/domains/merge-verification.test.mjs`

**Tests:** `tests/lib/domains/merge-verification.test.mjs`

**Context to load:**
- Spec Behaviors 12-16 (verification type, trigger_patterns, tool validation)

- [x] **Write failing test**

```javascript
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { mergeVerification } from '../../../lib/domains/merge-verification.mjs';

describe('mergeVerification', () => {
  it('should return valid verification config', () => {
    const overlay = { type: 'visual', trigger_patterns: ['*.html'], tool: 'playwright' };
    const result = mergeVerification(overlay);
    assert.equal(result.config.type, 'visual');
    assert.deepEqual(result.config.trigger_patterns, ['*.html']);
  });

  it('should accept output type', () => {
    const result = mergeVerification({ type: 'output', trigger_patterns: ['*.csv'], tool: 'none' });
    assert.equal(result.config.type, 'output');
  });

  it('should accept flow type', () => {
    const result = mergeVerification({ type: 'flow', trigger_patterns: ['*.yaml'], tool: 'none' });
    assert.equal(result.config.type, 'flow');
  });

  it('should reject unknown type with UNKNOWN_VERIFY_TYPE', () => {
    const result = mergeVerification({ type: 'unknown' });
    assert.equal(result.config, null);
    assert.ok(result.warnings.some(w => w.code === 'UNKNOWN_VERIFY_TYPE'));
  });

  it('should reject trigger_patterns with path traversal (INVALID_PATTERN)', () => {
    const overlay = { type: 'visual', trigger_patterns: ['../etc/passwd', '*.html'], tool: 'none' };
    const result = mergeVerification(overlay);
    assert.equal(result.config.trigger_patterns.length, 1);
    assert.ok(result.warnings.some(w => w.code === 'INVALID_PATTERN'));
  });

  it('should reject absolute path trigger_patterns (INVALID_PATTERN)', () => {
    const overlay = { type: 'visual', trigger_patterns: ['/etc/passwd'], tool: 'none' };
    const result = mergeVerification(overlay);
    assert.equal(result.config.trigger_patterns.length, 0);
  });

  it('should flag tool not in active servers with TOOL_UNAVAILABLE', () => {
    const overlay = { type: 'visual', trigger_patterns: ['*.html'], tool: 'playwright' };
    const result = mergeVerification(overlay, new Set(['other-tool']));
    assert.equal(result.config, null);
    assert.ok(result.warnings.some(w => w.code === 'TOOL_UNAVAILABLE'));
  });

  it('should accept tool: none without checking active servers', () => {
    const result = mergeVerification({ type: 'output', trigger_patterns: [], tool: 'none' });
    assert.equal(result.config.tool, 'none');
    assert.equal(result.warnings.length, 0);
  });

  it('should return null config when overlay is null', () => {
    const result = mergeVerification(null);
    assert.equal(result.config, null);
  });

  it('should not mutate input overlay', () => {
    const overlay = Object.freeze({ type: 'output', trigger_patterns: Object.freeze(['*.csv']), tool: 'none' });
    assert.doesNotThrow(() => mergeVerification(overlay));
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/lib/domains/merge-verification.test.mjs`
Expected: FAIL

- [x] **Implement**

Create `lib/domains/merge-verification.mjs` with:
- `mergeVerification(overlayData, activeServers?)` -- pure validation/normalization
- Valid types: `visual`, `output`, `flow` (reject others with `UNKNOWN_VERIFY_TYPE`)
- `trigger_patterns` validation: reject `..` and absolute paths with `INVALID_PATTERN`
- `tool` validation: `"none"` always passes; non-`"none"` checked against `activeServers` set
- No governance layer (verification has no governance counterpart -- SA-3)

- [x] **Verify test passes**

Run: `node --test tests/lib/domains/merge-verification.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add lib/domains/merge-verification.mjs tests/lib/domains/merge-verification.test.mjs
git commit -m "feat(domain-profiles): add verification config merge with pattern validation

Spec: .context-index/specs/features/domain-profiles/domain-aware-skill-integration.spec.md
Plan-task: 4"
```

---

### Task 5: Gate Config Merge Function [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=5
**Rationale:** Simple extraction function returning file_exclusions and bash_passthrough arrays; mechanical pattern application with no governance layer.

**Charter capability:** Domain-Aware Lifecycle Gates
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/domains/merge-gate-config.mjs`
- Create: `tests/lib/domains/merge-gate-config.test.mjs`

**Tests:** `tests/lib/domains/merge-gate-config.test.mjs`

**Context to load:**
- Spec Behaviors 17-18 (gate config, file_exclusions, bash_passthrough)
- `lib/lifecycle-gate-config.mjs` (current defaults for reference)

- [x] **Write failing test**

```javascript
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { mergeGateConfig } from '../../../lib/domains/merge-gate-config.mjs';

describe('mergeGateConfig', () => {
  it('should return file_exclusions and bash_passthrough from overlay', () => {
    const overlay = {
      file_exclusions: ['*.test.*', 'docs/**'],
      bash_passthrough: ['git status', 'npm test'],
    };
    const result = mergeGateConfig(overlay);
    assert.deepEqual(result.config.file_exclusions, ['*.test.*', 'docs/**']);
    assert.deepEqual(result.config.bash_passthrough, ['git status', 'npm test']);
  });

  it('should return empty arrays when overlay is null', () => {
    const result = mergeGateConfig(null);
    assert.deepEqual(result.config.file_exclusions, []);
    assert.deepEqual(result.config.bash_passthrough, []);
  });

  it('should handle missing fields gracefully', () => {
    const result = mergeGateConfig({ file_exclusions: ['*.test.*'] });
    assert.deepEqual(result.config.file_exclusions, ['*.test.*']);
    assert.deepEqual(result.config.bash_passthrough, []);
  });

  it('should not mutate input', () => {
    const overlay = Object.freeze({ file_exclusions: Object.freeze(['*.test.*']), bash_passthrough: Object.freeze(['ls']) });
    assert.doesNotThrow(() => mergeGateConfig(overlay));
  });

  it('should handle empty overlay object', () => {
    const result = mergeGateConfig({});
    assert.deepEqual(result.config.file_exclusions, []);
    assert.deepEqual(result.config.bash_passthrough, []);
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/lib/domains/merge-gate-config.test.mjs`
Expected: FAIL

- [x] **Implement**

Create `lib/domains/merge-gate-config.mjs` with:
- `mergeGateConfig(overlayData)` -- pure function
- `loadGateHookConfig(domain, repoRoot, pluginRoot)` -- thin I/O wrapper using `loadOverlay()`
- Returns `{ config: { file_exclusions: string[], bash_passthrough: string[] }, warnings: [] }`
- No governance layer (gate-config has no governance counterpart -- SA-3)
- Returns empty arrays when overlay is null (Behavior 18 -- strictest mode)

- [x] **Verify test passes**

Run: `node --test tests/lib/domains/merge-gate-config.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add lib/domains/merge-gate-config.mjs tests/lib/domains/merge-gate-config.test.mjs
git commit -m "feat(domain-profiles): add gate config merge for file exclusions and bash passthrough

Spec: .context-index/specs/features/domain-profiles/domain-aware-skill-integration.spec.md
Plan-task: 5"
```

---

### Task 6: Test Config Merge Function [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=5
**Rationale:** Simple extraction function returning permitted_tools, max_test_file_size, and skip_patterns; mechanical pattern application with no governance layer.

**Charter capability:** Domain-Aware Test Config
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/domains/merge-test-config.mjs`
- Create: `tests/lib/domains/merge-test-config.test.mjs`

**Tests:** `tests/lib/domains/merge-test-config.test.mjs`

**Context to load:**
- Spec Behaviors 19-20 (test config)
- `lib/test-strategies/profiles.mjs` (current `UNIT_PROFILE.permitted_tools`)

- [x] **Write failing test**

```javascript
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { mergeTestConfig } from '../../../lib/domains/merge-test-config.mjs';

describe('mergeTestConfig', () => {
  it('should return test config from overlay', () => {
    const overlay = {
      permitted_tools: ['node:test', 'jest'],
      max_test_file_size: 500,
      skip_patterns: ['describe\\.skip', 'it\\.skip'],
    };
    const result = mergeTestConfig(overlay);
    assert.deepEqual(result.config.permitted_tools, ['node:test', 'jest']);
    assert.equal(result.config.max_test_file_size, 500);
    assert.equal(result.config.skip_patterns.length, 2);
  });

  it('should return empty config with warning when overlay is null', () => {
    const result = mergeTestConfig(null);
    assert.deepEqual(result.config.permitted_tools, []);
    assert.ok(result.warnings.length > 0);
  });

  it('should handle partial overlay', () => {
    const result = mergeTestConfig({ permitted_tools: ['vitest'] });
    assert.deepEqual(result.config.permitted_tools, ['vitest']);
    assert.equal(result.config.max_test_file_size, undefined);
    assert.deepEqual(result.config.skip_patterns, []);
  });

  it('should not mutate input', () => {
    const overlay = Object.freeze({ permitted_tools: Object.freeze(['node:test']) });
    assert.doesNotThrow(() => mergeTestConfig(overlay));
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/lib/domains/merge-test-config.test.mjs`
Expected: FAIL

- [x] **Implement**

Create `lib/domains/merge-test-config.mjs` with:
- `mergeTestConfig(overlayData)` -- pure function
- `loadTestConfig(domain, repoRoot, pluginRoot)` -- thin I/O wrapper
- Returns `{ config: { permitted_tools, max_test_file_size, skip_patterns }, warnings }`
- No governance layer (test-config has no governance counterpart -- SA-3)
- Returns empty permitted_tools with warning when overlay is null (Behavior 20)

- [x] **Verify test passes**

Run: `node --test tests/lib/domains/merge-test-config.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add lib/domains/merge-test-config.mjs tests/lib/domains/merge-test-config.test.mjs
git commit -m "feat(domain-profiles): add test config merge for permitted tools and gaming thresholds

Spec: .context-index/specs/features/domain-profiles/domain-aware-skill-integration.spec.md
Plan-task: 6"
```

---

### Task 7: Refactor Existing Modules to Delegate to Domain Profiles [specialist: none]

**Routing:** assisted-agent (score: 14/20)
**Scores:** spec=4 pattern=3 blast=3 novelty=4
**Rationale:** Modifies 4 existing modules across 2 directories with coupled refactoring; provenance tracking migration and API parameter changes require careful surgery on existing code.

**Charter capability:** Domain-Aware Reviewer Dispatch, Domain-Aware Quality Gates, Domain-Aware Lifecycle Gates, Domain-Aware Test Config
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2, Task 3, Task 5, Task 6
**Files:**
- Modify: `lib/governance/review-config.mjs` -- Remove `BUNDLED_REVIEWER_IDS`; import and call `mergeReviewers()` for domain-sourced reviewers
- Modify: `lib/governance/validate-config.mjs` -- Remove `DEFAULT_SEVERITY_BY_KIND`; accept domain severity defaults as a parameter to `validateCheck()`
- Modify: `lib/lifecycle-gate-config.mjs` -- Remove `DEFAULT_FILE_EXCLUSIONS` and `DEFAULT_BASH_PASSTHROUGH`; accept domain gate config as parameter to `resolveGateConfig()`
- Modify: `lib/test-strategies/profiles.mjs` -- Remove hardcoded `permitted_tools` from `UNIT_PROFILE`; `loadProfile()` accepts domain-resolved permitted tools
- Test: `tests/lib/domains/refactor-constants.test.mjs`

**Tests:** `tests/lib/domains/refactor-constants.test.mjs`

**Context to load:**
- Spec AC lines 181-184 (no hardcoded constants remain)
- Review notes SA-2 (provenance tracking), CA-5 (severity defaults)
- Full source of all four modules

- [x] **Write failing test**

```javascript
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../../..');

describe('hardcoded constant removal', () => {
  it('review-config.mjs should not contain BUNDLED_REVIEWER_IDS', () => {
    const src = readFileSync(resolve(root, 'lib/governance/review-config.mjs'), 'utf8');
    assert.ok(!src.includes('BUNDLED_REVIEWER_IDS'), 'BUNDLED_REVIEWER_IDS still present');
  });

  it('validate-config.mjs should not contain DEFAULT_SEVERITY_BY_KIND', () => {
    const src = readFileSync(resolve(root, 'lib/governance/validate-config.mjs'), 'utf8');
    assert.ok(!src.includes('DEFAULT_SEVERITY_BY_KIND'), 'DEFAULT_SEVERITY_BY_KIND still present');
  });

  it('lifecycle-gate-config.mjs should not contain DEFAULT_FILE_EXCLUSIONS or DEFAULT_BASH_PASSTHROUGH', () => {
    const src = readFileSync(resolve(root, 'lib/lifecycle-gate-config.mjs'), 'utf8');
    assert.ok(!src.includes('DEFAULT_FILE_EXCLUSIONS'), 'DEFAULT_FILE_EXCLUSIONS still present');
    assert.ok(!src.includes('DEFAULT_BASH_PASSTHROUGH'), 'DEFAULT_BASH_PASSTHROUGH still present');
  });

  it('profiles.mjs should not hardcode permitted_tools in UNIT_PROFILE', () => {
    const src = readFileSync(resolve(root, 'lib/test-strategies/profiles.mjs'), 'utf8');
    // Check that the permitted_tools array is not hardcoded inline in UNIT_PROFILE
    const unitBlock = src.substring(src.indexOf('UNIT_PROFILE'), src.indexOf('REQUIRED_FIELDS'));
    assert.ok(!unitBlock.includes("'node:test'"), 'Hardcoded permitted_tools still in UNIT_PROFILE');
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/lib/domains/refactor-constants.test.mjs`
Expected: FAIL -- constants still present in source files

- [x] **Implement**

Refactor each module:

1. **`review-config.mjs`:** Remove `BUNDLED_REVIEWER_IDS` Set. In `loadReviewConfig()`, import `loadReviewerConfig` from `lib/domains/merge-reviewers.mjs`. Call it to get domain-resolved reviewers. Merge governance reviewers on top using `mergeReviewers()`. Preserve `__source` tracking via the merge function's provenance field (addresses SA-2). Warning logic for `BUNDLED_DEFAULT_OVERRIDE` migrates to `mergeReviewers()`.

2. **`validate-config.mjs`:** Remove `DEFAULT_SEVERITY_BY_KIND` constant. Add an optional `domainSeverityDefaults` parameter to `loadValidateConfig()` that provides per-kind severity defaults from the domain gate overlay. The `validateCheck()` function receives these as a parameter instead of using the module-level constant (addresses CA-5).

3. **`lifecycle-gate-config.mjs`:** Remove `DEFAULT_FILE_EXCLUSIONS` (44 entries) and `DEFAULT_BASH_PASSTHROUGH` (32 entries). Add an optional `domainConfig` parameter to `resolveGateConfig()` containing `{ file_exclusions, bash_passthrough }` from the domain profile. When provided, use as the base instead of the removed hardcoded arrays.

4. **`profiles.mjs`:** Remove hardcoded `permitted_tools` from `UNIT_PROFILE`. The array becomes an empty placeholder. Add parameter to `loadProfile()` to accept domain-resolved permitted tools that populate the profile's `permitted_tools` field.

- [x] **Verify test passes**

Run: `npm test`
Expected: PASS -- all existing tests still pass with refactored modules

- [x] **Commit**

```bash
git add lib/governance/review-config.mjs lib/governance/validate-config.mjs lib/lifecycle-gate-config.mjs lib/test-strategies/profiles.mjs tests/lib/domains/refactor-constants.test.mjs
git commit -m "refactor(domain-profiles): remove hardcoded defaults, delegate to domain profiles

Remove BUNDLED_REVIEWER_IDS, DEFAULT_SEVERITY_BY_KIND, DEFAULT_FILE_EXCLUSIONS,
DEFAULT_BASH_PASSTHROUGH, and hardcoded permitted_tools. Each module now accepts
domain-resolved config from lib/domains/ merge functions.

Spec: .context-index/specs/features/domain-profiles/domain-aware-skill-integration.spec.md
Plan-task: 7"
```

---

### Task 8: Wire Domain Resolution into Brainstorm [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=4
**Rationale:** Markdown-only change adding domain-aware startup instructions; clear spec behavior with explicit loading steps and example code.

**Charter capability:** Charter Template Overlay
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `skills/brainstorm/SKILL.md`

**Tests:** `tests/lib/domains/merge-template-overlay.test.mjs` (already written in Task 1 -- no new tests)

**Context to load:**
- Spec Behaviors 2-3 (charter overlay loading at startup, quality attributes)

- [x] **Write failing test**

No new code tests -- this task modifies skill markdown. The merge function was tested in Task 1.

- [x] **Implement**

Update `skills/brainstorm/SKILL.md` to add domain-aware startup instructions:

At the skill's startup/initialization section, add:
1. Call `resolveDomain()` with the manifest and charter frontmatter to get the active domain
2. Call `loadOverlay(domain, "charter-overlay", repoRoot, pluginRoot)` to get the charter template overlay
3. If overlay is non-null, call `mergeTemplateOverlay(baseTemplate, overlay)` to produce the merged charter template
4. Use the merged template for charter generation
5. If the overlay includes a Quality Attributes section, present domain-specific quality attribute suggestions to the user

Include inline Node.js example:
```bash
node --input-type=module -e "
import { resolveDomain } from '<ADEV_ROOT>/lib/domains/resolve.mjs';
import { loadOverlay } from '<ADEV_ROOT>/lib/domains/overlay.mjs';
import { mergeTemplateOverlay } from '<ADEV_ROOT>/lib/domains/merge-template-overlay.mjs';
// ... usage
"
```

- [x] **Verify test passes**

Run: `npm test`
Expected: PASS (no code changes, only markdown)

- [x] **Commit**

```bash
git add skills/brainstorm/SKILL.md
git commit -m "feat(domain-profiles): wire domain-aware charter overlay into brainstorm skill

Spec: .context-index/specs/features/domain-profiles/domain-aware-skill-integration.spec.md
Plan-task: 8"
```

---

### Task 9: Wire Domain Resolution into Specify [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=4
**Rationale:** Markdown-only change identical in pattern to Task 8; clear spec behavior for spec overlay loading.

**Charter capability:** Spec Template Overlay
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `skills/specify/SKILL.md`

**Tests:** `tests/lib/domains/merge-template-overlay.test.mjs` (already written -- no new tests)

**Context to load:**
- Spec Behavior 4 (spec overlay loading at startup)

- [x] **Write failing test**

No new code tests -- this task modifies skill markdown.

- [x] **Implement**

Update `skills/specify/SKILL.md` to add domain-aware startup instructions:

At the skill's initialization section, add instructions to:
1. Call `resolveDomain()` with manifest and charter frontmatter
2. Call `loadOverlay(domain, "spec-overlay", repoRoot, pluginRoot)` to get the spec template overlay
3. If overlay is non-null, call `mergeTemplateOverlay(baseTemplate, overlay)` to produce the merged spec template
4. Use the merged template for spec generation

- [x] **Verify test passes**

Run: `npm test`
Expected: PASS

- [x] **Commit**

```bash
git add skills/specify/SKILL.md
git commit -m "feat(domain-profiles): wire domain-aware spec overlay into specify skill

Spec: .context-index/specs/features/domain-profiles/domain-aware-skill-integration.spec.md
Plan-task: 9"
```

---

### Task 10: Wire Domain Resolution into Review-Specs [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=4
**Rationale:** Markdown-only change replacing hardcoded reviewer loading with domain-aware call; follows same wiring pattern as Tasks 8-9.

**Charter capability:** Domain-Aware Reviewer Dispatch
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2, Task 7
**Files:**
- Modify: `skills/review-specs/SKILL.md`

**Tests:** `tests/lib/domains/merge-reviewers.test.mjs` (already written -- no new tests)

**Context to load:**
- Spec Behavior 5 (reviewer dispatch)

- [x] **Write failing test**

No new code tests -- this task modifies skill markdown. The reviewer loading code path is already refactored in Task 7.

- [x] **Implement**

Update `skills/review-specs/SKILL.md` to replace hardcoded reviewer loading with domain-aware instructions:

At the reviewer loading step, add:
1. Call `resolveDomain()` with manifest and charter frontmatter
2. Call `loadReviewerConfig(domain, repoRoot, pluginRoot)` from `lib/domains/merge-reviewers.mjs`
3. Use the returned merged reviewer list for dispatch
4. Log any warnings from the merge process

The existing `loadReviewConfig()` in `lib/governance/review-config.mjs` (refactored in Task 7) already delegates to the domain profile. This task ensures the skill markdown references the correct entry point.

- [x] **Verify test passes**

Run: `npm test`
Expected: PASS

- [x] **Commit**

```bash
git add skills/review-specs/SKILL.md
git commit -m "feat(domain-profiles): wire domain-aware reviewer dispatch into review-specs skill

Spec: .context-index/specs/features/domain-profiles/domain-aware-skill-integration.spec.md
Plan-task: 10"
```

---

### Task 11: Wire Domain Resolution into Validate [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=4
**Rationale:** Markdown-only change replacing hardcoded gate loading with domain-aware call; follows same wiring pattern as Tasks 8-10.

**Charter capability:** Domain-Aware Quality Gates
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3, Task 7
**Files:**
- Modify: `skills/validate/SKILL.md`

**Tests:** `tests/lib/domains/merge-gates.test.mjs` (already written -- no new tests)

**Context to load:**
- Spec Behavior 10 (gate loading)

- [x] **Write failing test**

No new code tests -- this task modifies skill markdown.

- [x] **Implement**

Update `skills/validate/SKILL.md` to replace hardcoded gate loading with domain-aware instructions:

At the gate loading step, add:
1. Call `resolveDomain()` with manifest and charter frontmatter
2. Call `loadDomainGates(domain, repoRoot, pluginRoot)` from `lib/domains/merge-gates.mjs`
3. Use the merged gate list for validation execution
4. Gate commands execute via `execFile` (no shell interpolation -- already enforced by the merge function)

- [x] **Verify test passes**

Run: `npm test`
Expected: PASS

- [x] **Commit**

```bash
git add skills/validate/SKILL.md
git commit -m "feat(domain-profiles): wire domain-aware gate loading into validate skill

Spec: .context-index/specs/features/domain-profiles/domain-aware-skill-integration.spec.md
Plan-task: 11"
```

---

### Task 12: Wire Domain Resolution into Implement [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=3
**Rationale:** Markdown change for verification config wiring with 3 type branches (visual, output, flow); slightly more complex than other wiring tasks due to type-dependent behavior.

**Charter capability:** Domain-Aware Verification
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 4
**Files:**
- Modify: `skills/implement/SKILL.md`

**Tests:** `tests/lib/domains/merge-verification.test.mjs` (already written -- no new tests)

**Context to load:**
- Spec Behaviors 12-16 (verification config types)

- [x] **Write failing test**

No new code tests -- this task modifies skill markdown.

- [x] **Implement**

Update `skills/implement/SKILL.md` at the verification step (Step 2e or equivalent):

1. Call `resolveDomain()` with manifest and charter frontmatter
2. Call `loadOverlay(domain, "verification", repoRoot, pluginRoot)` + `mergeVerification(overlay, activeServers)`
3. Based on `type`:
   - `visual`: use browser-based snapshot verification
   - `output`: use output comparison via assertions (no browser, no MCP)
   - `flow`: use assertion-based checks on workflow definitions
4. If no verification config exists (null), log warning and skip domain-specific verification

- [x] **Verify test passes**

Run: `npm test`
Expected: PASS

- [x] **Commit**

```bash
git add skills/implement/SKILL.md
git commit -m "feat(domain-profiles): wire domain-aware verification into implement skill

Spec: .context-index/specs/features/domain-profiles/domain-aware-skill-integration.spec.md
Plan-task: 12"
```

---

### Task 13: Wire Domain Resolution into Lifecycle Gate Hooks [specialist: none]

**Routing:** assisted-agent (score: 15/20)
**Scores:** spec=4 pattern=3 blast=4 novelty=4
**Rationale:** Modifies hook code files (not just markdown) across hooks/ and lib/ directories; requires identifying which hooks call resolveGateConfig() and updating their call sites.

**Charter capability:** Domain-Aware Lifecycle Gates
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 5, Task 7
**Files:**
- Modify: `lib/lifecycle-gate-config.mjs` (ensure `resolveGateConfig()` accepts and uses domain config)
- Modify: hooks that call `resolveGateConfig()` to pass domain config

**Tests:** `tests/lib/domains/merge-gate-config.test.mjs` (already written -- no new tests for hook wiring)

**Context to load:**
- Spec Behaviors 17-18 (gate config for hooks)
- `hooks/` directory (identify which hooks call `resolveGateConfig()`)

- [x] **Write failing test**

No new code tests -- the hook integration is tested via existing hook tests. The gate config merge function is tested in Task 5.

- [x] **Implement**

Identify hooks that import/use `resolveGateConfig()` from `lib/lifecycle-gate-config.mjs`. Update them to:

1. Call `resolveDomain()` using manifest data available in hook context (from `CLAUDE_TOOL_INPUT_*` env vars or stdin JSON)
2. Call `loadGateHookConfig(domain, repoRoot, pluginRoot)` from `lib/domains/merge-gate-config.mjs`
3. Pass the domain gate config to `resolveGateConfig(userConfig, domainConfig)`
4. The refactored `resolveGateConfig()` (from Task 7) uses domain config as base instead of hardcoded arrays

- [x] **Verify test passes**

Run: `npm test`
Expected: PASS

- [x] **Commit**

```bash
git add lib/lifecycle-gate-config.mjs hooks/
git commit -m "feat(domain-profiles): wire domain-aware gate config into lifecycle hooks

Spec: .context-index/specs/features/domain-profiles/domain-aware-skill-integration.spec.md
Plan-task: 13"
```

---

### Task 14: Wire Domain Resolution into Write-Test/Implement [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=4 blast=4 novelty=4
**Rationale:** Markdown changes to 2 skill files adding domain-aware test config loading; follows established wiring pattern with clear spec behaviors.

**Charter capability:** Domain-Aware Test Config
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 6, Task 7
**Files:**
- Modify: `skills/write-test/SKILL.md`
- Modify: `skills/implement/SKILL.md` (additional test config wiring -- append to Task 12 changes)

**Tests:** `tests/lib/domains/merge-test-config.test.mjs` (already written -- no new tests)

**Context to load:**
- Spec Behaviors 19-20 (test config for write-test and implement)

- [x] **Write failing test**

No new code tests -- skill markdown update.

- [x] **Implement**

Update `skills/write-test/SKILL.md` and `skills/implement/SKILL.md` at the test configuration step:

1. Call `resolveDomain()` with manifest and charter frontmatter
2. Call `loadTestConfig(domain, repoRoot, pluginRoot)` from `lib/domains/merge-test-config.mjs`
3. Use returned `permitted_tools` for test framework detection
4. Use `max_test_file_size` for gaming detection threshold
5. Use `skip_patterns` for skipped test detection in the domain's test frameworks

- [x] **Verify test passes**

Run: `npm test`
Expected: PASS

- [x] **Commit**

```bash
git add skills/write-test/SKILL.md skills/implement/SKILL.md
git commit -m "feat(domain-profiles): wire domain-aware test config into write-test and implement

Spec: .context-index/specs/features/domain-profiles/domain-aware-skill-integration.spec.md
Plan-task: 14"
```

---

### Task 15: Immutability Invariant Tests [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=4
**Rationale:** Adding freeze-based invariant tests to existing test files; clear spec requirement with established Object.freeze test pattern from Tasks 1-6.

**Charter capability:** (cross-cutting invariant)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 2, Task 3, Task 4, Task 5, Task 6
**Files:**
- Modify: `tests/lib/domains/merge-reviewers.test.mjs` (add deep-freeze test if not already present)
- Modify: `tests/lib/domains/merge-gates.test.mjs`
- Modify: `tests/lib/domains/merge-verification.test.mjs`
- Modify: `tests/lib/domains/merge-gate-config.test.mjs`
- Modify: `tests/lib/domains/merge-test-config.test.mjs`
- Modify: `tests/lib/domains/merge-template-overlay.test.mjs`

**Tests:** All test files listed above

**Context to load:**
- Spec Behavior 21 (immutability invariant -- merge functions return new objects, verified by tests)

- [x] **Write failing test**

For each merge module's test file, ensure a test exists that deep-freezes all inputs and verifies the merge function completes without throwing (proving no mutation):

```javascript
it('should not throw when given frozen inputs (immutability invariant)', () => {
  const frozen = Object.freeze({ /* ... frozen deep input ... */ });
  assert.doesNotThrow(() => mergeFunction(frozen));
});
```

Note: Tasks 2-6 already include these tests in their initial test suites. This task verifies they are comprehensive (covering all code paths including error cases with frozen inputs) and adds any missing coverage.

- [x] **Verify test fails**

Run: `npm test`
Expected: FAIL if any merge function attempts mutation on frozen objects in edge cases not covered by initial tests

- [x] **Implement**

Review each merge function and fix any code paths that mutate inputs. Common fixes:
- Replace `array.push()` on input arrays with spread operator into new arrays
- Replace property assignment on input objects with spread into new objects
- Use `structuredClone()` for deep copies where needed

- [x] **Verify test passes**

Run: `npm test`
Expected: PASS

- [x] **Commit**

```bash
git add tests/lib/domains/
git commit -m "test(domain-profiles): verify immutability invariant for all merge functions

Spec: .context-index/specs/features/domain-profiles/domain-aware-skill-integration.spec.md
Plan-task: 15"
```

---

### Task 16: Integration Tests [specialist: none]

**Routing:** assisted-agent (score: 14/20)
**Scores:** spec=4 pattern=3 blast=3 novelty=4
**Rationale:** Large integration test spanning all 6 merge modules plus refactored modules; requires understanding the full config pipeline and exercising I/O paths with temp fixtures.

**Charter capability:** (cross-cutting)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7
**Files:**
- Create: `tests/lib/domains/integration.test.mjs`

**Tests:** `tests/lib/domains/integration.test.mjs`

**Context to load:**
- Spec Behaviors 1-21 (all behaviors)
- All merge modules + overlay.mjs + resolve.mjs

- [x] **Write failing test**

```javascript
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { createTempDir, cleanupTempDir, writeFixture } from '../../helpers.mjs';
import { PLUGIN_ROOT } from '../../helpers.mjs';
import { resolveDomain } from '../../../lib/domains/resolve.mjs';
import { loadOverlay } from '../../../lib/domains/overlay.mjs';
import { mergeReviewers } from '../../../lib/domains/merge-reviewers.mjs';
import { mergeGates } from '../../../lib/domains/merge-gates.mjs';
import { mergeGateConfig } from '../../../lib/domains/merge-gate-config.mjs';
import { mergeTestConfig } from '../../../lib/domains/merge-test-config.mjs';
import { mergeVerification } from '../../../lib/domains/merge-verification.mjs';
import { mergeTemplateOverlay } from '../../../lib/domains/merge-template-overlay.mjs';

describe('domain-aware skill integration', () => {
  let tmp;
  
  it('should resolve domain and load all overlay types', () => {
    const manifest = { project: { domain: 'software' } };
    const result = resolveDomain(manifest, null, null);
    assert.equal(result.resolved_domain, 'software');
  });

  it('should merge reviewers with governance override winning on conflict', () => {
    const domain = { reviewers: [{ id: 'r1', dispatch: 'always' }] };
    const governance = { reviewers: [{ id: 'r1', dispatch: 'triggered' }] };
    const result = mergeReviewers(domain, governance);
    assert.equal(result.reviewers[0].dispatch, 'triggered');
    assert.equal(result.reviewers[0].__source, 'governance');
  });

  it('should merge gates with governance override winning on conflict', () => {
    const domain = { gates: [{ id: 'test', command: ['npm', 'test'] }] };
    const governance = { gates: [{ id: 'test', command: ['npm', 'run', 'test:ci'] }] };
    const result = mergeGates(domain, governance);
    assert.deepEqual(result.gates[0].command, ['npm', 'run', 'test:ci']);
  });

  it('should merge template overlay via H2 section matching', () => {
    const base = '## Quality Attributes\nGeneric quality\n\n## Scope\nGeneric scope\n';
    const overlay = '## Quality Attributes\nDomain-specific quality attributes\n';
    const result = mergeTemplateOverlay(base, overlay);
    assert.ok(result.includes('Domain-specific quality attributes'));
    assert.ok(!result.includes('Generic quality'));
    assert.ok(result.includes('Generic scope'));
  });

  it('should not have any hardcoded fallbacks in merge functions', () => {
    // When all overlays are null, merge functions should return empty/null configs
    const reviewResult = mergeReviewers(null, null);
    assert.equal(reviewResult.reviewers.length, 0);
    
    const gateResult = mergeGates(null, null);
    assert.equal(gateResult.gates.length, 0);
    
    const gcResult = mergeGateConfig(null);
    assert.deepEqual(gcResult.config.file_exclusions, []);
    
    const tcResult = mergeTestConfig(null);
    assert.deepEqual(tcResult.config.permitted_tools, []);
    
    const vResult = mergeVerification(null);
    assert.equal(vResult.config, null);
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/lib/domains/integration.test.mjs`
Expected: FAIL if modules not yet created

- [x] **Implement**

Implement comprehensive integration tests covering:
1. Full config loading pipeline: `resolveDomain()` -> `loadOverlay()` -> `merge*()` for each overlay type
2. Governance wins on conflict (reviewers, gates)
3. No hardcoded fallbacks remain (null overlay -> empty config)
4. Template overlay H2 section matching end-to-end
5. Error code propagation (OVERLAY_MERGE_WARN, INVALID_GATE, UNKNOWN_VERIFY_TYPE, etc.)

Use temp directories with fixture files to test the full I/O path via `loadReviewerConfig()`, `loadDomainGates()`, etc.

- [x] **Verify test passes**

Run: `npm test`
Expected: PASS

- [x] **Commit**

```bash
git add tests/lib/domains/integration.test.mjs
git commit -m "test(domain-profiles): add integration tests for domain-aware config loading

Spec: .context-index/specs/features/domain-profiles/domain-aware-skill-integration.spec.md
Plan-task: 16"
```

---

### Task 17: Documentation Updates [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=4
**Rationale:** Documentation-only changes to 2 docs files with clear spec requirements on what to document; no code changes, no test risk.

**Charter capability:** (cross-cutting)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 7, Task 8, Task 9, Task 10, Task 11, Task 12, Task 13, Task 14
**Files:**
- Modify: `docs/configuration.md` (document config merge order per skill)
- Modify: `docs/hooks.md` (document domain-aware lifecycle gate config)

**Tests:** No code tests for documentation.

- [x] **Write failing test**

No code tests for documentation. Skip TDD for this task.

- [x] **Implement**

Update `docs/configuration.md`:
- Document the config merge order for each skill integration point:
  - Brainstorm: domain charter-overlay via H2 section matching (no governance layer)
  - Specify: domain spec-overlay via H2 section matching (no governance layer)
  - Review-specs: domain reviewers -> governance reviewers (governance wins on ID conflict)
  - Validate: domain gates -> governance gates (governance wins on ID conflict)
  - Implement: domain verification config (no governance layer)
  - Hooks: domain gate-config (no governance layer)
  - Write-test/Implement: domain test-config (no governance layer)
- Note which overlay types have governance counterparts (reviewers, gates) vs. domain-only (charter-overlay, spec-overlay, verification, gate-config, test-config)

Update `docs/hooks.md`:
- Document domain-aware lifecycle gate config
- Explain that file exclusions and bash passthrough commands now come from the domain profile
- Note that the `software` profile ships with the current default 44 file exclusions and 32 bash passthrough commands
- Document that when no gate-config overlay exists, empty lists are used (strictest mode)

- [x] **Verify test passes**

Run: `npm test`
Expected: PASS (no code changes)

- [x] **Commit**

```bash
git add docs/configuration.md docs/hooks.md
git commit -m "docs(domain-profiles): document config merge order and domain-aware gate config

Spec: .context-index/specs/features/domain-profiles/domain-aware-skill-integration.spec.md
Plan-task: 17"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied
- No hardcoded constants remain in refactored modules (grep verification)
- Governance gates: `gates.yaml` -- test gate (fast tier)
