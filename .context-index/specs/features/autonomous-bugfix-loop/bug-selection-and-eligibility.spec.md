---
partial_schema: spec@1
charter: autonomous-bugfix-loop
status: validated
kind: behavioral
risk_level: medium
milestone: 1
revision: 7
charter-revision: 7
created: 2026-08-19
updated: 2026-08-20
source-manifest:
  sha: "a39dcc1"
  files:
    - docs/cli-reference.md
    - lib/cli/issues-next.mjs
    - lib/cli/issues-stale.mjs
    - lib/cli/issues.mjs
    - lib/issues/eligibility.mjs
    - lib/issues/interface.mjs
    - templates/manifest-template.yaml
    - tests/issues/next.test.mjs
  computed-at: "2026-08-20T13:15:34.355Z"
drift_detected: true
---

# Live Spec: Bug Selection Verb and Eligibility Filter

<!-- Live Spec within the autonomous-bugfix-loop charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/autonomous-bugfix-loop/charter.md -->

## Behavioral Contract

### Preconditions

- `manifest.yaml` has `tasks.backend` configured (json or beads); the issue board is reachable via `getIssueManager(manifest)`.
- The caller has read access to `.context-index/lifecycle-state/bugfix-loop-attempts.jsonl` for attempt-cap state (the file the sibling `per-issue-attempt-cap` spec establishes). Its absence is not an error — it means no attempts have been recorded for any issue yet.
- This spec depends on the `AttemptRecord` schema defined in the charter's Domain Model and detailed by the sibling `per-issue-attempt-cap` spec (same charter, also Milestone 1). If that sibling spec's schema changes after this one ships, this verb's exclusion logic (BEH-5) must be updated to match — this is a normal parallel-spec dependency, not a blocker on writing either spec first.
- **`--max-priority <p>` uses the `P0`–`P4` string vocabulary, mapped one-to-one onto `WorkItem.priority`'s numeric `0`–`4` scale**: `P0=0` (critical), `P1=1` (high), `P2=2` (medium), `P3=3` (low), `P4=4` (backlog). This mapping is fixed and owned by this spec; the CLI-facing string form exists only because "P2" reads clearer than "2" at the command line — `IssueManagerInterface` itself is never touched.
- **The eligibility filter reads `manifest.yaml`'s `modules[].slug` list** (the same manifest already required by the first precondition above) to validate `affected_modules` entries per BEH-11. This is a *stricter* posture than the codebase's only other `modules[].slug` membership check, the heuristics module's Scope Derivation Rule (`.context-index/specs/features/heuristics/validate-extraction.spec.md` Check 12; `.context-index/specs/features/heuristics/recover-extraction.spec.md` Step 7): that rule also validates a derived value against `manifest.yaml`'s `modules[].slug`, but on a mismatch it falls back to `_global` rather than excluding anything — a permissive disposition, the opposite of BEH-11's fail-closed exclusion. BEH-11 does not mirror that precedent; it deliberately diverges from it, because BEH-11 gates autonomous action on a WorkItem (see Preconditions bullet below) where the heuristics rule only tags a stored artifact for later retrieval — an unrecognized value in the safety-gating path must fail closed rather than silently fall back to a default. BEH-11's fail-closed behavior stands on its own merits for that reason, not as an instance of existing prior art.
- **The module-safety mechanism depends on `task-management/charter.md` revision 8's new `WorkItem.affected_modules` field** (optional array of manifest `modules[].slug` values or the reserved safety tags `review-gate`, `convergence-detector`, `retry-loop`, `bugfix-loop`), added specifically to give BEH-6/BEH-7 below a real *schema* producer. **This field is read/written on both supported backends, for real, as of this revision:** on `json`, `IssueManager.update()` merges it like any other issue field (`lib/issues/json-adapter.mjs`); on `beads`, it rides in `agent_context.adev` — added to the adapter's `CONTEXT_FIELDS` allowlist and read back in `_toIssue()` (`lib/issues/beads-adapter.mjs`), the same mechanism `branch`/`spec_ref`/`pr` already use for fields br has no native column for. Prior to this revision the beads adapter silently dropped the field on write — a real defect (round-3 review finding RI-2), not a documentation gap — now closed and covered by `tests/issues/beads-adapter.test.mjs`'s "affected_modules round-trip" suite.
- **v1's producer is `adev issues set-modules <id> <slug>[,<slug>...] [--json]`** (`lib/cli/issues-set-modules.mjs`, wired into the `adev issues` dispatcher in `lib/cli/issues.mjs`), a real Task Map deliverable of this milestone — not a hypothetical "any script or one-off command a human could write." It wraps `IssueManager.update(id, { affected_modules })` over the same interface every backend already implements, works identically on `json` and `beads`, and is exercised end-to-end (both backends, through the real CLI dispatch path) in `tests/issues/set-modules.test.mjs` and `tests/issues/beads-adapter.test.mjs`. It is deliberately unpolished: no validation against `manifest.modules[].slug`, no GitHub-label sync. A richer `/adev:issues create/update --affected-modules <slug>` flag and GitHub-label-based population remain explicit Deferred Capabilities (see charter) — that's a UX-polish gap now, not a "does any producer exist at all" gap (round-3 review finding WR-1). **Consequence, stated plainly: BEH-10's fail-closed default applies to any bug not yet tagged via `adev issues set-modules`** — the loop will not autonomously attempt an untagged bug, but tagging one out of that state is a real, invocable, tested CLI command today, on either backend.
- **`set-modules` performing zero validation is safe only because the *read side* (the eligibility filter, BEH-11) is the enforcement point, not the write side.** `adev issues set-modules` accepting any trimmed non-empty string (round-3/round-4 design: v1 is deliberately unpolished, no `manifest.modules[].slug` check at write time) means a typo'd or unrecognized slug can land in `WorkItem.affected_modules` on disk. That is tolerated *only* because `adev issues next` (round-5, BEH-11) is required to re-validate every `affected_modules` entry against `manifest.modules[].slug` ∪ the four reserved safety tags at read time, on every invocation, and to treat anything that fails that check as fail-closed — mirroring this repo's established refuse-don't-silently-pass posture for values feeding a safety gate (`governance-values.mjs`'s `assertSafeScalar`, `exec-payload.mjs`'s containment checks). A future write-side validation in `set-modules` would be a defense-in-depth improvement, not a substitute for BEH-11 — the filter must never trust an unvalidated on-disk value, regardless of how it got there.

