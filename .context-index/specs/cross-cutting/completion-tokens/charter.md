---
status: draft
kind: cross-cutting
revision: 1
updated: 2026-06-02
tracker-ref: issue-540
---

# Cross-Cutting Charter: Completion Tokens

## Business Intent

adev's terminal skills (`/adev:build`, `/adev:validate`) report completion through prose and persona-adapted chat output, which varies run to run. Claude Code's built-in `/goal` command drives a session across turns until a small evaluator model (Haiku) confirms a completion condition — but the evaluator **cannot run tools or read files; it only judges what a skill surfaced in the transcript** (see `.context-index/research/goal-command-adoption.md`). Without a stable, machine-checkable marker, a `/goal` condition over an adev pipeline is unreliable because the evaluator must guess from changing prose. This concern standardizes a **transcript-provable completion token** that build and validate always print, so a goal condition can match it verbatim. It is the implementation of Option 2 from the `/goal` adoption research.

## Scope

### In Scope

- A standard completion-token grammar: `ADEV-<SKILL>: <STATE>` — uppercase, single line, emitted as the **last line** of the skill's chat output.
- `/adev:build` emits a terminal `ADEV-BUILD: <STATE>` line where STATE ∈ `COMPLETE | FAILED | BLOCKED`.
- `/adev:validate` emits a terminal `ADEV-VALIDATE: <STATE>` line where STATE ∈ `PASS | FAIL`.
- The token is emitted **unconditionally and persona/verbosity-independently** — it is never trimmed, reworded, or suppressed by the active persona or verbosity dial (parity with the existing "disk artifacts always use full format" rule).
- User-facing documentation of the convention so operators can write `/goal` conditions against it (e.g. `/goal /adev:build --auto … has run and the transcript contains "ADEV-BUILD: COMPLETE" and "ADEV-VALIDATE: PASS"`).

### Out of Scope

- Implementing, wrapping, or reimplementing `/goal` itself — it is a harness primitive, not adev's to build (research Option 3, rejected).
- Completion tokens for non-terminal or supporting skills (`eval`, `deploy`, `implement`, `review-specs`, …). The same grammar can be extended to them later; this charter governs only build + validate.
- Changing adev's deterministic gates, verdicts, or retry logic. Tokens **report** the existing terminal verdict; they never **decide** it.
- Any change to on-disk artifact formats (`.validate.md`, `.plan.md`, build-state JSON, lifecycle event logs).

## Affected Modules

| Module | Impact (high / medium / low) | Changes Required |
|---|---|---|
| `strategic-planning` (`skills/build/SKILL.md`) | low | Add a final `ADEV-BUILD: <STATE>` line to the orchestrator's terminal report, mapped from the pipeline's terminal status. |
| `validation` (`skills/validate/SKILL.md`) | low | Add a final `ADEV-VALIDATE: PASS\|FAIL` line mapped from the overall validation verdict. |
| `output-personas` (persona/verbosity overlay) | low | Exempt the completion-token line from persona/verbosity trimming — it is always printed verbatim, like disk artifacts. |

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|---|---|---|
| `ADEV-<SKILL>: <STATE>` | convention | Uppercase, single-line, last-line-of-output terminal marker. `<SKILL>` is the terminal skill name; `<STATE>` is from that skill's fixed enum. |
| build state enum | convention | `COMPLETE` (pipeline finished, validate passed) · `FAILED` (a step errored) · `BLOCKED` (review BLOCK with no retry budget). |
| validate state enum | convention | `PASS` (all dispatched checks passed) · `FAIL` (any check failed). |
| persona-independence rule | convention | Completion tokens are emitted regardless of active persona or verbosity; persona rules MUST NOT trim or reword them. |

### Consumed APIs

| Interface | Source Module | Description |
|---|---|---|
| terminal build status | `strategic-planning` (`/adev:build`) | The pipeline's final status (complete / failed / blocked) that maps to the build token STATE. |
| overall validation verdict | `validation` (`/adev:validate`) | The aggregate PASS/FAIL the validate token reports. |

## Quality Attributes

| Attribute | Requirement |
|---|---|
| Determinism | The token is a fixed verbatim string from a closed STATE enum — no prose variation between runs. |
| Persona-independence | Always emitted regardless of persona or verbosity dial (parity with the disk-artifact rule in the output-personas charter). |
| Evaluator-matchability | A plain-English `/goal` condition referencing the literal token (e.g. `"ADEV-VALIDATE: PASS"`) matches reliably from the transcript alone. |
| Zero-dependency | Implemented as SKILL.md prose plus, at most, a tiny existing-helper call — no new runtime code or dependencies (constitution principles 1 and 2). |
| Backward compatibility | Additive only — does not change existing report semantics, verdicts, retry behavior, or artifact formats. Pre-existing consumers are unaffected. |
