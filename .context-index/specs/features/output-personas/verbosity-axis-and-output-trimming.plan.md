<!-- partial_schema: plan@1 -->

# Implementation Plan: Verbosity Axis and Output Trimming

> **Methodology:** adev
> **Charter:** `.context-index/specs/features/output-personas/charter.md` (revision 3)
> **Spec:** `.context-index/specs/features/output-personas/verbosity-axis-and-output-trimming.spec.md` (revision 2)
> **Review:** PASS_WITH_NOTES (2026-05-18) — 9 warnings addressed in spec rev 2; 15 suggestions remain open as quality-of-life polish
> **Platform:** Node.js (ESM, `.mjs`), npm, `node:test`
> **Issue:** issue-516 (implementation) — fulfills issue-515 (feedback)

**Goal:** Add `verbosity: terse|normal|deep` as a second config axis orthogonal to persona, calibrate the Architect template's normal-overlay defaults, install a universal anti-redundancy rule, and codify the Next-Actions-as-invariant rule — all without breaking the frozen `resolvePersona()` contract from `persona-resolution-and-injection.spec.md`.

**Architecture:** This spec extends an already-validated capability (the persona resolution mechanism is frozen and not modified). New work is markdown-only at the template level and ~30–50 lines additive in `lib/persona.mjs` for verbosity-axis resolution. The two-axis framing is implemented by composing a persona directive + a verbosity overlay at session-start injection — both are templates loaded from disk under the plugin root, with the same path-traversal validation contract the persona templates already use. Test surface is a 9-combo matrix (3 personas × 3 verbosity overlays) plus extending `scripts/persona-jsonl-analysis.mjs` to support post-ship `persona × verbosity` re-measurement.

**Suggestions intentionally deferred** (from spec review PASS_WITH_NOTES; reviewed and acknowledged by `/adev:plan` reviewer PR-3): SA-4 (move Next-Actions invariant to charter Invariants section), SA-7 (defer per-skill / per-turn verbosity explicitly in spec Out-of-Scope), CA-4 (introduce "verbosity overlay" as canonical charter term), CA-6 (clarify 6-source-template vs 9-rendered-combo distinction in fixture assertions), CA-7 (drop the "or equivalent injection point" hedge from spec Module Impact). These are markdown-only refinements to the charter and spec; deferred to a follow-up hygiene pass to avoid stretching this implementation's scope. They will surface on the next `/adev:hygiene` run.

---

## File Structure

**Create:**
- `templates/verbosity/terse.md` — Verbosity overlay (~10–20 lines): tone-bias toward 1–3 sentence outputs, skip-mandated-sections clause, Next-Actions-still-mandated clause, anti-redundancy clause with Next-Actions exclusion.
- `templates/verbosity/normal.md` — Verbosity overlay (~10–20 lines): 1–2 paragraph default, Next-Actions menu permitted at branch points, anti-redundancy clause.
- `templates/verbosity/deep.md` — Verbosity overlay (~10–20 lines): restores all mandated sections, permits trade-off rationale, anti-redundancy clause.
- `tests/fixtures/persona-output/architect-terse.expected.md` (and 8 siblings — 9 total) — Golden directive-text fixtures for the 3×3 combo matrix.

**Modify:**
- `templates/personas/architect.md` — Apply calibrated per-dimension trim (24 → 19–22 bullets); add `### Anti-Redundancy` section.
- `templates/personas/developer.md` — Add `### Anti-Redundancy` section (no bullet-count change).
- `templates/personas/product.md` — Add `### Anti-Redundancy` section (no bullet-count change).
- `lib/persona.mjs` — Add `loadVerbosityOverlay(name)`; extend `parseUserConfig` to recognize `verbosity` key with validation; extend `resolvePersona()` return shape additively (`{ name, source, verbosity, verbositySource }`).
- `hooks/session-start.sh` — Concatenate persona directive + verbosity overlay before injection.
- `scripts/persona-jsonl-analysis.mjs` — Add persona×verbosity two-key grouping; preserve no-content-echo invariant.
- `tests/persona.test.mjs` — New test cases covering the 9-combo matrix, the two calibration assertions, path-traversal defense-in-depth, additive return-shape preservation.
- `.context-index/specs/features/output-personas/persona-resolution-and-injection.spec.md` — Amend line 70 (disk-vs-chat duality closure sentence) + new acceptance criterion (Next-Actions invariant). Bump companion spec `revision: 2 → 3` since this is a deliberate amendment to a validated spec.
- `package.json` — Version bump.
- `.claude-plugin/plugin.json` — Version bump (must match `package.json` per Constitution Principle 5).

**Reference (read, do not modify):**
- `templates/personas/{architect,developer,product}.md` — Current templates; trim and anti-redundancy targets.
- `lib/persona.mjs:resolvePersona, loadPersonaDirective, parseUserConfig` — Existing two-phase resolution pattern to extend.
- `.context-index/specs/features/output-personas/persona-resolution-and-injection.spec.md` — Frozen mechanism; new code must preserve invariants from this spec.
- `.context-index/research/persona-output-depth-and-verbosity.md` — Empirical grounding for calibration targets.
- `scripts/persona-fixture-score.mjs` — Re-runnable A/B scorer; canonical source for fixture-weighted bullet totals.

---

## Context Packets

### Task 1 Context
- Spec: behaviors 4, 5, 7, 8, 11; Module Impact "Verbosity overlay templates" row
- Reference: existing `templates/personas/architect.md` for tone reference
- Research: `.context-index/research/persona-output-depth-and-verbosity.md` § Two-axis framing
- Sample: none — pure markdown content authoring

### Task 2 Context
- Spec: Behavior 6 (two-metric calibration); Acceptance "Calibration invariant (template-literal)" + "Calibration invariant (fixture-weighted)"
- Reference: `templates/personas/architect.md` (24 bullets currently); `templates/personas/developer.md` (16 bullets — proves 2-bullet variants suffice on collapsed dimensions)
- Tool: `scripts/persona-fixture-score.mjs` for fixture-weighted total verification
- Research: empirical addendum (calibration finding — naive 33% overshoots; calibrated ~10–15% is target)

