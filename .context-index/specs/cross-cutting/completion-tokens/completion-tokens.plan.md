# Implementation Plan: Terminal Completion Tokens

> **Methodology:** adev
> **Charter:** .context-index/specs/cross-cutting/completion-tokens/charter.md
> **Spec:** .context-index/specs/cross-cutting/completion-tokens/completion-tokens.spec.md
> **Review:** PASS_WITH_NOTES (2026-06-02)
> **Platform:** Node.js (ESM, .mjs), node:test, zero external deps

**Goal:** Make `/adev:build` and `/adev:validate` emit a persona-independent, transcript-provable terminal token (`ADEV-<SKILL>: <STATE>`) so Claude Code's `/goal` evaluator can read completion from the transcript.

**Architecture:** This is a SKILL.md-prose change (constitution principle 2 — skills are primarily markdown), not code. Each terminal skill gains a final-line output directive; the persona overlay gains an exemption clause. The TDD "test" is a grep-based directive-assertion test (`node:test`), following the existing `tests/skills-no-inline-node.test.mjs` pattern — it asserts the canonical `skills/*/SKILL.md` carry the directives and the exact token grammar. Provider mirrors (`providers/*/skills/`) are regenerated from the canonical skills via `scripts/sync-provider-skills.mjs`.

---

## File Structure

**Create:**
- `tests/skills/completion-tokens.test.mjs` — directive-assertion drift-guard test

**Modify:**
- `skills/validate/SKILL.md` — add the `ADEV-VALIDATE: PASS|FAIL` final-line directive to the report-to-user section
- `skills/build/SKILL.md` — add the `ADEV-BUILD: COMPLETE|FAILED|BLOCKED` final-line directive + the convergence-verdict→state mapping to the terminal report
- `skills/using-adev/SKILL.md` — add completion tokens as a persona-exempt output class in `## Persona Output Override`
- `docs/concepts.md` — document the completion-token convention + a worked `/goal` example
- `providers/*/skills/{validate,build,using-adev}/SKILL.md` — regenerated (not hand-edited) via the sync script

**Reference (read, do not modify):**
- `tests/skills-no-inline-node.test.mjs` — follow this grep-over-SKILL.md test pattern
- `lib/loop-convergence.mjs` — the convergence verdicts the BLOCKED state maps from
- `scripts/sync-provider-skills.mjs` — mirror regeneration

## Context Packets

### Task 1 Context (test)
- Spec: behaviors B1–B8, acceptance criteria
- Pattern: `tests/skills-no-inline-node.test.mjs` (grep-over-SKILL.md, node:test)

### Task 2 Context (validate directive)
- Spec: B1, B2, B6, B7, B8
- File: `skills/validate/SKILL.md` "Report to User" / overall-status section

### Task 3 Context (build directive + mapping)
- Spec: B3, B4, B5, B7, B8; pinned BLOCKED↔convergence mapping
- Files: `skills/build/SKILL.md` terminal report; `lib/loop-convergence.mjs` (verdict names: BUDGET_EXHAUSTED, NO_PROGRESS, REGRESSED, PASS_PENDING_HUMAN); config `build.max_review_retries`

### Task 4 Context (persona exemption)
- Spec: B6; `skills/using-adev/SKILL.md` `## Persona Output Override` (existing disk-artifact carve-out)

### Task 5 Context (docs + mirrors)
- Spec: T4; `docs/concepts.md`; `scripts/sync-provider-skills.mjs`

## Parallelization

- Task 1 (test) first — establishes RED.
- Tasks 2, 3, 4 are independent (different SKILL.md files) — may run in parallel; each turns part of Task 1's test green.
- Task 5 (docs + mirror sync) last — depends on 2/3/4 landing.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Drift-guard directive test (RED) | small | unit | — | 1 create |
| 2 | ADEV-VALIDATE directive in validate SKILL.md | small | unit | — | 1 modify |
| 3 | ADEV-BUILD directive + convergence mapping in build SKILL.md | medium | unit | — | 1 modify |
| 4 | Persona-exempt clause for completion tokens | small | unit | — | 1 modify |
| 5 | Docs + provider-mirror sync | small | unit | 2, 3, 4 | 1 modify + regen |

## Task Structure

### Task 1: Drift-guard directive test (RED) [specialist: none]

**Charter capability:** evaluator-matchability / determinism (the test pins the grammar and presence).
**Strategy:** unit (source: fallback)
**Files:**
- Create: `tests/skills/completion-tokens.test.mjs`
**Tests:** `tests/skills/completion-tokens.test.mjs`

