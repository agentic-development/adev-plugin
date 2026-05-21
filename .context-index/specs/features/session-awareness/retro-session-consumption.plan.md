<!-- partial_schema: plan@1 -->

# Implementation Plan: Retro Session Consumption

> **Methodology:** adev
> **Charter:** .context-index/specs/features/session-awareness/charter.md (rev 6, approved)
> **Spec:** .context-index/specs/features/session-awareness/retro-session-consumption.spec.md (rev 1)
> **Review:** PASS_WITH_NOTES (2026-05-20)
> **Platform:** Node.js, JavaScript (ESM, .mjs), node:test, npm

**Goal:** Extend `/adev:retro` to consume `.context-index/sessions/*.md` files in the analysis window and render a `## Session Activity` section covering total session count + format breakdown, tool-use distribution, per-spec session counts, cost/token trends, sessions-to-closed-issues cross-reference, and first-class Context Gaps — degrading silently when sessions are absent.

**Architecture:** Two new ESM modules under `lib/retro/`: a pure `session-format.mjs` classifier (`hook | post-commit | unknown`) and a `session-activity.mjs` orchestrator that globs `.context-index/sessions/*.md`, filters by the analysis window, classifies each file, dispatches to focused metric helpers, and returns a structured object. Sub-helpers live in a single rollup `lib/retro/session-metrics.mjs` (per review SA-2). The skill `skills/retro/SKILL.md` invokes the orchestrator via a new CLI verb `adev retro session-activity` (Principle 2 — skills are markdown only; no inline-Node). Defense-in-depth at the consumer is mandatory (review SEC-B1/B2/B3): backtracking-free body scans with a 5MB body cap and 16KB frontmatter cap, issue-id charset validation before any board lookup, and YAML safe-load rejecting anchors/aliases/custom tags.

---

## Pre-Plan: Review Notes Folded In

The rev 1 review (PASS_WITH_NOTES) surfaced 6 warnings and 6 polish suggestions. This plan maps each into discrete tasks:

| Review ID | Class | Mapped Task(s) |
|---|---|---|
| SA-1 (Context Gaps placement) | warning | Task 1 (spec polish) + Tasks 14, 15 (skill prose delete-from-Step-2 + add-to-Step-1) |
| SA-2 (sub-helper rollup file) | warning | Task 1 (spec polish) + Task 6 (rollup `lib/retro/session-metrics.mjs` shape) |
| SA-3 (tool-use parser contract) | warning | Task 1 (spec polish enumerates patterns) + Task 7 (tool-use parser pins patterns + tests fixtures) |
| SA-4 (issue board API in Preconditions) | suggestion | Task 1 (spec polish) — adds the row to Preconditions + Module Impact Map |
| SEC-B1 (body-grep DoS) | warning | Task 2 (length-cap + non-backtracking helpers) + Task 11 (gap-frame anchored scan) |
| SEC-B2 (issue-id validation) | warning | Task 3 (issue-id validator helper) + Task 10 (xref applies validator before board lookup) |
| SEC-B3 (YAML safe-load) | warning | Task 4 (safe frontmatter parser) consumed by Tasks 5+ |
| CON-X1 (`hook` is classifier label, not stored field) | polish | Task 1 (spec polish) |
| CON-X3 (`session_id_short` definition) | polish | Task 1 (spec polish) + Task 10 (xref render uses 8-char prefix for display) |
| CON-X4 (stale header + Task Map row 1) | polish | Task 1 (spec polish) |
| CON-X5 (xref `(unknown)` semantics) | polish | Task 1 (spec polish) + Task 10 (xref render branch) |
| SEC-B4 (read scope invariant) | polish | Task 1 (spec polish) + Task 5 (orchestrator path-containment assertion) |
| XS-2 (session-end scope) | cross-spec | Task 1 (spec polish — narrow Behaviors 9/11 to session-end) |

Polish items are consolidated into Task 1 (a single rev 2 spec amendment) so the rest of the plan reads against a polished spec.

---

## File Structure

**Create:**
- `lib/retro/session-format.mjs` — pure classifier `classifyFormat(frontmatter)` returning `hook | post-commit | unknown`
- `lib/retro/safe-frontmatter.mjs` — defense-in-depth YAML reader: 16KB size cap, anchor/alias/tag rejection, returns `{ ok, frontmatter | null, reason }`
- `lib/retro/body-scan.mjs` — bounded body-scan utilities: 5MB body cap, `String.prototype.includes()`-based literal-token scanning and non-backtracking regex helpers
- `lib/retro/issue-id-validation.mjs` — `validateIssueId(value)` returning `{ ok, normalized | null }`; charset `^[a-z0-9][a-z0-9.-]{0,63}$` AND `parseId()` recognition
- `lib/retro/session-activity.mjs` — `gatherSessionActivity(projectRoot, analysisWindow, opts?)` orchestrator
- `lib/retro/session-metrics.mjs` — single rollup file with named exports for each sub-helper: `parseToolUseDistribution`, `countPerSpec`, `aggregateCostTokens`, `joinClosedIssueXref`, `scanContextGaps`
- `lib/cli/retro/session-activity.mjs` — CLI verb implementation that calls `gatherSessionActivity()`
- `tests/lib/retro-session-format.test.mjs` — unit tests for `classifyFormat()`
- `tests/lib/retro-safe-frontmatter.test.mjs` — YAML safe-load tests (billion-laughs, custom-tag, oversize)
- `tests/lib/retro-body-scan.test.mjs` — body-cap, non-backtracking, frame-anchored tests
- `tests/lib/retro-issue-id-validation.test.mjs` — charset matrix tests
- `tests/lib/retro-session-activity.test.mjs` — orchestrator tests (empty / hook-only / post-commit-only / mixed / malformed / out-of-window)
- `tests/lib/retro-session-metrics.test.mjs` — sub-helper tests (one describe block per helper)
- `tests/skills/retro-session-section.test.mjs` — end-to-end snapshot test of rendered Session Activity output shape

**Modify:**
- `.context-index/specs/features/session-awareness/retro-session-consumption.spec.md` — bump to rev 2; fold all review notes
- `skills/retro/SKILL.md` — add § 1.8 (Session Activity) between § 1.7 and Step 2; remove the conditional Context Gaps text from current § 2 "Context Gaps" (lines around :125); update Output Format (around the Report Format section) to render Session Activity subsections
- `skills/init/SKILL.md:761` — doc-drift fix; make the `/adev:retro` session-consumption claim accurate
- `cli/index.mjs` — register the new `adev retro session-activity` verb dispatch
- `lib/cli/index.mjs` or equivalent verb router (find via existing pattern) — wire the new verb

**Reference (read, do not modify):**
- `lib/issues/registry.mjs::getIssueManager(manifest)` — read-only consumer of `list({ status: "closed" })`
- `lib/issues/id-utils.mjs::parseId()` — issue-id recognition fallback for the validator
- `lib/session-summary.mjs::fromTranscript()` — produces the body shape Task 7 parses against (read-only; the contract is duplicated into Spec B per SA-3 path-b)
- `lib/lifecycle-state.mjs::reportStep`, `reportPlanTask` — plan-task event emission contracts
- `lib/manifest.mjs::loadManifest()` — read manifest for issue-manager init

---

## Context Packets

### Task 1 Context (spec polish — rev 2)
- Spec: `.context-index/specs/features/session-awareness/retro-session-consumption.spec.md` (full file)
- Review: `.context-index/specs/features/session-awareness/retro-session-consumption.review.md` (full file)
- Charter: `.context-index/specs/features/session-awareness/charter.md` (Capability Map row "Retro Session Consumption")
- Upstream spec: `.context-index/specs/features/session-awareness/hook-driven-capture.spec.md` (rev 5, header comment + SessionEnd frontmatter contract — SEC-12/SEC-13)
- Constitution: `.context-index/constitution.md` (Principles 1–3, autonomy boundaries)

### Task 2 Context (body-scan helpers)
- `lib/retro/body-scan.mjs` (NEW — primary implementation; show signatures only when referenced from siblings)
- `tests/lib/retro-body-scan.test.mjs` (NEW)
- Spec § "Invariants" (No raw transcript reading; Stable section position)
- Review SEC-B1 verbatim text (body length cap, non-backtracking constraint, frame anchor)

### Task 3 Context (issue-id validator)
- `lib/retro/issue-id-validation.mjs` (NEW)
- `lib/issues/id-utils.mjs::parseId` (signature only — used as a recognition fallback)
- Review SEC-B2 verbatim

### Task 4 Context (safe YAML frontmatter reader)
- `lib/retro/safe-frontmatter.mjs` (NEW)
- `lib/meta-tools.mjs::parseFrontmatter` (lines 18–80 — existing parser for reference; the new reader wraps it with size cap + anchor/alias/tag rejection)
- Review SEC-B3 verbatim