### Task 3 Context
- Spec: Behavior 11 (anti-redundancy with Next-Actions exclusion); Acceptance "Anti-redundancy presence/exclusion invariants"
- Reference: existing persona templates' section structure (`### <Dimension>` headers)

### Task 4 Context
- Spec: Behaviors 1, 2, 3, 5 (resolution semantics); Acceptance "`lib/persona.mjs` exports `resolvePersona()` …"; Postcondition (additive return shape)
- Source-manifest-guided: `lib/persona.mjs` (full read — existing two-phase pattern is the template); `tests/persona.test.mjs` (signatures only — show test structure)
- Companion spec: `persona-resolution-and-injection.spec.md:48` (path-traversal validation contract — mirror it for verbosity)
- Heuristic: `cache-reads-dominate-cost` (verbosity overlay reduces echo volume per turn)

### Task 5 Context
- Spec: Behavior 4 (`personaDirective + "\n\n" + verbosityOverlay`); SEC-4 fix (degrade-and-continue on missing overlay, hook exits 0)
- Source-manifest-guided: `hooks/session-start.sh` (full read — existing injection point); companion spec source-manifest row for this file
- Constitution: "Hook protocol compliance" principle (exit 0/2, JSON to stdout)

### Task 6 Context
- Spec: Module Impact "Test fixtures" row; Acceptance "Anti-redundancy presence invariant" (6 source templates) + "Next-Actions invariant" (9 rendered combos)
- Reference: completed templates from Tasks 1, 2, 3 (must exist before fixture authoring)

### Task 7 Context
- Spec: Acceptance Criteria § Functional + § Quality & invariants (in full)
- Source-manifest-guided: `tests/persona.test.mjs` (full read — existing pattern); `lib/persona.mjs` (signatures only, post-Task-4)
- Tool: `node:test` runner

### Task 8 Context
- Spec: Module Impact "JSONL analysis script" row; Acceptance "No-content-echo invariant (preserved)"
- Source-manifest-guided: `scripts/persona-jsonl-analysis.mjs` (full read — existing structure + invariant comment at line 6)
- Heuristic: `eval-with-session-jsonl` (use `message.usage` fields, not bytes/4 estimates)

### Task 9 Context
- Task 11 from spec — but it pairs with Task 8 above. Test fixture: a minimal JSONL transcript with synthetic `message.content` strings to grep-against.

### Task 10 Context
- Spec: Module Impact "Companion spec amendment" row; CA-8 review finding (companion spec is `validated`; amendment requires revision bump)
- Reference: `.context-index/specs/features/output-personas/persona-resolution-and-injection.spec.md` line 70 (target); line 66 (postcondition "exactly one persona directive block" needs update per CA-9)

### Task 11 Context
- Constitution: Principle 5 ("Version parity — package.json and .claude-plugin/plugin.json versions must always match")
- Reference: `package.json` + `.claude-plugin/plugin.json` current versions

---

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

### Heuristic: Use session JSONL for token measurement, not file-size estimates (confidence: medium)
- **Pattern:** When evaluating token consumption or cost of adev skills, parse real session JSONL files from `~/.claude/projects/` (message.usage fields: input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens). Dispatch paired A/B subagents and compare their JSONL data for controlled experiments.
- **Anti-pattern:** Estimate tokens using bytes/4 or hardcoded assumptions about thinking budgets and cache hit rates. These overstate savings by 2-2.5x vs real measurements.
- **Evidence:** 1 observation. Applied to Task 8 (JSONL analysis extension) and the post-ship validation contract.

### Heuristic: Cache reads are 71% of session cost — minimize context accumulation (confidence: medium)
- **Pattern:** When optimizing token cost, focus on reducing what accumulates in conversation context (output echoes, artifact dumps, verbose subagent returns). Every output token persists as a cache read on all subsequent turns, creating multiplicative amplification.
- **Anti-pattern:** Focus on reducing input token counts (SKILL.md sizes, context packets). Input is <1% of cost; cache reads at 0.1x pricing dominate due to volume (98% of all tokens processed).
- **Evidence:** 1 observation. Applies to Tasks 1–3, 6 (template trim + overlay content): every bullet removed from defaults saves cache reads on every subsequent turn.

### Heuristic: Summarized skill output produces equivalent artifact quality (confidence: medium)
- **Pattern:** When a skill writes an artifact to disk (plan, review, validation report), instruct it to return only a structured summary to the conversation. The artifact on disk will be equally complete — the summarization instruction affects echo volume, not reasoning.
- **Anti-pattern:** Assume that shorter output means lower quality artifacts. The model reasons the same way regardless of how much it echoes back. A/B eval showed 12/12 rubric parity with 36% cost savings.
- **Evidence:** 1 observation. Applies to Task 3 (anti-redundancy rule): mandating disk-artifact summarization in chat operationalizes this heuristic in the persona system itself.

---

## Parallelization

- **Group A (sequential, foundation):** Task 1 → Task 2 → Task 3. All edit `templates/` files; cleanest to land in order so Task 3's anti-redundancy edits don't conflict with Task 2's trim.
- **Group B (sequential, code core):** Task 4 → Task 5. Task 4 extends `lib/persona.mjs`; Task 5 wires the hook to call it. Hard dependency.
- **Group C (sequential, test layer):** Task 6 → Task 7. Fixtures must exist before tests assert them.
- **Group D (independent of A/B/C):** Task 8 → Task 9. Task 8 writes the no-content-echo test (RED); Task 9 lands the persona×verbosity script extension (GREEN). Test-first ordering per plan-review PR-4. Lives in `scripts/` and a new test file; no overlap with persona resolution path.
- **Group E (independent):** Task 10 — companion spec amendment. Markdown-only edit; no code overlap.
- **Group F (terminal):** Task 11 — version bump. Must land last, after all behavior changes are committed.

