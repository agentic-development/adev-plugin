---
charter: completion-tokens
kind: behavioral
status: implemented
affects: [strategic-planning, validation, setup]
mode: cross-cutting
revision: 1
charter-revision: 2
created: 2026-06-02
updated: 2026-06-03
tracker-ref: issue-540
source-manifest:
  sha: "7e2eeff"
  files:
    - docs/concepts.md
    - skills/build/SKILL.md
    - skills/using-adev/SKILL.md
    - skills/validate/SKILL.md
    - tests/skills/completion-tokens.test.mjs
  computed-at: "2026-06-03T00:03:40.302Z"
---

# Live Spec: Terminal Completion Tokens

Defines the behavioral contract for the `/goal`-friendly completion tokens that `/adev:build` and `/adev:validate` emit. The tokens are a fixed, transcript-provable marker so Claude Code's built-in `/goal` evaluator (which sees only the transcript) can read completion reliably. Implements the `completion-tokens` cross-cutting charter (Option 2 of `.context-index/research/goal-command-adoption.md`).

## Behavioral Contract

**Token grammar.** A completion token is a single line matching `^ADEV-[A-Z]+: [A-Z_]+$` — uppercase skill name, one `: ` separator, an uppercase state from a closed per-skill enum. It is emitted as plain text (NOT inside a code fence or backticks) so it appears verbatim in the rendered transcript the evaluator reads.

- **B1 — validate PASS.** When `/adev:validate` finishes with an overall verdict of PASS (all dispatched checks passed), then the **last line** of its chat output is exactly `ADEV-VALIDATE: PASS`.
- **B2 — validate FAIL.** When `/adev:validate` finishes with overall FAIL (any check failed, including a fail-fast quality-gate failure), then the last line of its chat output is exactly `ADEV-VALIDATE: FAIL`.
- **B3 — build COMPLETE.** When `/adev:build` runs every required pipeline step to completion and the terminal validate step reports PASS, then the last line of its chat output is exactly `ADEV-BUILD: COMPLETE`.
- **B4 — build FAILED.** When `/adev:build` terminates because a non-review step errored (implement/validate/plan/etc. returned a failure that halts the pipeline), then the last line of its chat output is exactly `ADEV-BUILD: FAILED`.
- **B5 — build BLOCKED.** When `/adev:build` terminates without reaching `COMPLETE` because of an unresolved review state, then the last line of its chat output is exactly `ADEV-BUILD: BLOCKED`. This covers two terminal cases from the convergence detector (`lib/loop-convergence.mjs`): (a) the BLOCK→revise loop stopped on a stop verdict (`BUDGET_EXHAUSTED`, `NO_PROGRESS`, or `REGRESSED`), or `build.max_review_retries` was `0` so the first BLOCK is terminal; and (b) the loop reached PASS but halted on `PASS_PENDING_HUMAN` (the `--require-human-final-pass` path) awaiting operator sign-off. In both cases the pipeline has not reached `COMPLETE`, so `BLOCKED` is the honest terminal token; the human-pending case is distinguished in the prose above the token, not in the token enum.
- **B6 — persona-independence.** When any persona (Product / Developer / Architect) or verbosity level is active, then the completion-token line is emitted verbatim and unmodified. Persona and verbosity rules MUST NOT trim, reword, translate, summarize away, or fence the token.
- **B7 — last-line anchoring.** When a terminal skill emits a completion token, then it is the final line of that skill's chat output for the run — no prose, blank-line-trailed sign-off, or follow-up question appears after it — so a transcript reader can anchor on it deterministically.
- **B8 — exactly one token per terminal run.** A single `/adev:build` or `/adev:validate` invocation emits its completion token exactly once, at terminal state. Intermediate per-step progress lines are not tokens and must not match the token grammar. Subagents dispatched by these skills (implement/validate-check/reviewer subagents) MUST NOT emit a completion-token-grammar line — only the top-level terminal skill emits the token, so a transcript reader anchored on the last match is never misled by an inner dispatch.

**Persona-independence mechanism (pinned).** The mechanism is a **per-SKILL.md output directive plus a persona-overlay exemption clause** — not a change to the persona template renderer:

1. Each terminal SKILL.md (`build`, `validate`) gains an explicit instruction in its report/output section: "Emit `ADEV-<SKILL>: <STATE>` as the final line, verbatim, regardless of active persona or verbosity."
2. The persona overlay (the `## Persona Output Override` section consumed at session start, mirrored from `skills/using-adev/SKILL.md`) gains a clause adding completion tokens to the existing "always emitted regardless of persona" carve-out that today covers on-disk artifacts. Completion tokens join disk artifacts as persona-exempt output.