### Task 5 Context (classifyFormat)
- `lib/retro/session-format.mjs` (NEW)
- Spec § "Behaviors" 4, 5, 6
- Spec § "Error Cases" rows for malformed YAML
- CON-X1 note: `hook` is classifier label, not a stored frontmatter value

### Task 6 Context (gatherSessionActivity orchestrator)
- `lib/retro/session-activity.mjs` (NEW)
- Spec § "Behaviors" 1, 2, 3, 13 (format-breakdown line owned by core per SA-2)
- Spec § "Postconditions" + "Invariants" (No mutation, Graceful absence, No raw transcript reading)
- Imports: `safe-frontmatter`, `session-format`, `session-metrics` (rollup), `body-scan` cap

### Task 7 Context (tool-use distribution sub-helper)
- `lib/retro/session-metrics.mjs::parseToolUseDistribution` (NEW)
- `lib/session-summary.mjs` (read to confirm body shape produced by `fromTranscript()`)
- Spec § "Behaviors" 7 (consumer-pinned patterns per SA-3 path-b)

### Task 8 Context (per-spec counter sub-helper)
- `lib/retro/session-metrics.mjs::countPerSpec` (NEW)
- Spec § "Behaviors" 8 (frontmatter `spec:` + literal body grep with path containment)
- `lib/retro/body-scan.mjs` (uses bounded literal-string scanning)

### Task 9 Context (cost/token aggregator sub-helper)
- `lib/retro/session-metrics.mjs::aggregateCostTokens` (NEW)
- Spec § "Behaviors" 9, 10 (session-end only per XS-2)
- `hook-driven-capture.spec.md` rev 5 § frontmatter fields contract (cost_usd, input_tokens, output_tokens, model — validated producer-side, defense-in-depth here)

### Task 10 Context (sessions ↔ closed-issues xref sub-helper)
- `lib/retro/session-metrics.mjs::joinClosedIssueXref` (NEW)
- `lib/issues/registry.mjs::getIssueManager` + `IssueManagerInterface.list({ status: "closed" })`
- `lib/retro/issue-id-validation.mjs::validateIssueId`
- Spec § "Behaviors" 11, "Error Cases" `(unknown)` row, CON-X3 (`session_id_short` = 8-char prefix for display)

### Task 11 Context (context-gaps sub-helper)
- `lib/retro/session-metrics.mjs::scanContextGaps` (NEW)
- `lib/retro/body-scan.mjs::scanWithinToolOutputFrame` (frame-anchored per SEC-B1(b))
- Spec § "Behaviors" 12, "Stable section position" invariant

### Task 12 Context (CLI verb)
- `lib/cli/retro/session-activity.mjs` (NEW)
- `cli/index.mjs` (verb registration pattern — read existing `retro` or equivalent verb to mirror)

### Task 13 Context (orchestrator tests)
- `tests/lib/retro-session-activity.test.mjs` (NEW)
- `tests/helpers.mjs` (`createTempDir`, `writeFixture`)
- Spec § "Acceptance Criteria" lines 167–169

### Task 14 Context (skill prose — § 1.8 add)
- `skills/retro/SKILL.md` lines 80–125 (insertion point between § 1.7 and Step 2)
- Spec § "Behaviors" 2, 13 + "Stable section position" invariant
- `.githooks/pre-commit-no-inline-node` invariant (no inline-Node patterns)

### Task 15 Context (skill prose — Context Gaps removal from Step 2)
- `skills/retro/SKILL.md` Step 2 "Context Gaps" subsection (the conditional grep at ~line 125)
- Spec § "Behaviors" 12 (replaces that grep)

### Task 16 Context (skill prose — Output Format)
- `skills/retro/SKILL.md` "Report Format" section (around line 256+)
- Spec § "Behaviors" 13 (output ordering)

### Task 17 Context (skill prose — init drift fix)
- `skills/init/SKILL.md:761` (locate the `/adev:retro` claim line)
- Spec § "Postconditions" (line about the doc-drift fix)

### Task 18 Context (end-to-end snapshot test)
- `tests/skills/retro-session-section.test.mjs` (NEW)
- `tests/helpers.mjs` (fixture creation)
- Spec § "Behaviors" 13 (full ordering + section-omission cases)

---

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

### Heuristic: Use session JSONL for token measurement, not file-size estimates (confidence: medium)
- **Pattern:** When evaluating token consumption or cost of adev skills, parse real session JSONL files from ~/.claude/projects/ (message.usage fields). Dispatch paired A/B subagents and compare their JSONL data for controlled experiments.
- **Anti-pattern:** Estimate tokens using bytes/4 or hardcoded assumptions about thinking budgets and cache hit rates.

### Heuristic: Cache reads are 71% of session cost — minimize context accumulation (confidence: medium)
- **Pattern:** When optimizing token cost, focus on reducing what accumulates in conversation context (output echoes, artifact dumps, verbose subagent returns).

### Heuristic: Summarized skill output produces equivalent artifact quality (confidence: medium)
- **Pattern:** When a skill writes an artifact to disk, instruct it to return only a structured summary to the conversation.

---

## Parallelization

- Group A (sequential foundation): Task 1 (spec polish) → Task 2 (body-scan) → Task 3 (issue-id) → Task 4 (safe-frontmatter)
- Group B (sequential, after foundation): Task 5 (classifyFormat) → Task 6 (gatherSessionActivity core)
- Group C (sub-helpers — independent of each other once Task 6 lands): Tasks 7, 8, 9, 10, 11 (can run in parallel after Group B)
- Group D (CLI verb): Task 12 (sequential after Group C)
- Group E (orchestrator tests): Task 13 (sequential after Group C+D)
- Group F (skill prose — independent of each other once Group D lands): Tasks 14, 15, 16, 17 (parallel)
- Group G (e2e): Task 18 (sequential after Groups D, E, F)

Sub-helpers (Group C) may be parallelised in `/adev:implement --parallel` since they all live in distinct named exports of the rollup file but each lands as its own task with its own test surface; sequential execution is also safe.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Spec rev 2 polish (fold review notes) | small | unit | — | 1 modify |
| 2 | `lib/retro/body-scan.mjs` (bounded, non-backtracking helpers) | small | unit | Task 1 | 1 create, 1 test |
| 3 | `lib/retro/issue-id-validation.mjs` (charset + parseId fallback) | small | unit | Task 1 | 1 create, 1 test |
| 4 | `lib/retro/safe-frontmatter.mjs` (YAML safe-load + size cap) | small | unit | Task 1 | 1 create, 1 test |
| 5 | `lib/retro/session-format.mjs` (`classifyFormat`) | small | unit | Tasks 1, 4 | 1 create, 1 test |
| 6 | `lib/retro/session-activity.mjs` core (glob + window filter + dispatch + format-breakdown) | medium | unit | Tasks 2, 4, 5 | 1 create, 1 test |
| 7 | Tool-use distribution sub-helper (`parseToolUseDistribution`) | small | unit | Tasks 2, 6 | 1 create (rollup), 1 test |
| 8 | Per-spec counter sub-helper (`countPerSpec`) | small | unit | Tasks 2, 6 | rollup edit, 1 test |
| 9 | Cost/token aggregator sub-helper (`aggregateCostTokens`) | small | unit | Task 6 | rollup edit, 1 test |
| 10 | Closed-issue xref sub-helper (`joinClosedIssueXref`) | small | unit | Tasks 3, 6 | rollup edit, 1 test |
| 11 | Context-gaps sub-helper (frame-anchored scan) | medium | unit | Tasks 2, 6 | rollup edit, 1 test |
| 12 | CLI verb `adev retro session-activity` | small | unit | Tasks 6–11 | 1 create, 1 modify (cli/index.mjs) |
| 13 | Orchestrator regression tests (empty/hook-only/post-commit/mixed/malformed) | medium | unit | Tasks 6–11 | 1 modify (orchestrator test) |
| 14 | Skill prose — add § 1.8 Session Activity step | small | unit | Task 12 | 1 modify |
| 15 | Skill prose — remove Step 2 "Context Gaps" conditional | small | unit | Task 14 | 1 modify |
| 16 | Skill prose — Output Format renders Session Activity | small | unit | Task 14 | 1 modify |
| 17 | Skill prose — `skills/init/SKILL.md:761` doc-drift fix | trivial | unit | Task 14 | 1 modify |
| 18 | End-to-end skill snapshot test (fixture-based) | medium | unit | Tasks 12–17 | 1 create |

Total: 18 tasks. All `unit` strategy (no integration/infra dependencies — session files and issue board are filesystem fixtures). Test-to-behavior ratio: 18 tasks vs. 13 spec behaviors = 1.38:1, within reviewer's 1:3..4:1 calibration window.

---

## Strategy Summary

