<!-- partial_schema: spec@1 -->

---
charter: autonomous-bugfix-loop
status: review-pending
kind: behavioral
risk_level: medium
milestone: 1
revision: 2
charter-revision: 6
created: 2026-08-19
updated: 2026-08-19
---

# Live Spec: ADEV-DEBUG Completion Token and --auto Mode

<!-- Live Spec within the autonomous-bugfix-loop charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/autonomous-bugfix-loop/charter.md -->

## Behavioral Contract

### Preconditions

- `/adev:debug` is invoked (with or without `--auto`) against a specific issue or reported symptom.
- This spec extends `skills/debug/SKILL.md`, owned by the `implementation` charter, and `skills/using-adev/SKILL.md`'s Persona Output Override, owned by the `setup` charter — both are declared dependencies of `autonomous-bugfix-loop/charter.md`.
- This spec **complies with, and does not redefine**, the token grammar (`^ADEV-[A-Z]+: [A-Z_]+$`, plain text, last line, exactly once) already pinned and validated by `.context-index/specs/cross-cutting/completion-tokens/completion-tokens.spec.md`. That spec's own Task Map currently covers only `build` and `validate` as terminal skills; this spec adds `debug` as a third, and its implementer should coordinate a small addition there rather than fork the grammar.
- `skills/debug/SKILL.md` Phase 1 today has no bounded "give up" exit — it says "If not reproducible, gather more data. Do not guess," with no attempt cap. This spec introduces that cap, scoped to `--auto` mode only (interactive mode keeps asking the user, which is fine since a human is present). The bound defaults to **3 reproduction attempts** (a manifest-configurable value, `tasks.bugfix_loop.reproduction_attempt_limit`), chosen distinct from the sibling `per-issue-attempt-cap` spec's cap default (2) — the two counters measure different things (see terminology note below) and using the same number for both invited exactly the conflation review flagged.
- **Terminology: "reproduction attempt" (this spec) vs. "`AttemptRecord` attempt" (sibling spec) are different counters.** A reproduction attempt is an intra-invocation try to reproduce the reported symptom in Phase 1, bounded by `reproduction_attempt_limit` (default 3) and never leaving this single `/adev:debug --auto` run. An `AttemptRecord` attempt is the sibling `per-issue-attempt-cap` spec's inter-invocation counter — incremented exactly once per *completed* `/adev:debug --issue --auto` call, regardless of how many reproduction tries happened inside it. The two never share a counter or a config key.

### Behaviors

<!-- retired-behavior-ids: (none) -->