**Concurrency model:** Groups A, D, E can run in parallel from the start. Group B depends on A finishing (tests in Task 4 reference the templates from A). Group C depends on A + B finishing (fixtures are persona×verbosity rendered output). Group F depends on everything.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Author verbosity overlay templates | small | unit | — | 3 create, 0 modify |
| 2 | Calibrate Architect template trim | small | unit | Task 1 | 0 create, 1 modify |
| 3 | Add anti-redundancy paragraph to all persona templates | small | unit | Task 2 | 0 create, 3 modify |
| 4 | Extend `lib/persona.mjs` with verbosity axis | medium | unit | Task 3 | 0 create, 1 modify |
| 5 | Update session-start hook to concatenate directives | small | unit | Task 4 | 0 create, 1 modify |
| 6 | Author 9 golden directive-text fixtures | medium | unit | Task 3, Task 5 | 9 create, 0 modify |
| 7 | Extend `tests/persona.test.mjs` | large | unit | Task 6 | 0 create, 1 modify |
| 8 | No-content-echo test for JSONL script (RED) | small | unit | — | 1 create, 0 modify |
| 9 | Extend `scripts/persona-jsonl-analysis.mjs` with persona×verbosity grouping (GREEN) | medium | unit | Task 8 | 0 create, 1 modify |
| 10 | Amend companion spec + bump revision | small | unit | — | 0 create, 1 modify |
| 11 | Version bump | x-small | unit | Tasks 1–10 | 0 create, 2 modify |

All tasks resolve to `test_strategy: unit` (default — no `test_strategies` configured in manifest; no spec-declared override; auto-detection routes all paths to unit). No infrastructure requirements section emitted (all-unit + no `infra_requirements:` in spec frontmatter).

---

## Task Structure

### Task 1: Author verbosity overlay templates [specialist: none]

**Charter capability:** "Verbosity axis + output trim + anti-redundancy + Next-Actions invariant" (charter.md:76)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `templates/verbosity/terse.md`, `templates/verbosity/normal.md`, `templates/verbosity/deep.md`
- Test: `tests/persona.test.mjs` (existing — assertions land in Task 7)

**Tests:** `tests/persona.test.mjs` — Task 7 will add structural assertions; Task 1 produces the source content these assertions target.

**Context to load:** see Context Packet 1 above.

- [ ] **Write failing test** *(deferred to Task 7; this task is content authoring, not code-with-behavior — see TDD-exception note below)*
- [ ] **Author `templates/verbosity/terse.md`** with: tone-bias rule (1–3 sentence default), skip-mandated-sections clause (Architectural-Read, multi-table verdicts, trade-off recapping), Next-Actions-still-mandated clause (single most-likely suggestion bias), anti-redundancy clause with explicit Next-Actions exclusion. NO hard word caps (Anthropic-postmortem rule).
- [ ] **Author `templates/verbosity/normal.md`** with: 1–2 paragraph default, Next-Actions menu permitted at branch points, anti-redundancy clause with Next-Actions exclusion.
- [ ] **Author `templates/verbosity/deep.md`** with: restores all mandated sections from persona directive, explicitly permits trade-off rationale and multi-table review verdicts, anti-redundancy clause with Next-Actions exclusion (deep does not trim, but still de-duplicates against disk artifacts).
- [ ] **Verify no hard word caps**: `grep -nE '\b[0-9]+ words\b|\b[0-9]+-word\b' templates/verbosity/*.md` → exit 1 (no matches).
- [ ] **Commit**

```bash
git checkout -b feat/output-personas/verbosity-axis-and-trim
git add templates/verbosity/terse.md templates/verbosity/normal.md templates/verbosity/deep.md
git commit -m "$(cat <<'EOF'
feat(output-personas): add verbosity overlay templates

Three new templates under templates/verbosity/ define the verbosity axis
(terse / normal / deep) that composes with the existing persona axis.
Each overlay carries the Next-Actions-still-mandated clause and the
anti-redundancy clause with explicit Next-Actions exclusion. No hard
word caps (Anthropic April-2026 postmortem rule).

Spec: .context-index/specs/features/output-personas/verbosity-axis-and-output-trimming.spec.md
Plan-task: 1
EOF
)"
```

**TDD-exception note:** Tasks 1–3 author markdown content (templates), not executable code. They have no behavior to test in isolation — they are *data* consumed by `lib/persona.mjs` and rendered into session directives. The assertions on their content (presence of clauses, bullet-count distribution) land in Task 7 alongside the lib's behavior tests, which is the natural test boundary. This is the same pattern used by the validated companion spec (which authored the original persona templates without per-template unit tests).

---

### Task 2: Calibrate Architect template trim [specialist: none]

**Charter capability:** "Verbosity axis + output trim + anti-redundancy + Next-Actions invariant"
**Strategy:** unit
**Files:**
- Modify: `templates/personas/architect.md` (current 24 bullets across 8 dimensions → target 19–22)
- Test: `tests/persona.test.mjs` (Task 7 adds the calibration assertions)

**Depends on:** Task 1 (overlay templates exist for paired testing in Task 7).

**Tests:** Task 7 will add two assertions — per-dimension sum in `[19, 22]` AND fixture-weighted total in `[58, 62]`. Both must pass after this task lands.

**Context to load:** see Context Packet 2 above.

- [ ] **Inspect current state**: `node scripts/persona-fixture-score.mjs` → confirm Architect fixture-weighted total = 69, per-dimension sum = 24.
- [ ] **Edit `templates/personas/architect.md`** with per-dimension trim:
  - **Verbosity** — keep 3 bullets (architectural pitch is the whole point)
  - **Code References** — keep 3 bullets
  - **Review Verdicts** — keep 3 bullets, but optionally trim to 2 if Developer's pattern is sufficient (target: ≤3)
  - **Test Results** — collapse 3 → 2 bullets (drop one redundancy)
  - **Plan Output** — keep 3 bullets, optionally trim to 2 (target: ≤3)
  - **Spec/ADR Citations** — keep 3 bullets
  - **Error/Debug Output** — collapse 3 → 2 bullets
  - **Next Actions** — **leave untouched** (3 bullets including the example — invariant)