All 18 tasks resolve to `strategy: unit` (source: fallback, confidence: high). No integration, schema, or visual strategies are required. Section omitted per skill prose: "Omit this section entirely when all tasks resolve to unit (backward compatible — no noise)."


---

## Tasks

### Task 1: Spec rev 2 polish — fold review notes [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=3
**Rationale:** Pure spec-text edit with 12 explicit, enumerated bullets to apply (SA-1..SEC-B4); single-file change with no code blast radius.

**Charter capability:** Retro Session Consumption (foundation for all subsequent tasks; ensures implementation reads against a polished spec)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `.context-index/specs/features/session-awareness/retro-session-consumption.spec.md` (bump `revision: 1` → `revision: 2`; update `updated:` date)

**Tests:** This is a spec-only edit; the matching test is the re-review step that follows. The `tests/lib/retro-session-format.test.mjs` file used by Task 5 also serves as a guard that the SA-1 / SA-2 / SA-3 clarifications are reflected in code.

**Context to load:**
- Spec full body
- Review verdict (`.review.md`) — all six warnings + six suggestions
- `hook-driven-capture.spec.md` rev 5 header comment (so CON-X4 wording about "landed in rev 4/5" is accurate)

**Edits to apply (one rev-2 amendment bundling all polish):**
- **SA-1** — Behavior 12: replace the "(replaces the conditional placeholder at retro:125)" prose with the explicit clarification: *"the existing conditional Context Gaps logic at retro:125 (currently inside Step 2) is REMOVED; the first-class replacement renders inside § 1.8 in Step 1."* Add a Module Impact Map row noting the delete-from-Step-2 edit to `skills/retro/SKILL.md`.
- **SA-2** — Module Impact Map: replace the `lib/retro/session-metrics/` row with a single-file row: `lib/retro/session-metrics.mjs` (NEW; named exports for each sub-helper). Explicitly assign Behavior 13.a (format-breakdown line) to `gatherSessionActivity()` core, not a sub-helper.
- **SA-3** — Behavior 7: replace "or whatever shape `lib/session-summary.mjs::fromTranscript()` produces" with an enumeration of exact patterns owned by Spec B: literal `### <Tool>` headings AND literal `**Tool:** <name>` lines (case-sensitive). Note: Spec B's parser is decoupled from Spec A's body prose.
- **SA-4** — Preconditions: add `getIssueManager(manifest)` row (consumed read-only via `list({ status: "closed", since, until })`). Module Impact Map: add a row pointing at `lib/issues/registry.mjs` (no edits; read-only consumer).
- **SEC-B1** — Invariants: add three rules: (1) "Body scans use literal `String.prototype.includes()` or non-backtracking regex; backtracking quantifiers (`.+`, `.*`) over body content are forbidden." (2) "Session bodies above 5 MB are skipped for metric extraction (counted in total, classified separately)." (3) "Context Gaps 'no matches' / 'file not found' / '0 results' patterns must match inside a tool-output frame — a block delimited per the body-scan helper's frame definition."
- **SEC-B2** — Invariants: add "`issue` and `epic` frontmatter values are validated against `^[a-z0-9][a-z0-9.-]{0,63}$` AND `parseId(value)` recognition before any board lookup. Charset-mismatch values render the xref row with `(invalid)` annotation. Defense-in-depth — required even though hook-driven-capture rev 5 SEC-13 validates at the producer."
- **SEC-B3** — Invariants: add "YAML frontmatter is parsed in safe-load mode — no custom tags, no functions, no aliases expanded > N times. Frontmatter exceeding 16 KB is skipped and classified `unknown`. If a third-party YAML library is introduced, an ADR is required (Principle 1)."
- **SEC-B4** — Invariants: tighten "No raw transcript reading" to "Retro MUST NOT open any file outside `.context-index/sessions/` and the project's issue board. A session body containing `See ~/.ssh/id_rsa for context` cannot cause an accidental read."
- **CON-X1** — Behavior 4: add a one-line note: "`hook` is the classifier's label, not a stored frontmatter value. Hook-mode files store `kind: session-end | pre-compact | placeholder`."
- **CON-X3** — Behavior 11: add a one-line definition: "`session_id_short` = first 8 hex chars of `session_id`, for display only; the underlying join is on the full `session_id`."
- **CON-X4** — Header comment + Actionable Task Map row 1: mark "Upstream amendment" as **landed in hook-driven-capture rev 4/5** (no longer pending).
- **CON-X5** — Behavior 11: add "When the referenced issue id is not present on the board at all, the row renders with `(unknown)` as title and no closed-date column value."
- **XS-2** — Behaviors 9 and 11: narrow scope from "hook-mode" to "session-end" (kind: session-end only; PreCompact placeholders are excluded from cost/token and xref aggregation).

- [ ] **Write failing test (rev check)**

The spec edit is verified by a manual diff review during the plan-reviewer loop and by the subsequent tasks' tests, which import from the polished invariants. Because Task 1 is a spec-only edit, the "failing test" is procedural: rerun `adev verify spec --spec <path>` and confirm the spec parses cleanly at `revision: 2`.

```bash
adev verify spec --spec .context-index/specs/features/session-awareness/retro-session-consumption.spec.md
# Expect: { revision: 2, status: "review-passed" } (pre-edit will show 1; post-edit shows 2)
```

- [ ] **Verify test fails**

Pre-edit: revision is 1; the polish items below are absent.

- [ ] **Implement**

Apply the 12 polish edits listed above to the spec file. Bump `revision: 1` → `revision: 2` and `updated: 2026-05-20` → current date in frontmatter. Re-run `/adev:review-specs` on the polished spec to obtain a fresh PASS_WITH_NOTES (or PASS) verdict; the plan-reviewer loop in Step 6 uses the polished spec.

- [ ] **Verify test passes**

```bash
adev verify spec --spec .context-index/specs/features/session-awareness/retro-session-consumption.spec.md
# Expect: revision: 2
```

- [ ] **Commit**

Branch: `feat/session-awareness/retro-session-consumption`

```bash
git add .context-index/specs/features/session-awareness/retro-session-consumption.spec.md
git commit -m "spec(session-awareness): retro-session-consumption rev 2 — fold review notes

Spec: .context-index/specs/features/session-awareness/retro-session-consumption.spec.md
Plan-task: 1"
```


### Task 2: `lib/retro/body-scan.mjs` — bounded, non-backtracking body-scan helpers [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=4
**Rationale:** Pure helper module with explicit API surface, test cases enumerated, and an exhaustive failing-test stub in the plan; minimal blast radius (1 lib file + 1 test).

**Charter capability:** Retro Session Consumption (defense-in-depth for body-grep operations — SEC-B1)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/retro/body-scan.mjs`
- Test: `tests/lib/retro-body-scan.test.mjs`

**Tests:** `tests/lib/retro-body-scan.test.mjs` — covers:
- Body exceeding 5MB → returns sentinel `{ skipped: true, reason: "oversize" }` (no allocation of full match arrays)
- Backtracking-prone input (e.g., 100KB of `/` chars against literal-string scan for `.context-index/specs/`) completes in < 50ms
- `containsLiteralToken(body, "no matches")` returns boolean — uses `String.prototype.includes()` only
- `scanWithinToolOutputFrame(body, needle, frameOpenMarker, frameCloseMarker)` only matches needles inside frames
- Frame markers default to a documented pair (e.g., ` ```output … ``` ` or `<tool-output> … </tool-output>` — pin the choice in this task)

**Context to load:**
- Review SEC-B1 text (a) regex DoS (b) adversarial gap injection
- Spec § "Invariants" (No raw transcript reading) — body-scan helpers are the only files allowed to look at session bodies

- [ ] **Write failing test**

```javascript
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  scanLiteralTokens,
  scanWithinToolOutputFrame,
  isOversizeBody,
  BODY_SIZE_LIMIT,
} from '../../lib/retro/body-scan.mjs';

test('body-scan: oversize body returns skipped sentinel', () => {
  const big = 'a'.repeat(BODY_SIZE_LIMIT + 1);
  assert.equal(isOversizeBody(big), true);
});

test('body-scan: literal scan is backtracking-free under adversarial input', () => {
  const adversarial = '/'.repeat(100_000);
  const start = Date.now();
  const hits = scanLiteralTokens(adversarial, ['.context-index/specs/']);
  const elapsed = Date.now() - start;
  assert.equal(hits.length, 0);
  assert.ok(elapsed < 50, `expected < 50ms, got ${elapsed}ms`);
});

