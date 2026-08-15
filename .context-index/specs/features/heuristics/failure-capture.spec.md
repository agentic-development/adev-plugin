---
charter: heuristics
kind: behavioral
status: review-pending
risk_level: high
milestone: 3
revision: 2
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

### Two keys, and which one deduplicates

`failure-signature-key.spec.md` shipped both `id` and `signature`, and this spec must be precise about
which does what, because they are not interchangeable:

- **`id` is the deduplication key.** `writeHeuristic` reconciles solely on it —
  `existingEntries.findIndex((e) => e.id === entry.id)` at `lib/heuristics.mjs:952`. It never inspects
  `signature`. Whether a second capture *updates* an entry or *creates a duplicate* is decided entirely
  by `id`.
- **`signature` is the cross-scope recurrence key.** It exists so retrieval and the downstream batch
  breaker can match the same underlying failure across scopes. It has no role in write-path
  reconciliation.

An earlier revision of this spec claimed an identical `signature` would make `writeHeuristic` append
evidence. That is false against the shipped code, and the correction drives Behaviors 4 and 4a.

### Preconditions

- `failure-signature-key.spec.md` has shipped: `adev heuristics signature` exists and `signature`
  round-trips through serialization.
- The Stop hook continues to receive `tool_result.verdict_metadata` with `overall` and `spec_path`.
- `writeHeuristic` accepts a `signature` field and reconciles on `id`.
- **Input scoping (security boundary).** The hook's PASS path consumes only structured
  verdict-metadata fields and never reads or re-emits quality-gate subprocess stdout/stderr, which
  flow through the redaction pipeline. The FAIL path inherits that guarantee unchanged — see
  Behavior 1a. This matters more on the FAIL path than the PASS path: captured text lands in a
  git-tracked store file that `/adev:sync` later copies into `CLAUDE.md`, `AGENTS.md`, `.cursorrules`,
  and `copilot-instructions`, so an unredacted secret in a failing gate's stderr would propagate into
  four agent files.

### Behaviors

1. **When** the validate Stop hook receives a verdict with `overall === 'FAIL'` **then** it extracts a
   heuristic describing the failure, writes it at `low` confidence with a `signature` derived from the
   failure text via the shared primitive with origin `validate`, and exits 0. It remains non-blocking:
   a failed extraction never changes the validate verdict.

1a. **When** the FAIL path assembles its failure text **then** it reads **only** `verdict_metadata`
   `checks[]` entries whose outcome is not PASS, using their structured `id`/`name`/`detail` fields —
   the same already-redacted values the quality-gate pipeline produced. It **never** reads
   `tool_result` subprocess channels, raw stdout/stderr, file contents, or environment values, and it
   never re-emits any field the PASS path does not already consume. If no non-PASS `checks[]` entry is
   present, the hook writes nothing and exits 0 rather than falling back to a broader field. This is a
   security boundary, not a formatting preference: the captured text is git-tracked and propagates to
   four agent files via `/adev:sync`.

2. **When** the hook captures on FAIL **then** the heuristic's `anti-pattern` field carries the "don't
   do this" counter-rule derived from the failure, and `pattern` carries the corrective action. The
   schema is already error-shaped for this — `/adev:learn` populates the same two fields.

3. **When** the hook captures on PASS **then** existing behavior is unchanged except for the title
   prefix: the hardcoded `"First-run PASS: "` is replaced by an outcome-derived prefix, so a PASS
   entry and a FAIL entry are distinguishable by title. The prefix is currently duplicated in
   `lib/cli/heuristics.mjs` and the hook; Behavior 7 deletes the CLI copy along with the dead `extract`
   verb, so **after this spec lands exactly one copy remains — the hook's**. The two behaviors are
   ordered, not contradictory: the derivation is unified first, then the dead caller is removed.

4. **When** the same failure recurs on a later validate run for the same spec **then** the derived
   **`id`** is identical to the first occurrence, so `writeHeuristic` updates the existing entry rather
   than creating a duplicate. The FAIL-path `id` is composed exactly as the PASS path composes it —
   `<spec-slug>-<digest>` over `normalizeIdInput(<repo-relative-spec-path>|<pattern>)`, per
   `failure-signature-key.spec.md` Behavior 7 — so it is location-independent and stable across runs.
   The `signature` is written alongside it but plays no part in this reconciliation.

4a. **Automatic promotion does not occur on the hook path, and this spec does not claim it.**
   `autoPromote` (`lib/heuristics.mjs:894`) counts **distinct evidence paths**:
   `new Set(evidence.map(e => e.path)).size`. The hook's evidence path is a deterministic function of
   the spec path — `report_path`, defaulting to `<spec-stem>.validate.md`
   (`hooks/post-validate-extract-heuristics.mjs:136-138`). The two facts compose into a closed loop:
   the same `id` implies the same spec, which implies the same evidence path, so recurrence can never
   raise the distinct-path count above 1; and a *different* spec yields a different `id`, so it becomes
   a separate entry rather than accumulating. **Automatic promotion via the hook path is therefore
   structurally unreachable regardless of key correctness**, and any acceptance criterion asserting it
   would be unsatisfiable. Promotion remains reachable only through paths that contribute genuinely
   distinct evidence — `/adev:recover`, `/adev:learn`, and `/adev:retro` consolidation. Widening the
   promotion mechanism is out of scope here and is tracked separately.

