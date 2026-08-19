<!-- partial_schema: spec@1 -->

---
charter: autonomous-bugfix-loop
status: review-pending
kind: behavioral
risk_level: medium
milestone: 1
revision: 2
charter-revision: 5
created: 2026-08-19
updated: 2026-08-19
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
- **The module-safety mechanism depends on `task-management/charter.md` revision 8's new `WorkItem.affected_modules` field** (optional array of manifest `modules[].slug` values or the reserved safety tags `review-gate`, `convergence-detector`, `retry-loop`, `bugfix-loop`), added specifically to give BEH-6/BEH-7 below a real producer. It is set only by a human or maintainer — via `/adev:issues` at filing time, or (for GitHub-origin bugs, once the `tracker-provider-bridge` spec ships) a maintainer-applied `module:<slug>` GitHub label, mirroring the `bug`+`help wanted` triage-gate pattern rather than being inferred from issue title/body text.

### Behaviors

<!-- retired-behavior-ids: (none) -->

- **BEH-1** — **When** `adev issues next --type bug --max-priority <p> --json` is invoked with a valid `<p>` **then** it returns the single highest-priority eligible WorkItem of `type: "bug"` whose priority is numerically `<=` the resolved bound (see BEH-8 for the safety floor), or `{"bug": null}` if none qualify.
- **BEH-2** — **When** multiple candidate WorkItems tie on priority **then** the one with the oldest `created` timestamp is selected (FIFO within a priority band).
- **BEH-3** — **When** a candidate WorkItem is currently claimed with a lease that has not expired (per `tasks.claim_ttl_minutes`) **then** it is excluded from candidacy.
- **BEH-4** — **When** a candidate WorkItem has one or more open (non-closed) blocking dependencies **then** it is excluded from candidacy.
- **BEH-5** — **When** a candidate WorkItem's `AttemptRecord.last_verdict` is `NO_PROGRESS`, `REGRESSED`, or `BUDGET_EXHAUSTED` **then** it is excluded from candidacy — this is the exact three-value set the sibling `per-issue-attempt-cap` spec's BEH-4 defines as authoritative; this verb never diverges from it. **When** no `AttemptRecord` exists for a WorkItem **then** it is treated as zero attempts, not excluded.
- **BEH-6** — **When** a candidate WorkItem's `affected_modules` field (per `task-management/charter.md` revision 8) has more than one entry **then** it is excluded from candidacy, regardless of priority — multiple declared modules means the fix's blast radius isn't confined to one area.
- **BEH-7 (safety boundary)** — **When** a candidate WorkItem's single `affected_modules` entry is in the eligibility filter's excluded-module list (the reserved safety tags `review-gate`, `convergence-detector`, `retry-loop`, `bugfix-loop`, or a manifest `modules[].slug` a project has additionally configured as sensitive via `tasks.bugfix_loop.excluded_modules`) **then** it is excluded from candidacy unconditionally — this exclusion cannot be overridden by `--max-priority` or any other flag.
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
| Add `affected_modules` field to `WorkItem` | Per `task-management/charter.md` revision 8; both JSON and beads adapters need to read/write it | small |
| Implement eligibility filter logic | Priority band (BEH-8/BEH-9, with the P0-P4↔0-4 mapping), fail-closed unclassified check (BEH-10), blast-radius/module check (BEH-6), excluded-module safety list (BEH-7), attempt-cap consult (BEH-5) | medium |
| Add manifest config for the additive excluded-module list | `tasks.bugfix_loop.excluded_modules`, layered on top of the four hardcoded reserved safety tags (`review-gate`, `convergence-detector`, `retry-loop`, `bugfix-loop`), which are never manifest-overridable | small |
| Wire attempt-cap consult | Read `AttemptRecord` from `.context-index/lifecycle-state/` per the schema the sibling `per-issue-attempt-cap` spec defines | small |
| Tests | `node:test` coverage for the full eligibility matrix: priority band + P0-P4 mapping, lease state, blocking deps, attempt cap (exact 3-verdict exclusion set), unclassified-fail-closed, multi-module blast radius, reserved-tag safety list, tie-breaking | medium |

## Acceptance Criteria

- [ ] `adev issues next --type bug --max-priority P3 --json` returns the highest-priority eligible bug, or `{"bug": null}` if none qualify
- [ ] `--max-priority` values `P0`-`P4` map exactly onto `WorkItem.priority` `0`-`4`
- [ ] P0/P1 bugs are never returned regardless of flags — the safety boundary is enforced, not merely a default
- [ ] A WorkItem with no `affected_modules` set is excluded from candidacy (fail-closed default), not silently passed through
- [ ] Multi-module blast-radius bugs (`affected_modules.length > 1`) are excluded from candidacy
- [ ] Bugs whose single `affected_modules` entry is a reserved safety tag or manifest-configured excluded module are excluded unconditionally
- [ ] Claimed bugs with a non-expired lease are excluded from candidacy
- [ ] Blocked bugs (open dependencies) are excluded from candidacy
- [ ] Bugs with `AttemptRecord.last_verdict` ∈ `{NO_PROGRESS, REGRESSED, BUDGET_EXHAUSTED}` are excluded from candidacy — the exact set the sibling spec defines, no subset; bugs with no `AttemptRecord` are treated as zero attempts
- [ ] Ties within a priority band resolve FIFO by `created` timestamp
- [ ] Invalid `--type` (`UNSUPPORTED_TYPE`) or `--max-priority` values produce a clear, non-zero-exit error, not a silent empty result
- [ ] All quality gates pass (`npm test`)
- [ ] No constitutional violations introduced