test('body-scan: frame-anchored scan rejects out-of-frame matches', () => {
  const body = [
    'prose mentioning no matches outside frame',
    '```output',
    'foo',
    '```',
  ].join('\n');
  const hits = scanWithinToolOutputFrame(body, 'no matches');
  assert.equal(hits.length, 0);
});
```

- [ ] **Verify test fails**

```bash
node --test tests/lib/retro-body-scan.test.mjs
# Expected: Cannot find module '../../lib/retro/body-scan.mjs'
```

- [ ] **Implement**

Create `lib/retro/body-scan.mjs` exporting `BODY_SIZE_LIMIT = 5 * 1024 * 1024`, `isOversizeBody(body)`, `scanLiteralTokens(body, tokens[])`, `scanWithinToolOutputFrame(body, needle, opts?)`. Implementation uses only `String.prototype.includes()` and split-on-frame-marker — no regex with quantifiers over body content. Frame markers documented in JSDoc.

- [ ] **Verify test passes**

```bash
node --test tests/lib/retro-body-scan.test.mjs
```

- [ ] **Commit**

```bash
git add lib/retro/body-scan.mjs tests/lib/retro-body-scan.test.mjs
git commit -m "feat(lib/retro): add bounded non-backtracking body-scan helpers

Implements SEC-B1 defense-in-depth: 5MB body cap, literal-token scan via
String.prototype.includes() (no backtracking), frame-anchored gap matching.

Spec: .context-index/specs/features/session-awareness/retro-session-consumption.spec.md
Plan-task: 2"
```

### Task 3: `lib/retro/issue-id-validation.mjs` — issue-id charset + parseId validator [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=5
**Rationale:** Mechanical pattern-application — the implementation snippet is in the plan verbatim and the test matrix is enumerated; single-file, no surprises.

**Charter capability:** Retro Session Consumption (defense-in-depth issue-id validation before board lookup — SEC-B2)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/retro/issue-id-validation.mjs`
- Test: `tests/lib/retro-issue-id-validation.test.mjs`

**Tests:** `tests/lib/retro-issue-id-validation.test.mjs` — covers:
- Valid charset + recognized by `parseId()` (`issue-528`, `e1.f2.t3`, `epic-12`) → `{ ok: true, normalized: <id> }`
- Charset mismatch (`"../../../etc/passwd"`, `"<img>"`, non-ASCII, > 64 chars) → `{ ok: false, normalized: null, reason: "charset" }`
- Valid charset but `parseId()` returns null → `{ ok: false, normalized: null, reason: "unrecognized" }`
- Non-string input (null, undefined, number, object) → `{ ok: false, normalized: null, reason: "type" }`

**Context to load:**
- Review SEC-B2 verbatim
- `lib/issues/id-utils.mjs::parseId` signature

- [ ] **Write failing test**

```javascript
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { validateIssueId } from '../../lib/retro/issue-id-validation.mjs';

test('validateIssueId: charset reject', () => {
  for (const bad of ['../../../etc/passwd', '<img onerror=>', 'A'.repeat(65), '', 'Foo!']) {
    assert.equal(validateIssueId(bad).ok, false, `expected reject: ${bad}`);
  }
});

test('validateIssueId: charset OK but parseId unrecognized', () => {
  const result = validateIssueId('zzz-not-an-id');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unrecognized');
});

test('validateIssueId: legacy and tiered both accepted', () => {
  assert.equal(validateIssueId('issue-528').ok, true);
  assert.equal(validateIssueId('e1.f2.t3').ok, true);
});
```

- [ ] **Verify test fails**

```bash
node --test tests/lib/retro-issue-id-validation.test.mjs
```

- [ ] **Implement**

```javascript
import { parseId } from '../issues/id-utils.mjs';

const CHARSET_RE = /^[a-z0-9][a-z0-9.-]{0,63}$/;

export function validateIssueId(value) {
  if (typeof value !== 'string') return { ok: false, normalized: null, reason: 'type' };
  if (!CHARSET_RE.test(value)) return { ok: false, normalized: null, reason: 'charset' };
  if (!parseId(value)) return { ok: false, normalized: null, reason: 'unrecognized' };
  return { ok: true, normalized: value, reason: null };
}
```

- [ ] **Verify test passes**

```bash
node --test tests/lib/retro-issue-id-validation.test.mjs
```

- [ ] **Commit**

```bash
git add lib/retro/issue-id-validation.mjs tests/lib/retro-issue-id-validation.test.mjs
git commit -m "feat(lib/retro): add issue-id validator (charset + parseId)

Implements SEC-B2 defense-in-depth: validates issue/epic frontmatter values
against ^[a-z0-9][a-z0-9.-]{0,63}$ AND parseId() before any board lookup.

Spec: .context-index/specs/features/session-awareness/retro-session-consumption.spec.md
Plan-task: 3"
```

### Task 4: `lib/retro/safe-frontmatter.mjs` — YAML safe-load + size cap [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=3
**Rationale:** Wraps the existing parser in `lib/meta-tools.mjs`; algorithm steps are itemized and the failing-test stub covers each rejection class; small adaptation around existing pattern.

**Charter capability:** Retro Session Consumption (defense-in-depth YAML parsing — SEC-B3)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/retro/safe-frontmatter.mjs`
- Test: `tests/lib/retro-safe-frontmatter.test.mjs`

**Tests:** `tests/lib/retro-safe-frontmatter.test.mjs` — covers:
- Plain `--- … ---` frontmatter parses normally
- Frontmatter > 16 KB → `{ ok: false, frontmatter: null, reason: "oversize" }`
- Custom YAML tag (`!!js/function`) → `{ ok: false, reason: "unsafe-tag" }`
- Anchor + alias (billion-laughs trigger `&a [...], *a *a ...`) → `{ ok: false, reason: "anchor-alias" }`
- Malformed YAML (unbalanced quotes / bad indent) → `{ ok: false, reason: "parse-error" }`
- File with no frontmatter at all → `{ ok: true, frontmatter: {}, reason: null }` (consumer classifies as `unknown` separately)

**Context to load:**
- `lib/meta-tools.mjs::parseFrontmatter` (existing hand-rolled parser; the new reader wraps it but inserts the size cap + anchor/alias/tag pre-check on the raw frontmatter slice)
- Review SEC-B3 verbatim
- Constitution Principle 1 (no new external deps — keep the existing hand-rolled parser; reject unsafe constructs at the lexical level before parsing)

- [ ] **Write failing test**

```javascript
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readSafeFrontmatter, FRONTMATTER_SIZE_LIMIT } from '../../lib/retro/safe-frontmatter.mjs';

test('safe-frontmatter: oversize rejected', () => {
  const big = `---\n${'k: v\n'.repeat(FRONTMATTER_SIZE_LIMIT)}\n---\nbody`;
  const result = readSafeFrontmatter(big);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'oversize');
});

test('safe-frontmatter: custom tag rejected', () => {
  const text = '---\nfoo: !!js/function "return 42"\n---\nbody';
  assert.equal(readSafeFrontmatter(text).ok, false);
});

test('safe-frontmatter: anchor/alias rejected', () => {
  const text = '---\na: &x [1]\nb: *x\n---\nbody';
  assert.equal(readSafeFrontmatter(text).ok, false);
});

test('safe-frontmatter: plain frontmatter parses', () => {
  const text = '---\nkind: session-end\nsession_id: abc\n---\nbody';
  const r = readSafeFrontmatter(text);
  assert.equal(r.ok, true);
  assert.equal(r.frontmatter.kind, 'session-end');
});
```

- [ ] **Verify test fails**

```bash
node --test tests/lib/retro-safe-frontmatter.test.mjs
```

- [ ] **Implement**

Create `lib/retro/safe-frontmatter.mjs` exporting `FRONTMATTER_SIZE_LIMIT = 16 * 1024`, `readSafeFrontmatter(rawText)`. Algorithm: (1) check raw text length, (2) extract `---\n…\n---` slice and check slice size against limit, (3) scan slice for `!!`, `&`, `*` (anchor/alias/tag sentinels — reject if present at line start after optional whitespace), (4) hand off to existing hand-rolled parser in `lib/meta-tools.mjs` (re-exported or duplicated). Returns `{ ok, frontmatter, reason }`.

- [ ] **Verify test passes**

```bash
node --test tests/lib/retro-safe-frontmatter.test.mjs
```

- [ ] **Commit**

```bash
git add lib/retro/safe-frontmatter.mjs tests/lib/retro-safe-frontmatter.test.mjs
git commit -m "feat(lib/retro): add safe YAML frontmatter reader

Implements SEC-B3 defense-in-depth: 16KB size cap, rejects YAML anchors,
aliases, and custom tags before parsing. No new external dependencies
(Principle 1).

Spec: .context-index/specs/features/session-awareness/retro-session-consumption.spec.md
Plan-task: 4"
```


### Task 5: `lib/retro/session-format.mjs` — `classifyFormat()` [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=5
**Rationale:** Pure function classifier with three documented branches; failing-test stub and implementation contract both inline in the plan.

**Charter capability:** Retro Session Consumption (foundation classifier — Behaviors 4, 5, 6)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/retro/session-format.mjs`
- Test: `tests/lib/retro-session-format.test.mjs`

