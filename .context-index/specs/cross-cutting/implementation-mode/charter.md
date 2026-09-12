---
status: approved
kind: cross-cutting
revision: 2
updated: 2026-09-10
tracker-ref: adev-plugin-8u2a
---

# Cross-Cutting Charter: Implementation Mode

## Business Intent

Give projects control over how rigorously `/adev:implement` enforces test-first development, via a new `implementation_mode` setting resolved independently of risk tier. Three modes are exposed: `tdd` (default — today's mandatory RED→GREEN→REFACTOR, unchanged), `test-required` (tests still mandatory by review time, but `write-test` is dispatched post-hoc rather than as a precondition to writing code), and `agent-default` (no adev-imposed test requirement — fully hands-off, agent judgment only). The mode is asked once during `/adev:init` and resolved at dispatch time via a single canonical config lookup, so `/adev:implement` and `/adev:write-test` consult one source of truth instead of duplicating per-mode logic.

## Scope

### In Scope

- New `implementation_mode` top-level key in `manifest.yaml` (`tdd` / `test-required` / `agent-default`), defaulting to `tdd` for full backward compatibility.
- A new `/adev:init` question for this setting, independent of the existing risk-tier prompt.
- A canonical config resolver (`lib/implementation-modes/constants.mjs` + a CLI verb) mapping mode name to `{dispatch_red, ordering_enforced, coverage_check}`.
- `/adev:implement` consulting the resolved config to decide whether/when `write-test` is dispatched and whether test-first ordering is a precondition.
- `/adev:write-test` supporting post-hoc dispatch (after GREEN) under `test-required`, in addition to its existing pre-hoc (RED-phase) invocation under `tdd`.
- Updating the `implementation`, `write-test`, `planning`, `assessment`, `maintenance`, `strategic-planning`, and `setup` module charters to reflect the new conditional behavior (see Affected Modules).

### Out of Scope

- Third-party/user-authored custom modes — the mode set stays a fixed enumeration of 3. Config-driven lookup only, no extension point for externally-defined modes.
- Any change to `risk-policies.yaml`'s schema, `test_depth`'s own resolution mechanism, or risk-tier behavior — the two axes stay orthogonal in this charter and `test_depth` resolution itself is untouched. A future follow-on could let `strict` tier constrain which modes are selectable, but that's explicitly deferred, not built here. (The one interaction is documented below under "Guardrail integrity" — `agent-default` causes `test_depth` resolution to never run at all, not a change to how it resolves when it does run.)
- Any change to `hooks/gaming-gate.sh` — it stays an unconditional backstop regardless of mode. It validates the integrity of whatever tests exist; it doesn't require tests to exist, so it has nothing to do with whether they were mandated.
- **Preserving the sensitive-path floor under `agent-default`.** The codebase has a pre-existing, always-on guardrail: `test_depth` resolution (via `adev test-policy resolve`) includes a sensitive-path floor that forces `thorough` depth on auth/crypto/secrets/CI paths (`governance/sensitive-paths.yaml` + built-in defaults), regardless of other settings. `agent-default` mode means `/adev:implement` never calls `test-policy resolve` at all (see Affected Modules: `strategic-planning`), so this floor never evaluates and never fires for tasks under that mode — including sensitive-path tasks. This is a **deliberate, explicit trade-off of choosing `agent-default`**, not a gap this charter fixes: a project accepting fully-hands-off implementation is also accepting that the sensitive-path floor does not apply while that mode is active. See "Guardrail integrity" below for where this must be surfaced to the user.

## Affected Modules

| Module | Impact (high / medium / low) | Changes Required |
|---|---|---|
| `setup` | medium | New `/adev:init` question (mode selection) — the `agent-default` option must explicitly warn that it also bypasses the existing sensitive-path test-depth floor (see Out of Scope), so the trade-off is visible at selection time, not discovered later; writes `implementation_mode` to `manifest.yaml`; new section in `templates/manifest-template.yaml` (near the existing Test Policy block); `using-adev`'s help routing-table row and TDD glossary entry updated to describe the setting instead of stating TDD unconditionally, **and its explanation of `agent-default` must also name the sensitive-path-floor bypass**, mirroring the Guardrail integrity requirement below — not just `/adev:init`'s one-time prompt. |
| `implementation` | high | Main `implement/SKILL.md` dispatch flow, `tdd-mandate.md` scoped to `tdd` mode, `batched-mode.md` and `parallel-mode.md` (both hardcode "full TDD loop" in their dispatch prompts), `code-quality-checklist.md`'s "TDD was followed" review criterion (inherited transitively by `synthesized-reviewer-prompt.md`), charter's Key Behaviors revised, and existing `lib/implement/` dispatch-support code updated to consult the resolver. |
| `write-test` | medium | Accepts post-hoc invocation (after GREEN) in addition to existing pre-hoc (RED-phase) invocation; charter's Business Intent/Dependencies note conditional dispatch. |
| `planning` | high | Task template's "Write failing test"/"Verify test fails" checkboxes, `plan-reviewer-prompt.md`'s "no task skips test-first" criterion, `epic-mode.md`'s routing-table wording. |
| `assessment` (owns `/adev:route`) | medium | `assisted-agent`'s RED-phase-dependent pause point and `auto-agent`'s "full TDD cycle" description need mode-conditional wording. |
| `maintenance` (owns `/adev:hygiene`) | medium | Audit Pass 22 (Test-Policy Drift) must treat a missing `**Tests:**` field as expected, not drift, under `agent-default`. |
| `strategic-planning` (owns `/adev:status`) | medium | `/adev:status`'s test-depth-assignment count needs a note (or different framing) for `agent-default`-mode projects, where the count is structurally always 0 — `test_depth_assigned` events are only emitted when `/adev:implement` calls `adev test-policy resolve` immediately before dispatching `write-test`, which never happens under `agent-default`. |
| `lib` | medium | New `lib/implementation-modes/constants.mjs` resolver module, following the existing `lib/risk-tiers/` pattern. |
| `cli` | low | One new CLI verb (e.g. `adev implementation-mode resolve`) wiring the resolver into the existing driver-surface pattern. |

**Checked, confirmed not affected:** `hooks` (only `gaming-gate.sh` is TDD-adjacent, and it's an unconditional backstop by design), `design` (`specify`'s "coverage" references are spec/capability coverage and the orthogonal `test_depth` setting, not this), `assessment`'s `review-specs`/`assess` sub-skills (pattern-coverage scoring and arbitrary-codebase maturity scoring — unrelated), `validation`'s `eval` (zero references at the skill-prose level) and `validate` itself (fix-evidence tracking, not ordering), `strategic-planning`'s `research`/`build`/`issues`/`document` (`build` is descriptive-only, others have zero hits), `maintenance`'s `repomap`/`codehealth`/`sample`/`retro`/`reconcile` (`codehealth`'s `coverage_exclude` is unrelated glob exclusion, `sample`'s TDD mention is informational metadata only, others zero hits), `triage` (`work`'s "write tests first" row routes to a different, user-initiated standalone `/adev:write-test` invocation).

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|---|---|---|
| `implementation_mode` | Manifest config key | `tdd` \| `test-required` \| `agent-default`, written by `/adev:init`, read by every consuming skill. |
| `adev implementation-mode resolve` | CLI verb | Resolves a mode name (or the current project's manifest value) to `{dispatch_red, ordering_enforced, coverage_check}`. |
| `lib/implementation-modes/constants.mjs` | Config module | Canonical definitions of the 3 built-in modes — single source of truth, referenced by the resolver and by `/adev:init`'s prompt menu. |

### Consumed APIs

| Interface | Source Module | Description |
|---|---|---|
| `manifest.yaml` read/write | `setup` / `lib` | Same config I/O convention already used for risk-tier settings. |
| `adev test-policy resolve` / `test_depth_assigned` event stream | `implementation` | Not redefined by this charter — `status` and `hygiene`'s interpretation of this existing stream changes, but the stream itself doesn't. |
| `write-test --red` / handoff block contract | `write-test` | This charter changes *when* `write-test` is invoked, not its core mechanism (handoff blocks, gaming detection stay as-is). |

## Quality Attributes

| Attribute | Requirement |
|---|---|
| Backward compatibility | Default is `tdd`; every existing project's behavior is byte-for-byte unchanged unless it explicitly opts into a different mode. |
| Single source of truth | All 3 modes' behavior differences resolve from one canonical config object — no skill hardcodes per-mode branching logic independently. |
| Auditability | The active mode for a given task is traceable after the fact (surfaced in `/adev:status`, usable by `/adev:retro`) so reviewers can distinguish "no test written because `agent-default`" from "test missing due to drift." |
| Guardrail integrity | Backstops independent of test-first ordering (`hooks/gaming-gate.sh`) stay unconditional regardless of mode — dropping ordering enforcement never drops integrity checks on whatever tests do exist. The sensitive-path `test_depth` floor is a different case: `agent-default` intentionally bypasses it (see Out of Scope). This bypass must be surfaced explicitly wherever the mode is presented — `/adev:init`'s prompt and `/adev:using-adev`'s explanation both name it, so it is a chosen trade-off, never a silently-discovered one. |
| Discoverability | The setting and its trade-offs are explained in `/adev:using-adev`'s help surface, not just a one-time `/adev:init` prompt easy to forget about. |
