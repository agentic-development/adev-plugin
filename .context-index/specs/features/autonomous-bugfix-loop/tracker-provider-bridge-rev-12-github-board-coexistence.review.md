---
spec: .context-index/specs/features/autonomous-bugfix-loop/tracker-provider-bridge-rev-12-github-board-coexistence.spec.md
charter: .context-index/specs/features/autonomous-bugfix-loop/charter.md
verdict: PASS_WITH_NOTES
tier: full
date: 2026-11-26
last-reviewed-revision: 1
file-sha: 287dc9bef4e30c20870ebd868b98b04fb4127dd7667f523498f2ec64811780ed
---

# Architecture Review: tracker-provider-bridge-rev-12-github-board-coexistence

> **Date:** 2026-11-26
> **Spec:** .context-index/specs/features/autonomous-bugfix-loop/tracker-provider-bridge-rev-12-github-board-coexistence.spec.md (revision 1; amends `tracker-provider-bridge.spec.md`, target revision 12)
> **Charter:** .context-index/specs/features/autonomous-bugfix-loop/charter.md (revision 12; `charter-extension: true` — four recorded divergences, charter revision is a pending follow-up)
> **Verdict:** PASS_WITH_NOTES
> **Rigor tier:** full (risk_level: high → `review_mode: full`)
> **Diff scope:** not scoped (`first-review`)
> **Registry warnings:** `BROADEN_TOOL` ×2 and `BROADEN_NETWORK` for profile `browser-review` (not used by any dispatched reviewer); `CONTEXT_PACK_FENCE_COLLISION` on the target spec and on the base `tracker-provider-bridge.spec.md` (both quote fence tokens literally; neutralized by the renderer)
> **Dispatch note:** each reviewer received its prompt verbatim from `adev governance dispatch` (`buildDispatchPlan` → `buildReviewerDispatches`), delivered as a file the reviewer read in full, because the five prompts total ~945 KB. Heuristics for module `autonomous-bugfix-loop` (4 entries) were included.
> **Governance:** risk policy `high` sets `require_hitl_approval: true` — a human must approve before `/adev:plan`.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-capable | plugin:review-specs/consistency-analyzer-prompt.md |
| referent-integrity | Referent Integrity Reviewer | subagent | reviewer-reasoning | plugin:review-specs/referent-integrity-prompt.md |
| wiring-reviewer | Wiring Reviewer | subagent | reviewer-capable | plugin:review-specs/wiring-reviewer-prompt.md |
| boundary-reviewer | Boundary Reviewer | subagent | reviewer-capable | plugin:review-specs/boundary-reviewer-prompt.md |
| termination-reviewer | Termination Reviewer | subagent | reviewer-fast | plugin:review-specs/termination-reviewer-prompt.md (triggered, score 2 ≥ 1) |

## Disabled Reviewers

| ID | Reason |
|----|--------|
| structural-architect | Disabled as part of the reviewer-domain-fit initiative. OWASP/structural scope was retargeted to referent-integrity/wiring-reviewer/consistency-analyzer/boundary-reviewer for the default (Node CLI/plugin) project shape. |
| security-reviewer | Disabled as part of the reviewer-domain-fit initiative. OWASP-scoped review relocated to the web-service domain extension (opt-in via adev extension install web-service). |

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