5. **When** `/adev:recover` Step 7 extracts a heuristic **then** it stops restating the digest rule in
   prose and obtains **two distinct values from the verb**, because its `id` and its `signature` do not
   share a shape:

   - its **`signature`** is `recover-<digest>`, taken directly from
     `adev heuristics signature --origin recover --text <root-cause>`;
   - its **`id`** stays `<category-slug>-<digest>`, composed by recover from the same digest.

   The rule text is removed from `skills/recover/SKILL.md`; the step names the verb for both.

5a. **When** a caller needs the bare digest to compose its own prefix **then**
   `adev heuristics signature --digest-only` emits the 8-hex digest alone, with no prefix. This closes
   an integration gap between the two specs: `failure-signature-key.spec.md` Behavior 7a states that
   the prefix is caller-supplied and that callers share the digest function rather than the prefix, but
   the shipped verb emits only the composed `<origin>-<digest>` against a closed origin enum
   (`lib/cli/heuristics.mjs:519-523`). Without a bare-digest mode, `/adev:recover` cannot produce
   `<category-slug>-<digest>` from the verb at all — the constitution requires skills to name a CLI
   verb rather than call a lib function, so exposing the digest is the only route that satisfies both
   Behavior 6 and the anti-pattern rule. `--digest-only` is rejected together with `--blocker-id`,
   whose digest is inherited rather than derived.

6. **When** `/adev:recover` runs after this change **then** the heuristics it writes carry ids
   byte-identical to those it wrote before for the same normalized root cause, so recurrence counts
   established under Phase 1 survive. Behavior 5a is what makes this satisfiable: the category prefix
   and the digest are composed by recover exactly as before, and only the digest's implementation
   location moves.

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
| FAIL-path extraction | Derive title, pattern, anti-pattern, `signature` and **`id`** from a FAIL verdict, reading only non-PASS `checks[]` entries per Behavior 1a. The `id` uses the PASS-path composition so recurrence updates rather than duplicates | medium |
| Outcome-derived title prefix | Single derivation replacing the hardcoded `"First-run PASS: "`; two copies exist now, one remains after the retirement task | small |
| `--digest-only` on the signature verb | Bare 8-hex digest with no prefix, rejected together with `--blocker-id`; required by Behavior 5a so recover can compose `<category-slug>-<digest>` | small |
| Migrate recover Step 7 | Replace the prose rule in `skills/recover/SKILL.md:387-397` with two verb invocations — `--origin recover` for the signature, `--digest-only` for the id's digest | small |
| Remove the dead path | Delete the `extract` verb, `--check-first-run`, and the orphaned check file | small |
| Retire the dead path's tests | `tests/cli/heuristics.test.mjs` exercises the `extract` verb throughout (27 references) and is listed in the source manifest of **another spec**, `cli-driver-surface/inline-node-extraction-sweep.spec.md`. Deleting the verb without retiring these tests means `npm test` cannot pass, so no acceptance criterion depending on a green suite could hold. Removing them also touches a second spec's manifest and must be reflected there | medium |
| Update dangling references | `docs/cli-reference.md` and `lib/diagnostics/tier2/validated-without-report.mjs` | small |
| Tests | FAIL capture, PASS unchanged, recurrence updates rather than duplicates, input scoping honored, non-blocking on every error path, recover ids byte-identical | medium |

## Acceptance Criteria

- [ ] A FAIL verdict produces a heuristic entry with a `signature`, `id`, `pattern`, and `anti-pattern`
- [ ] A PASS verdict still produces an entry, with an outcome-derived title prefix rather than the
      hardcoded `"First-run PASS: "`
- [ ] PASS and FAIL entries are distinguishable by title
- [ ] The same failure captured twice on the same spec yields the same **`id`** and updates one entry
      rather than creating two, verified by asserting entry count and evidence length
- [ ] A FAIL capture whose `signature` matches an existing entry with a *different* `id` creates a
      separate entry — asserting that `signature` is not a dedup key and the spec does not assume it is
- [ ] **No test asserts automatic promotion on the hook path.** Per Behavior 4a it is structurally
      unreachable — deterministic evidence paths keep the distinct-path count at 1 — so such a test
      would be unsatisfiable
- [ ] The FAIL path reads only non-PASS `checks[]` entries; a test feeds a verdict carrying a secret in
      a subprocess-style field and asserts it does not reach the store
- [ ] With no non-PASS `checks[]` entry present, the hook writes nothing and exits 0
- [ ] Every error path in the hook exits 0 and leaves the validate verdict unchanged
- [ ] `skills/recover/SKILL.md` contains no derivation-rule text and names the verb for both values
- [ ] `adev heuristics signature --digest-only` emits a bare 8-hex digest and is rejected alongside
      `--blocker-id`
- [ ] Heuristics written by `/adev:recover` after the change carry ids byte-identical to before for the
      same normalized root cause, asserted against a pre-change fixture
- [ ] `adev heuristics extract`, `--check-first-run`, and the orphaned check file are gone
- [ ] `tests/cli/heuristics.test.mjs` no longer exercises the removed verb, and
      `cli-driver-surface/inline-node-extraction-sweep.spec.md`'s source manifest reflects the change
- [ ] No reference to the removed verb remains in `docs/` or `lib/`
- [ ] `npm test` passes
- [ ] No constitutional violations
