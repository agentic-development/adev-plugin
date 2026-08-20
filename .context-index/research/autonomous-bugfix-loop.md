---
topic: "Unattended long-duration sessions that drain bugs from the issue board automatically"
date: "2026-08-19"
relates-to:
  - .context-index/research/goal-command-adoption.md
  - .context-index/research/issue-board-merge-conflicts.md
  - .context-index/specs/cross-cutting/completion-tokens/completion-tokens.spec.md
  - .context-index/specs/cross-cutting/review-block-auto-retry.spec.md
  - .context-index/specs/features/task-management/charter.md
  - skills/build/SKILL.md
  - skills/debug/SKILL.md
  - lib/loop-convergence.mjs
  - lib/cli/issues-claim.mjs
sources:
  - internal
  - .context-index/research/goal-command-adoption.md
  - .context-index/research/issue-board-merge-conflicts.md
status: complete
---

## Summary

An unattended bug-fixing loop is four layers, and adev already owns three of them. The
loop engine, the bounding logic, the per-bug worker, and the concurrency safety all exist
in some form. What is missing is the **outer driver** (something that keeps the session
running across turns) plus **four small, well-scoped gaps**.

This artifact closes the final open question in
[`goal-command-adoption.md`](goal-command-adoption.md): *"Interaction with `/loop` and
scheduled/cloud routines for nightly unattended adev builds."*

**Verdict: do not build a new loop engine.** Compose the existing pieces, add the four
gaps, and make eligibility filtering the safety boundary. The single most important
finding is that **the filter is not polish — it is the thing that stops the loop from
auto-closing governance bugs in the machinery it depends on.**

## What already exists

| Layer | Mechanism | Location |
|---|---|---|
| Loop engine | One-step-per-turn dispatch: read state, dispatch one subagent, record, re-invoke with fresh context | `skills/build/SKILL.md` §One-Step-Per-Invocation Dispatch |
| Resumable state | `adev build-state read/create/record/next`, atomic writes, status recalculation | `lib/build-state.mjs` |
| Bounding | Convergence verdicts `PASS / CONTINUE / NO_PROGRESS / REGRESSED / BUDGET_EXHAUSTED / PASS_PENDING_HUMAN` via blocker-ID set diffing | `lib/loop-convergence.mjs` |
| Per-bug worker | `/adev:debug --issue <id> --apply` — claims in Phase 1.6, runs gates in Phase 6, closes **only** at high confidence | `skills/debug/SKILL.md` |
| Concurrency safety | `adev issues claim/release/stale` — TTL leases (240 min here), not locks | `lib/cli/issues-claim.mjs` |
| Done markers | `ADEV-BUILD: COMPLETE\|FAILED\|BLOCKED`, `ADEV-VALIDATE: PASS\|FAIL` | `completion-tokens.spec.md` (validated) |

Two properties of the existing pieces matter disproportionately for a loop:

- **`/adev:debug` is already honest about failure.** Phase 6 closes the issue only when
  quality gates pass and the fix is verified against the spec; otherwise it annotates
  (`"Fix applied but not yet validated"`) and leaves the issue open. An unattended loop
  needs exactly this — a worker that cannot mark its own failures as successes.
- **The one-step-per-turn design is deliberate anti-shortcutting.** `skills/build/SKILL.md`
  states the rationale plainly: executing one step per turn with a fresh context means the
  orchestrator "never accumulates enough context to feel compelled to shortcut." A bug
  loop should copy this discipline rather than iterating inside one long context.

## Recommended architecture

Outer driver: **`/goal`**, not `/loop`.

`/goal` is a session-scoped Stop hook plus a fast transcript evaluator — it continues until
a condition is transcript-provable. `/loop` is interval-based, which is the wrong shape for
draining a queue. Reserve `/loop` or a scheduled routine for *kicking off* a nightly run,
not for the per-bug iteration.