**Depends on:** Tasks 1, 4

**Tests:** `tests/lib/retro-session-format.test.mjs` — covers all six behaviors of `classifyFormat()`:
- Hook-mode `kind: session-end` → returns `"hook"`
- Hook-mode `kind: pre-compact` → returns `"hook"`
- Hook-mode `kind: placeholder` → returns `"hook"`
- Post-commit `type: commit, agent: git-hook` → returns `"post-commit"`
- Any other frontmatter shape (random keys, missing `kind`/`type`) → returns `"unknown"`
- Empty frontmatter `{}` → returns `"unknown"`
- `null` / `undefined` input → returns `"unknown"`
- Comment that CON-X1's vocabulary distinction is honored: classifier label is "hook", but the stored `kind` field is `session-end | pre-compact | placeholder`. Use `assert.notEqual(format, frontmatter.kind)` for hook-mode rows as a guard.

**Context to load:**
- Spec Behaviors 4, 5, 6 + Error Cases (malformed YAML row)
- CON-X1 note
- `lib/retro/safe-frontmatter.mjs` (signature only — this module's callers pre-parse)

- [ ] **Write failing test**

```javascript
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { classifyFormat } from '../../lib/retro/session-format.mjs';

test('classifyFormat: hook-mode kinds', () => {
  for (const kind of ['session-end', 'pre-compact', 'placeholder']) {
    assert.equal(classifyFormat({ kind, session_id: 'x', date: '2026-05-20' }), 'hook');
  }
});

test('classifyFormat: post-commit', () => {
  assert.equal(
    classifyFormat({ date: '2026-05-20', type: 'commit', agent: 'git-hook' }),
    'post-commit'
  );
});

test('classifyFormat: unknown', () => {
  assert.equal(classifyFormat({}), 'unknown');
  assert.equal(classifyFormat(null), 'unknown');
  assert.equal(classifyFormat({ random: 'noise' }), 'unknown');
});
```

- [ ] **Verify test fails**
- [ ] **Implement**

Pure function: switch on `frontmatter?.kind` for hook-mode; check `frontmatter?.type === 'commit' && frontmatter?.agent === 'git-hook'` for post-commit; default `unknown`.

- [ ] **Verify test passes**
- [ ] **Commit**

```bash
git add lib/retro/session-format.mjs tests/lib/retro-session-format.test.mjs
git commit -m "feat(lib/retro): add classifyFormat (hook | post-commit | unknown)

Pure function over parsed frontmatter. Honors CON-X1 vocabulary: 'hook' is
the classifier label; stored frontmatter uses kind: session-end | pre-compact
| placeholder.

Spec: .context-index/specs/features/session-awareness/retro-session-consumption.spec.md
Plan-task: 5"
```

### Task 6: `lib/retro/session-activity.mjs` — orchestrator core [specialist: none]

**Routing:** assisted-agent (score: 15/20)
**Scores:** spec=5 pattern=3 blast=4 novelty=3
**Rationale:** Orchestrator composes several new helpers and must enforce SEC-B4 path-containment; the implementation skeleton is sketched but not complete — pause after RED to confirm composition shape before GREEN.

**Charter capability:** Retro Session Consumption (orchestration — Behaviors 1, 2, 3, 13.a; SEC-B4 path-containment)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/retro/session-activity.mjs`
- Test: `tests/lib/retro-session-activity.test.mjs` (initial — orchestrator-only assertions; Task 13 expands with full edge-case coverage)

**Depends on:** Tasks 2, 4, 5

**Tests:** `tests/lib/retro-session-activity.test.mjs` (initial slice — Task 13 extends):
- Empty `.context-index/sessions/` → returns `{ totalSessions: 0, formatBreakdown: { hook: 0, "post-commit": 0, unknown: 0 }, … }` with sub-fields as documented defaults
- Missing `.context-index/sessions/` → same as empty (Graceful absence invariant)
- Format-breakdown line is computed in the orchestrator (per SA-2 — not delegated to a sub-helper)
- SEC-B4: orchestrator MUST NOT open any file path outside `.context-index/sessions/` and the issue board path; add a guard test that constructs a session body containing `See ../../etc/passwd` and confirms the orchestrator does not attempt to read that path (mock `fs.readFile` to track calls)

**Context to load:**
- Spec Behaviors 1, 2, 3, 13.a + "Graceful absence", "No mutation", "No raw transcript reading", "Stable section position" invariants
- Review SEC-B4 wording
- `lib/retro/safe-frontmatter.mjs`, `lib/retro/session-format.mjs`, `lib/retro/body-scan.mjs::BODY_SIZE_LIMIT`

- [ ] **Write failing test**

```javascript
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createTempDir, cleanupTempDir } from '../helpers.mjs';
import { gatherSessionActivity } from '../../lib/retro/session-activity.mjs';

test('gatherSessionActivity: missing sessions dir → empty result, no warnings', async () => {
  const dir = await createTempDir();
  try {
    const result = await gatherSessionActivity(dir, {
      since: '2026-05-01',
      until: '2026-05-31',
    });
    assert.equal(result.totalSessions, 0);
    assert.deepEqual(result.formatBreakdown, { hook: 0, 'post-commit': 0, unknown: 0 });
  } finally {
    await cleanupTempDir(dir);
  }
});

test('gatherSessionActivity: empty sessions dir → empty result', async () => {
  const dir = await createTempDir();
  try {
    await mkdir(join(dir, '.context-index/sessions'), { recursive: true });
    const result = await gatherSessionActivity(dir, { since: '2026-05-01', until: '2026-05-31' });
    assert.equal(result.totalSessions, 0);
  } finally {
    await cleanupTempDir(dir);
  }
});

test('gatherSessionActivity: file outside window excluded', async () => {
  const dir = await createTempDir();
  try {
    const sessions = join(dir, '.context-index/sessions');
    await mkdir(sessions, { recursive: true });
    await writeFile(
      join(sessions, '2025-01-01-aaa.md'),
      '---\nkind: session-end\nsession_id: aaa\ndate: 2025-01-01\n---\nbody'
    );
    const result = await gatherSessionActivity(dir, { since: '2026-05-01', until: '2026-05-31' });
    assert.equal(result.totalSessions, 0);
  } finally {
    await cleanupTempDir(dir);
  }
});
```

- [ ] **Verify test fails**
- [ ] **Implement**

```javascript
// lib/retro/session-activity.mjs
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { readSafeFrontmatter } from './safe-frontmatter.mjs';
import { classifyFormat } from './session-format.mjs';
import { isOversizeBody } from './body-scan.mjs';
import {
  parseToolUseDistribution,
  countPerSpec,
  aggregateCostTokens,
  joinClosedIssueXref,
  scanContextGaps,
} from './session-metrics.mjs';

export async function gatherSessionActivity(projectRoot, window, opts = {}) {
  const sessionsDir = join(projectRoot, '.context-index/sessions');
  let files;
  try {
    files = await readdir(sessionsDir);
  } catch {
    return emptyResult();
  }
  // Glob *.md, parse frontmatter, filter by window, classify, dispatch.
  // Compose format-breakdown locally (SA-2: owned by core).
  // Pass classified sessions to sub-helpers.
  // Defense-in-depth: enforce containment — all readFile calls use paths under sessionsDir.
}
```

- [ ] **Verify test passes**
- [ ] **Commit**

```bash
git add lib/retro/session-activity.mjs tests/lib/retro-session-activity.test.mjs
git commit -m "feat(lib/retro): add gatherSessionActivity orchestrator core

