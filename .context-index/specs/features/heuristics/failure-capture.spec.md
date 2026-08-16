---
charter: heuristics
kind: behavioral
status: review-pending
risk_level: high
milestone: 3
revision: 1
charter-revision: 6
created: 2026-08-15
updated: 2026-08-15
---

# Live Spec: Failure Capture — learn from what went wrong, not only from what went right

<!-- Live Spec within the heuristics charter.
     Parent Charter: .context-index/specs/features/heuristics/charter.md (revision 6, Phase 3)
     Covers capabilities: Validate Failure Capture, Recover Migration, Dead Capture-Path Retirement.
     Depends on: failure-signature-key.spec.md (the signature primitive and corrected id derivation).
     Frontmatter precedes the H1 deliberately: `adev specify revise` cannot parse a spec
     whose frontmatter is not the first non-blank content. -->

## Behavioral Contract

Automatic heuristic capture is structurally blind to failure. The live capture path is the
non-blocking Stop hook `hooks/post-validate-extract-heuristics.mjs`, which returns early at line 73
on `verdict.overall !== 'PASS'`. Nothing else captures automatically: `/adev:recover` Step 7 captures,
but only when an agent is already stuck, and `/adev:learn` requires a human to think of it. The
result is a store whose automatic entries all say a spec passed.

A second problem sits beside the first. The capture surface has drifted: `validate.check-12-heuristic-extraction`
is in `REMOVED_CHECK_IDS`, and the CLI verb `adev heuristics extract` — together with its
`--check-first-run` flag and an orphaned check file — is reachable from no skill and no hook. That
dead path carries its own stale copies of the derivation rules, which is why the "single
implementation" contract from `failure-signature-key.spec.md` cannot hold until it is removed.

This spec widens the live hook to capture on FAIL, migrates `/adev:recover` onto the shared
primitive, and retires the dead path along with the references that would otherwise dangle.

### Preconditions

- `failure-signature-key.spec.md` has shipped: `adev heuristics signature` exists and `signature`
  round-trips through serialization.
- The Stop hook continues to receive `tool_result.verdict_metadata` with `overall` and `spec_path`.
- `writeHeuristic` accepts a `signature` field.

### Behaviors

1. **When** the validate Stop hook receives a verdict with `overall === 'FAIL'` **then** it extracts a
   heuristic describing the failure, writes it at `low` confidence with a `signature` derived from the
   failure text via the shared primitive with origin `validate`, and exits 0. It remains non-blocking:
   a failed extraction never changes the validate verdict.

2. **When** the hook captures on FAIL **then** the heuristic's `anti-pattern` field carries the "don't
   do this" counter-rule derived from the failure, and `pattern` carries the corrective action. The
   schema is already error-shaped for this — `/adev:learn` populates the same two fields.

3. **When** the hook captures on PASS **then** existing behavior is unchanged except for the title
   prefix: the hardcoded `"First-run PASS: "` is replaced by an outcome-derived prefix, so a PASS
   entry and a FAIL entry are distinguishable by title. The prefix is derived in one place and used by
   both the hook and any remaining CLI caller.

4. **When** the same failure recurs on a later validate run **then** the derived `signature` is
   identical to the first occurrence, so `writeHeuristic` appends evidence to the existing entry
   rather than creating a second one, and `autoPromote` can observe two distinct evidence paths.

5. **When** `/adev:recover` Step 7 extracts a heuristic **then** it obtains the key by invoking
   `adev heuristics signature` rather than restating the ID Derivation Rule in prose. The rule text is
   removed from `skills/recover/SKILL.md`; the step names the verb.

6. **When** `/adev:recover` runs after this change **then** the heuristics it writes are keyed
   identically to those it wrote before for the same normalized root cause, so recurrence counts
   established under Phase 1 survive. The recover-side key was already content-only; only its
   implementation location moves.

7. **When** the retirement lands **then** `adev heuristics extract`, its `--check-first-run` flag, and
   `skills/validate/checks/validate.check-12-heuristic-extraction.md` no longer exist, and the two
   references that would otherwise dangle are updated in the same change: the verb signature in
   `docs/cli-reference.md` and the consumer comment in
   `lib/diagnostics/tier2/validated-without-report.mjs`.