```
claude -p "/goal Every eligible bug on the board has either been closed by /adev:debug
with high confidence, or parked with a note explaining why a human is needed.
Stop after 15 bugs or 60 turns."
```

Inner loop, one bug per turn:

```
adev issues next --type bug --max-priority P2 --json
  -> adev issues claim <id>
  -> /adev:debug --issue <id> --apply --auto
  -> quality gates
  -> close at high confidence, or park with a note
  -> adev issues release <id>
```

**The division of labour is the load-bearing design decision:** `/goal` keeps the session
running; adev's deterministic gates decide what "fixed" means. The `/goal` evaluator
cannot run tools — it reads only the transcript. It must never be the thing that judges a
fix correct. This mirrors the conclusion already reached in `goal-command-adoption.md`.

## The four gaps

### Gap 1 — Bug-selection verb

`adev issues` exposes only `migrate / claim / release / stale`. There is **no enumeration
verb**, so the loop has no supported way to ask "what should I work on next?"

Needed: `adev issues next --type bug --max-priority P2 --json`, returning the next
eligible bug — unclaimed or expired lease, unblocked, and not already past its attempt cap.

`br ready` is not a substitute: it mixes features and bugs, and it is blind to adev claim
state.

**Ownership note:** the `task-management` charter (revision 6) owns *what* the board means
(lifecycle, tiered IDs, `next_action`, the `IssueManagerInterface` contract); the
`agent-reliable-state-artifacts` charter owns *how* it persists. A selection verb is a new
read operation on the interface, so it lands in `task-management`.

### Gap 2 — `ADEV-DEBUG:` completion tokens

`/adev:debug` emits no terminal token, so `/goal` has nothing to anchor on. Only `build`
and `validate` currently emit tokens.

Needed: `ADEV-DEBUG: FIXED | PARKED | UNREPRODUCIBLE`, following the grammar already
pinned in `completion-tokens.spec.md` — `^ADEV-[A-Z]+: [A-Z_]+$`, plain text (not fenced),
last line, exactly once per run, persona-exempt.