Globs .context-index/sessions/*.md, filters by analysis window, classifies
each file via classifyFormat(), and dispatches to sub-helpers. Composes
format-breakdown line locally (SA-2). Enforces SEC-B4 read-scope invariant
— never opens files outside .context-index/sessions/.

Spec: .context-index/specs/features/session-awareness/retro-session-consumption.spec.md
Plan-task: 6"
```

### Task 7: Sub-helper — `parseToolUseDistribution()` [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=4
**Rationale:** Patterns pinned by SA-3 to literal `### <Tool>` and `**Tool:** <name>`; top-10 + tie-break rules explicit; one named export to a rollup file.

**Charter capability:** Retro Session Consumption (Behavior 7 — tool-use distribution)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create / modify: `lib/retro/session-metrics.mjs` (initial export — this is the first sub-helper added to the rollup)
- Test: `tests/lib/retro-session-metrics.test.mjs` (new file; one describe block per sub-helper)

**Depends on:** Tasks 2, 6

**Tests:** `tests/lib/retro-session-metrics.test.mjs` — `parseToolUseDistribution()` describe block covers:
- Bodies with literal `### Read` headings → tally `Read`
- Bodies with literal `**Tool:** Bash` lines → tally `Bash`
- Mixed bodies → both contribute to tally
- Body exceeding `BODY_SIZE_LIMIT` → skipped, no count contribution (uses `body-scan.mjs::isOversizeBody`)
- Body content matching only outside the documented patterns → no tally (per SA-3 path-b — patterns are consumer-owned)
- Top-10 ordering: descending by frequency; ties broken alphabetically

**Context to load:**
- Spec Behavior 7 (post-rev-2 enumerated patterns)
- SA-3 review text (path-b — consumer self-contained)
- `lib/session-summary.mjs` (read body shape produced by `fromTranscript()` — informational only; the parser is decoupled per SA-3)

- [ ] **Write failing test**

```javascript
import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseToolUseDistribution } from '../../lib/retro/session-metrics.mjs';

describe('parseToolUseDistribution', () => {
  test('counts ### Tool headings', () => {
    const sessions = [
      { body: '### Read\nfoo\n### Bash\nbar\n### Read\n' },
    ];
    const result = parseToolUseDistribution(sessions);
    assert.equal(result.find(r => r.tool === 'Read').count, 2);
    assert.equal(result.find(r => r.tool === 'Bash').count, 1);
  });
  test('counts **Tool:** lines', () => {
    const sessions = [{ body: '**Tool:** Grep\n**Tool:** Grep\n' }];
    const result = parseToolUseDistribution(sessions);
    assert.equal(result.find(r => r.tool === 'Grep').count, 2);
  });
  test('top-10 ordering with tie-break', () => {
    // Construct 12 distinct tools, verify top-10 and alphabetical tie-break
    // ...
  });
});
```

- [ ] **Verify test fails**
- [ ] **Implement**

Parse each hook-mode session body line-by-line using `String.split('\n')` and literal `String.startsWith()` / `String.includes()` checks for the two enumerated patterns. No regex with quantifiers on body content. Return top-10 sorted descending by count, ties broken alphabetically by tool name.

- [ ] **Verify test passes**
- [ ] **Commit**

```bash
git add lib/retro/session-metrics.mjs tests/lib/retro-session-metrics.test.mjs
git commit -m "feat(lib/retro): add parseToolUseDistribution sub-helper

Pins Behavior 7's tool-use patterns to literal '### <Tool>' headings and
'**Tool:** <name>' lines (SA-3 path-b — consumer self-contained). Bounded by
body-scan size cap.

Spec: .context-index/specs/features/session-awareness/retro-session-consumption.spec.md
Plan-task: 7"
```


### Task 8: Sub-helper — `countPerSpec()` [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=4
**Rationale:** Spec Behavior 8 enumerates the two contribution sources, dedupe rule, omit rule, and sort tiebreak; reuses Task 2's literal scanner.

**Charter capability:** Retro Session Consumption (Behavior 8 — per-spec session counts)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/retro/session-metrics.mjs` (add export `countPerSpec`)
- Modify: `tests/lib/retro-session-metrics.test.mjs` (add describe block)

**Depends on:** Tasks 2, 6

**Tests:** `tests/lib/retro-session-metrics.test.mjs` — `countPerSpec()` describe block:
- Frontmatter `spec:` field counted toward that spec
- Body contains literal `.context-index/specs/foo/bar.spec.md` → counted toward `foo/bar`
- Session referencing two specs (one in frontmatter, one in body) → both incremented
- Dedupe per `(session, spec)` pair — a body that mentions the same spec twice counts once for that session
- Zero-count specs are omitted from output
- Sort: descending by count, ties broken by spec slug ascending

**Context to load:**
- Spec Behavior 8 (post-rev-2)
- `lib/retro/body-scan.mjs::scanLiteralTokens` (used to scan body for spec paths)

- [ ] **Write failing test** (describe block in retro-session-metrics.test.mjs)
- [ ] **Verify test fails**
- [ ] **Implement** in `lib/retro/session-metrics.mjs` using literal-string scan only.
- [ ] **Verify test passes**
- [ ] **Commit**

```bash
git add lib/retro/session-metrics.mjs tests/lib/retro-session-metrics.test.mjs
git commit -m "feat(lib/retro): add countPerSpec sub-helper

Spec: .context-index/specs/features/session-awareness/retro-session-consumption.spec.md
Plan-task: 8"
```

### Task 9: Sub-helper — `aggregateCostTokens()` [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=4
**Rationale:** Behaviors 9, 10 (post XS-2 narrowing) precisely define inclusion criteria, totals, per-model/per-spec breakdowns, and parseError sampling; small sum-and-bucket implementation.

**Charter capability:** Retro Session Consumption (Behaviors 9, 10 — cost & token trends)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/retro/session-metrics.mjs` (add export `aggregateCostTokens`)
- Modify: `tests/lib/retro-session-metrics.test.mjs` (add describe block)

**Depends on:** Task 6

**Tests:** `tests/lib/retro-session-metrics.test.mjs` — `aggregateCostTokens()` describe block:
- All sessions have cost fields → returns totals + per-model + per-spec breakdowns
- Sessions missing `cost_usd` excluded from cost aggregate but still counted in session total
- Mixed shape (some sessions have model, others don't) → per-model breakdown only includes those with `model`
- Non-numeric `cost_usd` (e.g. `"$0.05"` string) → excluded; recorded in `parseErrors[]` sample list
- No sessions have any cost field → returns `null` (orchestrator omits subsection)
- XS-2: pre-compact and placeholder sessions are EXCLUDED — only `kind: session-end` contributes (spec behavior post-rev-2)

**Context to load:**
- Spec Behaviors 9, 10 (post-rev-2 XS-2 narrowing)
- `hook-driven-capture.spec.md` rev 5 SEC-12 (producer-side numeric validation contract — defense-in-depth here)

- [ ] **Write failing test** — describe block
- [ ] **Verify test fails**
- [ ] **Implement** — `Number.isFinite()` checks before summation; `parseErrors[]` sample collection for diagnostics.
- [ ] **Verify test passes**
- [ ] **Commit**

```bash
git add lib/retro/session-metrics.mjs tests/lib/retro-session-metrics.test.mjs
git commit -m "feat(lib/retro): add aggregateCostTokens sub-helper

Sums cost_usd / input_tokens / output_tokens across session-end files only
(XS-2 narrowing). Skip-and-record parse-error samples for malformed numerics.

Spec: .context-index/specs/features/session-awareness/retro-session-consumption.spec.md
Plan-task: 9"
```

### Task 10: Sub-helper — `joinClosedIssueXref()` [specialist: none]

**Routing:** assisted-agent (score: 15/20)
**Scores:** spec=5 pattern=3 blast=4 novelty=3
**Rationale:** Touches the issue board contract (`getIssueManager`, `list({status:closed})`) plus three render-branch annotations (`(invalid)`, `(unknown)`, omit); checkpoint after RED to confirm board-manager mocking shape.

**Charter capability:** Retro Session Consumption (Behavior 11 — sessions ↔ closed issues; SEC-B2 validation; CON-X3 session_id_short; CON-X5 unknown-id semantics)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/retro/session-metrics.mjs` (add export `joinClosedIssueXref`)
- Modify: `tests/lib/retro-session-metrics.test.mjs` (add describe block)

**Depends on:** Tasks 3, 6

**Tests:** `tests/lib/retro-session-metrics.test.mjs` — `joinClosedIssueXref()` describe block:
- Session with valid `issue:` → row renders with issue title and `session_id_short` (8-char prefix)
- Session with `issue:` value that fails `validateIssueId()` → row renders with `(invalid)` annotation, no board lookup attempted
- Session with `issue:` not present on the board at all → row renders with `(unknown)` title and no closed-date (CON-X5)
- Session with `issue:` present on board but not closed in the analysis window → row excluded from xref table
- Session with `epic:` and no `issue:` → joined against epic id
- XS-2: only `kind: session-end` sessions contribute (post-rev-2 narrowing)
- Multiple sessions touching the same issue → row's `session_id_short` list contains all
- Mock issue board injected via `opts.issueManager`

**Context to load:**
- `lib/retro/issue-id-validation.mjs::validateIssueId`
- `lib/issues/registry.mjs::getIssueManager` + `list({ status: "closed" })`
- Spec Behavior 11 (post-rev-2), CON-X3, CON-X5
- Review SEC-B2

- [ ] **Write failing test** — describe block
- [ ] **Verify test fails**
- [ ] **Implement** — validate every `issue`/`epic` value via `validateIssueId()` BEFORE calling `issueManager.list()` or `issueManager.get()`. Render `(invalid)` or `(unknown)` per the matrix. Format `session_id_short = session_id.slice(0, 8)` for display.
- [ ] **Verify test passes**
- [ ] **Commit**

```bash
git add lib/retro/session-metrics.mjs tests/lib/retro-session-metrics.test.mjs
git commit -m "feat(lib/retro): add joinClosedIssueXref sub-helper

Validates issue/epic frontmatter via validateIssueId() before any board
lookup (SEC-B2 defense-in-depth). Renders (invalid) for charset failures
and (unknown) for absent ids per CON-X5. Displays session_id_short =
session_id.slice(0, 8) per CON-X3.

Spec: .context-index/specs/features/session-awareness/retro-session-consumption.spec.md
Plan-task: 10"
```

### Task 11: Sub-helper — `scanContextGaps()` (frame-anchored) [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=3
**Rationale:** Frame-anchored scan reuses Task 2's `scanWithinToolOutputFrame`; aggregation rules and top-10 sort explicit; novelty in defining gap markers but those are itemized.

**Charter capability:** Retro Session Consumption (Behavior 12 — first-class Context Gaps; SEC-B1(b))
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/retro/session-metrics.mjs` (add export `scanContextGaps`)
- Modify: `tests/lib/retro-session-metrics.test.mjs` (add describe block)

**Depends on:** Tasks 2, 6

**Tests:** `tests/lib/retro-session-metrics.test.mjs` — `scanContextGaps()` describe block:
- Session body with `no matches` inside a tool-output frame → counted as gap
- Session body with `no matches` in adversarial prose OUTSIDE a tool-output frame → NOT counted (SEC-B1(b))
- Gap aggregated by spec (frontmatter `spec:` field OR body grep for `.context-index/specs/**/*.spec.md`)
- Top-10 spec-gap pairs returned, sorted descending by count
- Empty result when no hook-mode sessions had gap matches → returns `[]`

**Context to load:**
- `lib/retro/body-scan.mjs::scanWithinToolOutputFrame`
- Spec Behavior 12 (post-rev-2 with SEC-B1(b) frame anchor)
- Review SEC-B1(b) verbatim

- [ ] **Write failing test** — describe block
- [ ] **Verify test fails**
- [ ] **Implement** — uses `scanWithinToolOutputFrame()` exclusively; never raw substring search across the full body for gap markers. Aggregate by (spec, gap-marker) pairs.
- [ ] **Verify test passes**
- [ ] **Commit**

```bash
git add lib/retro/session-metrics.mjs tests/lib/retro-session-metrics.test.mjs
git commit -m "feat(lib/retro): add scanContextGaps sub-helper (frame-anchored)

