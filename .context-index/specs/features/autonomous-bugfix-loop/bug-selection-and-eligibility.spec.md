<!-- partial_schema: spec@1 -->

---
charter: autonomous-bugfix-loop
status: review-blocked
kind: behavioral
risk_level: medium
milestone: 1
revision: 1
charter-revision: 2
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
- The caller has read access to `.context-index/lifecycle-state/` for attempt-cap state. Its absence is not an error — it means no attempts have been recorded for any issue yet.
- This spec depends on the `AttemptRecord` schema defined in the charter's Domain Model and detailed by the sibling `per-issue-attempt-cap` spec (same charter, also Milestone 1). If that sibling spec's schema changes after this one ships, this verb's exclusion logic (BEH-5) must be updated to match — this is a normal parallel-spec dependency, not a blocker on writing either spec first.

### Behaviors

<!-- retired-behavior-ids: (none) -->

- **BEH-1** — **When** `adev issues next --type bug --max-priority <p> --json` is invoked with a valid `<p>` **then** it returns the single highest-priority eligible WorkItem of `type: "bug"` whose priority is numerically `<=` the resolved bound (see BEH-8 for the safety floor), or `{"bug": null}` if none qualify.
- **BEH-2** — **When** multiple candidate WorkItems tie on priority **then** the one with the oldest `created` timestamp is selected (FIFO within a priority band).
- **BEH-3** — **When** a candidate WorkItem is currently claimed with a lease that has not expired (per `tasks.claim_ttl_minutes`) **then** it is excluded from candidacy.
- **BEH-4** — **When** a candidate WorkItem has one or more open (non-closed) blocking dependencies **then** it is excluded from candidacy.
- **BEH-5** — **When** a candidate WorkItem's `AttemptRecord` shows `attempts >=` the configured per-issue cap, or `last_verdict: BUDGET_EXHAUSTED` **then** it is excluded from candidacy. **When** no `AttemptRecord` exists for a WorkItem **then** it is treated as zero attempts, not excluded.
- **BEH-6** — **When** a candidate WorkItem's associated module(s) (resolved via its `notes`/source-manifest association or an explicit module tag) span more than one entry in `manifest.yaml`'s `modules[]` **then** it is excluded from candidacy, regardless of priority.
- **BEH-7 (safety boundary)** — **When** a candidate WorkItem's associated module is in the eligibility filter's excluded-module list (the modules implementing the review gate, the convergence detector, the retry loop, or `autonomous-bugfix-loop` itself) **then** it is excluded from candidacy unconditionally — this exclusion cannot be overridden by `--max-priority` or any other flag.
- **BEH-8 (safety floor)** — **When** `--max-priority` is omitted **then** the resolved bound defaults to `P3` (covering P2 and P3, the charter's fixed eligible band). **When** `--max-priority` is `P0` or `P1` **then** the verb rejects the invocation (see Error Cases) — P0/P1 are never selectable regardless of flags, since they are outside the eligibility filter's safety boundary by design, not merely deprioritized.
- **BEH-9** — **When** `--type` is supplied with a value other than `"bug"` **then** the verb rejects the invocation (see Error Cases) — this milestone supports bug selection only.

### Postconditions

- The board is unchanged: this verb performs no writes. It never claims, closes, or mutates any WorkItem or `AttemptRecord`.
- The caller receives either exactly one eligible WorkItem reference or an explicit null result — never a partial or ambiguous response.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `tasks.backend` not configured in manifest | Exits non-zero with a clear message; does not silently return null | `ISSUE_BOARD_NOT_CONFIGURED` |
| `--type` supplied with a value other than `"bug"` | Exits non-zero, explains only `bug` is supported this milestone | `INVALID_TYPE` |
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
| Implement eligibility filter logic | Priority band (BEH-8), blast-radius/module check (BEH-6), excluded-module safety list (BEH-7), attempt-cap consult (BEH-5) | medium |
| Add manifest config for excluded-module safety list | e.g. `tasks.bugfix_loop.excluded_modules`, defaulting to the modules backing the review gate, convergence detector, and retry loop | small |
| Wire attempt-cap consult | Read `AttemptRecord` from `.context-index/lifecycle-state/` per the schema the sibling `per-issue-attempt-cap` spec defines | small |
| Tests | `node:test` coverage for the full eligibility matrix: priority band, lease state, blocking deps, attempt cap, blast radius, excluded-module list, tie-breaking | medium |

## Acceptance Criteria

- [ ] `adev issues next --type bug --max-priority P3 --json` returns the highest-priority eligible bug, or `{"bug": null}` if none qualify
- [ ] P0/P1 bugs are never returned regardless of flags — the safety boundary is enforced, not merely a default
- [ ] Multi-module blast-radius bugs are excluded from candidacy
- [ ] Bugs whose module is on the excluded-module safety list are excluded unconditionally
- [ ] Claimed bugs with a non-expired lease are excluded from candidacy
- [ ] Blocked bugs (open dependencies) are excluded from candidacy
- [ ] Bugs at or over their attempt cap are excluded from candidacy; bugs with no `AttemptRecord` are treated as zero attempts
- [ ] Ties within a priority band resolve FIFO by `created` timestamp
- [ ] Invalid `--type` or `--max-priority` values produce a clear, non-zero-exit error, not a silent empty result
- [ ] All quality gates pass (`npm test`)
- [ ] No constitutional violations introduced
