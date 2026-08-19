<!-- partial_schema: plan@1 -->

# Implementation Plan: Reviewer Panel Retarget

> **Methodology:** adev
> **Charter:** .context-index/specs/features/reviewer-domain-fit/charter.md
> **Spec:** .context-index/specs/features/reviewer-domain-fit/reviewer-panel-retarget.spec.md
> **Review:** PASS_WITH_NOTES (2026-08-18)
> **Platform:** none (Node CLI/plugin, no web framework), JavaScript (ESM), Node.js, npm, node:test

**Goal:** Retarget the default bundled reviewer panel (`templates/domains/software/reviewers.yaml`) from 3 web-app-shaped reviewers to 5 active + 2 disabled, ship a `web-service` domain extension that relocates the OWASP-scoped security review to where it is opt-in, and remove the hand-computed `blocker_id` hashing instruction that reviewer profiles cannot actually execute.

**Architecture:** This is a refactor spec (Phase 2 of the `reviewer-domain-fit` initiative), touching only config/prompt-markdown surfaces — no runtime code changes. Four new prompt files join the bundled `skills/review-specs/` set; `consistency-analyzer-prompt.md` is rewritten in place to absorb `structural-architect`'s ADR/module-boundary scope; `templates/domains/software/reviewers.yaml` and `templates/review-specs/defaults.yaml` are edited to wire the new panel; a new `extensions/web-service/` package restates the panel plus the relocated `security-reviewer`. `structural-architect` and `security-reviewer` are disabled (`enabled: false` + `disabled_reason`), never deleted, per `lib/governance/enablement.mjs`'s existing contract — every project whose materialized `review.yaml` still names their prompt files keeps resolving them (BEH-7).

---

## Review Notes Addressed

The spec passed `PASS_WITH_NOTES` after 6 review rounds. Verified directly against source during planning (not re-trusted blindly):

- **`shouldDispatch` object-vs-string dispatch schema** (`lib/governance/review-config.mjs:259-263`) — confirmed by reading: a bare string `"triggered"` passes `VALID_DISPATCH_STRING` validation (line 24, 548) but `shouldDispatch` only reads `.triggered` off an **object** (`typeof d === "object"`); a bare string falls through to `default-always`. Task 3 uses the nested-object form for `termination-reviewer`, exactly as the spec requires.
- **`context_pack` default is `"base"`** (`review-config.mjs:571`), confirmed — this is why Task 2 must land before Task 3 references `context_pack: referent-integrity` / `context_pack: wiring`.
- **The five broken tests** — all five line citations verified by direct grep against the current file contents (`tests/domains/bundled-profiles.test.mjs:57,59-61`; `tests/governance/context-pack.test.mjs:388` and `:429,434`; `tests/skills/review-specs-blocker-id-emission.test.mjs:42-47`); `tests/cli/init-extension-picker.test.mjs`'s "Catalog has 2 entries" comment and positional `'4'`/`'2'` answers confirmed at lines 64-65.
- **Domain resolution is first-file-wins, not additive** (`lib/domains/domain-config.mjs:200-230`, `lib/domains/merge-reviewers.mjs`, `lib/domains/constants.mjs:23-32` `DOMAIN_CONFIG_FILENAMES`) — confirmed. This has a consequence the spec's Changes Catalog doesn't spell out and Task 4 below states explicitly: `extensions/web-service/domain/` needs **only** `reviewers.yaml` (not the other 6 domain-config files `data-engineering`/`process-automation` each ship), because `web-service` deliberately overrides just the `reviewers` config type and inherits everything else from `extends: software` via `loadDomainConfig`'s fallback (verified in `lib/extensions/content-install.mjs:73-90`, which copies only whatever recognized files exist in the source directory — nothing requires the full set). **Do not add `web-service` as a row to `tests/extensions/domain-profile-packs.test.mjs`'s `PACKS` table** — that suite's `EXPECTED_DOMAIN_FILES` check asserts the domain directory contains **exactly** 7 files, which `web-service` deliberately does not. Task 4 writes a dedicated test file instead.

---

## File Structure

**Create:**
- `skills/review-specs/referent-integrity-prompt.md` — bundled counterpart of `.context-index/prompts/referent-integrity.md`
- `skills/review-specs/wiring-reviewer-prompt.md` — PRODUCER/CONSUMER/TRIGGER/TEST wiring scope
- `skills/review-specs/boundary-reviewer-prompt.md` — threat-model-seeded security scope, `dispatch: always`
- `skills/review-specs/termination-reviewer-prompt.md` — loop/retry/poll cap scope (the prompt file itself carries no `dispatch:` field — that is registry-only, set in Task 3 as the nested-object triggered form, never the bare string)
- `extensions/web-service/adev-extension.yaml` — new vendored extension manifest (`extends: software`)
- `extensions/web-service/domain/reviewers.yaml` — six reviewer entries (five shared + `security-reviewer`)
- `tests/extensions/web-service-reviewers.test.mjs` — dedicated test (NOT the `domain-profile-packs.test.mjs` table — see Review Notes)
- `tests/specs/reviewer-panel-retarget-charter-amendment.test.mjs` — asserts charter Phase 2 criterion amendment