### Behaviors

<!-- retired-behavior-ids: (none) -->

- **BEH-1** — **When** `adev issues next --type bug --max-priority <p> --json` is invoked with a valid `<p>` **then** it returns the single highest-priority eligible WorkItem of `type: "bug"` whose priority is numerically `<=` the resolved bound (see BEH-8 for the safety floor), or `{"bug": null}` if none qualify.
- **BEH-2** — **When** multiple candidate WorkItems tie on priority **then** the one with the oldest `created` timestamp is selected (FIFO within a priority band).
- **BEH-3** — **When** a candidate WorkItem is currently claimed with a lease that has not expired (per `tasks.claim_ttl_minutes`) **then** it is excluded from candidacy.
- **BEH-4** — **When** a candidate WorkItem has one or more open (non-closed) blocking dependencies **then** it is excluded from candidacy.
- **BEH-5** — **When** a candidate WorkItem's `AttemptRecord.last_verdict` is `NO_PROGRESS`, `REGRESSED`, `BUDGET_EXHAUSTED`, or `UNREPRODUCIBLE` **then** it is excluded from candidacy — this is the exact four-value set the sibling `per-issue-attempt-cap` spec's BEH-4 defines as authoritative; this verb never diverges from it. `UNREPRODUCIBLE` is its own distinct value, not folded into `BUDGET_EXHAUSTED` — an issue that doesn't reproduce and a run that exhausted its retry budget are different facts, and the sibling spec's BEH-3 sets them separately (found during pre-merge live testing of this charter). **When** no `AttemptRecord` exists for a WorkItem **then** it is treated as zero attempts, not excluded.
- **BEH-6** — **When** a candidate WorkItem's `affected_modules` field (per `task-management/charter.md` revision 8) has more than one entry **then** it is excluded from candidacy, regardless of priority — multiple declared modules means the fix's blast radius isn't confined to one area.
- **BEH-7 (safety boundary)** — **When** a candidate WorkItem's single `affected_modules` entry is in the eligibility filter's excluded-module list (the reserved safety tags `review-gate`, `convergence-detector`, `retry-loop`, `bugfix-loop`, or a manifest `modules[].slug` a project has additionally configured as sensitive via `tasks.bugfix_loop.excluded_modules`) **then** it is excluded from candidacy unconditionally — this exclusion cannot be overridden by `--max-priority` or any other flag.
- **BEH-11 (unrecognized-slug fail-closed)** — **When** a candidate WorkItem's single `affected_modules` entry is neither one of the four reserved safety tags nor found in `manifest.modules[].slug` (i.e. it does not match any entry BEH-7 would check it against, and it is not the empty/absent case BEH-10 covers) **then** it is excluded from candidacy, identically to BEH-10 — an unrecognized or misspelled module slug is indistinguishable from an untagged bug and must never be treated as validated. The eligibility filter performs this membership check itself, against the manifest's `modules[].slug` list, on every invocation of `adev issues next` — it does not trust that `adev issues set-modules` (which performs no such validation by design, see Preconditions) already did this check. **Evaluation order:** BEH-6 (length > 1) is checked first; for a single-entry `affected_modules`, BEH-7 (reserved/excluded match) is checked next; if the entry matches neither BEH-7's excluded list nor a real `manifest.modules[].slug`, BEH-11 excludes it; only an entry that is a real, non-excluded manifest module slug is module-eligible. BEH-10 covers the separate empty/absent case. These four behaviors are jointly exhaustive over every possible `affected_modules` value: there is no value for which none of BEH-6, BEH-7, BEH-10, BEH-11 applies, and applying any of them yields exclusion except when BEH-7/BEH-11's checks are passed (a single entry that is a real, non-excluded manifest module slug).
- **BEH-10 (fail-closed default)** — **When** a candidate WorkItem's `affected_modules` field is empty or absent **then** it is excluded from candidacy — an unclassified bug is never assumed safe. This is the deliberate default: the safety boundary (BEH-7) has nothing to check against an untagged WorkItem, so the only sound default is exclusion, not silent pass-through. A human (or maintainer, for GitHub-origin bugs) makes a WorkItem loop-eligible by setting `affected_modules`, not by leaving it unset.
- **BEH-8 (safety floor)** — **When** `--max-priority` is omitted **then** the resolved bound defaults to `P3` (covering P2 and P3, the charter's fixed eligible band). **When** `--max-priority` is `P0` or `P1` **then** the verb rejects the invocation (see Error Cases) — P0/P1 are never selectable regardless of flags, since they are outside the eligibility filter's safety boundary by design, not merely deprioritized.
- **BEH-9** — **When** `--type` is supplied with a value other than `"bug"` **then** the verb rejects the invocation (see Error Cases) — this milestone supports bug selection only.

### Postconditions

- The board is unchanged: this verb performs no writes. It never claims, closes, or mutates any WorkItem or `AttemptRecord`.
- The caller receives either exactly one eligible WorkItem reference or an explicit null result — never a partial or ambiguous response.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `tasks.backend` not configured in manifest | Exits non-zero with a clear message; does not silently return null | `ISSUE_BOARD_NOT_CONFIGURED` |
| `--type` supplied with a value other than `"bug"` | Exits non-zero, explains only `bug` is supported this milestone | `UNSUPPORTED_TYPE` (not `INVALID_TYPE` — that code is already used by `lib/issues/interface.mjs` for a different, non-empty-string validation failure; reusing it would collide two distinct error conditions on one code across the same call stack) |
| `--max-priority` is `P0` or `P1` | Exits non-zero, explains P0/P1 are outside the safety boundary and cannot be selected via this verb | `INVALID_PRIORITY_BOUND` |
| `--max-priority` is malformed (not P0-P4) | Exits non-zero, reports the invalid value | `INVALID_PRIORITY_BOUND` |
| No eligible bug exists | **Not an error.** Returns `{"bug": null}`, exit code 0 | — |

## System Constitution Reference

- **Principle:** "Minimize external dependencies — prefer Node.js built-ins" — Applies because the eligibility filter (priority band, blast-radius/module check, excluded-module safety list, attempt-cap consult) is implemented entirely with Node built-ins and the existing `IssueManagerInterface`; no new dependency is introduced.
- **Principle:** "Pure ESM — all `.mjs` files" — Applies because the new CLI verb implementation lives in `lib/cli/` as an ESM module per existing convention.
- **Anti-Pattern:** "No `Run inline Node.js:` step directives... inside `skills/*/SKILL.md`. Skills name a CLI subcommand." — Applies because the sibling `/adev:bugfix-loop` skill (specified separately) will invoke `adev issues next ... --json` as a named CLI subcommand rather than embedding this filter logic inline in skill prose.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Implement `adev issues next` CLI verb | New `lib/cli/issues-next.mjs` wrapping `IssueManager.list`/`get` with the eligibility filter | medium |
| Add `affected_modules` field to `WorkItem` | Per `task-management/charter.md` revision 8. **Done, this revision:** JSON adapter already merges arbitrary fields generically; beads adapter fixed in `lib/issues/beads-adapter.mjs` — added to the `CONTEXT_FIELDS` allowlist and read back in `_toIssue()` (round-3 review RI-2) | small |
| Implement `adev issues set-modules` CLI verb (v1 producer) | New `lib/cli/issues-set-modules.mjs`, wired into the `adev issues` dispatcher (`lib/cli/issues.mjs`). Wraps `IssueManager.update(id, { affected_modules })`; works on both backends. Closes the "no producer exists anywhere" gap (round-3 review WR-1) — deliberately unpolished, the richer `/adev:issues create/update --affected-modules` flag and GitHub-label sync stay Deferred Capabilities. **Done, this revision.** | small |
| Implement eligibility filter logic | Priority band (BEH-8/BEH-9, with the P0-P4↔0-4 mapping), fail-closed unclassified check (BEH-10), blast-radius/module check (BEH-6), excluded-module safety list (BEH-7), unrecognized-slug fail-closed check (BEH-11 — validates each `affected_modules` entry against `manifest.modules[].slug` at read time), attempt-cap consult (BEH-5) | medium |
| Add manifest config for the additive excluded-module list | `tasks.bugfix_loop.excluded_modules`, layered on top of the four hardcoded reserved safety tags (`review-gate`, `convergence-detector`, `retry-loop`, `bugfix-loop`), which are never manifest-overridable | small |
| Wire attempt-cap consult | Read `AttemptRecord` from `.context-index/lifecycle-state/` per the schema the sibling `per-issue-attempt-cap` spec defines | small |
| Tests | `node:test` coverage for the full eligibility matrix: priority band + P0-P4 mapping, lease state, blocking deps, attempt cap (exact 3-verdict exclusion set), unclassified-fail-closed, multi-module blast radius, reserved-tag safety list, unrecognized-slug fail-closed (BEH-11 — a slug present but absent from `manifest.modules[].slug`), tie-breaking. **Producer/adapter coverage done, this revision:** `tests/issues/beads-adapter.test.mjs` (affected_modules round-trip) and `tests/issues/set-modules.test.mjs` (CLI end-to-end, both backends) | medium |

## Acceptance Criteria

- [ ] `adev issues next --type bug --max-priority P3 --json` returns the highest-priority eligible bug, or `{"bug": null}` if none qualify
- [ ] `--max-priority` values `P0`-`P4` map exactly onto `WorkItem.priority` `0`-`4`
- [ ] P0/P1 bugs are never returned regardless of flags — the safety boundary is enforced, not merely a default
- [ ] A WorkItem with no `affected_modules` set is excluded from candidacy (fail-closed default), not silently passed through
- [x] `adev issues set-modules <id> <slug>[,<slug>...]` sets `affected_modules` and the change round-trips through `IssueManager.get()`/`list()` on both the `json` and `beads` backends (round-3 review RI-2/WR-1 — verified in `tests/issues/set-modules.test.mjs` and `tests/issues/beads-adapter.test.mjs`)
- [ ] Multi-module blast-radius bugs (`affected_modules.length > 1`) are excluded from candidacy
- [ ] Bugs whose single `affected_modules` entry is a reserved safety tag or manifest-configured excluded module are excluded unconditionally
- [ ] Bugs whose single `affected_modules` entry is neither a reserved safety tag nor found in `manifest.modules[].slug` (an unrecognized or misspelled slug) are excluded from candidacy, identically to the empty/absent case (BEH-11)
- [ ] Claimed bugs with a non-expired lease are excluded from candidacy
- [ ] Blocked bugs (open dependencies) are excluded from candidacy
- [ ] Bugs with `AttemptRecord.last_verdict` ∈ `{NO_PROGRESS, REGRESSED, BUDGET_EXHAUSTED, UNREPRODUCIBLE}` are excluded from candidacy — the exact set the sibling spec defines, no subset; bugs with no `AttemptRecord` are treated as zero attempts
- [ ] Ties within a priority band resolve FIFO by `created` timestamp
- [ ] Invalid `--type` (`UNSUPPORTED_TYPE`) or `--max-priority` values produce a clear, non-zero-exit error, not a silent empty result
- [ ] All quality gates pass (`npm test`)
- [ ] No constitutional violations introduced
