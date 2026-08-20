<!-- partial_schema: plan@1 -->

# Implementation Plan: ADEV-DEBUG Completion Token and --auto Mode

> **Methodology:** adev
> **Charter:** .context-index/specs/features/autonomous-bugfix-loop/charter.md
> **Spec:** .context-index/specs/features/autonomous-bugfix-loop/debug-completion-and-auto.spec.md
> **Review:** PASS_WITH_NOTES (2026-08-19)
> **Platform:** Node.js (ESM), JavaScript, npm, node:test

**Goal:** Give `/adev:debug` a transcript-provable `ADEV-DEBUG: FIXED | PARKED | UNREPRODUCIBLE` completion token and a non-interactive `--auto` mode that bounds Phase 1 reproduction attempts, skips the interactive ADR prompt, records failing-check evidence on the issue board, and resolves claim/release ownership from `ADEV_ISSUE_OWNER` so `/adev:bugfix-loop` can drive it unattended.

**Architecture:** This is a pure `SKILL.md`-prose change to `skills/debug/SKILL.md` (no new library code — per the spec's own System Constitution Reference) plus one bullet added to `skills/using-adev/SKILL.md`'s Persona Output Override carve-out. All six behaviors that touch `skills/debug/SKILL.md` land in that single file across five sequential tasks (each building on the shape the previous task left behind), followed by one task on `skills/using-adev/SKILL.md`, and closed out by a non-code coordination task. Tests are drift-guard assertions against the rendered SKILL.md text, following the existing `tests/skills/completion-tokens.test.mjs` precedent (`readFileSync` + `assert.match`/`assert.ok` against required substrings and section anchors) rather than runtime unit tests, because the artifact under test is markdown instruction, not executable code.

**Review-note resolutions carried into this plan:**
- **RI-1 (FAILING-CHECKS write mis-attributed to a branch that never calls `format-note`):** confirmed against the current `skills/debug/SKILL.md` Phase 6 step 4 — the PARKED/"annotate, do not close" branch today writes a **hardcoded literal string** (`"Fix applied but not yet validated — run /adev:validate"`) via a direct `update(id, { notes: ... })` call; it does not invoke `adev verify format-note` at all (only the HIGH-confidence closing branch does). Task 4 below fixes this at the root: it appends the `FAILING-CHECKS:` block to that same literal-string `update()` call — no separate write, no false claim that `format-note` is invoked on that branch. The spec's own text ("via the existing `adev verify format-note`/`IssueManager.update` call") is read as "the existing `IssueManager.update` call" being the operative half for this branch; `format-note` remains scoped to the closing branch only.
- **RI-2 (BEH-9 scoped only to Phase 1.6 claim; Phase 6 release still hardcodes `"${USER}/local"`):** confirmed — `skills/debug/SKILL.md:161` (claim) and `:173` (release) both currently hardcode the same literal, and the sibling `bugfix-loop-skill.spec.md` explicitly depends on both ends resolving to the same owner (`ADEV_ISSUE_OWNER=bugfix-loop`) for the claim/re-claim/release triple to stay idempotent. Task 5 below resolves the owner value **once** at Phase 1.6 entry and reuses that same resolved value at the Phase 6 release call, rather than re-deriving it — this is the fix, not a documentation-only note.
- **RI-3 (documentation gap on `--owner`/`ADEV_ISSUE_OWNER` fallback):** addressed as a documentation delta folded into Task 5 (same behavior, BEH-9) rather than a standalone task — see Task 5's Files list.

**Round-1 plan-review fixes (this revision):** the dispatched plan-reviewer found three defects in the first draft of this plan, fixed below:
1. Task 3's failing-test regex for the reproduction-attempt-limit default didn't match its own implementation text because the digit was wrapped in markdown bold (`default **3**` broke `\bdefault...3\b`). Fixed by dropping the bold markers around the digit.
2. Task 1's `--auto` ADR-skip branch hardcoded a generic `--action` label ("Architectural insight (auto mode)") with no room for the actual insight text, defeating BEH-5's purpose (a human browsing the note would learn nothing about what was found). Fixed: `--action` now carries a short description of the actual insight.
3. Task 1 said the insight note was appended "in the same `update()` call Phase 6 step 4 already makes" but neither task actually wired that hand-off. Fixed: Task 1's step 3 branch now explicitly computes the note and does NOT call `update()` itself; Task 4's step 4 edit (below) is the single call site that merges the step-3 insight note into whichever notes string it writes, for both the closing and the parking branch.

**Deferred from the round-3 spec review, not actioned here (PASS_WITH_NOTES permits this):** WR-2, BD-1 (open-ended insight text has no argv-safe delivery mechanism beyond what `--action` provides — accepted as-is, since `format-note`'s CLI surface is out of scope for this plan per the spec's own System Constitution Reference), and BD-2/RI-4 (no length cap on the issue `notes` field, now more pressing since this plan concatenates up to three sources — base note, `FAILING-CHECKS:`, and the insight note — into one string). A follow-up spec/task should add a bounded-length guard on `notes` if concatenation depth grows further. A short update to `debug-completion-and-auto.spec.md`'s BEH-9/AC-8 text (to state the `ADEV_ISSUE_OWNER` fix also covers the Phase 6 release call, per Task 5) is recommended but not required before implementation — the plan's own text is the operative source for Task 5's implementer either way.

---

## File Structure

**Modify:**
- `skills/debug/SKILL.md` — Arguments table (`--auto` flag), Phase 1 (bounded reproduction-attempt limit + `UNREPRODUCIBLE` exit), Phase 1.6 (owner resolution for claim), Phase 6 step 1 (failing-check-ID capture), Phase 6 step 3 (`--auto` skip-and-note), Phase 6 step 4 (owner resolution for release; `FAILING-CHECKS` write), new `### Completion token` section (all three states)
- `skills/using-adev/SKILL.md` — `## Persona Output Override` carve-out bullet, extended to name `ADEV-DEBUG`
- `templates/manifest-template.yaml` — document `tasks.bugfix_loop.reproduction_attempt_limit` (default 3), alongside the existing `bugfix_loop.attempt_cap` doc comment
- `docs/skill-reference.md` or `docs/cli-reference.md` (whichever already documents `/adev:debug`'s `--issue`/claim behavior — confirm at Task 5 time) — short note on `--owner`/`ADEV_ISSUE_OWNER` fallback (RI-3)

**Create:**
- `tests/skills/debug-completion-and-auto.test.mjs` — drift-guard suite covering BEH-1 through BEH-9

**Reference (read, do not modify):**
- `skills/validate/SKILL.md:588-595` — the `### Completion token (\`/goal\`-friendly)` section pattern to mirror (state→token mapping, "final line" rule, persona/verbosity exemption, subagent non-emission rule)
- `skills/build/SKILL.md:868-872` — second precedent for the same pattern, including a multi-state mapping table
- `.context-index/specs/cross-cutting/completion-tokens/completion-tokens.spec.md` — the pinned token grammar (`^ADEV-[A-Z]+: [A-Z_]+$`) this plan must not redefine
- `tests/skills/completion-tokens.test.mjs` — exact test style precedent (`readFileSync` + `assert.match`/`assert.ok`, `assertGrammar` helper)
- `lib/cli/verify.mjs:192-253` — `adev verify format-note` CLI surface (`formatConfidenceNote(action, confidence, details)`); confirms no `failingChecks` detail exists today, which is why Task 4 appends the block to the literal-string branch rather than extending this CLI verb (out of scope — see Task 4)
- `.context-index/specs/features/autonomous-bugfix-loop/per-issue-attempt-cap.spec.md` — the consumer of BEH-8's `FAILING-CHECKS:` block (`IssueManager.get(id).notes`) and BEH-9's `ADEV_ISSUE_OWNER` dependency; do not change that spec's own module (`lib/loop-convergence.mjs`) from here
- `.context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-skill.spec.md` — confirms the claim/re-claim/release ownership triple this plan's Task 5 must keep idempotent
- `templates/manifest-template.yaml:250-255` — existing `tasks.bugfix_loop.attempt_cap` doc-comment convention to mirror for `reproduction_attempt_limit`

---

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/autonomous-bugfix-loop/debug-completion-and-auto.spec.md` (BEH-5, Acceptance Criteria bullet 3)
- Charter: `.context-index/specs/features/autonomous-bugfix-loop/charter.md` (capability: `--auto` Mode on `/adev:debug`)
- Source files: `skills/debug/SKILL.md` (full read — Arguments section lines 10-18, Phase 6 step 3 lines 342-346)

### Task 2 Context
- Spec: `.context-index/specs/features/autonomous-bugfix-loop/debug-completion-and-auto.spec.md` (BEH-1, BEH-2, BEH-4, Postconditions bullet 1)
- Source files: `skills/validate/SKILL.md:588-595` (full read — pattern to mirror), `skills/build/SKILL.md:868-872` (full read — second precedent), `skills/debug/SKILL.md` Phase 6 (from Task 1, full read)
- Cross-cutting: `.context-index/specs/cross-cutting/completion-tokens/completion-tokens.spec.md` (token grammar, B6-B8)

### Task 3 Context
- Spec: `.context-index/specs/features/autonomous-bugfix-loop/debug-completion-and-auto.spec.md` (BEH-3, BEH-7, Preconditions bullets 4-5, Error Cases rows 1 and 3)
- Source files: `skills/debug/SKILL.md` Phase 1 (lines 48-82, full read), the new `### Completion token` section (from Task 2, full read)
- Template: `templates/manifest-template.yaml:250-255` (full read — doc-comment convention)

### Task 4 Context
- Spec: `.context-index/specs/features/autonomous-bugfix-loop/debug-completion-and-auto.spec.md` (BEH-5, BEH-8, Acceptance Criteria bullet 7)
- Source files: `skills/debug/SKILL.md` Phase 6 steps 1, 3, and 4 (from Task 1/2, full read — step 3's insight-note computation this task's step 4 edit must merge; the PARKED-path literal-string `update()` call this task extends)
- Sibling contract: `.context-index/specs/features/autonomous-bugfix-loop/per-issue-attempt-cap.spec.md` (Preconditions bullet 2, BEH-2 — `curr_blockers` consumer; export signatures only)

### Task 5 Context
- Spec: `.context-index/specs/features/autonomous-bugfix-loop/debug-completion-and-auto.spec.md` (BEH-9, Acceptance Criteria bullet 8)
- Source files: `skills/debug/SKILL.md` Phase 1.6 (lines 146-174, full read) and Phase 6 step 4 (from Task 4, full read)
- Sibling contract: `.context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-skill.spec.md` (Output Contract's claim/re-claim/release paragraph — full read, confirms the idempotency requirement)
- Docs: whichever of `docs/skill-reference.md` / `docs/cli-reference.md` documents `/adev:debug --issue` today (grep at task time; read the matching section only)

### Task 6 Context
- Spec: `.context-index/specs/features/autonomous-bugfix-loop/debug-completion-and-auto.spec.md` (BEH-6)
- Source files: `skills/using-adev/SKILL.md:135-143` (full read — `## Persona Output Override` section, the existing `ADEV-BUILD`/`ADEV-VALIDATE` carve-out bullet to extend)
- Reference: `tests/skills/completion-tokens.test.mjs:74-86` (full read — the existing test asserting this section names completion tokens; this task's suite addition follows the same shape for `ADEV-DEBUG`)

### Task 7 Context
- Spec: `.context-index/specs/features/autonomous-bugfix-loop/debug-completion-and-auto.spec.md` (Preconditions bullet 3, "its implementer should coordinate a small addition there rather than fork the grammar")
- Sibling: `.context-index/specs/cross-cutting/completion-tokens/completion-tokens.spec.md` (Actionable Task Map — the table this coordination note targets, owned by that spec's own implementer, not edited directly by this plan)

---

## Parallelization

- Group A (sequential — all edit `skills/debug/SKILL.md`, each building on the prior task's shape): Task 1 → Task 2 → Task 3 → Task 4
- Group A continued (sequential, same file, independent content region): Task 5 — runs after Task 4 only to avoid two agents editing `skills/debug/SKILL.md` concurrently; its Phase 1.6/Phase 6-step-4 edits do not depend on Task 3 or Task 4's content
- Group B (independent once Task 2 lands): Task 6 — touches only `skills/using-adev/SKILL.md`, needs just the `ADEV-DEBUG` token name to exist (from Task 2), not the full Phase 1/6 wiring
- Group C (fully independent, no code): Task 7 — board/spec coordination note, no file dependency on any other task

Effective order: Task 1 → Task 2 → {Task 3, Task 6 in either order} → Task 4 → Task 5, with Task 7 runnable at any point.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | `--auto` flag + Phase 6 step 3 skip-and-note | small | unit | — | 0 create, 1 modify |
| 2 | `ADEV-DEBUG` completion token (FIXED/PARKED) | small | unit | Task 1 | 1 create, 1 modify |
| 3 | Bounded reproduction-attempt limit + UNREPRODUCIBLE | medium | unit | Task 2 | 0 create, 2 modify |
| 4 | FAILING-CHECKS block on PARKED (fixes RI-1) | medium | unit | Task 2 | 0 create, 1 modify |
| 5 | ADEV_ISSUE_OWNER for claim + release (fixes RI-2) | small | unit | Task 4 | 0 create, 2 modify |
| 6 | Persona-exempt carve-out for ADEV-DEBUG | small | unit | Task 2 | 0 create, 1 modify |
| 7 | Coordinate completion-tokens.spec.md Task Map note | small | n/a (non-code) | — | 0 create, 0 modify |

---

## Task Structure

### Task 1: `--auto` flag + Phase 6 step 3 skip-and-note [specialist: none]

**Charter capability:** `--auto` Mode on `/adev:debug`
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/debug/SKILL.md:10-18` (Arguments section — add `--auto`)
- Modify: `skills/debug/SKILL.md:342-346` (Phase 6 step 3 — skip-and-note under `--auto`)

**Tests:** `tests/skills/debug-completion-and-auto.test.mjs` — new suite (per-behavior granularity, source: manifest `test_policy.granularity`). Covers BEH-5.

**Context to load:**
- `skills/debug/SKILL.md` Arguments section and Phase 6 step 3 (full read)
- `tests/skills/completion-tokens.test.mjs` (style precedent)

- [ ] **Write failing test**

```javascript
// tests/skills/debug-completion-and-auto.test.mjs
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");

test("debug SKILL.md declares --auto in the Arguments section (BEH-5)", () => {
  const md = read("skills/debug/SKILL.md");
  assert.match(
    md,
    /## Arguments[\s\S]{0,600}--auto/,
    "Arguments section must document --auto",
  );
});

test("debug SKILL.md skips the interactive ADR prompt under --auto and records a note instead (BEH-5)", () => {
  const md = read("skills/debug/SKILL.md");
  assert.match(
    md,
    /--auto[\s\S]{0,800}(skip|suppress)[\s\S]{0,400}(ADR|prompt)/i,
    "Phase 6 step 3 must skip the interactive ADR prompt under --auto",
  );
  assert.match(
    md,
    /--auto[\s\S]{0,1200}format-note|format-note[\s\S]{0,400}--auto/,
    "Phase 6 step 3's --auto branch must record the insight as a note via format-note rather than drafting an ADR",
  );
  assert.match(
    md,
    /insight description/i,
    "the format-note --action value must carry the actual insight description, not a generic hardcoded label",
  );
  assert.match(
    md,
    /Do not call `update\(\)` here/,
    "Phase 6 step 3 must not write to the issue itself — it hands the note to step 4's single update() call site",
  );
});
```

- [ ] **Verify test fails**

Run: `node --test -- tests/skills/debug-completion-and-auto.test.mjs`
Expected: FAIL — `Cannot find module 'tests/skills/debug-completion-and-auto.test.mjs'` (file does not exist yet)

- [ ] **Implement**

In `skills/debug/SKILL.md`'s `## Arguments` section, add:

```markdown
- `--auto`: non-interactive mode. No step in Phase 1 or Phase 6 blocks waiting for user input — every decision point that would otherwise prompt falls back to a deterministic default (see Phase 1's bounded reproduction limit and Phase 6 step 3 below). Intended for `/adev:bugfix-loop`'s unattended invocations.
```

In Phase 6 step 3 ("Consider drafting an ADR"), add an `--auto` branch before the existing interactive prompt:

```markdown
   - **Under `--auto`:** skip the interactive prompt entirely — there is no user present to answer it. If an architectural insight was detected, compute a confidence note carrying an insight description (not a generic label) via the existing `adev verify format-note` CLI verb:
     ```bash
     adev verify format-note --action "Architectural insight (auto mode): <one-sentence insight description>" --confidence low \
                             --spec-path <specPath>
     ```
     `<one-sentence insight description>` is the actual finding from this step (the unexpected coupling, missing abstraction, violated assumption, or technology constraint) — never the literal placeholder text. **Do not call `update()` here.** Phase 6 step 4 is the single call site that writes to the issue's `notes` field; hand this note's text to step 4, which appends it to whichever notes string it ends up writing (see Task 4). ADR authorship stays a deferred human follow-up; `--auto` never drafts one autonomously.
```

- [ ] **Verify test passes**

Run: `node --test -- tests/skills/debug-completion-and-auto.test.mjs`
Expected: PASS

- [ ] **Commit**

Branch (if not already created): `feat/autonomous-bugfix-loop/debug-completion-and-auto`

```bash
git add skills/debug/SKILL.md tests/skills/debug-completion-and-auto.test.mjs
git commit -m "feat(autonomous-bugfix-loop): add --auto flag and Phase 6 ADR-skip-and-note behavior to /adev:debug

Spec: .context-index/specs/features/autonomous-bugfix-loop/debug-completion-and-auto.spec.md
Plan-task: 1"
```

---

### Task 2: `ADEV-DEBUG` completion token (FIXED/PARKED) [specialist: none]

**Charter capability:** ADEV-DEBUG Completion Token
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `skills/debug/SKILL.md` (new `### Completion token` section, added after Phase 6 step 4; wire the FIXED/PARKED emission points)

**Tests:** `tests/skills/debug-completion-and-auto.test.mjs` — extend (per-behavior granularity; same suite). Covers BEH-1, BEH-2, BEH-4.

**Context to load:**
- `skills/validate/SKILL.md:588-595` (full read — pattern to mirror)
- `skills/build/SKILL.md:868-872` (full read — second precedent)
- `.context-index/specs/cross-cutting/completion-tokens/completion-tokens.spec.md` (token grammar)

- [ ] **Write failing test**

```javascript
const TOKEN_GRAMMAR = /^ADEV-[A-Z]+: [A-Z_]+$/;
function assertGrammar(token) {
  assert.ok(TOKEN_GRAMMAR.test(token), `token "${token}" must match ^ADEV-[A-Z]+: [A-Z_]+$`);
}

test("debug SKILL.md emits the ADEV-DEBUG completion token for FIXED and PARKED (BEH-1, BEH-2, BEH-4)", () => {
  const md = read("skills/debug/SKILL.md");
  for (const tok of ["ADEV-DEBUG: FIXED", "ADEV-DEBUG: PARKED"]) {
    assertGrammar(tok);
    assert.ok(md.includes(tok), `skills/debug/SKILL.md must instruct emitting "${tok}"`);
  }
  assert.match(
    md,
    /ADEV-DEBUG[\s\S]{0,400}?(final line|last line)|(final line|last line)[\s\S]{0,400}?ADEV-DEBUG/i,
    "debug SKILL.md must require the ADEV-DEBUG token as the final line of output",
  );
});
```

- [ ] **Verify test fails**

Run: `node --test -- tests/skills/debug-completion-and-auto.test.mjs`
Expected: FAIL — `ADEV-DEBUG: FIXED` not found in `skills/debug/SKILL.md`

- [ ] **Implement**

Add a new section to `skills/debug/SKILL.md` immediately after Phase 6 step 4, mirroring `skills/validate/SKILL.md:588-595`:

```markdown
### Completion token (`/goal`-friendly)

After Phase 6's confidence gate resolves, the **final line** of your chat output for this run MUST be the completion token — emit it verbatim:

- Phase 6 step 4 closed the issue with HIGH confidence (quality gates pass, fix verified against spec) → `ADEV-DEBUG: FIXED`
- Phase 6 step 4 annotated without closing (gates not run, failed, or fix unverified) → `ADEV-DEBUG: PARKED`
- Phase 1 exhausted its bounded reproduction-attempt limit under `--auto` without reproducing the symptom (see Phase 1) → `ADEV-DEBUG: UNREPRODUCIBLE`

Rules: emit it exactly once, as plain text (no code fence, no backticks, no trailing prose after it), regardless of the active persona or verbosity level. This is a transcript-provable marker so Claude Code's `/goal` evaluator and the sibling `/adev:bugfix-loop` skill can read completion from the transcript's last line (see `.context-index/specs/cross-cutting/completion-tokens/`). Subagents dispatched by this skill MUST NOT emit a completion-token-grammar line — only this top-level skill does.
```

Update Phase 6 step 4's two closing branches (HIGH confidence close, and the annotate-without-closing fallback) to note that the completion token above follows immediately after this step.

- [ ] **Verify test passes**

Run: `node --test -- tests/skills/debug-completion-and-auto.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/debug/SKILL.md tests/skills/debug-completion-and-auto.test.mjs
git commit -m "feat(autonomous-bugfix-loop): add ADEV-DEBUG completion token for FIXED/PARKED outcomes

Spec: .context-index/specs/features/autonomous-bugfix-loop/debug-completion-and-auto.spec.md
Plan-task: 2"
```

---

### Task 3: Bounded reproduction-attempt limit + UNREPRODUCIBLE [specialist: none]

**Charter capability:** ADEV-DEBUG Completion Token / `--auto` Mode on `/adev:debug`
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Files:**
- Modify: `skills/debug/SKILL.md:48-82` (Phase 1 — bounded attempt limit, `UNREPRODUCIBLE` exit, `NO_INVESTIGATION_TARGET` exit)
- Modify: `templates/manifest-template.yaml:250-255` (document `tasks.bugfix_loop.reproduction_attempt_limit`, default 3)

**Tests:** `tests/skills/debug-completion-and-auto.test.mjs` — extend. Covers BEH-3, BEH-7, the `NO_INVESTIGATION_TARGET` error case.

**Context to load:**
- `skills/debug/SKILL.md` Phase 1 (full read) and the new Completion token section (from Task 2, full read)
- `templates/manifest-template.yaml:250-255` (full read — doc-comment convention for the sibling `attempt_cap` key)

- [ ] **Write failing test**

```javascript
test("debug SKILL.md bounds --auto reproduction attempts and terminates UNREPRODUCIBLE (BEH-3, BEH-7)", () => {
  const md = read("skills/debug/SKILL.md");
  assert.match(
    md,
    /reproduction_attempt_limit/,
    "Phase 1 must reference tasks.bugfix_loop.reproduction_attempt_limit",
  );
  assert.match(md, /\bdefault(?:s|ing)? (?:of |to )?3\b/i, "default reproduction attempt limit must be 3");
  assert.ok(
    md.includes("ADEV-DEBUG: UNREPRODUCIBLE"),
    "Phase 1 must terminate with ADEV-DEBUG: UNREPRODUCIBLE when the bound is exhausted",
  );
  assert.match(
    md,
    /NO_INVESTIGATION_TARGET/,
    "Phase 1 must exit with NO_INVESTIGATION_TARGET under --auto when no target can be resolved",
  );
});

test("manifest template documents tasks.bugfix_loop.reproduction_attempt_limit", () => {
  const yaml = read("templates/manifest-template.yaml");
  assert.match(yaml, /reproduction_attempt_limit/);
});
```

- [ ] **Verify test fails**

Run: `node --test -- tests/skills/debug-completion-and-auto.test.mjs`
Expected: FAIL — `reproduction_attempt_limit` not found in either file

- [ ] **Implement**

In Phase 1, after step 2 ("Reproduce consistently"), add:

```markdown
2a. **Bounded reproduction attempts (`--auto` only).** Interactive mode keeps asking the user when reproduction fails — a human is present to redirect. Under `--auto`, track reproduction attempts against `tasks.bugfix_loop.reproduction_attempt_limit` (manifest-configurable, default 3). Each failed reproduction try counts as one attempt. When the limit is reached without a consistent reproduction, terminate Phase 1 immediately — do not proceed to Phase 2 or later — and emit `ADEV-DEBUG: UNREPRODUCIBLE` as the final line (see Completion token section). This is an intra-invocation counter, distinct from the sibling `per-issue-attempt-cap` spec's inter-invocation `AttemptRecord.attempts` — the two never share a counter or config key.

2b. **No investigation target (`--auto` only).** If `--auto` is passed but Phase 1 cannot resolve any investigation target — no `--issue` id, no `--error` symptom, and nothing inferable from context — exit immediately with a clear `NO_INVESTIGATION_TARGET` message rather than guessing or blocking on an interactive question `--auto` has no user present to answer.
```

Add to `templates/manifest-template.yaml`, near the existing `bugfix_loop.attempt_cap` comment block:

```yaml
  # bugfix_loop.reproduction_attempt_limit: bounded reproduction-try limit for
  #   /adev:debug --auto's Phase 1 (debug-completion-and-auto.spec.md). Default: 3.
  #   Distinct from bugfix_loop.attempt_cap (per-issue-attempt-cap.spec.md) — this
  #   counts intra-invocation reproduction tries, never leaving a single
  #   /adev:debug --auto run; attempt_cap counts completed invocations.
  # bugfix_loop:
  #   reproduction_attempt_limit: 3
```

- [ ] **Verify test passes**

Run: `node --test -- tests/skills/debug-completion-and-auto.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/debug/SKILL.md templates/manifest-template.yaml tests/skills/debug-completion-and-auto.test.mjs
git commit -m "feat(autonomous-bugfix-loop): bound /adev:debug --auto reproduction attempts and add UNREPRODUCIBLE exit

Spec: .context-index/specs/features/autonomous-bugfix-loop/debug-completion-and-auto.spec.md
Plan-task: 3"
```

---

### Task 4: FAILING-CHECKS block on PARKED (fixes RI-1) [specialist: none]

**Charter capability:** `--auto` Mode on `/adev:debug`
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Files:**
- Modify: `skills/debug/SKILL.md` Phase 6 step 1 (capture failing check IDs) and step 4 (make step 4 the single merge point for the `FAILING-CHECKS:` block from step 1 AND the insight note from Task 1's step 3, appended to whichever notes string step 4 writes — closing or parking)

**Tests:** `tests/skills/debug-completion-and-auto.test.mjs` — extend. Covers BEH-8, and closes the Task 1↔step 4 wiring gap for BEH-5.

**Context to load:**
- `skills/debug/SKILL.md` Phase 6 steps 1 and 4 (from Task 2, full read — specifically the current PARKED branch, which writes `notes: "Fix applied but not yet validated — run /adev:validate"` via a direct `update()` call with **no** `format-note` invocation)
- `.context-index/specs/features/autonomous-bugfix-loop/per-issue-attempt-cap.spec.md` (Preconditions bullet 2 — confirms the consumer reads `IssueManager.get(id).notes` for a `FAILING-CHECKS:` block)

- [ ] **Write failing test**

```javascript
test("debug SKILL.md writes a FAILING-CHECKS block into issue notes on the PARKED path under --auto (BEH-8, RI-1 fix)", () => {
  const md = read("skills/debug/SKILL.md");
  assert.match(md, /FAILING-CHECKS:/, "Phase 6 must define the FAILING-CHECKS: notes block");
  // RI-1: the FAILING-CHECKS write must land in the SAME update() call the
  // PARKED branch already makes -- not a separate write, and not a false
  // claim that format-note is invoked on this branch.
  assert.match(
    md,
    /Fix applied but not yet validated[\s\S]{0,400}FAILING-CHECKS|FAILING-CHECKS[\s\S]{0,400}Fix applied but not yet validated/,
    "the FAILING-CHECKS block must be appended to the existing PARKED-path notes string, in the same update() call",
  );
});

test("debug SKILL.md merges Phase 6 step 3's insight note into step 4's single update() call, for both the closing and parking branch (BEH-5/BEH-8 wiring)", () => {
  const md = read("skills/debug/SKILL.md");
  const step4Idx = md.indexOf("Update issue board with confidence");
  assert.ok(step4Idx !== -1, "Phase 6 step 4 heading must exist");
  const step4Window = md.slice(step4Idx, step4Idx + 2500);
  assert.match(
    step4Window,
    /insight note/i,
    "step 4 must reference merging step 3's insight note into its update() call(s)",
  );
  assert.match(
    step4Window,
    /FAILING-CHECKS[\s\S]{0,600}insight note|insight note[\s\S]{0,600}FAILING-CHECKS/i,
    "the PARKED branch must concatenate FAILING-CHECKS and the insight note in the same update() call",
  );
});
```

- [ ] **Verify test fails**

Run: `node --test -- tests/skills/debug-completion-and-auto.test.mjs`
Expected: FAIL — `FAILING-CHECKS:` not found

- [ ] **Implement**

In Phase 6 step 1 ("Run quality gates"), add a `--auto` sub-bullet:

```markdown
   - **Under `--auto`, on failure:** capture the failing checks as a stable, comparable, sorted set of IDs (e.g., failing test names, one per line, sorted). If the test runner's output cannot be parsed into discrete IDs, fall back to the raw failure output instead — the degraded-mode bounding of that raw text (hash, not full text) is the consuming `per-issue-attempt-cap` spec's responsibility, not this step's; this step only guarantees the raw text reaches the write in step 4 below.
```

Phase 6 step 4 becomes the single merge point for everything computed earlier in Phase 6 (step 1's failing checks, step 3's insight note from Task 1). Update both of its existing branches:

The HIGH-confidence closing branch (currently `update(id, { status: "closed", notes: "<confidence note>" })`):

```markdown
   - Update the issue: build the notes string as `<confidence note>`, and **if Phase 6 step 3 computed an insight note under `--auto`,** append it on its own line in the same call: `update(id, { status: "closed", notes: "<confidence note>" + (insightNote ? "\n" + insightNote : "") })`. Without an insight note, this is unchanged from today.
```

The "annotate, do not close" fallback branch — the one that currently reads:

```
If gates have not been run or fail, add a note but do not close: `update(id, { notes: "Fix applied but not yet validated — run /adev:validate" })`
```

becomes:

```markdown
   - If gates have not been run or fail, add a note but do not close. Build the notes string by concatenating, each on its own line, whichever of these apply — all in this one `update()` call: (1) the base literal `"Fix applied but not yet validated — run /adev:validate"`; (2) **under `--auto`, if step 1 captured failing checks,** a `FAILING-CHECKS: <sorted-json-array>` block (or the raw fallback text); (3) **under `--auto`, if Phase 6 step 3 computed an insight note,** that note text. Example with all three present:
     `update(id, { notes: "Fix applied but not yet validated — run /adev:validate\nFAILING-CHECKS: <sorted-json-array>\n<insight note>" })`
     Without `--auto`, or when neither step 1 nor step 3 produced anything extra, the notes string is unchanged from today.
```

- [ ] **Verify test passes**

Run: `node --test -- tests/skills/debug-completion-and-auto.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/debug/SKILL.md tests/skills/debug-completion-and-auto.test.mjs
git commit -m "fix(autonomous-bugfix-loop): write FAILING-CHECKS block into issue notes on the PARKED path under --auto

Fixes a review finding (RI-1): the PARKED-path notes update never called
format-note; the FAILING-CHECKS block now appends to that same
IssueManager.update() call instead of being falsely attributed to format-note.
Also makes Phase 6 step 4 the single merge point for step 3's insight note
(Task 1), closing the wiring gap the round-1 plan review flagged.

Spec: .context-index/specs/features/autonomous-bugfix-loop/debug-completion-and-auto.spec.md
Plan-task: 4"
```

---

### Task 5: ADEV_ISSUE_OWNER for claim + release (fixes RI-2) [specialist: none]

**Charter capability:** ADEV-DEBUG Completion Token / `--auto` Mode on `/adev:debug`
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 4
**Files:**
- Modify: `skills/debug/SKILL.md:146-174` (Phase 1.6 — resolve owner once; Phase 6 step 4 — reuse the same resolved owner for release)
- Modify: `docs/skill-reference.md` or `docs/cli-reference.md` (RI-3 — document the `ADEV_ISSUE_OWNER` fallback; confirm the correct file by grepping for the existing `/adev:debug --issue` documentation before editing)

**Tests:** `tests/skills/debug-completion-and-auto.test.mjs` — extend. Covers BEH-9.

**Context to load:**
- `skills/debug/SKILL.md` Phase 1.6 (full read) and Phase 6 step 4 (from Task 4, full read)
- `.context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-skill.spec.md` (Output Contract's claim/re-claim/release paragraph, full read)

- [ ] **Write failing test**

```javascript
test("debug SKILL.md resolves ADEV_ISSUE_OWNER for both claim and release (BEH-9, RI-2 fix)", () => {
  const md = read("skills/debug/SKILL.md");
  assert.match(md, /ADEV_ISSUE_OWNER/, "Phase 1.6 must document ADEV_ISSUE_OWNER resolution");
  // RI-2: the same resolved owner value must be reused at the release call,
  // not re-derived as a second hardcoded "${USER}/local" literal.
  const claimIdx = md.indexOf("adev issues claim");
  const releaseIdx = md.indexOf("adev issues release");
  assert.ok(claimIdx !== -1 && releaseIdx !== -1, "both claim and release commands must be present");
  const releaseWindow = md.slice(releaseIdx, releaseIdx + 400);
  assert.match(
    releaseWindow,
    /ADEV_ISSUE_OWNER|resolved owner|same owner/i,
    "the release command must reuse the ADEV_ISSUE_OWNER-resolved owner, not a fresh hardcoded literal",
  );
});
```

- [ ] **Verify test fails**

Run: `node --test -- tests/skills/debug-completion-and-auto.test.mjs`
Expected: FAIL — `ADEV_ISSUE_OWNER` not found

- [ ] **Implement**

In Phase 1.6, before the "Claim it:" bash block, add owner resolution and reuse it in both the claim and (via a forward reference) release commands:

```markdown
**Resolve the owner:** read the `ADEV_ISSUE_OWNER` environment variable. If set, use it as the owner for both this claim and Phase 6's matching release. If unset, fall back to `"${USER}/local"`, unchanged from today. Resolve once, here, and reuse the same value at release time — do not re-derive it independently at Phase 6, which would defeat the point of the env var when it differs turn to turn (e.g., `/adev:bugfix-loop` setting `ADEV_ISSUE_OWNER=bugfix-loop` for the duration of one `/adev:debug --auto` invocation).

**Claim it:**

\`\`\`bash
adev issues claim <issue-id> --owner "${ADEV_ISSUE_OWNER:-${USER}/local}" --branch "$(git branch --show-current)"
\`\`\`
```

At Phase 6's release call, replace the hardcoded literal with the same resolved value:

```markdown
Release the claim in Phase 6, once the fix is recorded, using the **same owner value resolved in Phase 1.6**:

\`\`\`bash
adev issues release <issue-id> --owner "${ADEV_ISSUE_OWNER:-${USER}/local}"
\`\`\`
```

For RI-3, add a short note to whichever doc file already covers `/adev:debug --issue` (confirmed by grep at task time — likely `docs/skill-reference.md`'s `/adev:debug` entry):

```markdown
`--issue <id>` claims/releases ownership using `ADEV_ISSUE_OWNER` when set in the environment, falling back to `"${USER}/local"` otherwise. `/adev:bugfix-loop` sets `ADEV_ISSUE_OWNER=bugfix-loop` for its own invocations so its own claim and `/adev:debug`'s internal re-claim/release resolve to the same owner.
```

- [ ] **Verify test passes**

Run: `node --test -- tests/skills/debug-completion-and-auto.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/debug/SKILL.md docs/skill-reference.md tests/skills/debug-completion-and-auto.test.mjs
git commit -m "fix(autonomous-bugfix-loop): resolve ADEV_ISSUE_OWNER once and reuse it for both claim and release

Fixes a review finding (RI-2): the Phase 6 release call still hardcoded
\"\${USER}/local\" even when ADEV_ISSUE_OWNER was set for the claim, risking
CLAIM_OWNER_MISMATCH for /adev:bugfix-loop's unattended invocations. Also
documents the --owner/ADEV_ISSUE_OWNER fallback (RI-3).

Spec: .context-index/specs/features/autonomous-bugfix-loop/debug-completion-and-auto.spec.md
Plan-task: 5"
```

---

### Task 6: Persona-exempt carve-out for ADEV-DEBUG [specialist: none]

**Charter capability:** ADEV-DEBUG Completion Token
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Files:**
- Modify: `skills/using-adev/SKILL.md:135-143` (`## Persona Output Override` — extend the completion-tokens bullet to name `ADEV-DEBUG`)

**Tests:** `tests/skills/debug-completion-and-auto.test.mjs` — extend. Covers BEH-6.

**Context to load:**
- `skills/using-adev/SKILL.md:135-143` (full read)
- `tests/skills/completion-tokens.test.mjs:74-86` (existing test asserting this section names completion tokens generically)

- [ ] **Write failing test**

```javascript
test("using-adev persona overlay names ADEV-DEBUG as persona-exempt (BEH-6)", () => {
  const md = read("skills/using-adev/SKILL.md");
  assert.match(md, /## Persona Output Override/);
  assert.match(
    md,
    /ADEV-DEBUG/,
    "the persona overlay must explicitly name ADEV-DEBUG in the completion-token exemption bullet",
  );
});
```

- [ ] **Verify test fails**

Run: `node --test -- tests/skills/debug-completion-and-auto.test.mjs`
Expected: FAIL — `ADEV-DEBUG` not found in `skills/using-adev/SKILL.md`

- [ ] **Implement**

In `skills/using-adev/SKILL.md`'s `## Persona Output Override` section, update the completion-tokens bullet:

```markdown
- **Completion tokens** — the `/goal`-friendly terminal markers emitted by `/adev:build` (`ADEV-BUILD: <STATE>`), `/adev:validate` (`ADEV-VALIDATE: <STATE>`), and `/adev:debug` (`ADEV-DEBUG: <STATE>`) — are always emitted verbatim as the final line of output regardless of persona or verbosity. Persona and verbosity rules MUST NOT trim, reword, translate, summarize away, or fence them; like disk artifacts, they are exempt from persona adaptation (see `.context-index/specs/cross-cutting/completion-tokens/`).
```

- [ ] **Verify test passes**

Run: `node --test -- tests/skills/debug-completion-and-auto.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/using-adev/SKILL.md tests/skills/debug-completion-and-auto.test.mjs
git commit -m "feat(autonomous-bugfix-loop): extend persona-exempt carve-out to ADEV-DEBUG completion token

Spec: .context-index/specs/features/autonomous-bugfix-loop/debug-completion-and-auto.spec.md
Plan-task: 6"
```

---

### Task 7: Coordinate completion-tokens.spec.md Task Map note [specialist: none] [REQUIRES NO CODE CHANGE]

**Charter capability:** ADEV-DEBUG Completion Token
**Strategy:** n/a — non-code coordination action, no source files touched by this plan
**Depends on:** —
**Files:** none (this plan does not edit `.context-index/specs/cross-cutting/completion-tokens/completion-tokens.spec.md` — that spec's Task Map is owned by its own implementer, per this spec's own Preconditions bullet 3: "its implementer should coordinate a small addition there rather than fork the grammar")

**Tests:** none — this task produces no testable code artifact.

- [ ] **Coordinate**

After Tasks 1-6 land, file a board note (via `/adev:issues` or a direct `adev issues create` if `tasks.backend` is configured) addressed to the `completion-tokens` cross-cutting charter, requesting that its Task Map gain a row noting `debug` as a third terminal skill covered (alongside `build`/`validate`), referencing this plan's completed work. Do not edit `completion-tokens.spec.md` directly from this plan — that spec is owned elsewhere and this plan's spec explicitly defers the edit to its owner.

- [ ] **Commit**

No commit — this task's only artifact is the board note (or an equivalent message to the `completion-tokens` spec's owner), not a source-file change.

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

Per `.context-index/governance/gates.yaml`:
- `test` gate (tier: fast, severity: error): `npm test`

Additional acceptance criteria to verify manually (not covered by a deterministic gate command):
- `^ADEV-[A-Z]+: [A-Z_]+$` grammar holds for all three new states (`FIXED`, `PARKED`, `UNREPRODUCIBLE`) — verified by the `assertGrammar` helper in `tests/skills/debug-completion-and-auto.test.mjs`, not just visual inspection
- Token is persona-exempt, verified across Product and Architect personas — manual spot-check per Acceptance Criteria bullet 5 (no automated persona-simulation harness exists in this repo)
- No constitutional violations introduced — pure `SKILL.md` prose plus manifest-template documentation and one docs note; no new dependencies, no hook-protocol or CLI-install-path changes
- Provider mirrors (`providers/*/skills/debug`, `providers/*/skills/using-adev`) are regenerated via `scripts/sync-provider-skills.mjs` after Tasks 1-6 land, per the existing sync convention (out of scope for this plan's own tasks — a downstream sync step, not a new task)