- [ ] **Write failing test.** Assert, by reading the canonical SKILL.md files:
  - `skills/validate/SKILL.md` contains a directive emitting `ADEV-VALIDATE: PASS` and `ADEV-VALIDATE: FAIL` as the final line.
  - `skills/build/SKILL.md` contains a directive emitting `ADEV-BUILD: COMPLETE`, `ADEV-BUILD: FAILED`, and `ADEV-BUILD: BLOCKED`, and names the convergence verdicts that map to BLOCKED.
  - `skills/using-adev/SKILL.md` `## Persona Output Override` lists completion tokens as persona-exempt.
  - All literal tokens match the grammar `^ADEV-[A-Z]+: [A-Z_]+$`.
- [ ] **Verify test fails.** Run `node --test tests/skills/completion-tokens.test.mjs` → FAIL (directives absent).
- [ ] **Commit** (with the implementation tasks, or as a RED commit per write-test conventions).

### Task 2: ADEV-VALIDATE directive [specialist: none]

**Charter capability:** validate token (B1, B2).
**Strategy:** unit
**Files:**
- Modify: `skills/validate/SKILL.md` (overall-status / report-to-user section)
**Tests:** `tests/skills/completion-tokens.test.mjs`

- [ ] Add a directive: after computing the overall verdict, emit `ADEV-VALIDATE: PASS` (all checks passed) or `ADEV-VALIDATE: FAIL` (any failed) as the **final line** of chat output, verbatim, regardless of persona/verbosity (B6, B7), exactly once (B8).
- [ ] Verify Task 1's validate assertions pass.
- [ ] Commit.

### Task 3: ADEV-BUILD directive + convergence mapping [specialist: none]

**Charter capability:** build token + BLOCKED mapping (B3–B5).
**Strategy:** unit
**Files:**
- Modify: `skills/build/SKILL.md` (terminal report, after the pipeline resolves)
**Tests:** `tests/skills/completion-tokens.test.mjs`

- [ ] Add a directive: emit `ADEV-BUILD: COMPLETE` (all steps done + terminal validate PASS), `ADEV-BUILD: FAILED` (non-review step errored), or `ADEV-BUILD: BLOCKED` (review unresolved) as the final line. Pin BLOCKED to convergence verdicts `BUDGET_EXHAUSTED | NO_PROGRESS | REGRESSED | PASS_PENDING_HUMAN` or `build.max_review_retries == 0`. Persona-independent, last line, once (B6–B8).
- [ ] Verify Task 1's build assertions pass.
- [ ] Commit.

### Task 4: Persona-exempt clause [specialist: none]

**Charter capability:** persona-independence (B6).
**Strategy:** unit
**Files:**
- Modify: `skills/using-adev/SKILL.md` (`## Persona Output Override`)
**Tests:** `tests/skills/completion-tokens.test.mjs`

- [ ] Add a new bullet to the persona-exempt carve-out: completion tokens (`ADEV-<SKILL>: <STATE>`) are always emitted verbatim, never trimmed/reworded/fenced by persona or verbosity — same exemption disk artifacts already have.
- [ ] Verify Task 1's persona assertion passes.
- [ ] Commit.

### Task 5: Docs + provider-mirror sync [specialist: none]

**Depends on:** Task 2, Task 3, Task 4
**Charter capability:** documentation + mirror parity.
**Strategy:** unit
**Files:**
- Modify: `docs/concepts.md` (or a short unattended-runs note)
- Regenerate: `providers/*/skills/{validate,build,using-adev}/SKILL.md`
**Tests:** `tests/skills/completion-tokens.test.mjs` (full suite green)

- [ ] Document the completion-token convention and a worked `/goal` example (e.g. `/goal /adev:build --auto --spec <p> ran and the transcript contains "ADEV-BUILD: COMPLETE" and "ADEV-VALIDATE: PASS"`). Note the persona-exemption precedent (SEC-2).
- [ ] Run `node scripts/sync-provider-skills.mjs` to regenerate provider mirrors from the canonical skills.
- [ ] Verify full test suite passes: `npm test`.
- [ ] Commit.

---

## Quality Gates

After all tasks, `/adev:validate` verifies the full suite. Results land in `.validate.md`, not here.

- Tests pass: `npm test`
- No inline-Node introduced into SKILL.md: `tests/skills-no-inline-node.test.mjs` (the directive is plain prose, not executable — must stay clean)
- All acceptance criteria from the spec satisfied (B1–B8 + provider-mirror parity)
- No constitutional violations (zero new deps; markdown-only change)

## Notes from review (PASS_WITH_NOTES, carried forward)

- SA-3: Task 1's test asserts the exact grammar string and final-line directive context, not mere presence — strengthens the drift guard.
- SEC-2: Task 5 documents the persona-exemption precedent so future exemptions are deliberate.
- CHR-1: optional — align the charter's Affected Modules wording (`output-personas` → `setup`); cosmetic, not blocking.