- [ ] **Verify per-dimension sum lands in [19, 22]**: count bullets manually or run `awk` over the edited file.
- [ ] **Verify fixture-weighted total lands in [58, 62]**: `node scripts/persona-fixture-score.mjs` → confirm "Total bullets across fixtures" for `architect` column is 58–62.
- [ ] **Verify Next Actions section is untouched**: `diff` Next Actions section against original (no change).
- [ ] **Commit**

```bash
git add templates/personas/architect.md
git commit -m "$(cat <<'EOF'
feat(output-personas): calibrated Architect template trim

Per-dimension trim of templates/personas/architect.md from 24 to 19-22
bullets, fixture-weighted total from 69 to 58-62 bullets. Test Results
and Error/Debug Output collapse from 3 to 2 bullets. Verbosity,
Code References, Spec/ADR Citations, and Next Actions are unchanged
(Next Actions is invariant per the spec). Calibration target derived
from JSONL audit (architect/developer mean output token ratio 1.85x)
and fixture A/B (naive 33% trim overshoots Developer; calibrated 10-15%
preserves Architect's decision-grade density).

Spec: .context-index/specs/features/output-personas/verbosity-axis-and-output-trimming.spec.md
Plan-task: 2
EOF
)"
```

---

### Task 3: Add anti-redundancy paragraph to all persona templates [specialist: none]

**Charter capability:** "Verbosity axis + output trim + anti-redundancy + Next-Actions invariant"
**Strategy:** unit
**Files:**
- Modify: `templates/personas/architect.md`, `templates/personas/developer.md`, `templates/personas/product.md`
- Test: `tests/persona.test.mjs` (Task 7 adds anti-redundancy presence + exclusion assertions)

**Depends on:** Task 2 (Architect template is at its final trimmed state before the anti-redundancy section is appended).

**Tests:** Task 7 will assert each of the 3 persona templates AND each of the 3 verbosity overlays contains:
- A paragraph mentioning at least one of `.review.md`, `.plan.md`, `.validate.md`, `.spec.md`, `.context-index/`
- An explicit exclusion clause mentioning `Next Actions` and `except` (or equivalent)

**Context to load:** see Context Packet 3 above.

- [ ] **Define the canonical anti-redundancy paragraph** (one paragraph, reused across 6 files via copy-paste so the assertion is text-identical):

  > **Anti-Redundancy.** If a disk artifact (`.review.md`, `.plan.md`, `.validate.md`, `.spec.md`, or any file under `.context-index/**/*.md`) captures the detail, summarize in 1–3 sentences and link to the path. Do not recapitulate the contents of written artifacts. **Exception:** the Next Actions dimension always renders forward-looking suggestions and is not subject to the anti-redundancy rule.

- [ ] **Append `### Anti-Redundancy` section to `templates/personas/architect.md`** at the end of the file (after the Next Actions section).
- [ ] **Append `### Anti-Redundancy` section to `templates/personas/developer.md`** at the end of the file.
- [ ] **Append `### Anti-Redundancy` section to `templates/personas/product.md`** at the end of the file.
- [ ] **Verify the same canonical paragraph appears in all 3 persona templates AND all 3 verbosity overlays (from Task 1)**: total of 6 templates. `grep -c "Anti-Redundancy" templates/personas/*.md templates/verbosity/*.md` → all 6 = 1.
- [ ] **Commit**

```bash
git add templates/personas/*.md
git commit -m "$(cat <<'EOF'
feat(output-personas): universal anti-redundancy rule

Adds the Anti-Redundancy section to all three persona templates with
the Next-Actions exclusion clause. The rule prevents chat output from
recapitulating disk artifacts (.review.md, .plan.md, .validate.md,
.spec.md, or any .context-index/ file) — chat summarizes in 1-3
sentences and links to the path. Grounded by JSONL audit: Architect
output references disk-artifact paths 1.60x more than Developer,
then recapitulates them anyway. Pure deduplication win.

Spec: .context-index/specs/features/output-personas/verbosity-axis-and-output-trimming.spec.md
Plan-task: 3
EOF
)"
```

---

### Task 4: Extend `lib/persona.mjs` with verbosity axis [specialist: none]

**Charter capability:** "Verbosity axis + output trim + anti-redundancy + Next-Actions invariant"
**Strategy:** unit
**Files:**
- Modify: `lib/persona.mjs`
- Test: `tests/persona.test.mjs` (Task 7 adds the new test cases)

**Depends on:** Task 3 (templates must exist for tests to load).