8. **When** a heuristic file is missing, malformed, or unwritable during capture **then** the hook
   logs a warning and exits 0. Capture never blocks the lifecycle, on either the PASS or the FAIL
   path — this is the charter's Degradation attribute and it is unchanged by widening the trigger.

### Postconditions

- The store accumulates entries from failures as well as successes.
- No shipped code contains a second copy of the derivation rules.
- The validate verdict is never altered by capture, on any path.
- `/adev:recover`'s existing heuristics remain addressable under their original ids.

### Error Cases

| Condition | Expected behavior | Exit code |
|---|---|---|
| `verdict_metadata` absent or not an object | Hook returns early, writes nothing, exits 0 | 0 |
| `verdict.overall` is neither PASS nor FAIL | Hook returns early, writes nothing, exits 0 | 0 |
| `spec_path` missing from the verdict | Hook returns early, writes nothing, exits 0 | 0 |
| `adev heuristics signature` unavailable or errors | Entry is written without a `signature`; warning logged; exit 0 | 0 |
| Heuristic file unwritable | Warning logged; exit 0; validate verdict unaffected | 0 |
| `CLAUDE_PLUGIN_ROOT` unset | Existing behavior preserved — warning logged, extraction skipped | 0 |

## System Constitution Reference

- **Principle:** "Hook protocol compliance — hooks read JSON from stdin + env vars, exit 0 (allow) or
  2 (block), output JSON to stdout." — Applies as the governing constraint. Widening the trigger
  changes a value comparison on already-consumed data; stdin parsing, the consumed
  `tool_result.verdict_metadata` field, stdout warnings, and exit semantics are all unchanged. This is
  a behavioral change *within* the protocol, which the constitution's Architecture Boundaries place
  under Autonomous — not "Changing the hook protocol", which requires human approval.
- **Principle:** "Skills are primarily markdown — companion code is allowed but must not be required
  for the skill to function." — Applies to Behavior 5: after migration, `/adev:recover` names a verb.
  If the verb is unavailable the step degrades to writing an entry without a signature rather than
  failing, so the skill still functions.
- **Anti-pattern:** "No `Run inline Node.js:` step directives… Skills name a CLI subcommand." —
  Applies to the removal of the prose derivation rule from `skills/recover/SKILL.md`.
- **Principle:** "Minimize external dependencies" — Applies; no new dependency.

## Actionable Task Map

| Task | Description | Complexity |
|---|---|---|
| Widen the hook gate | Replace the early return at `hooks/post-validate-extract-heuristics.mjs:73` with PASS/FAIL branching | small |
| FAIL-path extraction | Derive title, pattern, anti-pattern, and signature from a FAIL verdict | medium |
| Outcome-derived title prefix | Single derivation replacing the hardcoded `"First-run PASS: "` in both copies | small |
| Migrate recover Step 7 | Replace the prose rule in `skills/recover/SKILL.md:387-397` with the verb invocation | small |
| Remove the dead path | Delete the `extract` verb, `--check-first-run`, and the orphaned check file | small |
| Update dangling references | `docs/cli-reference.md` and `lib/diagnostics/tier2/validated-without-report.mjs` | small |
| Tests | FAIL capture, PASS unchanged, recurrence appends rather than duplicates, non-blocking on every error path | medium |

## Acceptance Criteria

- [ ] A FAIL verdict produces a heuristic entry with a `signature`, `pattern`, and `anti-pattern`
- [ ] A PASS verdict still produces an entry, with an outcome-derived title prefix rather than the
      hardcoded `"First-run PASS: "`
- [ ] PASS and FAIL entries are distinguishable by title
- [ ] The same failure captured twice appends evidence to one entry instead of creating two, verified
      by asserting entry count and evidence length
- [ ] Two distinct evidence paths on one entry promote it from `low` to `medium`
- [ ] Every error path in the hook exits 0 and leaves the validate verdict unchanged
- [ ] `skills/recover/SKILL.md` contains no derivation-rule text and names `adev heuristics signature`
- [ ] Heuristics written by `/adev:recover` after the change carry the same ids as before for the same
      normalized root cause
- [ ] `adev heuristics extract`, `--check-first-run`, and the orphaned check file are gone
- [ ] No reference to the removed verb remains in `docs/` or `lib/`
- [ ] `npm test` passes
- [ ] No constitutional violations