**BLOCKED↔convergence-verdict mapping (pinned).** `ADEV-BUILD: BLOCKED` is the terminal token **iff** the build stopped on an unresolved review state. Concretely, the build's terminal status is BLOCKED when the review step's final convergence verdict ∈ {`BUDGET_EXHAUSTED`, `NO_PROGRESS`, `REGRESSED`, `PASS_PENDING_HUMAN`}, or `build.max_review_retries == 0` and review returned BLOCK. A `PASS`/`PASS_WITH_NOTES` convergence verdict continues the pipeline (eventually `COMPLETE`); a non-review step error yields `FAILED`. (`PASS_PENDING_HUMAN` is a genuine *halt awaiting operator sign-off* under `--require-human-final-pass`, not a defect — but the pipeline has not reached `COMPLETE`, so the token reports `BLOCKED`.)

## System Constitution Reference

- **Principle 2 — Skills are primarily markdown.** The tokens are implemented as SKILL.md output prose; no companion code is required for the behavior to function. ✓ The directive is markdown instruction the skill follows when printing its terminal report.
- **Principle 1 — Minimize external dependencies.** Zero new runtime code and zero new dependencies — the change is prose in two SKILL.md files plus a persona-overlay clause and documentation. ✓
- **Principle 3 — Pure ESM.** No code change, so no module-system impact. Any optional test added uses `node:test`. ✓

## Module Impact Map

| Module | Impact | Changes Required |
|---|---|---|
| `validation` (`skills/validate/SKILL.md`) | Low | Add a final-line directive: emit `ADEV-VALIDATE: PASS\|FAIL` from the overall verdict (Behaviors B1–B2, B6–B8). |
| `strategic-planning` (`skills/build/SKILL.md`) | Low | Add a final-line directive: emit `ADEV-BUILD: COMPLETE\|FAILED\|BLOCKED` from terminal status, with the convergence→BLOCKED mapping (Behaviors B3–B8). |
| `setup` (persona overlay in `skills/using-adev/SKILL.md` `## Persona Output Override`) | Low | Add completion tokens as a new bullet in the persona-exempt output carve-out, alongside disk artifacts (Behavior B6). |
| docs | Low | Document the token convention and a worked `/goal` example (e.g. in `docs/concepts.md` or a new unattended-runs guide). |

## Integration Points

1. **build ↔ `lib/loop-convergence.mjs`.** `/adev:build` maps the review step's terminal convergence verdict to the `BLOCKED` state (B5). The mapping reads the existing verdict; it does not change convergence logic.
2. **build ↔ validate.** `ADEV-BUILD: COMPLETE` requires the build's embedded validate step to have reported PASS — the build token is consistent with the validate token for the same run.
3. **terminal skills ↔ persona overlay.** Completion tokens are persona-exempt, exactly like on-disk artifacts (`.validate.md`, plans) already are. This reuses the existing exemption concept rather than inventing a new mechanism.

## Actionable Task Map

| Task | Description | Complexity |
|---|---|---|
| T1 | Add the `ADEV-VALIDATE: PASS\|FAIL` final-line directive to `skills/validate/SKILL.md` (and its provider mirrors) | Low |
| T2 | Add the `ADEV-BUILD: COMPLETE\|FAILED\|BLOCKED` final-line directive + convergence→BLOCKED mapping to `skills/build/SKILL.md` (and mirrors) | Low |
| T3 | Add the persona-exempt clause for completion tokens to the persona overlay (`skills/using-adev/SKILL.md` `## Persona Output Override`) | Low |
| T4 | Document the convention + a worked `/goal` example in user docs | Low |
| T5 | Add a test asserting both terminal SKILL.md files contain their token directive and the grammar string (drift guard) | Low |

## Visual Expectations

Not applicable — this concern produces a plain-text terminal line, not UI. The only "visual" requirement is that the token renders as plain text (not inside a fenced code block) so the transcript evaluator matches it.

## Acceptance Criteria

- [ ] `skills/validate/SKILL.md` instructs emitting `ADEV-VALIDATE: PASS` / `ADEV-VALIDATE: FAIL` as the final chat line, mapped from the overall verdict (B1, B2).
- [ ] `skills/build/SKILL.md` instructs emitting `ADEV-BUILD: COMPLETE` / `FAILED` / `BLOCKED` as the final chat line, with the `BLOCKED` state pinned to the convergence stop-verdicts / `max_review_retries == 0` (B3–B5).
- [ ] The persona overlay lists completion tokens as persona/verbosity-exempt output, alongside disk artifacts (B6).
- [ ] Every defined token matches `^ADEV-[A-Z]+: [A-Z_]+$` and is emitted as plain text, last line, exactly once per terminal run (B7, B8).
- [ ] User docs describe the convention and show a `/goal` condition referencing the literal tokens.
- [ ] A test asserts both terminal SKILL.md files contain their token directive (drift guard, T5).
- [ ] Provider mirrors (`providers/*/skills/{build,validate}`) carry the same directive, per version/mirror parity.
- [ ] All quality gates pass; no constitutional violations.