**Tests:** Task 7 will assert:
- `resolvePersona()` returns `{ name, source, verbosity, verbositySource }` — additive shape; existing `name` / `source` fields unchanged
- `loadVerbosityOverlay(name)` reads `templates/verbosity/<name>.md` and returns its content for valid names; warns and falls back to `normal.md` for missing files; rejects names containing `/`, `\`, `..` BEFORE path construction (defense-in-depth)
- `parseUserConfig` accepts `verbosity=<value>` lines, validates against `{terse, normal, deep}` AND the path-traversal denylist at parse time
- Per-persona verbosity defaults: `architect → normal`, `developer → normal`, `product → terse`
- Resolution hierarchy: `--verbosity` flag → local config → global config → per-persona default

**Context to load:** see Context Packet 4 above. Heuristic note: the existing two-phase resolve-then-load pattern in `lib/persona.mjs` is the template — mirror it for verbosity.

- [ ] **RED**: write failing test cases in `tests/persona.test.mjs` **locally to this task** (clarified per plan-review PR-1). These tests verify the new `lib/persona.mjs` behaviors and must land green by the end of Task 4. Task 7 will *extend* this file (does NOT duplicate) with the higher-level matrix + calibration + invariant assertions. Per task, write **one** representative failing test before each implementation step:

  ```javascript
  // Stage in tests/persona.test.mjs:
  describe('loadVerbosityOverlay', () => {
    it('reads templates/verbosity/<name>.md for valid name', () => {
      const overlay = loadVerbosityOverlay('terse');
      assert.match(overlay, /Anti-Redundancy/);
    });
  });
  ```

- [ ] **Verify test fails**: `npm test -- --test-name-pattern "loadVerbosityOverlay"` → FAIL (`loadVerbosityOverlay is not exported`).
- [ ] **Implement `loadVerbosityOverlay(name)`** in `lib/persona.mjs`:
  1. Validate `name` against closed enumeration `{terse, normal, deep}`; throw or warn-and-return-null for unknown.
  2. Validate `name` against path-traversal denylist (`/`, `\`, `..`); throw or warn-and-return-null on hit.
  3. Construct path: `path.join(pluginRoot, 'templates', 'verbosity', `${name}.md`)`.
  4. `readFileSync` and return content; on missing file, warn and recursively call `loadVerbosityOverlay('normal')`; if `normal` is also missing, warn and return empty string (degrade — Behavior 5 + SEC-4 fix).
- [ ] **Verify test passes**: `npm test -- --test-name-pattern "loadVerbosityOverlay"` → PASS.
- [ ] **RED**: write failing test for additive `resolvePersona` shape:
  ```javascript
  it('resolvePersona returns { name, source, verbosity, verbositySource }', () => {
    const result = resolvePersona({});
    assert.ok('name' in result);
    assert.ok('source' in result);
    assert.ok('verbosity' in result);
    assert.ok('verbositySource' in result);
  });
  ```
- [ ] **Verify test fails** (current shape is `{name, source}`).
- [ ] **Implement additive return shape in `resolvePersona`**: extend the existing function to also resolve `verbosity` from the same hierarchy (flag → local → global → per-persona default), return both axes alongside the original two fields. Per-persona default table is a local constant: `{architect: 'normal', developer: 'normal', product: 'terse'}`. Validate the resolved verbosity against the closed enumeration; on invalid, warn and fall back to the per-persona default.
- [ ] **Verify test passes**.
- [ ] **RED**: write failing test for `parseUserConfig` verbosity handling:
  ```javascript
  it('parseUserConfig parses verbosity= line and validates value', () => {
    const cfg = parseUserConfig(tmpFile('persona=architect\nverbosity=terse\n'));
    assert.equal(cfg.verbosity, 'terse');
  });
  it('parseUserConfig rejects verbosity path-traversal', () => {
    const cfg = parseUserConfig(tmpFile('verbosity=../etc/passwd\n'));
    assert.equal(cfg.verbosity, undefined); // rejected, warning emitted
  });
  ```
- [ ] **Implement** the `verbosity` key in `parseUserConfig`: add enum validation + path-traversal denylist. Mirror persona's validation pattern from companion spec line 48.
- [ ] **Verify all new tests pass** + existing tests still pass: `npm test`.
- [ ] **Commit**

```bash
git add lib/persona.mjs tests/persona.test.mjs
git commit -m "$(cat <<'EOF'
feat(output-personas): extend lib/persona.mjs with verbosity axis

Adds loadVerbosityOverlay(name) with closed-enum + path-traversal
validation defense-in-depth. Extends resolvePersona() return shape
additively to { name, source, verbosity, verbositySource } -
existing callers (hooks/session-start.sh, tests/persona.test.mjs)
continue to work without modification. parseUserConfig now accepts
verbosity= lines with enum + denylist validation at parse time.
Per-persona defaults: architect=normal, developer=normal,
product=terse.

Spec: .context-index/specs/features/output-personas/verbosity-axis-and-output-trimming.spec.md
Plan-task: 4
EOF
)"
```

---

### Task 5: Update session-start hook to concatenate directives [specialist: none]

**Charter capability:** "Verbosity axis + output trim + anti-redundancy + Next-Actions invariant"
**Strategy:** unit
**Files:**
- Modify: `hooks/session-start.sh`
- Test: `tests/persona.test.mjs` (Task 7 adds the hook-injection test)

**Depends on:** Task 4.

**Tests:** Task 7 will assert the session-start hook concatenates `personaDirective + "\n\n" + verbosityOverlay` correctly, and degrades gracefully (hook exits 0 with persona-only directive) when the overlay file is missing.

**Context to load:** see Context Packet 5 above. Constitution: "Hook protocol compliance" — exit 0 = allow, exit 2 = block, JSON to stdout.

- [ ] **RED**: stage failing test in `tests/persona.test.mjs` (Task 7):
  ```javascript
  it('session-start hook injects persona + verbosity overlay', () => {
    // Set HOME/persona config to architect+terse, exec the hook,
    // assert stdout JSON contains additionalContext with both directive texts.
  });
  ```
- [ ] **Verify test fails**.
- [ ] **Edit `hooks/session-start.sh`** to:
  1. Call `resolvePersona()` (returns `{name, source, verbosity, verbositySource}`).
  2. Load persona directive AND verbosity overlay via `loadPersonaDirective(name)` + `loadVerbosityOverlay(verbosity)`.
  3. Concatenate: `directive="${personaDirective}\n\n${verbosityOverlay}"`.
  4. Inject the combined string via the existing `additionalContext` JSON path.
  5. Wrap the entire block in `2>/dev/null || true` so a missing overlay (or any other failure) does not exit non-zero — hook always exits 0 (Hook protocol compliance + SEC-4 fix).
- [ ] **Verify test passes** AND existing hook tests pass.
- [ ] **Commit**

```bash
git add hooks/session-start.sh tests/persona.test.mjs
git commit -m "$(cat <<'EOF'
feat(output-personas): wire session-start hook to concatenate
persona directive + verbosity overlay

The session-start hook now loads both the persona directive and the
verbosity overlay, concatenates them with a blank-line separator, and
injects the combined string as additionalContext. Missing overlay
template degrades to persona-only directive; hook always exits 0
(Hook protocol compliance, SEC-4 review finding).