- **CON-1 (warning, module-boundary, `eligibility`)** — GB-3/GB-5 put GitHub-specific logic (the `gh-<n>` ID grammar, `module:` label parsing and normalization, the label pair) in the bridge module `github-board-eligibility.mjs`, and add a `tasks.backend === "github"` branch in `lib/cli/issues-next.mjs`. The charter invariant "No tracker-provider-specific logic (label names, API shape, comment format) lives outside its own `TrackerProviderAdapter` implementation" is not among the four divergences the header comment records. *Recommendation:* record it as a fifth divergence (and add it to Task 8's charter follow-up), or move the label and ID parsing behind an adapter method.
- **CON-2 (warning, contract, `eligibility`)** — GB-3/GB-4/GB-7 add `--prompt-safe` and the exit-1 `TRACKER_GATE_UNAVAILABLE` error to `adev issues next`, and GB-4 forbids `{"bug": null}` on gate failure. The verb's CLI and error contract is owned by `bug-selection-and-eligibility.spec.md`: its Error Cases table has no such row, and its Postconditions promise "exactly one eligible WorkItem reference or an explicit null". Nothing amends that spec. *Recommendation:* add a companion amendment to `bug-selection-and-eligibility`, or list it explicitly as an external task.
- **CON-3 (suggestion, terminology, `prompt-fencing`)** — GB-7 truncates titles over 200 characters, while the base inbound step 3 refuses titles past 200 characters (and GB-3.4 refuses bodies over 4000). *Recommendation:* state that the truncation is for display and rendering only (as in github-board-backend BEH-20) and deliberately differs from the base refuse posture.
- **CON-4 (suggestion, domain-model, `board-writes-and-writeback`)** — GB-9.4's writeback-only `TrackerSyncLink` (`external_ref: "github-board:gh-<n>"`, `local_issue_id: "gh-<n>"`, `accepted_at: null`) links an issue to itself, and makes `accepted_at` nullable, which the charter's entity definition does not allow. *Recommendation:* add both points to the Task 8 charter follow-up.
- **CON-5 (suggestion, contract, `eligibility`)** — GB-3.2 relies on `gateCheck()` returning the complete gated set, but `github-tracker-adapter.mjs` runs `gh issue list --json number,title,body,labels` with no `--limit`, so `gh` returns its default of 30. The raw `labels` entries are objects, not strings. *Recommendation:* say in GB-6 or Task 2 that the adapter sets an explicit `--limit` and that GB-5 reads `labels[].name`; otherwise gated items past the 30th are silently never eligible.

Notes: `charter-extension: true` and `target-revision: 12` are valid. The four documented divergences are intentional and were not flagged. The GB-5 P-1 to P-5 guarantees match github-board-backend BEH-8/19/20/39. The base filter BEH-1 to BEH-11 and the rev-8 priority band are preserved. No ADR conflicts in ADRs 0001 to 0016. ADRs 0017 to 0019 and some cross-cutting specs were left out of the pack by its size budget; no blocker rests on omitted content.

## Referent Integrity Reviewer (referent-integrity)

**Verdict:** PASS_WITH_NOTES

The reviewer checked about 60 referents against HEAD 9b72eac6: CLI verbs and flags, bridge and registry functions, adapter constants and argv, fencing, the link store, eligibility, run-state fields, error codes, the backend decode and adapter, backend spec/plan citations, test infrastructure, and skill prose. All exist as described, apart from the findings below.

- **RI-1 (warning, GB-6 / Task Map row 2)** — "registry construction passes it only on the github backend". `lib/provider/tracker-provider-registry.mjs:88` builds a module-level singleton (`register('github', createGitHubTrackerAdapter())`) at import time with no manifest, and `get(name)` takes only a name. No construction point can see `manifest.tasks.backend` or `tasks.github.repo`. *Recommendation:* name the injection point, either a `get(name, { manifest })` signature change or building the adapter at the inbound/outbound/issues-next call site with `{ repo }`.
- **RI-2 (warning, GB-6 / Task Map row 2)** — "validated by the same validator as github-board-backend BEH-2". `lib/issues/github/config.mjs:13` defines a non-exported `REPO` regex. The only exported validator, `normalizeGithubConfig(raw)`, validates the whole `tasks.github` block, which is wider than a repo check. *Recommendation:* cite `normalizeGithubConfig` explicitly, or state that the `REPO` check is exported for reuse.
- **RI-3 (warning, GB-8)** — "Nothing in the bridge or the loop writes assignees or milestones (github-board-backend BEH-19)". BEH-19 covers assignees, body, and label families, not milestones, and the backend does write Epic milestones. *Recommendation:* keep the milestone prohibition as this amendment's own rule, cite BEH-19 only for assignees, and note that milestones are written only by `createEpic`/`updateEpic`, which the loop never calls.
- **RI-4 (suggestion, Task Map row 4 / GB-7)** — `neutralizeTitle` in `prompt-report.mjs` duplicates the planned `neutralizeTitle(s)` in `lib/issues/github/untrusted-text.mjs` (github-board-backend plan Task 15). *Recommendation:* reuse it, or state why the bridge needs its own.
- **RI-5 (suggestion, Task Map row 7)** — `adev issues show --json` is missing its positional argument. The real form is `adev issues show <id> --json`.

## Wiring Reviewer (wiring-reviewer)

**Verdict:** PASS_WITH_NOTES

- **WR-1 (warning, GB-7 / Task Map row 7 / AC "Task 7 shipped")** — The only consumer of `adev tracker-sync report --issue <id> --json` is `/adev:debug` Phase 1 step 2b. That read does not exist yet and belongs to another charter. The test is a prose-presence assertion rather than a producer-to-consumer trace, and `collided` has no named reader. *Recommendation:* name the test file for the debug-side assertion, and state that `collided` is informational (stderr is its only reader) or name a reader.
- **WR-2 (suggestion, GB-7 surface 1)** — The `--prompt-safe` output fields `priority`, `affected_modules`, and `type` have no stated reader; bugfix-loop Step 2 reads only `id`. *Recommendation:* state that they exist for shape parity with the default `--json` output.
- **WR-3 (warning, Task Map row 6)** — The github-backend PARKED path (`record-attempt --raw-output` → per-issue-attempt-cap degraded blocker hash) is asserted only as skill prose. *Recommendation:* extend the GB-8 replayed-turn test to assert the AttemptRecord it writes (hash-based `curr_blockers`, no `notes` read).
- **WR-4 (warning, GB-4 / Task Map row 6)** — `TRACKER_GATE_UNAVAILABLE` exit 1 → `finish --status blocked` → BLOCKED token is tested only on the producer side. The no-false-COMPLETE guarantee depends on this whole chain. *Recommendation:* add an integration test next to `tests/integration/bugfix-loop-loop.test.mjs` that drives an unavailable `gateCheck` through to the status and the token.
- **WR-5 (suggestion, GB-9 step 4 / Task Map row 5)** — `last_comment_id` on writeback-only links has no reader beyond the shared duplicate guard, and no test shows the stale-link scan tolerating `accepted_at: null`. *Recommendation:* add that assertion and state the reader.
- **WR-6 (suggestion, GB-1 to GB-9)** — The wiring for the new modules is complete but split across GB-1, the Task Map, and the ACs. *Recommendation:* optionally add a single producer/consumer/trigger/test summary table to GB-1.

## Boundary Reviewer (boundary-reviewer)

**Verdict:** PASS_WITH_NOTES

Checklist: path containment, subprocess interpolation, and privilege posture are clean. GB-6 adds `--repo` as separate argv tokens, GB-3/GB-4 fail closed, and GB-8 lists the relaxed writes. Input trust and artifact leakage are covered by the findings below.

- **BD-1 (warning, destructive ops, Task Map row 7 / AC "Task 7 shipped")** — On the github backend, `/adev:debug` Phase 6 passing `notes` to `update()` rewrites the issue body the filer owns, and Phase 1 would feed raw, unfenced `notes` into agent context. Only a validation-time Acceptance Criterion prevents this; nothing enforces it at runtime. Tasks 1 to 6 could merge and run `--auto` against a live board before Task 7 lands. *Recommendation:* add a fail-closed runtime guard (`adev issues next` or bugfix-loop Step 0 refuses on `tasks.backend=github` until the `/adev:debug` github mode is present), or land Task 7 before Tasks 1 to 6 are exposed.
- **BD-2 (warning, artifact leakage, Task Map row 7(b) / GB-8)** — The confidence note, FAILING-CHECKS block, and insight note are to move to "a channel the filer cannot edit, e.g. the close reason", which is a public GitHub comment. The spec does not require that agent-authored content to be validated, size-bounded, or scrubbed, unlike GB-9's fixed templates. *Recommendation:* require a fixed template or a refuse-don't-sanitize validator, state where the content lands, and state that no raw issue-body text is echoed into it.
- **BD-3 (warning, input trust, GB-9.4 / GB-7)** — `--completed-at <ts>` is compared and persisted without a strict ISO-8601 refusal. The spec also does not say whether `commit-pr` (bugfix-loop-execution-hardening BEH-11) and branch-name derivation read the raw title or the neutralized one. *Recommendation:* require a strict ISO-8601 match, and state that those consumers keep reading the raw title with their refuse-don't-sanitize behavior.
- **BD-4 (suggestion, input trust, GB-5 / Task 2)** — The `gateCheck()` item contract (labels as `{name}` objects) is not pinned. A change in label shape would silently empty C-1's module labels. *Recommendation:* state the contract, and test that an item with no `labels` field is ineligible.

## Termination Reviewer (termination-reviewer)

**Verdict:** PASS_WITH_NOTES

Constructs checked: the per-turn loop (bounded through the base spec), PARKED/UNREPRODUCIBLE re-selection (bounded by the AttemptRecord cap), the GB-3.4 re-check (bounded by the turn budget), the GB-4 gate-unavailable path (fails closed; not a loop), and the GB-3.2 gate evaluation (no loop).

- **TR-1 (warning, `behavioral-delta-scope` GB-1 / GB-3.4)** — Two behaviors repeat across turns: ineligible items are re-checked every turn "with no counter", and PARKED items are re-selected. The amendment never restates the cap that bounds either on this backend. The bounds exist in `bugfix-loop-skill.spec.md` (`--max-turns` default 20, `--max-bugs`, the per-issue AttemptRecord cap default 2, `BUDGET_EXHAUSTED`). But GB-1 maps only GB-2 to GB-9 onto github, and "Unaffected" covers only json/file/beads. *Recommendation:* add one sentence saying the base per-turn budget and the AttemptRecord cap apply unchanged on github, and that the GB-3.4 re-check is bounded by `max_turns`.

---

## Summary

**Total findings:** 21 (0 blockers, 12 warnings, 9 suggestions)
**Action required:** None blocking. Before or during `/adev:plan`, consider addressing the warnings. They fall into four groups:

- **Charter or contract bookkeeping:** CON-1 is a fifth divergence the header does not record; CON-2 needs a companion amendment to `bug-selection-and-eligibility`.
- **Seams that do not exist yet:** RI-1 (registry injection point), RI-2 (repo validator).
- **Missing end-to-end tests:** WR-1, WR-3, WR-4.
- **Runtime guards:** BD-1 is the main one, ordering Task 7 before github runs; then BD-2, BD-3, RI-3 and TR-1.

The `high` risk policy requires human approval before planning. The charter revision for the recorded divergences remains a known pending follow-up.