- **BEH-1** — **When** `/adev:debug` reaches Phase 6 and quality gates pass and the fix is verified against the spec (the existing HIGH-confidence close condition, Phase 6 step 4) **then** the final line of chat output is exactly `ADEV-DEBUG: FIXED`.
- **BEH-2** — **When** `/adev:debug` reaches Phase 6 but quality gates have not been run, fail, or the fix cannot be verified against spec (the existing "annotate, do not close" path) **then** the final line is exactly `ADEV-DEBUG: PARKED`.
- **BEH-3** — **When** `/adev:debug --auto` exhausts its bounded reproduction-attempt limit in Phase 1 without reproducing the reported symptom **then** the skill terminates without proceeding to Phase 2+ and the final line is exactly `ADEV-DEBUG: UNREPRODUCIBLE`.
- **BEH-4** — **When** any of BEH-1/2/3's terminal states is reached **then** the token is emitted as plain text (never fenced), exactly once, as the literal last line of chat output, matching `^ADEV-[A-Z]+: [A-Z_]+$`. Its named consumer is the sibling `/adev:bugfix-loop` skill's per-turn call sequence (`bugfix-loop-skill.spec.md`), which reads this exact last line to branch on the outcome.
- **BEH-5** — **When** `/adev:debug --auto` reaches Phase 6 step 3 (the ADR-drafting consideration) and an architectural insight is detected **then** the interactive prompt ("Want me to draft an ADR...") is skipped, and the insight is recorded as a note attached to the issue's confidence note (via the existing `adev verify format-note` note) rather than an ADR being drafted automatically — ADR authorship stays a deferred human follow-up, never a silent autonomous action. The note surfaces to a human via `/adev:issues`'s board view (the issue's `notes` field is visible there) — no new surface is introduced, but no automated audit currently flags an issue purely for carrying an unreviewed insight note; a human must browse to it.
- **BEH-6** — **When** any active persona other than Developer (Product, Architect) is in effect **then** the `ADEV-DEBUG:` token is still emitted verbatim, unaffected by persona adaptation — matching the existing persona-exempt carve-out for `ADEV-BUILD`/`ADEV-VALIDATE` in `skills/using-adev/SKILL.md`'s Persona Output Override, extended to name `/adev:debug` (`ADEV-DEBUG: <STATE>`) explicitly. That bullet is enumerated per-skill today; it does not automatically cover a new terminal skill.
- **BEH-7** — **When** `/adev:debug --auto` is invoked but Phase 1 cannot resolve any investigation target (no issue id, no reproducible symptom description, and no inferable target) **then** the skill exits immediately with a clear message rather than guessing or blocking on an interactive question that `--auto` has no user present to answer.
- **BEH-8** — **When** `/adev:debug --auto` reaches Phase 6 step 1 ("Run quality gates") and one or more gates fail **then** the failing gates are captured as a stable, comparable set of check IDs (e.g., failing test names, one per line, sorted) and included in the `ADEV-DEBUG: PARKED` outcome's data — this is the sibling `per-issue-attempt-cap` spec's required input for its `curr_blockers` diffing (that spec's Precondition names this exact requirement as owned here). **When** the underlying test runner's output cannot be parsed into discrete IDs **then** Phase 6 step 1 falls back to reporting the raw failure output unchanged — the degraded-mode handling for that case is the *consuming* spec's responsibility (`per-issue-attempt-cap`'s `NO_STABLE_CHECK_IDS` error case), not this one's.

### Postconditions

- Exactly one `ADEV-DEBUG:` token is emitted per invocation, matching one of `FIXED` / `PARKED` / `UNREPRODUCIBLE`.
- Under `--auto`, no step in Phase 1 or Phase 6 blocks waiting for interactive input — every decision point that previously prompted now has a deterministic default.
- The issue board (if `tasks.backend` is configured) reflects the outcome the token reports: closed for `FIXED`, annotated-open for `PARKED`, annotated for `UNREPRODUCIBLE`.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Reproduction tooling unavailable or symptom does not reproduce under `--auto`'s bounded attempt limit | Skill exits Phase 1 cleanly; does not proceed to Phase 2+ | *(terminal token `ADEV-DEBUG: UNREPRODUCIBLE` is the signal, not a separate error code)* |
| Phase 6 quality gates fail under `--auto` | Skill does not close the issue; annotates with the existing "fix applied but not yet validated" note; terminates cleanly | *(terminal token `ADEV-DEBUG: PARKED` is the signal)* |
| `--auto` passed with no resolvable investigation target (no issue id, no symptom, nothing inferable) | Exits immediately with a clear message; never guesses at a target | `NO_INVESTIGATION_TARGET` |

## System Constitution Reference

- **Principle:** "Skills are primarily markdown — skill files are structured instructions for Claude." — Applies because every change in this spec is a `SKILL.md` prose edit (Phase 1's bounded reproduction limit, Phase 6 step 3's `--auto` branch, the final-line token directive, the persona-overlay bullet) — no new companion code is required beyond the existing `adev verify format-note` CLI verb.
- **Architecture Boundary:** "Editing skill markdown content" (Autonomous — Agent May Decide). — Applies because, unlike the sibling `/adev:bugfix-loop` skill spec, this spec adds no new skill to the lifecycle order and requires no separate human approval; it only edits existing skill prose.
- **Anti-Pattern:** "No `Run inline Node.js:` step directives... inside `skills/*/SKILL.md`." — Applies because the note-recording behavior in BEH-5 reuses the existing `adev verify format-note` CLI verb rather than embedding logic inline.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Add `ADEV-DEBUG` final-line directive to Phase 6 | Emit `FIXED`/`PARKED` per the existing close/annotate branches (BEH-1, BEH-2, BEH-4) | small |
| Add bounded reproduction-attempt limit and `UNREPRODUCIBLE` terminal path to Phase 1, scoped to `--auto` | New logic: after `tasks.bugfix_loop.reproduction_attempt_limit` (default 3) without reproduction, terminate under `--auto` (BEH-3, BEH-7) | medium |
| Emit a stable failing-check-ID set from Phase 6 step 1 under `--auto` | New structured output (sorted list of failing test names) attached to the `PARKED` outcome, consumed by the sibling `per-issue-attempt-cap` spec (BEH-8) | medium |
| Add `--auto` flag parsing and Phase 6 step 3 skip-and-note behavior | Suppress the interactive ADR prompt; record the insight as a note instead of drafting (BEH-5) | small |
| Extend the persona-exempt carve-out to `ADEV-DEBUG` | Edit `skills/using-adev/SKILL.md`'s Persona Output Override bullet (BEH-6) | small |
| Coordinate a small addition to `completion-tokens.spec.md`'s Task Map | Note `debug` as a third terminal skill covered, alongside `build`/`validate` — that spec's owner should make this edit, not this one | small |
| Tests | `node:test` coverage for token emission per terminal state, `--auto` skip behavior, `UNREPRODUCIBLE` bound, persona exemption | medium |

## Acceptance Criteria

- [ ] `FIXED`/`PARKED`/`UNREPRODUCIBLE` token emitted correctly per terminal state, matching the pinned grammar
- [ ] Token is the literal last line, plain text, exactly once per invocation
- [ ] `--auto` skips the interactive ADR-drafting prompt without silently drafting an ADR
- [ ] `--auto` bounds reproduction attempts to `tasks.bugfix_loop.reproduction_attempt_limit` (default 3) and terminates `UNREPRODUCIBLE` rather than looping indefinitely
- [ ] Token is persona-exempt, verified across Product and Architect personas
- [ ] No investigation target under `--auto` exits cleanly with `NO_INVESTIGATION_TARGET`, never a guess
- [ ] `PARKED` outcomes under `--auto` include a stable, sorted, comparable set of failing check IDs from Phase 6 step 1
- [ ] All quality gates pass (`npm test`)
- [ ] No constitutional violations introduced