Implements Behavior 12: scans hook-mode session bodies for 'no matches' /
'file not found' / '0 results' markers ONLY inside tool-output frames
(SEC-B1(b) defense-in-depth — adversarial prose outside frames cannot
inject false gaps).

Spec: .context-index/specs/features/session-awareness/retro-session-consumption.spec.md
Plan-task: 11"
```

### Task 12: CLI verb `adev retro session-activity` [specialist: none]

**Routing:** assisted-agent (score: 14/20)
**Scores:** spec=4 pattern=3 blast=3 novelty=4
**Rationale:** Touches `cli/index.mjs` verb registration and adds `--format text` markdown rendering not yet specified in detail; pause after RED so the text-render shape matches Behavior 13 ordering before GREEN.

**Charter capability:** Retro Session Consumption (cli-driver-surface — exposes orchestrator to skill prose without inline-Node)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/cli/retro/session-activity.mjs`
- Modify: `cli/index.mjs` (register verb dispatch — follow existing pattern; locate via existing `retro` or comparable verb)

**Depends on:** Tasks 6, 7, 8, 9, 10, 11

**Tests:** `tests/lib/retro-session-activity.test.mjs` — add a "CLI integration" describe block (or new test file `tests/cli/retro-session-activity.test.mjs`) covering:
- `adev retro session-activity --since 2026-05-01 --until 2026-05-31 --project-root <tmp>` exits 0 and emits JSON on stdout
- Output JSON shape matches the orchestrator's return type
- `--format text` renders the markdown section (used by the skill prose in Task 14)
- Missing sessions dir → empty output, exit 0 (no warning)

**Context to load:**
- `cli/index.mjs` (existing verb-dispatch pattern)
- `lib/retro/session-activity.mjs::gatherSessionActivity`
- Constitution Principle 2 (skills are markdown — this verb is what the skill calls)

- [ ] **Write failing test** — CLI smoke + format=text path
- [ ] **Verify test fails**
- [ ] **Implement** — wrap `gatherSessionActivity()`; expose `--format json|text` flags; render markdown when `text`.
- [ ] **Verify test passes**
- [ ] **Commit**

```bash
git add lib/cli/retro/session-activity.mjs cli/index.mjs tests/cli/retro-session-activity.test.mjs
git commit -m "feat(cli): add 'adev retro session-activity' verb

Wraps gatherSessionActivity() for invocation from skills/retro/SKILL.md.
Supports --format json (default) and --format text (renders the markdown
section directly). Principle 2 compliance — skill prose no longer needs
inline-Node.

Spec: .context-index/specs/features/session-awareness/retro-session-consumption.spec.md
Plan-task: 12"
```

### Task 13: Orchestrator regression tests — comprehensive coverage [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=3
**Rationale:** Test-only extension with an explicit case-matrix from the spec's Error Cases and Acceptance Criteria; helpers (`createTempDir`, `writeFixture`) already exist.

**Charter capability:** Retro Session Consumption (Acceptance Criteria coverage)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `tests/lib/retro-session-activity.test.mjs` (extend with all edge cases)

**Depends on:** Tasks 6, 7, 8, 9, 10, 11

**Tests:** Extend `tests/lib/retro-session-activity.test.mjs` to cover the full acceptance-criteria matrix:
- Hook-only window — all hook-mode sessions
- Post-commit-only window — all post-commit sessions
- Mixed window — both formats; format-breakdown line shows the mix
- Unknown-format files — counted in total, no metrics extracted, no warning
- Malformed YAML frontmatter — file classified `unknown`, counted, no crash
- Out-of-window files — excluded from totals
- Cost fields present in some sessions only → cost subsection rendered, partial data
- No cost fields anywhere → cost subsection omitted (returns `null`)
- Issue/epic fields present → xref rendered
- No issue/epic anywhere → xref omitted
- Two files sharing `(date, session_id)` → both counted (dedupe by file path)
- Format-breakdown line composed in core (SA-2 assertion)
- SEC-B4 read-scope guard test

**Context to load:**
- Spec § "Acceptance Criteria" (lines 167–169 in current spec; check post-rev-2 line numbers)
- Spec § "Error Cases" table

- [ ] **Write failing test** — extend existing test file
- [ ] **Verify test fails** — newly added cases fail
- [ ] **Implement** — orchestrator should already handle these; surface any uncovered edge cases as small fixes
- [ ] **Verify test passes**
- [ ] **Commit**

```bash
git add tests/lib/retro-session-activity.test.mjs
git commit -m "test(lib/retro): comprehensive orchestrator regression suite

Covers empty, hook-only, post-commit-only, mixed, unknown, malformed, and
out-of-window cases. Validates SA-2 (format-breakdown in core) and SEC-B4
(read-scope) invariants.

Spec: .context-index/specs/features/session-awareness/retro-session-consumption.spec.md
Plan-task: 13"
```

### Task 14: Skill prose — add § 1.8 Session Activity step to `skills/retro/SKILL.md` [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=4
**Rationale:** Markdown insertion with the exact prose block authored in the plan; constitution Architecture Boundaries lists skill-markdown edits as autonomous; pre-commit hook guards inline-Node.

**Charter capability:** Retro Session Consumption (skill prose — Behaviors 2, 13; Stable section position invariant)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/retro/SKILL.md` (insert between end of § 1.7 and start of Step 2)

**Depends on:** Task 12

**Tests:** `tests/skills/retro-session-section.test.mjs` (created in Task 18 but stubbed here) — and the existing pre-commit hook `hooks/pre-commit-no-inline-node` covers Principle 2 enforcement:
- Grep skill file for `node -e`, `node --input-type=module -e`, `Run inline Node` → none must appear
- Pre-commit hook will reject any inline-Node introduction

Existing test file (smoke): add a `tests/skills/retro-session-section.test.mjs` stub that:
- Reads `skills/retro/SKILL.md`
- Asserts the file contains a `## Step 1.8: Session Activity` heading
- Asserts the file contains the literal CLI invocation `adev retro session-activity`
- Asserts the file contains no inline-Node patterns

**Context to load:**
- `skills/retro/SKILL.md` (existing — lines around § 1.7 end and Step 2 start)
- Spec Behaviors 2, 13 + "Stable section position" invariant
- `.githooks/pre-commit-no-inline-node` (constraint reminder)

- [ ] **Write failing test** — stub `tests/skills/retro-session-section.test.mjs` asserting the heading exists
- [ ] **Verify test fails** — heading absent
- [ ] **Implement** — insert § 1.8 prose calling the CLI verb:

```markdown
### 1.8 Session Activity

When `.context-index/sessions/` exists and the analysis window contains at
least one session file, gather and render Session Activity:

```bash
adev retro session-activity --since <since> --until <until> --format text
```

Capture the rendered output and include it verbatim in the Step 1 report
between § 1.7 (Heuristics) and Step 2 (Pattern Analysis). When the
directory is missing or no sessions fall in the window, the verb emits an
empty result and Session Activity is omitted from the report (Graceful
absence invariant).
```

- [ ] **Verify test passes**
- [ ] **Commit**

```bash
git add skills/retro/SKILL.md tests/skills/retro-session-section.test.mjs
git commit -m "feat(skills/retro): add § 1.8 Session Activity step

Inserts the Session Activity step between § 1.7 and Step 2 (Stable section
position invariant). Step invokes 'adev retro session-activity' CLI verb;
no inline-Node (Principle 2; pre-commit hook enforced).

Spec: .context-index/specs/features/session-awareness/retro-session-consumption.spec.md
Plan-task: 14"
```


### Task 15: Skill prose — remove Step 2 "Context Gaps" conditional [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=5 pattern=5 blast=5 novelty=4
**Rationale:** Pure deletion of a known text block with absence assertions in the test; trivial blast radius and minimal novelty.

**Charter capability:** Retro Session Consumption (SA-1 — Context Gaps placement)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/retro/SKILL.md` (remove the existing § Step 2 "Context Gaps" subsection — currently lines around :123-127 with the conditional grep)

**Depends on:** Task 14

**Tests:** Extend `tests/skills/retro-session-section.test.mjs` (started in Task 14):
- Read `skills/retro/SKILL.md`
- Assert the file no longer contains the conditional phrase `if session capture is configured`
- Assert the file no longer contains the old `### Context Gaps` subheading inside Step 2

**Context to load:**
- `skills/retro/SKILL.md` lines 123-127 (the conditional grep text to remove)
- Spec Behavior 12 + SA-1 review text

- [ ] **Write failing test** — assertions for absence of the old text
- [ ] **Verify test fails** — old text still present
- [ ] **Implement** — delete the conditional Context Gaps subsection from Step 2 entirely. The first-class replacement lives in § 1.8 (via the CLI verb output rendered in Task 14).
- [ ] **Verify test passes**
- [ ] **Commit**

```bash
git add skills/retro/SKILL.md tests/skills/retro-session-section.test.mjs
git commit -m "refactor(skills/retro): remove Step 2 conditional Context Gaps

The first-class Context Gaps subsection now lives inside § 1.8 Session
Activity (SA-1 clarification — see retro-session-consumption.spec rev 2).

Spec: .context-index/specs/features/session-awareness/retro-session-consumption.spec.md
Plan-task: 15"
```

### Task 16: Skill prose — Output Format renders Session Activity [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=4
**Rationale:** Single-file Output Format documentation update; Behavior 13 enumerates the six subsections and conditional rendering precisely.

**Charter capability:** Retro Session Consumption (Behavior 13 — output ordering)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/retro/SKILL.md` (Report Format section — around the `### Report Format` heading)

**Depends on:** Task 14

**Tests:** Extend `tests/skills/retro-session-section.test.mjs`:
- Assert Report Format documents the Session Activity render position (between § 1.7 output and Pattern Analysis output)
- Assert the documented output ordering matches Behavior 13: (a) total + format breakdown line; (b) Tool-Use Distribution; (c) Per-Spec Session Counts; (d) Cost & Token Trends (if applicable); (e) Sessions ↔ Closed Issues (if applicable); (f) Context Gaps

**Context to load:**
- `skills/retro/SKILL.md` Report Format section
- Spec Behavior 13 (post-rev-2)

- [ ] **Write failing test** — assertions for the documented ordering
- [ ] **Verify test fails**
- [ ] **Implement** — add a Session Activity render block to the Report Format documentation. The block names the six subsections in order and notes conditional rendering for (d) and (e).
- [ ] **Verify test passes**
- [ ] **Commit**

```bash
git add skills/retro/SKILL.md tests/skills/retro-session-section.test.mjs
git commit -m "docs(skills/retro): document Session Activity render order in Output Format

Spec: .context-index/specs/features/session-awareness/retro-session-consumption.spec.md
Plan-task: 16"
```

### Task 17: Doc-drift fix — `skills/init/SKILL.md:761` [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=5 pattern=5 blast=5 novelty=4
**Rationale:** Trivial single-line documentation fix with the exact replacement text included in the implementation step.

**Charter capability:** Retro Session Consumption (Postconditions — issue-528 doc-drift)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/init/SKILL.md` (around line 761 — the `/adev:retro` session-consumption claim)

**Depends on:** Task 14

**Tests:** Add to `tests/skills/retro-session-section.test.mjs`:
- Read `skills/init/SKILL.md`
- Assert the line near :761 mentions `/adev:retro` consumes session files
- Assert the line accurately describes the Session Activity step (does not falsely claim consumption that is not implemented)

**Context to load:**
- `skills/init/SKILL.md:761` exact line (locate via Read with line offset)
- Spec Postconditions: "skills/init/SKILL.md line 761's documentation claim about /adev:retro consuming sessions is now accurate"

- [ ] **Write failing test** — assertion that the line is accurate post-implementation
- [ ] **Verify test fails** — current line claims consumption that wasn't implemented (issue-528)
- [ ] **Implement** — update line :761 to: "`/adev:retro` reads `.context-index/sessions/` within the analysis window and emits a Session Activity section (tool-use distribution, per-spec session counts, token/cost trends, context gaps). See `skills/retro/SKILL.md` § 1.8."
- [ ] **Verify test passes**
- [ ] **Commit**

```bash
git add skills/init/SKILL.md tests/skills/retro-session-section.test.mjs
git commit -m "docs(skills/init): fix /adev:retro session-consumption doc drift

Resolves issue-528 Verification section. The claim is now accurate after
retro-session-consumption ships.

Spec: .context-index/specs/features/session-awareness/retro-session-consumption.spec.md
Plan-task: 17"
```

### Task 18: End-to-end skill snapshot test [specialist: none]

**Routing:** assisted-agent (score: 15/20)
**Scores:** spec=5 pattern=3 blast=4 novelty=3
**Rationale:** Snapshot tests are stable only when fixture determinism is right; pause after RED to review the fixture data and the snapshot shape before GREEN locks in the byte-for-byte expected output.

**Charter capability:** Retro Session Consumption (end-to-end Acceptance Criteria validation)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `tests/skills/retro-session-section.test.mjs` (extend with full fixture-based snapshot)

**Depends on:** Tasks 12, 13, 14, 15, 16, 17

**Tests:** Extend `tests/skills/retro-session-section.test.mjs` with end-to-end fixture cases:
- Fixture project with deterministic session files (mix of hook-mode session-end + pre-compact + post-commit + unknown + one malformed)
- Run `adev retro session-activity --since <since> --until <until> --format text` against the fixture
- Snapshot-assert the rendered Session Activity output shape including:
  - Total + format-breakdown line
  - Top-10 tool table with deterministic ordering
  - Per-spec counts with deterministic tie-break
  - Cost subsection when fixture includes cost frontmatter
  - Xref subsection with a `(unknown)` and `(invalid)` row when fixture includes both
  - Context Gaps with frame-anchored matches only
- Snapshot of section-omission case: fixture with no sessions in window → CLI emits empty marker; skill prose omits the section

**Context to load:**
- `tests/helpers.mjs` (`createTempDir`, `writeFixture`)
- Spec § "Acceptance Criteria" — end-to-end test row (line ~169)

- [ ] **Write failing test**
- [ ] **Verify test fails**
- [ ] **Implement** — fixture builder + snapshot assertions. Use small deterministic data to keep snapshots stable.
- [ ] **Verify test passes**
- [ ] **Commit**

```bash
git add tests/skills/retro-session-section.test.mjs
git commit -m "test(skills/retro): end-to-end snapshot of Session Activity output

Fixture-based snapshot covers all six subsections, conditional rendering,
and section-omission cases. Validates the full acceptance-criteria matrix.

Spec: .context-index/specs/features/session-awareness/retro-session-consumption.spec.md
Plan-task: 18"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test`
- Pre-commit hooks pass: `.githooks/pre-commit` (includes `pre-commit-no-inline-node` guard for `skills/retro/SKILL.md` and `skills/init/SKILL.md`)
- All 24 acceptance criteria from the spec satisfied (post-rev-2)
- No new external dependencies (Principle 1 — verified by `package.json` diff being limited to version bump if any)
- All new code is pure ESM (Principle 3 — `.mjs` extension on every new file)
- No inline-Node patterns in any SKILL.md (Principle 2 — enforced by pre-commit hook)
- Charter Capability Map row "Retro Session Consumption" updated to `Status: planned` → flipped to `Status: implemented` by `/adev:implement` upon final task validation