**Modify:**
- `skills/review-specs/consistency-analyzer-prompt.md` — absorb ADR Compliance + Module Boundaries scope; rewrite `## Input`; drop hash instruction
- `templates/review-specs/defaults.yaml:76-81` — add ADR glob to `consistency` pack; add `referent-integrity` and `wiring` packs
- `templates/domains/software/reviewers.yaml` — full rewrite: 7 entries (5 active, 2 disabled)
- `templates/extensions-catalog.json` — add `web-service` entry
- `.context-index/specs/features/reviewer-domain-fit/charter.md` — amend Phase 2's first acceptance criterion (Migration Path Step 6, part two)
- `tests/skills/review-specs-blocker-id-emission.test.mjs:42-47` — rewrite `consistency-analyzer` case; add cases for the 4 new prompts
- `tests/governance/context-pack.test.mjs:388` — fixture fix for the now-collapsed distinct-file-set count
- `tests/governance/context-pack.test.mjs:429-434` — update expected reviewer→pack mapping to the 5 active entries
- `tests/domains/bundled-profiles.test.mjs:57,59-61` — update entry count (3→7) and id assertions; add disabled-entry and dispatch-shape assertions
- `tests/governance/review-config.test.mjs` — add `termination-reviewer` triggered-dispatch positive/negative case (near existing `describe("review-config shouldDispatch")`, line 423+)
- `tests/cli/init-extension-picker.test.mjs:56-57` — positional answers for the 3-entry catalog (skip: `'4'`→`'5'`)

**Reference (read, do not modify):**
- `.context-index/prompts/referent-integrity.md` — Phase 1 prompt Task 1 adapts
- `lib/governance/review-config.mjs` (`shouldDispatch` :237-282, `collectReviewers` :421-434, validation :545-575) — dispatch/validation contract
- `lib/governance/enablement.mjs` — `enabled`/`disabled_reason` contract (shared, unmodified)
- `lib/domains/domain-config.mjs:200-230`, `lib/domains/merge-reviewers.mjs`, `lib/domains/constants.mjs:23-32` — domain resolution/shadowing contract
- `lib/extensions/content-install.mjs:48-90` (`installDomainProfile`) — confirms partial domain packages install fine
- `extensions/data-engineering/adev-extension.yaml`, `extensions/data-engineering/domain/reviewers.yaml` — shape to mirror for `web-service`'s manifest (not its domain/ file count)
- `skills/review-specs/SKILL.md:341-373` — aggregator `blocker_id` validation rules (unmodified; prompts depend on this behavior)
- `tests/governance/reviewer-prompt-inputs.test.mjs` — Behavior 22q bullet-to-title mapping; must stay green through Task 2
- `scripts/sync-provider-skills.mjs`, `tests/sync/provider-skill-parity.test.mjs` — provider mirror regeneration gate

---

## Context Packets