That spec is `status: validated` but carries `drift_detected: true`, and issue
`adev-plugin-jl90` ("make adev terminal skills /goal-friendly with transcript-provable
completion tokens") is still open despite both tokens shipping. Reconcile before extending.

### Gap 3 — Per-issue attempt cap

`lib/loop-convergence.mjs` bounds *review revisions*, not bug attempts. Without a cap the
loop grinds indefinitely on one unfixable bug — the exact failure the convergence detector
was built to catch, in a context where it is not wired up.

Needed: reuse the convergence verdicts keyed on issue id, with attempt state under
`.context-index/lifecycle-state/`.

**Ownership note:** `lib/loop-convergence.mjs` is owned by
`review-block-auto-retry.spec.md` (`status: validated`, `risk_level: high`). Reusing it for
a second loop domain touches a high-risk validated spec — treat as a coordinated change,
not an incidental import.

### Gap 4 — `--auto` on `/adev:debug`

`--auto` exists on `build`, `plan`, `retro`, and `specify`, but not `debug`. Debug Phase 6
step 3 prompts interactively about drafting an ADR, which blocks any headless run outright.

## The safety constraint (most important finding)

Eligibility filtering is the safety boundary, not a refinement to add later.

The board carries 145 open issues, 27 of them bugs. The top of the bug queue is **not**
loop material:

- `adev-plugin-j7pq.3` (P0) — *"the review gate accepts verdicts it should reject: stale
  file-sha, forged terminal events, skip-emits-PASS"*
- `adev-plugin-j7pq.1` (P1) — *"convergence detector is blind: persistent:0 is structural,
  so NO_PROGRESS never fires"*
- `adev-plugin-revise-loop-no-content-edits-q6q0` (P1) — *"BLOCK-to-revise loop cannot
  converge: reviseSpec makes no content edits but reports every blocker addressed"*

These are deep defects **in the very machinery the loop would depend on** — the review
gate, the convergence detector, the retry loop. Several also need a human to sign off on
the fix. Turned loose unfiltered, the loop would either fail repeatedly or, worse,
auto-close governance bugs with high-confidence notes.

`/adev:route` already scores blast radius and novelty, but only for **plan tasks**, not
board issues. Extending that scoring to issues is the likely prerequisite for a
trustworthy filter. Until it exists, restrict the loop to P2/P3 bugs with a single-module
blast radius and park everything else.

### Secondary safety finding: lease takeover is not atomic on beads

This project runs `tasks.backend: beads`. Per the backend capability matrix in
`docs/cli-reference.md`, **stale-lease takeover on beads is not atomic** — `br update
--claim` refuses any held issue and `--assignee` has no compare-and-set precondition, so
the adapter must clear the assignee and then claim, in two calls. Two agents observing the
same expired lease can both proceed.

Contended *live* claims are still refused atomically, so this only affects abandoned work,
and the window is bounded by TTL expiry rather than by contention. But a long-duration loop
is precisely the workload that generates abandoned claims. Either accept the bounded race,
or run the loop against `tasks.backend: json`, which has atomic takeover.

## Open questions

- Should the loop be a new skill, or a mode on an existing one? A new skill needs a
  Load Skill Extensions block and lands in the lifecycle order — which the constitution
  lists under **Requires Human Approval**. A `--bugs` mode on `/adev:build` avoids that
  but strains build's spec-centric state model, which is keyed per spec, not per issue.
- Does the attempt-cap state belong in `lifecycle-state/` (per this design) or on the
  issue itself as board metadata? The latter survives across machines and sessions; the
  former keeps board schema untouched.
- Should parked bugs be re-tried on a later run, or stay parked until a human clears the
  park? Auto-retry risks a slow-motion version of the same grinding failure.

## Extension: GitHub Issues bridge (added 2026-08-19)

The loop's bug supply doesn't have to be limited to the local board. External
contributors filing bugs on GitHub Issues, which the loop then fixes unattended, was
raised as a requirement during this doc's requirements pass and initially blocked: the
`task-management` charter's Out of Scope list excluded "External tracker sync (Jira,
Linear, GitHub Issues)" wholesale, and prior research
(`issue-board-merge-conflicts.md` §4b) had already flagged that carving out GitHub
Issues specifically is a charter-level decision, not something a spec can decide
unilaterally.

**Resolved:** `task-management/charter.md` revision 7 (2026-08-19) carves GitHub Issues
out of that exclusion, human-approved in this session. Jira/Linear remain excluded — that
part of the original decision stands. See the charter's Migration Notes for the full
rationale. Two other charters (`strategic-planning`, `context-viz`) repeat the same stale
exclusion and were **not** touched — flagged there as an open follow-up, not resolved.

**Design decision: triage-gated inbound sync, not automatic mirroring.** This follows the
standard OSS maintainer pattern (label before actionable, e.g. `confirmed`/`accepted` vs.
`needs-repro`/`wontfix`):

```
GitHub issue opened
  │   (untriaged — sync bridge ignores it; nothing local is created)
  ▼   maintainer applies acceptance label (e.g. `adev-accepted`)
Local WorkItem created, status: open, tagged with GitHub origin
  │
  ▼   loop's own eligibility filter (Gap 5/6 above: priority + blast radius)
Loop may claim it
```

Untriaged issues are **not** mirrored into the local board even in a non-actionable
state — they stay GitHub-only until labeled. This was chosen over mirror-then-promote
specifically to avoid a board-schema change on `task-management` (WorkItem has no
generic labels/tags field today — only `type`, `status`, `priority`, `next_action`,
`notes`) and to keep the local board free of untriaged noise.

This also resolves the trust-boundary risk flagged earlier (an anonymous GitHub filer
reaching an autonomous fixer with repo write access): the acceptance label is a human
checkpoint between "someone typed something on GitHub" and "an agent can act on it." It
sits *above*, not instead of, the loop's own priority/blast-radius filter — two
independent gates.