Spec: .context-index/specs/features/output-personas/verbosity-axis-and-output-trimming.spec.md
Plan-task: 5
EOF
)"
```

---

### Task 6: Author 9 golden directive-text fixtures [specialist: none]

**Charter capability:** "Verbosity axis + output trim + anti-redundancy + Next-Actions invariant"
**Strategy:** unit
**Files:**
- Create: `tests/fixtures/persona-output/architect-terse.expected.md`, `architect-normal.expected.md`, `architect-deep.expected.md`, `developer-terse.expected.md`, `developer-normal.expected.md`, `developer-deep.expected.md`, `product-terse.expected.md`, `product-normal.expected.md`, `product-deep.expected.md`
- Test: `tests/persona.test.mjs` (Task 7 adds the 9-combo assertions)

**Depends on:** Task 3 (persona templates final), Task 5 (hook integration final).

**Tests:** Task 7 will load each fixture and assert it matches the rendered output of `loadPersonaDirective(persona) + "\n\n" + loadVerbosityOverlay(verbosity)` byte-for-byte.

**Context to load:** see Context Packet 6 above. Per SA-6 review note, consider asserting *composition* (both directive contents present + separator) rather than exact concatenated bytes, to make the matrix scale O(n+m) not O(n×m). For v1, exact-bytes is acceptable (9 fixtures is small enough); revisit on a 4th persona or 4th verbosity level.

- [ ] **Generate each fixture** by running the concatenation logic once per combo:
  ```bash
  for persona in architect developer product; do
    for verbosity in terse normal deep; do
      node -e "
        import('./lib/persona.mjs').then(m => {
          const out = m.loadPersonaDirective('$persona') + '\n\n' + m.loadVerbosityOverlay('$verbosity');
          process.stdout.write(out);
        });
      " > tests/fixtures/persona-output/$persona-$verbosity.expected.md
    done
  done
  ```
- [ ] **Verify all 9 files exist and are non-empty**: `ls -la tests/fixtures/persona-output/*.expected.md | wc -l` → 9; `wc -c tests/fixtures/persona-output/*.expected.md` → all >0.
- [ ] **Verify each fixture contains a Next Actions section** (invariant): `grep -l "Next Actions" tests/fixtures/persona-output/*.expected.md | wc -l` → 9.
- [ ] **Verify each fixture contains the anti-redundancy paragraph**: `grep -l "Anti-Redundancy" tests/fixtures/persona-output/*.expected.md | wc -l` → 9.
- [ ] **Commit**

```bash
git add tests/fixtures/persona-output/
git commit -m "$(cat <<'EOF'
test(output-personas): add 9 golden directive-text fixtures

The 3x3 matrix (3 personas x 3 verbosity overlays) renders 9
expected directive texts. Each fixture asserts the composition of
loadPersonaDirective + loadVerbosityOverlay matches a frozen golden.
Next Actions section and Anti-Redundancy paragraph verified present
in all 9 combinations.

Spec: .context-index/specs/features/output-personas/verbosity-axis-and-output-trimming.spec.md
Plan-task: 6
EOF
)"
```

---

### Task 7: Extend `tests/persona.test.mjs` with full coverage [specialist: none]

**Charter capability:** "Verbosity axis + output trim + anti-redundancy + Next-Actions invariant"
**Strategy:** unit
**Files:**
- Modify: `tests/persona.test.mjs`

**Depends on:** Task 6 (fixtures must exist).

**Tests:** This task IS the higher-level test layer. It **extends** (does NOT duplicate) the per-function tests already landed in Tasks 4 and 5; this task adds the matrix + calibration + invariant assertions that span multiple persona/verbosity combinations. (Clarified per plan-review PR-1.)

**Context to load:** see Context Packet 7 above.

- [ ] **Verbosity resolution** (extend existing `parseUserConfig` and `resolvePersona` describe blocks):
  - parses `verbosity=` line; rejects path-traversal; rejects unknown values
  - resolution hierarchy: flag → local → global → per-persona default
  - per-persona default table assertion
- [ ] **`loadVerbosityOverlay`** (new describe block):
  - returns content for `terse`, `normal`, `deep`
  - warns and falls back to `normal.md` on missing file for a valid name
  - rejects names with `/`, `\`, `..` before path construction
  - degrades cleanly if `normal.md` is missing (returns empty string, no throw)
- [ ] **Architect calibration** (two independent assertions):
  - per-dimension bullet sum across `### ` headers in `templates/personas/architect.md` falls in `[19, 22]`
  - fixture-weighted total from `node scripts/persona-fixture-score.mjs` "Total bullets" row for `architect` column falls in `[58, 62]`
- [ ] **Next-Actions invariant**:
  - all 9 fixtures contain "Next Actions" substring (or equivalent dimension header)
  - all 3 persona templates AND all 3 verbosity overlays contain a Next-Actions-mandate clause
- [ ] **Anti-redundancy presence + exclusion**:
  - all 6 templates (3 persona + 3 overlay) contain a paragraph mentioning at least one of `.review.md`, `.plan.md`, `.validate.md`, `.spec.md`, `.context-index/`
  - the same paragraph in each of the 6 templates contains `except` + `Next Actions` (or equivalent exclusion clause)
- [ ] **No hard word caps**:
  - `grep -rE '\b[0-9]+ words\b|\b[0-9]+-word\b' templates/personas/ templates/verbosity/` → no matches
- [ ] **Session-start hook injection** (concatenation behavior — may live in `tests/hooks/session-start.test.mjs` if that file exists; otherwise inline in `tests/persona.test.mjs`):
  - hook reads persona + verbosity, concatenates, emits `additionalContext` containing both directive texts
  - missing overlay degrades to persona-only; hook exits 0
- [ ] **Run full suite**: `npm test` → all green.
- [ ] **Commit**

```bash
git add tests/persona.test.mjs
git commit -m "$(cat <<'EOF'
test(output-personas): extend persona test suite for verbosity axis

Adds test coverage for the verbosity axis: resolution from each
config layer, loadVerbosityOverlay enum + path-traversal validation,
per-persona defaults, the two calibration invariants (per-dimension
19-22 and fixture-weighted 58-62), the Next-Actions invariant
across all 9 combos, the anti-redundancy presence + exclusion
invariants across all 6 templates, and the no-hard-word-caps grep.
9 golden directive-text fixtures asserted byte-for-byte against
loadPersonaDirective + loadVerbosityOverlay composition.

Spec: .context-index/specs/features/output-personas/verbosity-axis-and-output-trimming.spec.md
Plan-task: 7
EOF
)"
```

---

### Task 8: No-content-echo test for JSONL script (RED — written before extension) [specialist: none]

**Charter capability:** "Verbosity axis + output trim + anti-redundancy + Next-Actions invariant" (security invariant)
**Strategy:** unit
**Files:**
- Create: `tests/scripts/persona-jsonl-analysis.test.mjs` (new test file alongside existing test dirs)

**Depends on:** none (independent of the persona resolution path).

**Tests:** This task IS the failing test that drives Task 9's implementation (TDD order corrected per plan-review PR-4). The test asserts the extended script preserves the no-content-echo invariant; it must fail until Task 9 lands the persona×verbosity grouping AND keeps the invariant.

**Context to load:** see Context Packet 9 (now mapped to this task — see updated packet header).

- [ ] **RED**: write the failing test:
  ```javascript
  // tests/scripts/persona-jsonl-analysis.test.mjs
  import { test } from 'node:test';
  import assert from 'node:assert/strict';
  import { spawnSync } from 'node:child_process';
  import { mkdtempSync, writeFileSync } from 'node:fs';
  import { tmpdir } from 'node:os';
  import { join } from 'node:path';

  test('persona-jsonl-analysis.mjs renders persona×verbosity table without echoing content', () => {
    const dir = mkdtempSync(join(tmpdir(), 'persona-jsonl-'));
    const sentinel = 'SECRET_TRANSCRIPT_CONTENT_QWERTY_12345';
    const fixture = [
      JSON.stringify({type: 'user', message: {content: [{type: 'text', text: sentinel}]}}),
      JSON.stringify({type: 'assistant', message: {role: 'assistant', content: [{type: 'text', text: sentinel + '_ASSISTANT'}], usage: {output_tokens: 10, input_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0}}}),
    ].join('\n');
    writeFileSync(join(dir, 'session.jsonl'), fixture);
    const result = spawnSync('node', ['scripts/persona-jsonl-analysis.mjs', dir], { encoding: 'utf8' });
    assert.equal(result.status, 0, 'script must exit 0');
    assert.ok(!result.stdout.includes(sentinel), 'stdout must not contain sentinel substring (no-content-echo invariant)');
    // The persona×verbosity table assertion lands in Task 9 — for this RED phase,
    // the test fails initially because the script does not yet bucket by verbosity.
    // (If the current script already passes this no-content check, that's expected —
    // the new behavior in Task 9 must preserve it.)
  });
  ```
- [ ] **Run the test** against the current `scripts/persona-jsonl-analysis.mjs`. Two possible outcomes are acceptable for RED:
  - The test fails because the script does not emit a persona×verbosity table — expected; Task 9 adds it.
  - The test passes because the current script already honors no-content-echo — that's the invariant we want preserved through Task 9. Either way, Task 9's GREEN check re-runs this same test.
- [ ] **Commit (RED snapshot)**

```bash
git add tests/scripts/persona-jsonl-analysis.test.mjs
git commit -m "$(cat <<'EOF'
test(output-personas): no-content-echo invariant test for JSONL script (RED)

Adds a grep-level test asserting scripts/persona-jsonl-analysis.mjs
does not print any substring of assistant/user message.content to
stdout. Test lands BEFORE the script extension (Task 9) per plan
review PR-4 (TDD cycle correction). Uses a synthetic transcript
with a distinctive sentinel string and asserts the sentinel does
not appear in the script's output. Operationalizes the SEC-3
security invariant.

Spec: .context-index/specs/features/output-personas/verbosity-axis-and-output-trimming.spec.md
Plan-task: 8
EOF
)"
```

---

### Task 9: Extend `scripts/persona-jsonl-analysis.mjs` with persona × verbosity grouping (GREEN) [specialist: none]

**Charter capability:** "Verbosity axis + output trim + anti-redundancy + Next-Actions invariant" (post-ship validation contract)
**Strategy:** unit
**Files:**
- Modify: `scripts/persona-jsonl-analysis.mjs`

**Depends on:** Task 8 (the test landed first).

**Tests:** Task 8's test must pass (GREEN) after this task. No new test file; this task implements the behavior the Task 8 test verifies.

**Context to load:** see Context Packet 8 above. The existing script's invariant at line 6 ("This script never echoes user/assistant content to stdout. Statistics only.") MUST be preserved.

- [ ] **Edit `scripts/persona-jsonl-analysis.mjs`** to:
  1. Detect verbosity from the same SessionStart attachment grep that currently detects persona (regex: `Output Persona:\s*\w+` already exists; add `verbosity:\s*\w+` from the same attachment if present in the system-prompt block).
  2. Replace the single-key `personaStats` aggregation with a two-key `[persona][verbosity]` nested aggregation.
  3. Render two output tables: (a) existing per-persona aggregates (unchanged for backward compat), (b) new persona × verbosity aggregates (9 rows for the 3×3 matrix + "unknown" buckets).
  4. Preserve the existing no-content-echo invariant — statistics only, never any `message.content` substring.
- [ ] **Run Task 8's test** against the extended script: `node --test tests/scripts/persona-jsonl-analysis.test.mjs` → PASS. The no-content-echo sentinel must not appear in stdout.
- [ ] **Run on existing JSONL corpus**: `node scripts/persona-jsonl-analysis.mjs` against `~/.claude/projects/-Users-dpavancini-Development-adev-plugin/` — confirm output renders both tables, persona × verbosity table is populated for sessions that had verbosity set (or all-unknown for current corpus since verbosity isn't injected yet).
- [ ] **Run full suite**: `npm test` → all green.
- [ ] **Commit**

```bash
git add scripts/persona-jsonl-analysis.mjs
git commit -m "$(cat <<'EOF'
feat(output-personas): persona x verbosity grouping in JSONL analysis (GREEN)

Extends scripts/persona-jsonl-analysis.mjs to bucket by both persona
and verbosity (3x3 = 9 buckets plus unknown). Renders two tables: the
existing per-persona aggregates (backward compatible) and the new
persona x verbosity aggregates needed by the spec's post-ship
validation contract. The no-content-echo invariant (Task 8 test)
is preserved.

Spec: .context-index/specs/features/output-personas/verbosity-axis-and-output-trimming.spec.md
Plan-task: 9
EOF
)"
```

---

### Task 10: Amend companion spec + bump revision [specialist: none]

**Charter capability:** "Verbosity axis + output trim + anti-redundancy + Next-Actions invariant"
**Strategy:** unit
**Files:**
- Modify: `.context-index/specs/features/output-personas/persona-resolution-and-injection.spec.md`

**Depends on:** none (markdown-only edit, can run in parallel with code tasks).

**Tests:** None — this is a spec-text amendment, not behavior. `/adev:hygiene` will catch drift if the amendment is missed.

**Context to load:** see Context Packet 10 above.

- [ ] **Read companion spec around line 70** (disk-vs-chat duality paragraph).
- [ ] **Append one sentence to that paragraph** closing the missing half (option E from the research artifact):
  > *"If a disk artifact captures the detail, chat may summarize in 1–3 sentences and link to the path; do not recapitulate the contents of written artifacts. Exception: the Next Actions dimension renders forward-looking suggestions regardless of disk content."*
- [ ] **Add a new acceptance criterion** to the companion spec (per CA-9 review finding):
  > *"Every assistant turn ends with a clear Next-action suggestion, regardless of persona or verbosity setting. This is a persona-system invariant: the Next Actions dimension is not subject to template trimming or to the anti-redundancy rule."*
- [ ] **Update the companion spec's Postcondition at line 66** ("exactly one persona directive block" → "exactly one persona directive block, optionally followed by a verbosity overlay block, both injected at session start"). Per CA-9 review finding.
- [ ] **Bump companion spec frontmatter `revision: 2 → 3`**, `updated: <today's date>`. Per CA-8 review finding (validated spec amendment requires deliberate revision bump).
- [ ] **Verify spec still parses cleanly** (frontmatter intact, no broken markdown).
- [ ] **Commit**

```bash
git add .context-index/specs/features/output-personas/persona-resolution-and-injection.spec.md
git commit -m "$(cat <<'EOF'
docs(output-personas): amend companion spec rev 2 -> 3

Adds the disk-vs-chat duality closure sentence at line 70, adds the
Next-Actions-as-invariant acceptance criterion, and updates the
"exactly one persona directive block" postcondition to acknowledge
the verbosity overlay block introduced by the verbosity-axis spec.
Bumps companion spec revision 2 -> 3 (CA-8 review finding: validated
spec amendments require deliberate revision bumps).

Spec: .context-index/specs/features/output-personas/verbosity-axis-and-output-trimming.spec.md
Plan-task: 10
EOF
)"
```

---

### Task 11: Version bump [specialist: none]

**Charter capability:** "Verbosity axis + output trim + anti-redundancy + Next-Actions invariant" (Constitution Principle 5)
**Strategy:** unit
**Files:**
- Modify: `package.json`, `.claude-plugin/plugin.json`

**Depends on:** Tasks 1–10 (all behavior changes committed first).

**Tests:** None for the bump itself; the existing version-parity test in the suite verifies both files match after the bump.

**Context to load:** see Context Packet 11 above.

- [ ] **Read current version** from both `package.json` and `.claude-plugin/plugin.json`. Confirm they currently match.
- [ ] **Decide bump type**: this spec adds a new capability (`verbosity` config key, new templates, new lib function) under an already-shipped charter, so the natural bump is **minor** (new feature, backward-compatible — `resolvePersona` change is additive, no contract break).
- [ ] **Edit `package.json`**: bump `"version"` field.
- [ ] **Edit `.claude-plugin/plugin.json`**: bump `"version"` field to the same value.
- [ ] **Verify parity**: `node -e "console.log(JSON.stringify({pkg: require('./package.json').version, plg: require('./.claude-plugin/plugin.json').version}))"` → both equal.
- [ ] **Run full suite**: `npm test` → all green (including any version-parity test).
- [ ] **Commit**

```bash
git add package.json .claude-plugin/plugin.json
git commit -m "$(cat <<'EOF'
chore(release): bump version for verbosity-axis feature

Minor version bump per Constitution Principle 5 (version parity):
package.json and .claude-plugin/plugin.json move in lockstep.
Adds the verbosity axis as a backward-compatible new capability;
no breaking changes (resolvePersona return shape is additive).

Spec: .context-index/specs/features/output-personas/verbosity-axis-and-output-trimming.spec.md
Plan-task: 11
EOF
)"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied (Functional, Quality & invariants, Post-ship validation contract — post-ship items run after merge, not pre-merge)
- Version parity: `package.json` and `.claude-plugin/plugin.json` carry the same version
- No constitutional violations: ESM only (`.mjs`, `import`), no new external deps, hook protocol compliance (exit 0/2)
- Spec-traceable commits: every commit message carries `Spec:` and `Plan-task:` trailers per CLAUDE.md commit-trailer rule
- `adev/frontmatter-present` diagnostic: the new spec passes (frontmatter is first non-blank line); the 130 pre-existing spec violations are out of scope (filed as issue-517, separate spec)

**Post-ship validation contract** (executed separately after ≥1000 assistant turns on the new templates, per SA-8 review finding — turn-count threshold, not session-count):

- Re-run `node scripts/persona-jsonl-analysis.mjs` against the live JSONL corpus
- **Output-token target**: `architect-normal` / `developer-normal` mean output-token ratio drops from current 1.85x to **< 1.4x**
- **Next-Actions invariant target**: `next_steps` flag rate across all 9 buckets is **> 95%** (up from current 1.8% / 0.8%)
- **No quality regression**: qualitative review pass confirms trimmed Architect output still meets the senior-architect bar on a decision-moment fixture