### Task 1 Context
- Spec: `reviewer-panel-retarget.spec.md` Migration Path Step 1, Current/Target State Structure tables
- Reference prompt: `.context-index/prompts/referent-integrity.md` (full — this is what Task 1's `referent-integrity-prompt.md` adapts almost verbatim, including its "On `blocker_id`" section)
- Reference prompts (existing bundled shape/format to match): `skills/review-specs/structural-architect-prompt.md`, `skills/review-specs/security-reviewer-prompt.md`
- Sibling prompt behavior seed for `boundary-reviewer`: `lib/extensions/governance-registry.mjs`, `lib/extensions/governance-splice.mjs`, `lib/extensions/governance-values.mjs`, `lib/extensions/exec-consent.mjs`, `lib/extensions/exec-payload.mjs` (read for the trust-boundary contract the checklist must name — path containment, subprocess interpolation, input trust, privilege posture, artifact leakage, destructive filesystem operations)
- Test to extend: `tests/skills/review-specs-blocker-id-emission.test.mjs` (existing structure/assertions style at lines 1-47)
- Provider sync: `scripts/sync-provider-skills.mjs` (companion-file copy logic, lines 40-100), `tests/sync/provider-skill-parity.test.mjs`

### Task 2 Context
- Spec: Migration Path Steps 2 and 3 (explicitly same-commit), Target State Structure table row for `consistency-analyzer-prompt.md` and `defaults.yaml`
- Source: `templates/review-specs/defaults.yaml` (full — especially `architecture`/`security` packs' existing ADR-glob pattern to mirror at lines 58-63/64-68)
- Source: `skills/review-specs/consistency-analyzer-prompt.md` (full, current content)
- Source: `.context-index/prompts/referent-integrity.md`'s three globs (`docs/cli-reference.md`, `docs/skill-reference.md`, `.context-index/orientation/architecture.md`) — reused verbatim for the new `referent-integrity` pack
- Test to modify: `tests/governance/context-pack.test.mjs:370-440` (full read — both the `:388` distinct-set assertion and the `:429-434` mapping assertion live in this file)
- Test that must stay green, read-only: `tests/governance/reviewer-prompt-inputs.test.mjs` (full — Behavior 22q bullet/title matching; the `## Input` rewrite must keep every bullet mapped to a titled pack include)
- Test to extend: `tests/skills/review-specs-blocker-id-emission.test.mjs:42-47` (the `consistency-analyzer` case)

### Task 3 Context
- Spec: Migration Path Step 4 (full), Behavioral Contract BEH-1, BEH-6, BEH-7, Error Cases table
- Source: `lib/governance/review-config.mjs:237-282` (`shouldDispatch` — the object-vs-string dispatch distinction), `:545-575` (validation, `context_pack` default), `lib/governance/enablement.mjs` (full — `enabled`/`disabled_reason` contract)
- Test to modify: `tests/domains/bundled-profiles.test.mjs:1-70` (full — `SW_DIR`/`EXPECTED_FILES` fixtures plus the assertions at 52-64)
- Test to modify: `tests/governance/context-pack.test.mjs:429-460` (the `"software-domain reviewers reference the same three packs"` test)
- Test to extend: `tests/governance/review-config.test.mjs:423-459` (existing `shouldDispatch` describe block — model for the new termination-reviewer positive/negative case)

### Task 4 Context
- Spec: Migration Path Step 5 (full), BEH-8, Acceptance Criteria (web-service bullets)
- Reference: `extensions/data-engineering/adev-extension.yaml`, `extensions/data-engineering/domain/reviewers.yaml` (manifest shape to mirror)
- Reference: `lib/extensions/content-install.mjs:48-90` (`installDomainProfile` — confirms partial domain/ directories install cleanly)
- Reference: `lib/domains/domain-config.mjs:200-230` (extends/shadowing rules), `lib/domains/merge-reviewers.mjs` (full)
- Source: `templates/extensions-catalog.json` (full, current 2-entry content)
- Test to modify: `tests/cli/init-extension-picker.test.mjs:1-90` (full read — `runPicker` fixture wiring plus the positional-answer assertions)
- Test precedent (read, do not add to): `tests/extensions/domain-profile-packs.test.mjs` (full — understand why `web-service` must NOT join its `PACKS` table)
- CLI verb reference: `lib/cli/domain.mjs:33,61,220,398` (`load-reviewers` subcommand signature)

### Task 5 Context
- Spec: Migration Path Step 6 part two, "Deviation from the charter's literal Phase 2 acceptance-criterion wording" section (full)
- Charter: `.context-index/specs/features/reviewer-domain-fit/charter.md` Acceptance Criteria, Phase 2 (lines ~271-279)
- Precedent test shape: `tests/specs/test-strategies-charter-revision-3.test.mjs` (full — this is the pattern for asserting charter prose via `assert.match`)

---

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

### Heuristic: Use session JSONL for token measurement, not file-size estimates (confidence: medium)
- **Pattern:** When evaluating token consumption or cost of adev skills, parse real session JSONL files from ~/.claude/projects/ (message.usage fields: input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens). Dispatch paired A/B subagents and compare their JSONL data for controlled experiments.
- **Anti-pattern:** Estimate tokens using bytes/4 or hardcoded assumptions about thinking budgets and cache hit rates. These overstate savings by 2-2.5x vs real measurements.
- **Evidence:** 1 observations

### Heuristic: Cache reads are 71% of session cost — minimize context accumulation (confidence: medium)
- **Pattern:** When optimizing token cost, focus on reducing what accumulates in conversation context (output echoes, artifact dumps, verbose subagent returns). Every output token persists as a cache read on all subsequent turns, creating multiplicative amplification.
- **Anti-pattern:** Focus on reducing input token counts (SKILL.md sizes, context packets). Input is <1% of cost; cache reads at 0.1x pricing dominate due to volume (98% of all tokens processed).
- **Evidence:** 1 observations

### Heuristic: Summarized skill output produces equivalent artifact quality (confidence: medium)
- **Pattern:** When a skill writes an artifact to disk (plan, review, validation report), instruct it to return only a structured summary to the conversation. The artifact on disk will be equally complete — the summarization instruction affects echo volume, not reasoning.
- **Anti-pattern:** Assume that shorter output means lower quality artifacts. The model reasons the same way regardless of how much it echoes back. A/B eval showed 12/12 rubric parity with 36% cost savings.
- **Evidence:** 1 observations

(None of these are specific to reviewer-registry/prompt-markdown editing; retrieved by charter-module slug per Step 2 of the plan skill. No module-specific heuristics were found for `reviewer-domain-fit`.)

---

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 → Task 4 (each shares at least one test file with the next: Task 1 and Task 2 both edit `tests/skills/review-specs-blocker-id-emission.test.mjs`; Task 2 and Task 3 both edit `tests/governance/context-pack.test.mjs`; Task 4 depends on Task 3's active-entry set and `security-reviewer`'s `disabled_reason` for field-equality/cross-reference)
- Group B (independent): Task 5 (touches only `charter.md` and its own new test file — no overlap with Group A)

Group B can run in parallel with Group A.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Author four new bundled reviewer prompts | medium | unit | — | 4 create, 1 modify |
| 2 | Extend context packs + rewrite consistency-analyzer prompt | medium | unit | Task 1 (shared test file) | 0 create, 3 modify |
| 3 | Retarget the default reviewer panel registry | medium | unit | Task 1, Task 2 | 0 create, 3 modify |
| 4 | Ship the web-service domain extension | medium | unit | Task 3 | 3 create, 2 modify |
| 5 | Amend charter Phase 2 acceptance criterion | small | unit | — | 1 create, 1 modify |

---

## Task Structure

### Task 1: Author four new bundled reviewer prompts [specialist: none]

**Charter capability:** No Capability Map exists on this initiative-kind charter (it tracks progress via per-phase Acceptance Criteria instead) — this task satisfies spec Acceptance Criteria bullet 1 ("No default-panel prompt instructs the model to compute a hash...") for the four new prompts, and charter Phase 2 criterion 5 (structural-architect/security-reviewer leave via `enabled: false`) indirectly by giving the disabled reviewers' replacements somewhere to point.
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `skills/review-specs/referent-integrity-prompt.md`
- Create: `skills/review-specs/wiring-reviewer-prompt.md`
- Create: `skills/review-specs/boundary-reviewer-prompt.md`
- Create: `skills/review-specs/termination-reviewer-prompt.md`
- Modify: `tests/skills/review-specs-blocker-id-emission.test.mjs`

**Tests:** `tests/skills/review-specs-blocker-id-emission.test.mjs` — extend (existing suite already covers `structural-architect`/`security-reviewer`/`consistency-analyzer`; add one `test(...)` per new prompt, mirroring the existing pattern at lines 1-47).

**Context to load:**
- `.context-index/prompts/referent-integrity.md` (adapt almost verbatim for the new bundled prompt — same scope, same "On `blocker_id`" section explaining why no hash is computed)
- `skills/review-specs/structural-architect-prompt.md`, `skills/review-specs/security-reviewer-prompt.md` (existing bundled prompt format/structure to match: Output Format, Rules, Before Finalizing, Output Constraint sections)
- `lib/extensions/governance-registry.mjs`, `lib/extensions/governance-splice.mjs`, `lib/extensions/governance-values.mjs`, `lib/extensions/exec-consent.mjs`, `lib/extensions/exec-payload.mjs` (seed material for `boundary-reviewer`'s embedded threat-model checklist)

- [ ] **Write failing test**

```javascript
test('referent-integrity prompt documents section_anchor + finding-type, no hash instruction', () => {
  const body = readSkill('referent-integrity-prompt.md');
  assert.ok(body.includes('section_anchor'));
  assert.ok(body.includes('finding-type') || body.includes('finding_type'));
  assert.ok(!body.includes('lib/blocker-id.mjs'), 'must not instruct hash computation');
  assert.ok(!/sha-?256/i.test(body), 'must not name a cryptographic digest');
});

test('wiring-reviewer prompt states PRODUCER/CONSUMER/TRIGGER/TEST scope and flags no-caller as blocker', () => {
  const body = readSkill('wiring-reviewer-prompt.md');
  assert.ok(/producer/i.test(body) && /consumer/i.test(body) && /trigger/i.test(body));
  assert.ok(/no caller/i.test(body) || /write-only/i.test(body));
  assert.ok(!body.includes('lib/blocker-id.mjs'));
});

test('boundary-reviewer prompt embeds the six measured issue classes and dispatches always', () => {
  const body = readSkill('boundary-reviewer-prompt.md');
  for (const term of ['path containment', 'subprocess interpolation', 'input trust', 'privilege', 'artifact leakage', 'destructive']) {
    assert.ok(body.toLowerCase().includes(term), `missing checklist item: ${term}`);
  }
  assert.ok(!body.includes('lib/blocker-id.mjs'));
});

test('termination-reviewer prompt flags missing iteration cap, cap-trip verdict, unattended default', () => {
  const body = readSkill('termination-reviewer-prompt.md');
  assert.ok(/iteration cap/i.test(body));
  assert.ok(/cap-trip/i.test(body) || /trip/i.test(body));
  assert.ok(/unattended/i.test(body));
  assert.ok(!body.includes('lib/blocker-id.mjs'));
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/review-specs-blocker-id-emission.test.mjs`
Expected: FAIL — `ENOENT` reading each of the four new prompt files (they do not exist yet).

- [ ] **Implement**

Write the four prompt files. Each follows the existing bundled format (`## Your Review Scope`, `## Output Format`, `## Rules`, `## Before Finalizing`, `## Output Constraint`) and ends with an "On `blocker_id`" explanation matching `.context-index/prompts/referent-integrity.md:62-93` verbatim in spirit — no reviewer emits `blocker_id`; each emits `section_anchor` + `finding-type` only. `boundary-reviewer-prompt.md`'s checklist must be embedded directly in the prompt body (not a reference to an external data file — spec Improvement 3 / Acceptance Criteria bullet 6). `termination-reviewer-prompt.md` does not itself declare `dispatch:` (that lives in the registry, Task 3) but its content should make clear it is invoked selectively.

- [ ] **Verify test passes**

Run: `node --test tests/skills/review-specs-blocker-id-emission.test.mjs`
Expected: PASS

- [ ] **Commit**

Branch (if not already created): `feat/reviewer-domain-fit/panel-retarget`

```bash
node scripts/sync-provider-skills.mjs
git add skills/review-specs/referent-integrity-prompt.md \
        skills/review-specs/wiring-reviewer-prompt.md \
        skills/review-specs/boundary-reviewer-prompt.md \
        skills/review-specs/termination-reviewer-prompt.md \
        tests/skills/review-specs-blocker-id-emission.test.mjs \
        providers/codex/skills/review-specs/ providers/opencode/skills/review-specs/
git commit -m "feat(review-specs): add four bundled reviewer prompts (referent-integrity, wiring, boundary, termination)

Spec: .context-index/specs/features/reviewer-domain-fit/reviewer-panel-retarget.spec.md
Plan-task: 1"
```

Run `node --test tests/sync/provider-skill-parity.test.mjs` before committing the mirror files to confirm no drift remains.

---

### Task 2: Extend context packs + rewrite consistency-analyzer prompt [specialist: none]

**Charter capability:** No Capability Map on this charter; satisfies spec Acceptance Criteria bullets 4-5 (context packs) and BEH-3 (consistency-analyzer's expanded scope).
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1 (shares `tests/skills/review-specs-blocker-id-emission.test.mjs`)
**Files:**
- Modify: `templates/review-specs/defaults.yaml`
- Modify: `skills/review-specs/consistency-analyzer-prompt.md`
- Modify: `tests/governance/context-pack.test.mjs`
- Modify: `tests/skills/review-specs-blocker-id-emission.test.mjs`

**Tests:** `tests/governance/context-pack.test.mjs` — extend. `tests/skills/review-specs-blocker-id-emission.test.mjs` — extend (rewrite the existing `consistency-analyzer` case).

**Context to load:**
- `templates/review-specs/defaults.yaml` (full — `architecture`/`security` packs' ADR-glob pattern at lines 58-68 to mirror for `consistency`)
- `.context-index/prompts/referent-integrity.md`'s three globs (reused verbatim for the new `referent-integrity` pack: `docs/cli-reference.md`, `docs/skill-reference.md`, `.context-index/orientation/architecture.md`)
- `tests/governance/reviewer-prompt-inputs.test.mjs` (read-only — the bullet-to-title mapping this task's `## Input` rewrite must satisfy)

**IMPORTANT — this step and Task 3's Step-4 registry change do NOT need to land together, but this task's two file changes (`defaults.yaml` and `consistency-analyzer-prompt.md`) DO need to land in the same commit** per the spec's own explicit note: rewriting `## Input` to promise ADRs before the `consistency` pack actually delivers them would fail `tests/governance/reviewer-prompt-inputs.test.mjs` in the intermediate state.

- [ ] **Write failing test**

```javascript
// tests/governance/context-pack.test.mjs — new/updated assertions
test("consistency pack now includes ADRs (matches architecture/security pattern)", () => {
  const repo = PLUGIN_ROOT;
  const cfg = loadReviewConfig(repo);
  const target = ".context-index/specs/features/review/configurable-reviewers.spec.md";
  const r = renderPack("consistency", cfg.contextPacks, { repoRoot: repo, targetSpecPath: target });
  assert.ok(r.files.some((f) => f.startsWith(".context-index/adrs/")), "consistency pack must include ADRs");
});

test("referent-integrity and wiring packs resolve with zero errors", () => {
  const cfg = loadReviewConfig(PLUGIN_ROOT);
  for (const pack of ["referent-integrity", "wiring"]) {
    const { errors } = resolveExtends(pack, cfg.contextPacks);
    assert.equal(errors.length, 0, `${pack}: ${JSON.stringify(errors)}`);
  }
});
```

Update the existing `:388` fixture-based test ("packs must deliver three distinct file sets") — its fixture's cross-cutting file is named `xc.md`, which doesn't match `consistency`'s cross-cutting glob; once `consistency` also gains the ADR glob it renders identically to `architecture` in that fixture, collapsing 3 distinct sets to 2. Fix the fixture (add a distinguishing file the `consistency` pack's cross-cutting glob matches, e.g. rename to `xc.spec.md` under `.context-index/specs/cross-cutting/`) rather than lowering the assertion's expected count.

Update the `:429-434` test ("software-domain reviewers reference the same three packs") is untouched by Task 2 itself (it reads the bundled `reviewers.yaml`, which Task 3 changes) — leave it for Task 3.

- [ ] **Verify test fails**

Run: `node --test tests/governance/context-pack.test.mjs`
Expected: FAIL — `consistency` pack has no ADR files yet; `referent-integrity`/`wiring` pack ids don't resolve (`PACK_NOT_FOUND` or similar).

- [ ] **Implement**

In `templates/review-specs/defaults.yaml`: add `- glob: .context-index/adrs/*.md` / `title: ADRs` to the `consistency` pack's `include` list (mirrors `architecture`/`security`). Add a `referent-integrity` pack (`extends: base`, same three globs as the Phase 1 `referent-integrity-pack`). Add a `wiring` pack (`extends: review-base`, no extra globs).

In `skills/review-specs/consistency-analyzer-prompt.md`: add ADR Compliance and Module Boundaries to `## Your Review Scope` (absorbing `structural-architect`'s scopes 3 and 6); rewrite `## Input` to name exactly what the `consistency` pack now delivers (constitution, platform context, parent charter, sibling specs, cross-cutting specs, ADRs); drop the "computed via `lib/blocker-id.mjs::buildBlockerId`" hash instruction, replacing it with the `section_anchor` + `finding-type`-only convention (matching `referent-integrity-prompt.md`'s own note).

- [ ] **Verify test passes**

Run: `node --test tests/governance/context-pack.test.mjs tests/governance/reviewer-prompt-inputs.test.mjs tests/skills/review-specs-blocker-id-emission.test.mjs`
Expected: PASS — including `reviewer-prompt-inputs.test.mjs`, which must stay green (it is not itself modified by this task, only satisfied by it).

- [ ] **Commit**

```bash
node scripts/sync-provider-skills.mjs
git add templates/review-specs/defaults.yaml \
        skills/review-specs/consistency-analyzer-prompt.md \
        tests/governance/context-pack.test.mjs \
        tests/skills/review-specs-blocker-id-emission.test.mjs \
        providers/codex/skills/review-specs/ providers/opencode/skills/review-specs/
git commit -m "feat(review-specs): extend consistency/referent-integrity/wiring context packs; rewrite consistency-analyzer prompt

Spec: .context-index/specs/features/reviewer-domain-fit/reviewer-panel-retarget.spec.md
Plan-task: 2"
```

Run `node --test tests/sync/provider-skill-parity.test.mjs` before committing the mirror files.

---

### Task 3: Retarget the default reviewer panel registry [specialist: none]

**Charter capability:** No Capability Map on this charter; satisfies spec Acceptance Criteria bullets 2-3, 6 and BEH-1, BEH-6, BEH-7; charter Phase 2 criterion 5 (`structural-architect`/`security-reviewer` disabled with reason).
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 2
**Files:**
- Modify: `templates/domains/software/reviewers.yaml`
- Modify: `tests/domains/bundled-profiles.test.mjs`
- Modify: `tests/governance/context-pack.test.mjs`
- Modify: `tests/governance/review-config.test.mjs`

**Tests:** `tests/domains/bundled-profiles.test.mjs` — extend. `tests/governance/context-pack.test.mjs` — extend (the `:429-434` mapping test). `tests/governance/review-config.test.mjs` — extend (new `termination-reviewer` dispatch case).

**Context to load:**
- `lib/governance/review-config.mjs:237-282` (`shouldDispatch`), `:545-575` (validation + `context_pack` default)
- `lib/governance/enablement.mjs` (full — `enabled`/`disabled_reason` contract, `DISABLED_WITHOUT_REASON` warning)

- [ ] **Write failing test**

```javascript
// tests/domains/bundled-profiles.test.mjs — replace the 3-count assertion
it('reviewers.yaml has 7 entries: 5 active + 2 disabled', () => {
  const content = readFileSync(join(SW_DIR, 'reviewers.yaml'), 'utf8');
  const parsed = parseYaml(content);
  assert.equal(parsed.reviewers.length, 7);
  const ids = parsed.reviewers.map(r => r.id);
  for (const id of ['referent-integrity', 'wiring-reviewer', 'consistency-analyzer', 'boundary-reviewer', 'termination-reviewer']) {
    assert.ok(ids.includes(id), `missing active reviewer: ${id}`);
  }
  const disabled = parsed.reviewers.filter(r => r.enabled === false);
  assert.equal(disabled.length, 2);
  const disabledIds = disabled.map(r => r.id).sort();
  assert.deepEqual(disabledIds, ['security-reviewer', 'structural-architect']);
  for (const r of disabled) {
    assert.ok(typeof r.disabled_reason === 'string' && r.disabled_reason.trim().length > 0,
      `${r.id} must carry a non-empty disabled_reason`);
  }
  const active = parsed.reviewers.filter(r => r.enabled !== false);
  for (const r of active) {
    assert.ok(r.profile, `${r.id} must declare an explicit profile`);
    assert.ok(r.context_pack, `${r.id} must declare an explicit context_pack`);
  }
  const termination = parsed.reviewers.find(r => r.id === 'termination-reviewer');
  assert.ok(termination.dispatch && typeof termination.dispatch === 'object' && termination.dispatch.triggered,
    'termination-reviewer must use the nested-object triggered form, not a bare string');
});

// tests/governance/review-config.test.mjs — new case near the existing shouldDispatch describe block
test("termination-reviewer's real config dispatches on a keyword and not otherwise", () => {
  const content = readFileSync(join(PLUGIN_ROOT, 'templates/domains/software/reviewers.yaml'), 'utf8');
  const parsed = parseYaml(content);
  const reviewer = parsed.reviewers.find(r => r.id === 'termination-reviewer');
  const noKeyword = shouldDispatch(reviewer, { targetSpecPath: 'x.spec.md', specContent: 'nothing relevant here' });
  assert.equal(noKeyword.dispatch, false);
  const withKeyword = shouldDispatch(reviewer, { targetSpecPath: 'x.spec.md', specContent: 'contains a retry loop' });
  assert.equal(withKeyword.dispatch, true);
});
```

Also update `tests/governance/context-pack.test.mjs`'s `:429-434` test to assert the 5 active reviewers' `context_pack` mapping (`referent-integrity`→`referent-integrity`, `wiring-reviewer`→`wiring`, `consistency-analyzer`→`consistency`, `boundary-reviewer`→`security`, `termination-reviewer`→`base`) instead of the old 3-entry map, and drop/adjust the assertion name if it still says "three packs".

- [ ] **Verify test fails**

Run: `node --test tests/domains/bundled-profiles.test.mjs tests/governance/context-pack.test.mjs tests/governance/review-config.test.mjs`
Expected: FAIL — `reviewers.yaml` still has 3 entries; `termination-reviewer` entry doesn't exist yet.

- [ ] **Implement**

Replace `templates/domains/software/reviewers.yaml`'s 3-entry list with 7 entries per spec Migration Path Step 4: `referent-integrity` (`profile: reviewer-reasoning`, `context_pack: referent-integrity`, `dispatch: always`), `wiring-reviewer` (`profile: reviewer-capable`, `context_pack: wiring`, `dispatch: always`), `consistency-analyzer` (`profile: reviewer-fast`, `context_pack: consistency`, `dispatch: always`, unchanged assignment), `boundary-reviewer` (`profile: reviewer-capable`, `context_pack: security`, `dispatch: always`), `termination-reviewer` (`profile: reviewer-fast`, `context_pack: base`, `dispatch: { triggered: { keywords: [loop, retry, poll, polling, iterate, iteration, recurring, convergence, auto-retry], min_score: 1 } }` — the nested-object form). Add `structural-architect` and `security-reviewer` back with `enabled: false` and a `disabled_reason` naming `reviewer-domain-fit` (security-reviewer's reason additionally points at the `web-service` domain).

- [ ] **Verify test passes**

Run: `node --test tests/domains/bundled-profiles.test.mjs tests/governance/context-pack.test.mjs tests/governance/review-config.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add templates/domains/software/reviewers.yaml \
        tests/domains/bundled-profiles.test.mjs \
        tests/governance/context-pack.test.mjs \
        tests/governance/review-config.test.mjs
git commit -m "feat(review-specs): retarget default reviewer panel to 5 active + 2 disabled entries

Spec: .context-index/specs/features/reviewer-domain-fit/reviewer-panel-retarget.spec.md
Plan-task: 3"
```

---

### Task 4: Ship the web-service domain extension [specialist: none]

**Charter capability:** No Capability Map on this charter; satisfies spec Acceptance Criteria bullets 7-9, 11 and BEH-8.
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3 (needs the software domain's final 5 active entries for field-equality, and `security-reviewer`'s `disabled_reason`)
**Files:**
- Create: `extensions/web-service/adev-extension.yaml`
- Create: `extensions/web-service/domain/reviewers.yaml`
- Create: `tests/extensions/web-service-reviewers.test.mjs`
- Modify: `templates/extensions-catalog.json`
- Modify: `tests/cli/init-extension-picker.test.mjs`

**Tests:** `tests/extensions/web-service-reviewers.test.mjs` — create (do NOT add a row to `tests/extensions/domain-profile-packs.test.mjs`'s `PACKS` table — see Review Notes above). `tests/cli/init-extension-picker.test.mjs` — extend.

**Context to load:**
- `extensions/data-engineering/adev-extension.yaml` (manifest shape to mirror — `extends: software`)
- `lib/extensions/content-install.mjs:48-90` (`installDomainProfile` — confirms a partial domain/ directory, containing only `reviewers.yaml`, installs cleanly; nothing requires the other 6 domain-config files)
- `templates/domains/software/reviewers.yaml` (post-Task-3 content — the 5 active entries this task's `reviewers.yaml` must stay field-equal to)
- `lib/cli/domain.mjs:220` (`load-reviewers` subcommand — used for the CLI-level resolution assertion)

- [ ] **Write failing test**

```javascript
// tests/extensions/web-service-reviewers.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from '../../lib/profiles/yaml.mjs';
import { parseExtensionManifest } from '../../lib/extensions/manifest-schema.mjs';
import { installExtension } from '../../lib/extensions/install.mjs';
import { loadDomainConfig } from '../../lib/domains/domain-config.mjs';
import { createTempDir, cleanupTempDir, writeFixture } from '../helpers.mjs';

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const EXT_DIR = join(REPO_ROOT, 'extensions', 'web-service');

test('adev-extension.yaml is valid and extends software', () => {
  const result = parseExtensionManifest(readFileSync(join(EXT_DIR, 'adev-extension.yaml'), 'utf8'));
  assert.ok(result.valid, JSON.stringify(result));
  assert.equal(result.manifest.provides['domain-profile'].extends, 'software');
});

test('domain/ contains ONLY reviewers.yaml (deliberate partial override, not a full domain package)', () => {
  assert.deepEqual(readdirSync(join(EXT_DIR, 'domain')), ['reviewers.yaml']);
});

test('web-service reviewers.yaml declares six entries: five field-equal to software + security-reviewer', () => {
  const webServiceReviewers = parseYaml(readFileSync(join(EXT_DIR, 'domain', 'reviewers.yaml'), 'utf8')).reviewers;
  assert.equal(webServiceReviewers.length, 6);
  const softwareReviewers = parseYaml(
    readFileSync(join(REPO_ROOT, 'templates/domains/software/reviewers.yaml'), 'utf8')
  ).reviewers.filter((r) => r.enabled !== false);
  const shared = ['referent-integrity', 'wiring-reviewer', 'consistency-analyzer', 'boundary-reviewer', 'termination-reviewer'];
  for (const id of shared) {
    const a = webServiceReviewers.find((r) => r.id === id);
    const b = softwareReviewers.find((r) => r.id === id);
    assert.deepEqual(a, b, `${id} must be field-equal between web-service and software domains`);
  }
  const sec = webServiceReviewers.find((r) => r.id === 'security-reviewer');
  assert.ok(sec, 'web-service must include security-reviewer');
  assert.equal(sec.prompt, 'plugin:review-specs/security-reviewer-prompt.md');
});

test('a scratch project with domain: web-service resolves six reviewers via loadDomainConfig', async () => {
  const tmp = createTempDir();
  try {
    writeFixture(tmp, '.context-index/manifest.yaml', 'project:\n  name: test\n');
    await installExtension(EXT_DIR, tmp, { pluginRoot: REPO_ROOT });
    const reviewers = loadDomainConfig('web-service', 'reviewers', tmp, REPO_ROOT);
    assert.equal(reviewers.reviewers.length, 6, 'web-service must resolve six reviewers, not fall back to software\'s three');
  } finally {
    cleanupTempDir(tmp);
  }
});
```

Also add to `tests/cli/init-extension-picker.test.mjs`: update the "Catalog has 2 entries" comment to "Catalog has 3 entries", change the skip-choice `ask: async () => '4'` to `'5'`, and add a positive case for `ask: async () => '4'` selecting `web-service`.

- [ ] **Verify test fails**

Run: `node --test tests/extensions/web-service-reviewers.test.mjs tests/cli/init-extension-picker.test.mjs`
Expected: FAIL — `extensions/web-service/` does not exist; catalog picker test's skip case selects `web-service` instead of skipping (once the catalog entry is added) or fails to find a 3rd catalog entry (before it's added).

- [ ] **Implement**

Create `extensions/web-service/adev-extension.yaml` mirroring `data-engineering`'s shape (`extends: software`). Create `extensions/web-service/domain/reviewers.yaml` with `merge_strategy: append` and six entries: the five active default-panel entries **byte-identical field-for-field** to `templates/domains/software/reviewers.yaml`'s post-Task-3 content, plus `security-reviewer` referencing the unchanged `plugin:review-specs/security-reviewer-prompt.md` (no duplicated prompt content). Add a `web-service` entry to `templates/extensions-catalog.json` (`label: "Web Service"`, matching the existing two entries' shape). Do not create the other 6 domain-config files (`charter-template.md`, `spec-template.md`, `gates.yaml`, `verification.yaml`, `gate-config.yaml`, `test-config.yaml`, `README.md`) — they are not in this spec's Changes Catalog and `loadDomainConfig`'s `extends: software` fallback supplies them.

Update `tests/cli/init-extension-picker.test.mjs`'s positional answers for the new 3-entry catalog.

- [ ] **Verify test passes**

Run: `node --test tests/extensions/web-service-reviewers.test.mjs tests/cli/init-extension-picker.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add extensions/web-service/ templates/extensions-catalog.json \
        tests/extensions/web-service-reviewers.test.mjs \
        tests/cli/init-extension-picker.test.mjs
git commit -m "feat(extensions): ship web-service domain extension with six reviewers

Spec: .context-index/specs/features/reviewer-domain-fit/reviewer-panel-retarget.spec.md
Plan-task: 4"
```

---

### Task 5: Amend charter Phase 2 acceptance criterion [specialist: none]

**Charter capability:** No Capability Map on this charter; this task IS the charter edit itself (Migration Path Step 6, part two).
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** none (independent of Group A; touches only `charter.md` and its own test)
**Files:**
- Modify: `.context-index/specs/features/reviewer-domain-fit/charter.md`
- Create: `tests/specs/reviewer-panel-retarget-charter-amendment.test.mjs`

**Tests:** `tests/specs/reviewer-panel-retarget-charter-amendment.test.mjs` — create (following the `tests/specs/test-strategies-charter-revision-3.test.mjs` precedent of asserting charter prose via `assert.match`/`assert.doesNotMatch`).

**Context to load:**
- `.context-index/specs/features/reviewer-domain-fit/reviewer-panel-retarget.spec.md`'s "Deviation from the charter's literal Phase 2 acceptance-criterion wording" section (already written — this task brings the charter into agreement with it)
- `tests/specs/test-strategies-charter-revision-3.test.mjs` (full — pattern to follow)

- [ ] **Write failing test**

```javascript
// tests/specs/reviewer-panel-retarget-charter-amendment.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const charter = readFileSync(
  new URL("../../.context-index/specs/features/reviewer-domain-fit/charter.md", import.meta.url),
  "utf8",
);

test("Phase 2's first acceptance criterion no longer claims blocker_id comes from the --origin review-specs command", () => {
  assert.doesNotMatch(
    charter,
    /blocker_id comes from `adev heuristics signature --origin review-specs --blocker-id`/,
  );
});

test("Phase 2's first acceptance criterion matches the spec's Deviation note (omit blocker_id, emit section_anchor + finding-type)", () => {
  const phase2Section = charter.slice(charter.indexOf("### Phase 2"), charter.indexOf("### Phase 3"));
  assert.match(phase2Section, /section_anchor/);
  assert.match(phase2Section, /finding-type|finding_type/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/specs/reviewer-panel-retarget-charter-amendment.test.mjs`
Expected: FAIL — `charter.md`'s current Phase 2 first criterion still reads *"`blocker_id` comes from `adev heuristics signature --origin review-specs --blocker-id`"*.

- [ ] **Implement**

Edit `charter.md`'s Phase 2 Acceptance Criteria first bullet (currently at approximately line 273) to match the spec's Deviation note: no default-panel prompt instructs the model to compute a hash; each `blocker` finding instead carries `section_anchor` + `finding-type` only. This is a content amendment to an existing criterion, not a new capability — do not bump the charter's frontmatter `revision:` field (currently `2`) for this edit alone; reserve a revision bump for a change that adds or removes scope.

- [ ] **Verify test passes**

Run: `node --test tests/specs/reviewer-panel-retarget-charter-amendment.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add .context-index/specs/features/reviewer-domain-fit/charter.md \
        tests/specs/reviewer-panel-retarget-charter-amendment.test.mjs
git commit -m "docs(reviewer-domain-fit): amend charter Phase 2 criterion to match blocker_id deviation

Spec: .context-index/specs/features/reviewer-domain-fit/reviewer-panel-retarget.spec.md
Plan-task: 5"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

Per `.context-index/governance/gates.yaml` (used in place of the constitution's Quality Gates section, since it exists):

- **`test`** (fast, required, error): `npm test`
- **`integration-test`** (integration, optional/warning — `required: false` until issue-590/591/592 close): `npm run test:evals` — not required for this migration but should be spot-checked if touched
- All acceptance criteria from `reviewer-panel-retarget.spec.md` satisfied
- `adev diagnose` clean
- No test outside the five scoped exceptions regresses (`tests/domains/bundled-profiles.test.mjs`, `tests/governance/context-pack.test.mjs:388` and `:429-434`, `tests/cli/init-extension-picker.test.mjs`, `tests/skills/review-specs-blocker-id-emission.test.mjs:42-47`)
- `tests/sync/provider-skill-parity.test.mjs` passes (provider mirrors regenerated after Tasks 1 and 2)