**Not yet decided:**
- The acceptance label's name/configurability (manifest field, likely
  `tasks.github_sync.accept_label` or similar).
- Outbound direction mechanics: what exactly gets written back to the GitHub issue on
  claim/fix/park (comment vs. state/label change), and whether outbound writes need their
  own confirmation gate or can be automatic once inbound is human-gated.
- Conflict handling when an issue is edited on both sides between syncs (still open per
  `issue-board-merge-conflicts.md` §4b — not resolved by the charter amendment).
- API failure isolation: GitHub unreachable/rate-limited must not block the local loop.

## Requirements (draft, consolidated 2026-08-19)

**Core loop behavior**
1. Drains the issue board of eligible bugs, one bug per turn, fresh-context per turn
   (mirrors `skills/build/SKILL.md`'s anti-shortcut discipline).
2. Terminates on a transcript-provable condition (bug count, turn budget, or board
   empty) — never on the worker's own self-report.
3. Never marks a bug fixed unless deterministic quality gates pass and `/adev:debug`
   Phase 6's confidence bar is met; otherwise parks with a note.

**Selection & eligibility (the safety boundary)**
4. Selects only bugs unclaimed (or lease-expired), unblocked, under their attempt cap.
5. Filters to a bounded blast radius / priority band (P2/P3 + single-module, pending
   issue-level blast-radius scoring) — wider gets parked, not attempted.
6. Never autonomously attempts a bug touching the loop's own dependency machinery
   (review gate, convergence detector, retry loop) regardless of priority/blast radius.

**Concurrency & state**
7. Uses leased claims (TTL), not locks — `adev issues claim/release`.
8. Per-issue attempt cap so one unfixable bug can't grind the loop indefinitely.
9. Accounts for beads' non-atomic stale-lease takeover — tolerate the bounded race, or
   document `tasks.backend: json` as the safer target for long-duration runs.

**Interfaces the loop depends on (the four gaps)**
10. Bug-selection read verb (`adev issues next --type bug ...`) — doesn't exist today.
11. `ADEV-DEBUG: FIXED | PARKED | UNREPRODUCIBLE` terminal token from `/adev:debug`.
12. `--auto` (non-interactive) mode on `/adev:debug` — Phase 6 step 3 currently prompts.
13. Reused attempt-bounding from `lib/loop-convergence.mjs`, keyed per issue instead of
    per review-revision — coordinate with `review-block-auto-retry.spec.md` (high-risk,
    validated).

**GitHub Issues bridge**
14. Inbound sync is triage-gated: a GitHub issue becomes a local WorkItem only after a
    maintainer applies an acceptance label. No local artifact exists before that.
15. Outbound: loop state changes (claimed, fixed, parked) propagate back to the GitHub
    issue (mechanism — comment vs. state change — not yet decided).
16. Conflict handling between local and GitHub edits between syncs — resolution rule
    still open (`issue-board-merge-conflicts.md` §4b).
17. GitHub API failures degrade to "local board keeps working, sync catches up later" —
    never block the bugfix loop itself.
18. The acceptance label is the trust boundary for externally-filed bugs reaching an
    agent with repo write access — this gate is load-bearing, not cosmetic triage.

**Explicitly out of scope for this requirements pass**
- The outer driver mechanism (`/goal` invocation shape).
- Auto-retry policy for parked bugs (open question, unresolved).
- Untriaged-issue mirroring (decided against — see above).

## Incidental findings

- **`docs/cli-reference.md` has committed merge-conflict markers on `origin/main`** —
  `<<<<<<< HEAD` at line 716 and `>>>>>>> e59ef658` at line 788, leaving the
  `test-helpers` and `test-debt` sections half-orphaned. Present on `main`, not only on
  `release/next`.
- **`adev-plugin-jl90` looks stale** — it asks for the completion tokens that
  `completion-tokens.spec.md` already validated and both skills already emit. The spec's
  `drift_detected: true` suggests the picture is partial rather than simply done.
