# Implementation Plan: Amendment — Auto-Retry Loop on Review BLOCK (targeting rev 2)

> **Methodology:** adev
> **Charter:** cross-cutting (affects: `agent-reliable-state-artifacts`, `spec-lifecycle`, `strategic-planning`, `review`) — no parent charter; amendment of `review-block-auto-retry.spec.md`
> **Spec:** `.context-index/specs/cross-cutting/review-block-auto-retry-rev-2-targeted-author-verify-loop.spec.md` (revision 6, target-revision 2)
> **Review:** PASS_WITH_NOTES (2026-08-22) — 0 blockers / 8 warnings / 15 suggestions across 5 dispatched reviewers (consistency-analyzer, referent-integrity, wiring-reviewer, boundary-reviewer, termination-reviewer). See `.review.md`.
> **Platform:** JavaScript (ESM, `.mjs`), Node.js, npm, node:test
> **Risk level:** high

**Goal:** Give the review-BLOCK auto-retry loop a real, AI-driven per-section authoring step (replacing the current no-op frontmatter-only revise) and a trend-based `NOT_CONVERGING` stop condition, plus a `finding_class` taxonomy that routes `decision`/`external` blockers away from authoring entirely, so the loop can actually converge instead of endlessly reproducing identical blockers.

**Architecture:** The mechanics verb (`lib/specify-revise.mjs`) moves from "acknowledge every blocker unconditionally" to "accept pre-authored section bodies keyed by anchor, splice with refuse-don't-sanitize validation, diff pre/post text to compute `addressed`/`unresolved`." `skills/specify/SKILL.md` Revise Mode gains a per-anchor authoring subagent fan-out step ahead of the mechanics verb call. A new Tier-2 diagnostic (`adev/mechanism-existence`, per ADR-0010's decision-flow step 5 — "inspects an artifact for verifiable invariants") gates every authored revision before any reviewer is re-dispatched, wrapped by a new `adev specify check-mechanisms` CLI verb. `lib/loop-convergence.mjs` gains `NOT_CONVERGING` with a single stated precedence order across all stop conditions (closing TR-4). `lib/blockers-writer.mjs`'s sidecar schema gains `finding_class`/`remedy_ref` with the same refuse-don't-sanitize gate `assertSafeScalar` already establishes elsewhere in the codebase — applied here to close the pre-existing, unrelated `section_anchor` interpolation gap the Boundary Reviewer flagged (BD-1). `skills/build/SKILL.md`'s loop and `skills/review-specs/SKILL.md`'s dispatch/report logic are the two orchestration surfaces that consume all of the above.

---

## File Structure

**Create:**
- `lib/diagnostics/tier2/mechanism-existence.mjs` — Tier-2 diagnostic producer (`adev/mechanism-existence`): extracts `file:line`/symbol/flag/error-code referents from authored text, realpath-contains every candidate against the repo root (mirrors `assertContained`, `lib/extensions/exec-payload.mjs:174-183`), refuses lexical `../` escapes before any filesystem access.
- `lib/governance/remedy-ref-render.mjs` — shared render-time sanitizer for `remedy_ref` (control-char + ANSI-escape stripping, length bound), consumed by both the build progress line and the `.review.md` "External Remedies" section so the two channels can never diverge on sanitization.
- `lib/governance/diff-scope.mjs` — pure helper: `extractChangedSections(prevSpecText, currSpecText)` returns changed section anchors + their text; `expandWithCrossReferences(specText, changedAnchors)` adds any section containing a markdown link or heading-name literal-text mention targeting a changed anchor.
- `tests/diagnostics/tier2/mechanism-existence.test.mjs` — new suite for the diagnostic producer (BEH-6, path-containment refusal).
- `tests/cli/specify-check-mechanisms.test.mjs` — new suite for the `adev specify check-mechanisms` CLI verb.
- `tests/lib/governance/remedy-ref-render.test.mjs` — new suite for the render-time stripping helper (WR-1, second half).
- `tests/governance/diff-scope.test.mjs` — new suite for changed-section extraction + cross-reference expansion (BEH-8, diff-scoped dispatch filter test).

**Modify:**
- `lib/manifest.mjs:143-168` (near `validateMaxReviewRetries`) — add `validateNotConvergingWindow(build)`, mirroring the existing function's shape; default 2, non-negative integer, `INVALID_NOT_CONVERGING_WINDOW` on violation.
- `lib/blockers-writer.mjs` — sidecar entry schema gains `finding_class` (enum `defect|decision|external`, default `defect`) and `remedy_ref` (present only when `finding_class === 'external'`); both validated with a local refuse-don't-sanitize gate before YAML interpolation (mirroring `lib/extensions/governance-values.mjs::assertSafeScalar`'s posture, not importing it directly — that module validates *extension* fields, a different trust boundary). The existing unvalidated `section_anchor` interpolation (line ~204, BD-1) gets the same gate.
- `lib/loop-convergence.mjs` — add `NOT_CONVERGING` to the verdict set; restate the module-doc precedence comment (lines 22-29) as a single ordered list covering PASS/PASS_PENDING_HUMAN → NOT_CONVERGING → NO_PROGRESS → REGRESSED → BUDGET_EXHAUSTED → CONTINUE, and note BEH-7's inner 3-attempt cap explicitly as a *separate* counter evaluated before this function is ever called for a given cycle (closes TR-4).
- `lib/specify-revise.mjs` — `reviseSpec()` gains an `authoredSections` parameter (`Map<anchor, body>`, produced by the skill's per-anchor authoring fan-out); export `groupBlockersByAnchor(blockerEntries)` for the fan-out step; replace the hardcoded `addressed = all input; unresolved = []` (lines 288-293) with per-anchor pre/post text diffing; add splice validation (frontmatter-fence line / control-character refusal, post-splice re-parse) per BEH-5a, discarding-and-preserving on failure with a `SPLICE_VALIDATION_FAILED` advisory; report `ANCHOR_NOT_FOUND` for anchors with no matching heading.
- `lib/cli/specify.mjs` — add a `check-mechanisms` subcommand wrapping `lib/diagnostics/tier2/mechanism-existence.mjs` via `runDiagnostics`/direct `run()` call; exit 0 (all resolved) / 2 (unresolved references found, new blockers to be created by the caller).
- `.context-index/governance/diagnostics.yaml` — register `adev/mechanism-existence` (`runner: plugin:tier2/mechanism-existence.mjs`, `severity: error`, `tier: 2`, `scope: spec`).
- `skills/specify/SKILL.md` (Revise Mode, line ~963) — before calling the mechanics verb: group `defect`-classed blockers by `section_anchor` via `groupBlockersByAnchor`, dispatch one subagent per anchor in parallel (each scoped to only that section's current text + its blocker prose + minimal frontmatter), collect authored bodies, pass to `reviseSpec({ authoredSections, ... })`. Report `ANCHOR_NOT_FOUND` entries to the operator. Reviewer-set doc fix: any prose naming "structural-architect/security-reviewer/consistency-analyzer" as *the* reviewer trio is corrected to "whatever `adev governance reviewers` resolves for the project."
- `skills/build/SKILL.md` (Blocker handling, lines 420-475) — insert `adev specify check-mechanisms --spec <path>` between step 4 (dispatch revise) and step 5 (re-run review); on unresolved references, create new `mechanism-existence` blockers and loop back to authoring (within BEH-7's own 3-attempt inner cap, independent of `retries_remaining`) or stop `BUDGET_EXHAUSTED`. Add `DECISION_REQUIRED` (immediate halt, no authoring) and `EXTERNAL_REMEDY` (exclude from convergence accounting, continue loop, emit "External remedies" progress line via `lib/governance/remedy-ref-render.mjs`) branches ahead of the existing convergence-detector call. Extend the `evaluateStopCondition` call site to pass `not_converging_window` and read the new `NOT_CONVERGING` verdict into the verdict-action table (line ~456-465). Add diff-scoped dispatch mode selection for cycles after the spec's first review (delegates the actual filtering to the review-specs skill's Step 4 per BEH-8).
- `skills/review-specs/SKILL.md` (Step 4, line ~190-226; Step 5 Consolidated Report Format, line ~267-289) — Step 4: when the lifecycle log already has a `step_completed` review event for this spec at an earlier revision, compute changed-section text via `lib/governance/diff-scope.mjs` and pass it as the `specContent` argument to `shouldDispatch()` (reviewers with `dispatch: always` are unaffected; `triggered` reviewers now score against the diff, not the full spec), and restrict each dispatched reviewer's rendered context pack to the changed-section text. First review of any spec/amendment always uses full-context dispatch regardless of rigor tier. Step 5: add an "External Remedies" section to the Consolidated Report Format, rendering the same `remedy_ref` data (via `lib/governance/remedy-ref-render.mjs`) as the build's progress line.

**Reference (read, do not modify):**
- `lib/extensions/exec-payload.mjs:158-217` — `assertContained` pattern for realpath containment + lexical `../` pre-check (BEH-6's model; corrected citation per BD-2: the refusal block is lines 174-183, not 171-179).
- `lib/extensions/governance-values.mjs:104-` — `assertSafeScalar` refuse-don't-sanitize pattern (BEH-1's model for the new sidecar fields).
- `lib/diagnostics/tier2/validated-without-report.mjs` — sibling Tier-2 producer; same ADR-0010 citation style, same `run(ctx)` contract.
- `lib/diagnostics/index.mjs:525-` — `runDiagnostics()` engine contract each producer's `run(ctx)` must satisfy.
- `.context-index/adrs/0010-governance-check-layering.md` — decision-flow step 5, authoritative routing for BEH-6 as a diagnostic rather than a bespoke verb (resolves CON-1).
- `lib/governance/review-config.mjs:251-` — `shouldDispatch(reviewer, ctx)`, reused unmodified for diff-scoped scoring (BEH-8) by varying the `specContent` argument.
- `.context-index/governance/review.yaml` — reviewer registry (`dispatch: always` vs `triggered` + keywords), confirms the drifted trio reference this amendment corrects.
- `.context-index/specs/cross-cutting/check-id-enum.spec.md` — SEC-8 guard this amendment mirrors for `remedy_ref` render-time stripping.
- `.context-index/specs/cross-cutting/review-block-auto-retry.spec.md` — the base (immutable) spec this amendment targets rev 2 of.

---

## Context Packets

### Task 1 Context
- Spec: this spec, frontmatter + BEH-11 + Preconditions Delta
- Source files: `lib/manifest.mjs:136-169` (full read — mirror `validateMaxReviewRetries`)
- Test: `tests/lib/manifest.test.mjs` (signatures via `grep "^describe\|^it"`)

### Task 2 Context
- Spec: BEH-1, Error Cases Delta rows 1-2
- Boundary review note: BD-1 (`.review.md`, section Boundary Reviewer)
- Source files: `lib/blockers-writer.mjs` (full read), `lib/extensions/governance-values.mjs:104-135` (pattern reference, signatures only)
- Test: `tests/lib/blockers-writer.test.mjs` (signatures)

### Task 3 Context
- Spec: BEH-1 last paragraph (render-time stripping), `.context-index/specs/cross-cutting/check-id-enum.spec.md` SEC-8 (relevant section only)
- No existing sibling helper — new module.

### Task 4 Context
- Spec: BEH-1 (defaulting/persistence), Error Cases Delta row 1
- Source files: `skills/review-specs/SKILL.md:253-289` (Step 5 verdict + report format), `lib/governance/review-config.mjs:289-` (`applySeverityCap`, signature only)
- Depends on: Task 2 (sidecar schema)

### Task 5 Context
- Spec: BEH-9, Error Cases Delta last row
- Termination review note: TR-4 (`.review.md`, section Termination Reviewer)
- Source files: `lib/loop-convergence.mjs` (full read)
- Test: `tests/lib/loop-convergence.test.mjs` (signatures)
- Depends on: Task 1 (manifest key)

### Task 6 Context
- Spec: BEH-5, BEH-5a, Behaviors Amended (Base Behavior 1/2)
- Wiring review notes: WR-5, WR-6
- Source files: `lib/specify-revise.mjs` (full read), `lib/partial-artifact.mjs::assertWithin` (signature only)
- Test: `tests/lib/specify-revise.test.mjs`, `tests/cli/specify-revise.test.mjs` (signatures)
- Depends on: Task 2 (finding_class-filtered blocker input)

### Task 7 Context
- Spec: BEH-4, Error Cases Delta `ANCHOR_NOT_FOUND` row
- Source files: `skills/specify/SKILL.md:963-` (Revise Mode, full read), `lib/specify-revise.mjs::groupBlockersByAnchor` (from Task 6)
- Depends on: Task 6

### Task 8 Context
- Spec: BEH-6, BEH-7 first sentence, Error Cases Delta `MECHANISM_PATH_ESCAPE`/`MECHANISM_NOT_FOUND` rows
- Consistency review note: CON-1 (routes this to diagnostics.yaml per ADR-0010)
- Boundary review note: BD-2 (citation correction)
- Source files: `lib/extensions/exec-payload.mjs:158-217` (full read), `lib/diagnostics/tier2/validated-without-report.mjs` (full read, sibling pattern), `lib/diagnostics/index.mjs:333-660` (`loadRegistry`/`runDiagnostics`, signatures), `.context-index/governance/diagnostics.yaml` (full read), `.context-index/adrs/0010-governance-check-layering.md` (Decision section only)
- Test: `tests/diagnostics/tier2/validated-without-report.test.mjs` (pattern reference), `tests/cli/specify-revise.test.mjs` (CLI test pattern reference)

### Task 9 Context
- Spec: BEH-2, BEH-3, BEH-7 (full), Error Cases Delta `DECISION_REQUIRED`/`EXTERNAL_REMEDY`/`MECHANISM_NOT_FOUND`/`LOOP_NOT_CONVERGING` rows
- Wiring review note: WR-8
- Source files: `skills/build/SKILL.md:395-476` (full read), `lib/loop-convergence.mjs` (from Task 5, full)
- Test: `tests/integration/build-loop-auto-retry.test.mjs` (full read)
- Depends on: Tasks 4, 5, 6, 7, 8

### Task 10 Context
- Spec: BEH-8, "Reviewer-registry correction" paragraph (Amendment Rationale)
- Source files: `skills/review-specs/SKILL.md:190-289` (full read), `lib/governance/review-config.mjs:251-289` (`shouldDispatch`, full read), `.context-index/governance/review.yaml` (full read)
- Test: `tests/governance/dispatch-manifest-prompt.test.mjs` (signatures, pattern reference)
- Depends on: Task 4

### Task 11 Context
- Spec: BEH-3 (two-channel requirement)
- Wiring review note: WR-3
- Source files: `skills/build/SKILL.md` (Task 9 edits), `skills/review-specs/SKILL.md` (Task 10 edits), `lib/governance/remedy-ref-render.mjs` (from Task 3)
- Depends on: Tasks 3, 9, 10

### Task 12 Context
- Spec: Actionable Task Map ("Real-dispatch convergence eval"), Acceptance Criteria (`--baseline-ref` A/B row)
- Source files: `tests/evals/convergence/run-convergence-eval.mjs` (full read — already built), `tests/evals/convergence/README.md`, `tests/evals/integration-sandbox/.context-index/specs/cross-cutting/broken-loop-fixture.spec.md`
- Depends on: Tasks 9, 10, 11

---

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

### Heuristic: A universal coverage claim must ship with the predicate that checks it (confidence: medium)
- **Pattern:** When closing a coverage gap in a spec or acceptance criterion, state the executable check alongside the claim — the exact command or match, and the paths it runs over. Scope it to live surfaces and exclude directories that archive review and validate artifacts, since those necessarily quote the pattern being forbidden. Match on the meaningful component rather than an exact string, so equivalent forms are both caught.
- **Anti-pattern:** Answer a repeatedly-missed surface by widening the assertion to an unbounded universal. The failure is self-demonstrating: a criterion forbidding a pattern must quote that pattern to describe itself.
- **Relevance:** Directly applicable to Task 9/10's `DECISION_REQUIRED`/`EXTERNAL_REMEDY`/diff-scoped-dispatch prose edits — each must name its concrete check (which lifecycle field, which function) rather than an unbounded "the loop handles X correctly" claim.

### Heuristic: Use session JSONL for token measurement, not file-size estimates (confidence: medium)
- **Pattern:** When evaluating token consumption or cost of adev skills, parse real session JSONL files (`message.usage` fields). Dispatch paired A/B subagents and compare their JSONL data for controlled experiments.
- **Relevance:** Applies to Task 12's `--baseline-ref` A/B convergence eval — use real session/lifecycle JSONL, not byte-size estimates, when comparing pre/post reviewer-dispatch cost.

### Heuristic: Cache reads are 71% of session cost — minimize context accumulation (confidence: medium)
- **Pattern:** Focus on reducing what accumulates in conversation context (output echoes, artifact dumps, verbose subagent returns), not input token counts.
- **Relevance:** Reinforces BEH-8's diff-scoped context restriction (Task 10) — the amendment's own cost rationale (~120-145K tokens/cycle) is best addressed by shrinking what accumulates per reviewer dispatch, exactly what BEH-8 does.

---

## Parallelization

- Group A (sequential): Task 2 → Task 4 → Task 10
- Group B (sequential): Task 2 → Task 6 → Task 7
- Group C (sequential): Task 1 → Task 5
- Group D (independent): Task 3
- Group E (independent): Task 8

Groups A-E can run in parallel with each other up to their internal sequencing. Task 9 is the join point (depends on Tasks 4, 5, 6, 7, 8) and must wait for all five groups. Task 11 depends on Tasks 3, 9, 10. Task 12 (the real-dispatch eval) runs last, after Task 11.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | `not_converging_window` manifest validation | small | unit | — | 0 create, 1 modify |
| 2 | `finding_class`/`remedy_ref` sidecar schema + `section_anchor` validation fix | medium | unit | — | 0 create, 1 modify |
| 3 | Render-time `remedy_ref` stripping helper | small | unit | — | 2 create, 0 modify |
| 4 | Reviewer output schema — `finding_class` default/reject wiring | medium | unit | Task 2 | 0 create, 1 modify |
| 5 | `NOT_CONVERGING` verdict + stated precedence order | medium | unit | Task 1 | 0 create, 1 modify |
| 6 | Real-diff `addressed`/`unresolved` + splice validation | large | unit | Task 2 | 0 create, 1 modify |
| 7 | Per-section authoring subagent dispatch | medium | unit | Task 6 | 0 create, 1 modify |
| 8 | `adev/mechanism-existence` diagnostic + `check-mechanisms` CLI verb | large | unit | — | 3 create, 2 modify |
| 9 | `DECISION_REQUIRED`/`EXTERNAL_REMEDY` exits + inner/outer cap distinction | large | unit | 4, 5, 6, 7, 8 | 0 create, 1 modify |
| 10 | Diff-scoped review dispatch + reviewer-registry doc fix | medium | unit | Task 4 | 2 create, 1 modify |
| 11 | External Remedies two-channel consistency | medium | unit | 3, 9, 10 | 0 create, 2 modify |
| 12 | Real-dispatch convergence eval re-run (`--baseline-ref`) | medium | integration | 9, 10, 11 | 0 create, 0 modify |

---

## Strategy Summary

| Strategy | Tasks | Source |
|----------|-------|--------|
| unit | 11 | fallback |
| integration | 1 | spec-declared |

---

## Test Infrastructure Requirements

> These requirements must be satisfied before Task 12's integration eval can run.
> Tasks without these prerequisites will produce setup errors, not test failures.
> **Never record actual credential values in plan output or spec files — env var names only.**

### External Systems

| System | Required By | Strategy |
|--------|-------------|----------|
| Live Claude Code session (`claude` CLI v2+) | Task 12 | integration |

### Credentials / Environment Variables

None required as repo-committed env vars. Authentication is via the local `claude` CLI session's own login state (not an env var or repo secret) — confirm `claude` is authenticated before running Task 12; do not attempt to inject an API key via `.env.test` or a CI secret for this task.

### Pre-Provisioned State

- [ ] `claude` CLI v2+ installed and authenticated on the machine running Task 12 (per `tests/evals/convergence/run-convergence-eval.mjs`'s own docstring prerequisites)
- [ ] `tests/evals/integration-sandbox/.context-index/governance/review.yaml` materialized (already present in the repo per current git status — verify it is still current before the run)

### CI Configuration

Task 12 is deliberately **excluded from `npm test`** and from CI entirely — it is a manual, cost-gated real-dispatch eval (per `tests/evals/convergence/README.md`'s explicit cost warning), not a regression check. Run it by hand:

```bash
node tests/evals/convergence/run-convergence-eval.mjs --baseline-ref <pre-implementation-commit>
```

### Unresolved Requirements

None — all of Task 12's infrastructure needs are known and listed above.

---

### Task 1: `not_converging_window` manifest validation [specialist: none]

**Charter capability:** cross-cutting amendment (no charter capability map)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/manifest.mjs:66` (call site), `lib/manifest.mjs:143-169` (new function, adjacent to `validateMaxReviewRetries`)
- Test: `tests/lib/manifest.test.mjs`

**Tests:** `tests/lib/manifest.test.mjs` — extend with cases for `build.not_converging_window`: default 2, explicit valid integer, negative rejected, fractional rejected, non-numeric rejected.

**Context to load:**
- `lib/manifest.mjs:136-169` (existing `validateMaxReviewRetries` — mirror exactly)
- Spec BEH-11, Integration Points item 4

- [ ] **Write failing test**

```javascript
test('build.not_converging_window defaults to 2', () => {
  const manifest = loadManifest(fixtureRootWithNoNotConvergingWindow);
  assert.strictEqual(manifest.build.not_converging_window, 2);
});

test('build.not_converging_window rejects negative values', () => {
  assert.throws(
    () => loadManifest(fixtureRootWithNotConvergingWindow(-1)),
    (err) => err.code === 'INVALID_NOT_CONVERGING_WINDOW',
  );
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/manifest.test.mjs`
Expected: FAIL — `build.not_converging_window` is `undefined` (no validation exists yet).

- [ ] **Implement**

```javascript
function validateNotConvergingWindow(build) {
  const raw = build.not_converging_window;
  if (raw === undefined || raw === null) {
    build.not_converging_window = 2; // default per BEH-9
    return;
  }
  if (typeof raw !== 'number' || !Number.isFinite(raw) || !Number.isInteger(raw) || raw < 0) {
    throw mkErr('INVALID_NOT_CONVERGING_WINDOW',
      `build.not_converging_window must be a non-negative integer; got ${JSON.stringify(raw)}`);
  }
  build.not_converging_window = raw;
}
```

Call `validateNotConvergingWindow(parsed.build);` alongside the existing `validateMaxReviewRetries(parsed.build);` at line 66.

- [ ] **Verify test passes**

Run: `node --test tests/lib/manifest.test.mjs`
Expected: PASS

- [ ] **Commit**

Branch (if not already created): `feat/strategic-planning/not-converging-window`

```bash
git add lib/manifest.mjs tests/lib/manifest.test.mjs
git commit -m "feat(strategic-planning): add build.not_converging_window manifest validation

Spec: .context-index/specs/cross-cutting/review-block-auto-retry-rev-2-targeted-author-verify-loop.spec.md
Plan-task: 1"
```

---

### Task 2: `finding_class`/`remedy_ref` sidecar schema + `section_anchor` validation fix [specialist: none]

**Charter capability:** cross-cutting amendment (no charter capability map)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/blockers-writer.mjs` (grouping, entry rendering ~lines 183-222)
- Test: `tests/lib/blockers-writer.test.mjs`

**Tests:** `tests/lib/blockers-writer.test.mjs` — extend with: `finding_class` present and valid (`defect`/`decision`/`external`) round-trips into the YAML block; absent `finding_class` defaults to `defect` and logs `FINDING_CLASS_DEFAULTED`; invalid enum value forces `defect` and logs `FINDING_CLASS_REJECTED` without dropping the entry; `remedy_ref` with a YAML flow indicator or colon-space sequence is omitted and logs `REMEDY_REF_REJECTED` without dropping the entry; `section_anchor` containing the same unsafe patterns is now also refused-and-defaulted (closes BD-1), proven by reintroducing an anchor value with an unescaped colon-space and asserting the sidecar still parses.

**Context to load:**
- `lib/blockers-writer.mjs` (full)
- `lib/extensions/governance-values.mjs:104-135` (`assertSafeScalar` — pattern reference only, not imported: this module validates a different trust boundary)
- Spec BEH-1 (validation + disposition-on-refusal paragraphs), Error Cases Delta rows 1-2
- `.review.md` BD-1

- [ ] **Write failing test**

```javascript
test('writeBlockers defaults finding_class to defect when absent and logs FINDING_CLASS_DEFAULTED', () => {
  const result = writeBlockers(root, specPath, [
    { blocker_id: 'CON-1:abc123', section_anchor: 'beh-1', reviewer: 'x', prose: 'body' },
  ]);
  const text = readFileSync(resolve(root, result.sidecarPath), 'utf8');
  assert.match(text, /finding_class: defect/);
  assert.ok(result.advisories.some(a => a.code === 'FINDING_CLASS_DEFAULTED'));
});

test('writeBlockers refuses an unsafe section_anchor and forces a safe default (BD-1)', () => {
  const result = writeBlockers(root, specPath, [
    { blocker_id: 'CON-1:abc123', section_anchor: 'beh-1: {evil}', reviewer: 'x', prose: 'body' },
  ]);
  const text = readFileSync(resolve(root, result.sidecarPath), 'utf8');
  assert.doesNotMatch(text, /\{evil\}/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/blockers-writer.test.mjs`
Expected: FAIL — `finding_class` never written; `section_anchor` interpolated raw (`{evil}` present in output).

- [ ] **Implement**

Add a local `refuseUnsafeScalar(value, fieldPath)` (mirrors `assertSafeScalar`'s refuse rule: no newlines/quotes/`#`/YAML flow indicators `{ } [ ]`, no colon-space) returning `{ safe, rejectedReason }` rather than throwing (blockers-writer's posture is discard-and-preserve, not fail-loud, per BEH-1's Disposition-on-refusal paragraph). Apply it to `finding_class` (closed enum check first), `remedy_ref` (when `finding_class === 'external'`), and `section_anchor`. Collect advisories (`FINDING_CLASS_DEFAULTED`, `FINDING_CLASS_REJECTED`, `REMEDY_REF_REJECTED`) into the returned `result.advisories` array. Never throw on a refused field — force the safe default and continue the write.

- [ ] **Verify test passes**

Run: `node --test tests/lib/blockers-writer.test.mjs`
Expected: PASS

- [ ] **Commit**

Branch: `feat/agent-reliable-state-artifacts/blockers-finding-class`

```bash
git add lib/blockers-writer.mjs tests/lib/blockers-writer.test.mjs
git commit -m "feat(agent-reliable-state-artifacts): add finding_class/remedy_ref to .blockers.md schema

Spec: .context-index/specs/cross-cutting/review-block-auto-retry-rev-2-targeted-author-verify-loop.spec.md
Plan-task: 2"
```

---

### Task 3: Render-time `remedy_ref` stripping helper [specialist: none]

**Charter capability:** cross-cutting amendment (no charter capability map)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/governance/remedy-ref-render.mjs`
- Test: `tests/lib/governance/remedy-ref-render.test.mjs`

**Tests:** `tests/lib/governance/remedy-ref-render.test.mjs` — control characters and ANSI escape sequences stripped; length bound enforced (truncation marker); safe input passes through unchanged; empty/null input returns empty string.

**Context to load:**
- `.context-index/specs/cross-cutting/check-id-enum.spec.md` (SEC-8 section only — control-char/ANSI-strip pattern reference)
- Spec BEH-1 last paragraph ("Independently of that write-time gate...")

- [ ] **Write failing test**

```javascript
import { renderRemedyRef } from '../../../lib/governance/remedy-ref-render.mjs';

test('renderRemedyRef strips ANSI escapes and control characters', () => {
  const raw = '\x1b[31mmalicious\x1b[0m\x07';
  assert.strictEqual(renderRemedyRef(raw), 'malicious');
});

test('renderRemedyRef enforces a length bound', () => {
  const long = 'a'.repeat(1000);
  assert.ok(renderRemedyRef(long).length < 1000);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/governance/remedy-ref-render.test.mjs`
Expected: FAIL — module does not exist.

- [ ] **Implement**

```javascript
const CONTROL_OR_ANSI = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]|\x1b\[[0-9;]*[a-zA-Z]/g;
const MAX_LEN = 256;

export function renderRemedyRef(value) {
  if (typeof value !== 'string' || value.length === 0) return '';
  const stripped = value.replace(CONTROL_OR_ANSI, '');
  return stripped.length > MAX_LEN ? `${stripped.slice(0, MAX_LEN)}…` : stripped;
}
```

- [ ] **Verify test passes**

Run: `node --test tests/lib/governance/remedy-ref-render.test.mjs`
Expected: PASS

- [ ] **Commit**

Branch: `feat/agent-reliable-state-artifacts/remedy-ref-render`

```bash
git add lib/governance/remedy-ref-render.mjs tests/lib/governance/remedy-ref-render.test.mjs
git commit -m "feat(agent-reliable-state-artifacts): add render-time remedy_ref stripping helper

Spec: .context-index/specs/cross-cutting/review-block-auto-retry-rev-2-targeted-author-verify-loop.spec.md
Plan-task: 3"
```

---

### Task 4: Reviewer output schema — `finding_class` default/reject wiring [specialist: none]

**Charter capability:** cross-cutting amendment (no charter capability map)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Files:**
- Modify: `skills/review-specs/SKILL.md` (Step 5 Verdict Logic / Step 6, lines ~253-320)
- Test: `tests/governance/review-config-manifest-profile.test.mjs` or a new `tests/governance/finding-class-consolidation.test.mjs` if consolidation logic moves to a lib function

**Tests:** `tests/governance/finding-class-consolidation.test.mjs` (create) — a BLOCK finding missing `finding_class` defaults to `defect` before being handed to `writeBlockers`; legacy pre-amendment reviewer output (no field at all) is treated identically.

**Context to load:**
- `skills/review-specs/SKILL.md:253-289` (full)
- Task 2's `writeBlockers` advisory contract
- Spec BEH-1 first two sentences

- [ ] **Write failing test**

```javascript
test('consolidateFindings defaults missing finding_class to defect before persistence', () => {
  const findings = [{ blocker_id: 'X:1', section_anchor: 'a', reviewer: 'y', prose: 'p' }];
  const result = writeBlockers(root, specPath, findings);
  assert.match(readFileSync(resolve(root, result.sidecarPath), 'utf8'), /finding_class: defect/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/governance/finding-class-consolidation.test.mjs`
Expected: FAIL — no defaulting wired into the consolidation path yet (this asserts the skill-level default behavior, which Task 2 implements at the writer level; this task confirms the review-specs prose actually calls through without stripping the field).

- [ ] **Implement**

Update `skills/review-specs/SKILL.md` Step 5/6 prose so reviewer findings passed to `writeBlockers` preserve any reviewer-supplied `finding_class`/`remedy_ref` unmodified (do not filter them out before the call) — the defaulting/rejection logic itself lives in `lib/blockers-writer.mjs` (Task 2). No new lib code required if Task 2 already defaults; this task's test simply proves the skill's data path doesn't drop the field pre-persistence.

- [ ] **Verify test passes**

Run: `node --test tests/governance/finding-class-consolidation.test.mjs`
Expected: PASS

- [ ] **Commit**

Branch: `feat/review/finding-class-wiring`

```bash
git add skills/review-specs/SKILL.md tests/governance/finding-class-consolidation.test.mjs
git commit -m "feat(review): preserve finding_class/remedy_ref through consolidation into .blockers.md

Spec: .context-index/specs/cross-cutting/review-block-auto-retry-rev-2-targeted-author-verify-loop.spec.md
Plan-task: 4"
```

---

### Task 5: `NOT_CONVERGING` verdict + stated precedence order [specialist: none]

**Charter capability:** cross-cutting amendment (no charter capability map)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `lib/loop-convergence.mjs` (module doc lines 14-29, `evaluateStopCondition` lines 95-136)
- Test: `tests/lib/loop-convergence.test.mjs`

**Tests:** `tests/lib/loop-convergence.test.mjs` — extend with: blocker count non-decreasing for `not_converging_window` consecutive cycles yields `NOT_CONVERGING`; `NOT_CONVERGING` takes precedence over `NO_PROGRESS` when both conditions hold in the same cycle (closes TR-4); `PASS` still always wins over `NOT_CONVERGING`.

**Context to load:**
- `lib/loop-convergence.mjs` (full)
- Spec BEH-9 (full), `.review.md` TR-4

- [ ] **Write failing test**

```javascript
test('NOT_CONVERGING fires before NO_PROGRESS when both conditions hold', () => {
  const result = evaluateStopCondition({
    addressed: [], persistent: ['a', 'b'], new_: [], prev_blockers: ['a', 'b'],
    retries_remaining: 1, verdict: 'BLOCK',
    blocker_count_history: [2, 2, 2], not_converging_window: 2,
  });
  assert.strictEqual(result.verdict, 'NOT_CONVERGING');
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/loop-convergence.test.mjs`
Expected: FAIL — `NOT_CONVERGING` verdict does not exist; falls through to `NO_PROGRESS`.

- [ ] **Implement**

Add a `blocker_count_history`/`not_converging_window` parameter to `evaluateStopCondition`. Insert the `NOT_CONVERGING` check immediately after the `PASS`/`PASS_PENDING_HUMAN` branch and before the existing `NO_PROGRESS` check (per BEH-9: "evaluated before NO_PROGRESS"). Rewrite the module-doc precedence list (lines 22-29) as: `PASS`/`PASS_PENDING_HUMAN` → `NOT_CONVERGING` → `NO_PROGRESS` → `REGRESSED` → `BUDGET_EXHAUSTED` → `CONTINUE`, with an explicit note that BEH-7's inner mechanism-check cap is evaluated by the caller *before* this function runs for a cycle at all (a separate counter, never merged into this precedence chain).

- [ ] **Verify test passes**

Run: `node --test tests/lib/loop-convergence.test.mjs`
Expected: PASS

- [ ] **Commit**

Branch: `feat/strategic-planning/not-converging-verdict`

```bash
git add lib/loop-convergence.mjs tests/lib/loop-convergence.test.mjs
git commit -m "feat(strategic-planning): add NOT_CONVERGING verdict with stated stop-condition precedence

Spec: .context-index/specs/cross-cutting/review-block-auto-retry-rev-2-targeted-author-verify-loop.spec.md
Plan-task: 5"
```

---

### Task 6: Real-diff `addressed`/`unresolved` + splice validation [specialist: none]

**Charter capability:** cross-cutting amendment (no charter capability map)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Files:**
- Modify: `lib/specify-revise.mjs` (lines 191-206 blockers parser, 288-330 diff/write logic)
- Test: `tests/lib/specify-revise.test.mjs`, `tests/cli/specify-revise.test.mjs`

**Tests:** `tests/lib/specify-revise.test.mjs` — extend with: a blocker whose anchor's authored body differs from prior text is `addressed`; an anchor with unchanged text is `unresolved`; an authored body containing a `---` fence line or control character is refused, prior text preserved, blocker `unresolved`, `SPLICE_VALIDATION_FAILED` advisory recorded (WR-6); post-splice frontmatter re-parse failure triggers the same refusal path; `groupBlockersByAnchor` groups correctly and reports anchors with no matching heading.

**Context to load:**
- `lib/specify-revise.mjs` (full)
- Spec BEH-5, BEH-5a (full), `.review.md` WR-5, WR-6

- [ ] **Write failing test**

```javascript
test('reviseSpec computes addressed_blocker_ids from an actual text diff, not blanket acknowledgement', () => {
  const result = reviseSpec({
    specPath, projectRoot,
    authoredSections: new Map([['beh-1', 'new authored body text']]),
  });
  assert.deepStrictEqual(result.addressed, ['CON-1:abc123']); // only the anchor that actually changed
  assert.deepStrictEqual(result.unresolved, ['CON-2:def456']); // anchor whose text is unchanged
});

test('reviseSpec refuses a splice containing a frontmatter-fence line (BEH-5a)', () => {
  const result = reviseSpec({
    specPath, projectRoot,
    authoredSections: new Map([['beh-1', '---\nmalicious: true\n---']]),
  });
  assert.ok(result.unresolved.includes('CON-1:abc123'));
  assert.ok(result.advisories.some(a => a.code === 'SPLICE_VALIDATION_FAILED'));
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/specify-revise.test.mjs`
Expected: FAIL — `reviseSpec` has no `authoredSections` parameter; `addressed` is currently hardcoded to the full input set.

- [ ] **Implement**

Add heading-anchor resolution over `fm.body` (map each `section_anchor` to its heading's byte range). For each entry in `authoredSections`: validate (refuse `---` fence lines and control characters); on pass, splice the new body into that range and record the anchor as changed; on refusal, leave prior text, record `SPLICE_VALIDATION_FAILED`. After all splices, re-parse the full post-splice text's frontmatter — on failure, roll back the entire write (BEH-5's guarantee: never partially applied) and mark every implicated anchor `unresolved`. Compute `addressed` as exactly the anchors whose text changed; `unresolved` as every loop-eligible blocker whose anchor is unchanged or failed validation. Export `groupBlockersByAnchor(blockerEntries)` returning `Map<anchor, blockerId[]>` plus an `anchorsNotFound` list (anchors with no matching heading).

- [ ] **Verify test passes**

Run: `node --test tests/lib/specify-revise.test.mjs && node --test tests/cli/specify-revise.test.mjs`
Expected: PASS

- [ ] **Commit**

Branch: `feat/spec-lifecycle/real-diff-splice`

```bash
git add lib/specify-revise.mjs tests/lib/specify-revise.test.mjs tests/cli/specify-revise.test.mjs
git commit -m "feat(spec-lifecycle): compute addressed/unresolved from a real per-anchor text diff

Spec: .context-index/specs/cross-cutting/review-block-auto-retry-rev-2-targeted-author-verify-loop.spec.md
Plan-task: 6"
```

---

### Task 7: Per-section authoring subagent dispatch [specialist: none]

**Charter capability:** cross-cutting amendment (no charter capability map)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 6
**Files:**
- Modify: `skills/specify/SKILL.md` (Revise Mode, line 963-)
- Test: `tests/lib/specify-revise.test.mjs` (extend — `groupBlockersByAnchor` fan-out assertions)

**Tests:** `tests/lib/specify-revise.test.mjs` — extend with a deterministic assertion that `groupBlockersByAnchor` produces exactly one group per distinct `section_anchor` present among `defect`-classed blockers (not `decision`/`external` ones — those never reach authoring per BEH-2/BEH-3), each group scoped to only that anchor's blocker IDs.

**Context to load:**
- `skills/specify/SKILL.md:963-` (full, Revise Mode section)
- `lib/specify-revise.mjs::groupBlockersByAnchor` (from Task 6)
- Spec BEH-4 (full)

- [ ] **Write failing test**

```javascript
test('groupBlockersByAnchor excludes decision/external-classed blockers from authoring groups', () => {
  const entries = [
    { blocker_id: 'A:1', section_anchor: 'beh-1', finding_class: 'defect' },
    { blocker_id: 'B:2', section_anchor: 'beh-1', finding_class: 'decision' },
  ];
  const { grouped } = groupBlockersByAnchor(entries);
  assert.deepStrictEqual(grouped.get('beh-1'), ['A:1']);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/specify-revise.test.mjs`
Expected: FAIL — `groupBlockersByAnchor` (Task 6) does not yet filter by `finding_class`.

- [ ] **Implement**

Extend `groupBlockersByAnchor` to accept the parsed `finding_class` per entry (read from the `.blockers.md` sidecar's YAML block, now present per Task 2) and only include `defect`-classed entries in the authoring groups. Update `skills/specify/SKILL.md` Revise Mode prose: before invoking `adev specify revise`, call `groupBlockersByAnchor` (documented as a lib function, not inline logic), dispatch one `Agent({...})` per distinct anchor in parallel — each given only that anchor's current section text, its blocker prose entries, and minimal charter/frontmatter context — instructed to return a rewritten section body + one-line rationale. Collect results into the `authoredSections` map passed to `adev specify revise`. Report `anchorsNotFound` entries to the operator; skip authoring for those.

- [ ] **Verify test passes**

Run: `node --test tests/lib/specify-revise.test.mjs`
Expected: PASS

- [ ] **Commit**

Branch: `feat/spec-lifecycle/per-anchor-authoring-dispatch`

```bash
git add skills/specify/SKILL.md lib/specify-revise.mjs tests/lib/specify-revise.test.mjs
git commit -m "feat(spec-lifecycle): dispatch one authoring subagent per implicated section anchor

Spec: .context-index/specs/cross-cutting/review-block-auto-retry-rev-2-targeted-author-verify-loop.spec.md
Plan-task: 7"
```

---

### Task 8: `adev/mechanism-existence` diagnostic + `check-mechanisms` CLI verb [specialist: none]

**Charter capability:** cross-cutting amendment (no charter capability map)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/diagnostics/tier2/mechanism-existence.mjs`
- Create: `tests/diagnostics/tier2/mechanism-existence.test.mjs`
- Create: `tests/cli/specify-check-mechanisms.test.mjs`
- Modify: `.context-index/governance/diagnostics.yaml` (register `adev/mechanism-existence`)
- Modify: `lib/cli/specify.mjs` (add `check-mechanisms` subcommand + extend its own `help()` export at line 223 — no separate central help index exists for `specify` subcommands)

**Tests:** `tests/diagnostics/tier2/mechanism-existence.test.mjs` — extracts `file:line`/symbol/flag/error-code referents correctly; a candidate resolving outside the repo root is refused (`MECHANISM_PATH_ESCAPE`), never silently "not found"; a relative candidate with a lexical `../` segment is refused before any filesystem access; an unresolvable candidate (`ENOENT`, broken symlink) is refused; a valid resolving candidate passes. `tests/cli/specify-check-mechanisms.test.mjs` — exit 0 when all referents resolve; exit 2 (per convention, non-review-blocking failure) when unresolved references found, with the CLI printing enough detail to construct a new `mechanism-existence` blocker.

**Context to load:**
- `lib/extensions/exec-payload.mjs:158-217` (full — `assertContained` model; BD-2 corrected citation: refusal block is lines 174-183)
- `lib/diagnostics/tier2/validated-without-report.mjs` (full — sibling producer pattern + ADR-0010 citation style)
- `lib/diagnostics/index.mjs:333-660` (`loadRegistry`, `runDiagnostics` — signatures)
- `.context-index/governance/diagnostics.yaml` (full)
- `.context-index/adrs/0010-governance-check-layering.md` (Decision section — step 5)
- `lib/cli/specify.mjs` (full — subcommand pattern)
- Spec BEH-6 (full), BEH-7 first sentence, Error Cases Delta `MECHANISM_PATH_ESCAPE`/`MECHANISM_NOT_FOUND` rows
- `.review.md` CON-1, BD-2

- [ ] **Write failing test**

```javascript
test('run() refuses a candidate that lexically escapes the repo root before touching the filesystem', () => {
  const ctx = { projectRoot, authoredText: 'see `../../etc/passwd:1` for details' };
  const result = run(ctx);
  assert.strictEqual(result.severity, 'error');
  assert.match(result.message, /MECHANISM_PATH_ESCAPE/);
});

test('adev specify check-mechanisms exits 2 on an unresolved referent', async () => {
  const { code } = await runCli(['specify', 'check-mechanisms', '--spec', specPath]);
  assert.strictEqual(code, 2);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/diagnostics/tier2/mechanism-existence.test.mjs tests/cli/specify-check-mechanisms.test.mjs`
Expected: FAIL — module and CLI subcommand do not exist.

- [ ] **Implement**

`lib/diagnostics/tier2/mechanism-existence.mjs`: export `run(ctx)` per the Tier-2 contract (`lib/diagnostics/index.mjs`'s runner interface). Extract `file:line` / backtick-fenced exported-symbol / `--flag` / `UPPER_SNAKE_ERROR_CODE` tokens from `ctx.authoredText` via regex (no import scanning — deterministic pattern match). For each `file:line`/symbol candidate: lexically pre-check for a `../` traversal segment (refuse before any `fs` call, mirroring `assertContained` lines 174-183); resolve + `realpathSync`-contain against a realpath'd `projectRoot`; refuse (never silently "not found") on escape or `ENOENT`/broken symlink. Register the producer in `.context-index/governance/diagnostics.yaml` as `id: adev/mechanism-existence, runner: plugin:tier2/mechanism-existence.mjs, severity: error, tier: 2, scope: spec`. `lib/cli/specify.mjs`: add `check-mechanisms --spec <path>` subcommand that reads the spec's newly authored sections, invokes the diagnostic's `run()`, prints resolved/unresolved referents, and exits 0 (clean) or 2 (unresolved — caller constructs new `mechanism-existence` blockers from the printed detail).

- [ ] **Verify test passes**

Run: `node --test tests/diagnostics/tier2/mechanism-existence.test.mjs tests/cli/specify-check-mechanisms.test.mjs`
Expected: PASS

- [ ] **Commit**

Branch: `feat/spec-lifecycle/mechanism-existence-diagnostic`

```bash
git add lib/diagnostics/tier2/mechanism-existence.mjs lib/cli/specify.mjs .context-index/governance/diagnostics.yaml tests/diagnostics/tier2/mechanism-existence.test.mjs tests/cli/specify-check-mechanisms.test.mjs
git commit -m "feat(spec-lifecycle): add adev/mechanism-existence Tier-2 diagnostic and check-mechanisms CLI verb

Spec: .context-index/specs/cross-cutting/review-block-auto-retry-rev-2-targeted-author-verify-loop.spec.md
Plan-task: 8"
```

---

### Task 9: `DECISION_REQUIRED`/`EXTERNAL_REMEDY` exits + inner/outer cap distinction [specialist: none]

**Charter capability:** cross-cutting amendment (no charter capability map)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Tasks 4, 5, 6, 7, 8
**Files:**
- Modify: `skills/build/SKILL.md` (Blocker handling, lines 420-476)
- Test: `tests/integration/build-loop-auto-retry.test.mjs`

**Tests:** `tests/integration/build-loop-auto-retry.test.mjs` — extend with: a `decision`-classed blocker halts the loop immediately with `DECISION_REQUIRED`, never dispatching authoring; an `external`-classed blocker is excluded from convergence accounting, loop continues on remaining `defect` blockers, "External remedies" progress line emitted; `check-mechanisms` unresolved-reference outcome creates a new `mechanism-existence` blocker and loops back to authoring within its own 3-attempt inner cap, distinct from `retries_remaining` (WR-8) — assert the inner cap exhausting does NOT decrement `retries_remaining`, and vice versa; `NOT_CONVERGING` (Task 5) reaches the verdict-action table and halts with `LOOP_NOT_CONVERGING`.

**Context to load:**
- `skills/build/SKILL.md:395-476` (full)
- `lib/loop-convergence.mjs` (Task 5 result, full)
- `.review.md` WR-8

- [ ] **Write failing test**

```javascript
test('inner mechanism-check cap exhausting does not decrement the outer retries_remaining', () => {
  const sim = simulateBuildLoop({ /* fixture: 3 consecutive MECHANISM_NOT_FOUND cycles */ });
  assert.strictEqual(sim.finalVerdict, 'BUDGET_EXHAUSTED');
  assert.strictEqual(sim.outerRetriesConsumed, 0);
});

test('a decision-classed blocker halts immediately without dispatching authoring', () => {
  const sim = simulateBuildLoop({ blockers: [{ finding_class: 'decision' }] });
  assert.strictEqual(sim.finalVerdict, 'DECISION_REQUIRED');
  assert.strictEqual(sim.authoringDispatched, false);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/integration/build-loop-auto-retry.test.mjs`
Expected: FAIL — no `DECISION_REQUIRED`/`EXTERNAL_REMEDY` branches exist; inner cap not tracked separately.

- [ ] **Implement**

Edit `skills/build/SKILL.md`'s Blocker-handling loop steps: after reading `.blockers.md` (step 2), branch on `finding_class` before dispatching authoring — `decision` halts immediately with sidecar+fail-loud and verdict `DECISION_REQUIRED`; `external` is excluded from this cycle's convergence set and its `remedy_ref` (via `lib/governance/remedy-ref-render.mjs`) is emitted as an "External remedies" progress line. Insert `adev specify check-mechanisms --spec <path>` between the existing steps 4 (dispatch revise) and 5 (re-run review); on exit 2, construct a new `mechanism-existence` blocker (`finding_class: defect`) and loop back to authoring within a fixed 3-attempt inner counter tracked independently of `retries_remaining` — exhausting the inner counter stops with `BUDGET_EXHAUSTED` via the identical sidecar+fail-loud path, without touching `retries_remaining`. Extend the `evaluateStopCondition` call (step 6) to pass `not_converging_window`/`blocker_count_history` and add `NOT_CONVERGING` → `LOOP_NOT_CONVERGING` to the verdict-action table (step 7).

- [ ] **Verify test passes**

Run: `node --test tests/integration/build-loop-auto-retry.test.mjs`
Expected: PASS

- [ ] **Commit**

Branch: `feat/strategic-planning/decision-external-exits`

```bash
git add skills/build/SKILL.md tests/integration/build-loop-auto-retry.test.mjs
git commit -m "feat(strategic-planning): add DECISION_REQUIRED/EXTERNAL_REMEDY loop exits and inner/outer retry cap separation

Spec: .context-index/specs/cross-cutting/review-block-auto-retry-rev-2-targeted-author-verify-loop.spec.md
Plan-task: 9"
```

---

### Task 10: Diff-scoped review dispatch + reviewer-registry doc fix [specialist: none]

**Charter capability:** cross-cutting amendment (no charter capability map)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 4
**Files:**
- Create: `lib/governance/diff-scope.mjs`
- Create: `tests/governance/diff-scope.test.mjs`
- Modify: `skills/review-specs/SKILL.md` (Step 4, lines 190-226)

**Tests:** `tests/governance/diff-scope.test.mjs` — `extractChangedSections` identifies exactly the sections whose text differs between two spec revisions; `expandWithCrossReferences` adds a section containing a markdown link or heading-name literal-text mention targeting a changed anchor, and nothing else; on the spec's first review (no prior `step_completed` review event), the caller never invokes diff-scoping — full-context dispatch always applies.

**Context to load:**
- `skills/review-specs/SKILL.md:190-226` (full)
- `lib/governance/review-config.mjs:251-289` (`shouldDispatch`, full)
- `.context-index/governance/review.yaml` (full)
- Spec BEH-8 (full), Amendment Rationale "Reviewer-registry correction" paragraph

- [ ] **Write failing test**

```javascript
test('extractChangedSections returns only sections whose text differs', () => {
  const prev = '## A\nold\n## B\nsame';
  const curr = '## A\nnew\n## B\nsame';
  const changed = extractChangedSections(prev, curr);
  assert.deepStrictEqual([...changed.keys()], ['a']);
});

test('expandWithCrossReferences includes a section that links to a changed anchor', () => {
  const spec = '## A\nnew\n## C\nsee [A](#a) for details';
  const expanded = expandWithCrossReferences(spec, new Set(['a']));
  assert.ok(expanded.has('c'));
});
```

- [ ] **Verify test fails**

Run: `node --test tests/governance/diff-scope.test.mjs`
Expected: FAIL — module does not exist.

- [ ] **Implement**

`lib/governance/diff-scope.mjs`: `extractChangedSections(prevText, currText)` splits both texts on markdown headings, compares each anchor's body text, returns `Map<anchor, currentText>` for anchors that differ. `expandWithCrossReferences(specText, changedAnchors)` does a literal-text scan (not a general reference resolver) for markdown links (`[...](#<anchor>)`) or heading-name mentions targeting any changed anchor, adding the containing section. Update `skills/review-specs/SKILL.md` Step 4: before the dispatch loop, check `currentState(spec).steps.review` for a prior `step_completed` event at an earlier revision; if present, compute the changed+cross-referenced section text via the new helper and pass it as the `specContent` argument to every `shouldDispatch()` call (reviewers with `dispatch: always` are unaffected — `shouldDispatch` always returns true for them regardless of `specContent`); restrict each dispatched reviewer's context pack render to that same text. First review of any spec always uses the full spec body. Correct any prose in this section (and `skills/specify/SKILL.md`) that names a fixed reviewer trio to instead read "whatever `adev governance reviewers` resolves for the project."

- [ ] **Verify test passes**

Run: `node --test tests/governance/diff-scope.test.mjs`
Expected: PASS

- [ ] **Commit**

Branch: `feat/review/diff-scoped-dispatch`

```bash
git add lib/governance/diff-scope.mjs skills/review-specs/SKILL.md skills/specify/SKILL.md tests/governance/diff-scope.test.mjs
git commit -m "feat(review): diff-scope reviewer dispatch and context on non-first review cycles

Spec: .context-index/specs/cross-cutting/review-block-auto-retry-rev-2-targeted-author-verify-loop.spec.md
Plan-task: 10"
```

---

### Task 11: External Remedies two-channel consistency [specialist: none]

**Charter capability:** cross-cutting amendment (no charter capability map)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Tasks 3, 9, 10
**Files:**
- Modify: `skills/build/SKILL.md` (External remedies progress line, from Task 9)
- Modify: `skills/review-specs/SKILL.md` (Step 5 Consolidated Report Format, lines 267-289)

**Tests:** New assertion in `tests/integration/build-loop-auto-retry.test.mjs` (extend, WR-3) — given the same `external`-classed blocker set, the build's progress-line rendering and the `.review.md` "External Remedies" section render the identical `blocker_id`/`section_anchor`/`remedy_ref` triple (via the shared `renderRemedyRef` helper from Task 3), proven by asserting both outputs against one fixture.

**Context to load:**
- `skills/build/SKILL.md` (Task 9's edited section)
- `skills/review-specs/SKILL.md:267-289` (Consolidated Report Format)
- `lib/governance/remedy-ref-render.mjs` (Task 3)
- Spec BEH-3 (full), `.review.md` WR-3

- [ ] **Write failing test**

```javascript
test('build progress line and .review.md External Remedies section render identical data', () => {
  const blocker = { blocker_id: 'EXT-1:abc', section_anchor: 'beh-3', remedy_ref: 'see ADR-0022' };
  const progressLine = renderExternalRemedyProgressLine(blocker);
  const reportSection = renderExternalRemediesReportSection([blocker]);
  assert.ok(progressLine.includes(renderRemedyRef(blocker.remedy_ref)));
  assert.ok(reportSection.includes(renderRemedyRef(blocker.remedy_ref)));
});
```

- [ ] **Verify test fails**

Run: `node --test tests/integration/build-loop-auto-retry.test.mjs`
Expected: FAIL — no shared rendering path exists yet between the two channels.

- [ ] **Implement**

Ensure both `skills/build/SKILL.md`'s "External remedies" progress line and `skills/review-specs/SKILL.md`'s "External Remedies" report section route `remedy_ref` through the identical `lib/governance/remedy-ref-render.mjs::renderRemedyRef` helper (Task 3) and list the same three fields (`blocker_id`, `section_anchor`, `remedy_ref`) in the same order, so the artifact a human reads on disk and the loop's live console output agree byte-for-byte on the rendered `remedy_ref`.

- [ ] **Verify test passes**

Run: `node --test tests/integration/build-loop-auto-retry.test.mjs`
Expected: PASS

- [ ] **Commit**

Branch: `feat/strategic-planning/external-remedies-consistency`

```bash
git add skills/build/SKILL.md skills/review-specs/SKILL.md tests/integration/build-loop-auto-retry.test.mjs
git commit -m "feat(strategic-planning): unify External Remedies rendering across build progress and review report

Spec: .context-index/specs/cross-cutting/review-block-auto-retry-rev-2-targeted-author-verify-loop.spec.md
Plan-task: 11"
```

---

### Task 12: Real-dispatch convergence eval re-run (`--baseline-ref`) [specialist: none]

**Charter capability:** cross-cutting amendment (no charter capability map)
**Strategy:** integration (source: spec-declared, confidence: high — spec explicitly requires real reviewer/authoring dispatch, not a synthetic assertion)
**Depends on:** Tasks 9, 10, 11
**Files:**
- Reference (read, do not modify): `tests/evals/convergence/run-convergence-eval.mjs`, `tests/evals/convergence/README.md`
- Modify: `tests/evals/convergence/results/convergence-eval-2026-08-22.md` → new dated results file for the post-implementation run

**Tests:** This task is not itself TDD (it drives a real, expensive dispatch harness against a planted fixture) — it is the spec's own acceptance-criterion verification step. `tests/evals/convergence/run-convergence-eval.mjs` already exists and is re-runnable per the spec's "Live confirmation attempt" note.

**Context to load:**
- `tests/evals/convergence/run-convergence-eval.mjs` (full)
- `tests/evals/integration-sandbox/.context-index/specs/cross-cutting/broken-loop-fixture.spec.md`
- Spec Acceptance Criteria (`--baseline-ref` A/B row), Actionable Task Map ("Real-dispatch convergence eval")

- [ ] **Establish baseline-ref**

Identify the commit immediately preceding this plan's first landed task (i.e., the repo state before any of Tasks 1-11 merged) to pass as `--baseline-ref`.

- [ ] **Run the eval in A/B mode**

```bash
node tests/evals/convergence/run-convergence-eval.mjs --baseline-ref <pre-implementation-commit>
```

Expected: the fixture's lifecycle log now carries real `reviewer_report`/`spec_revised` events for both the baseline and amended runs (unlike the 2026-08-22 smoke run, which recorded none); the amended loop reaches `PASS` (or a correct `DECISION_REQUIRED`/`EXTERNAL_REMEDY` exit) with fewer reviewer dispatches and lower cost than the baseline on the same planted fixture.

- [ ] **Record results**

Write the dated results report (e.g. `tests/evals/convergence/results/convergence-eval-<date>.md`) with real cost/token/verdict data (per the "Use session JSONL for token measurement" heuristic — parse real session JSONL, not byte estimates).

- [ ] **Close tracking issues**

```bash
adev issues close adev-plugin-revise-loop-no-content-edits-q6q0 --reason "Resolved by review-block-auto-retry-rev-2-targeted-author-verify-loop.spec.md — real per-anchor authoring + verified diff shipped."
adev issues close adev-plugin-j7pq.1 --reason "Resolved by review-block-auto-retry-rev-2-targeted-author-verify-loop.spec.md — NOT_CONVERGING stop condition shipped, closing the persistent==prev_blockers unreachability gap."
```

- [ ] **Commit**

Branch: `feat/strategic-planning/convergence-eval-rerun`

```bash
git add tests/evals/convergence/results/
git commit -m "docs(strategic-planning): record post-implementation A/B convergence eval results

Spec: .context-index/specs/cross-cutting/review-block-auto-retry-rev-2-targeted-author-verify-loop.spec.md
Plan-task: 12"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied (see spec's Acceptance Criteria list — 13 items, including the two issue-closure criteria addressed by Task 12)
- No constitutional violations introduced (zero-dependency, ESM-only, hook protocol unaffected, skills remain markdown-only with all new logic in `lib/` and dispatched via named `adev <verb>` calls — no inline Node in any touched SKILL.md)
