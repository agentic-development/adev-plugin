---
topic: "How much of /adev:review-specs is actually useful, and what can shift left into implementation"
date: "2026-08-13"
relates-to: ".context-index/research/review-validation-restructuring.md"
sources:
  - internal
status: complete
---

## Summary

**Method note first, because it inverts the obvious reading.** `.review.md` artifacts are rewritten in place on every re-review, so the working tree preserves only each spec's *final* verdict. Read from the snapshot, the corpus shows zero `BLOCK` and a 79% `PASS_WITH_NOTES` rate — a gate that appears never to have stopped anything. That is an artifact of the storage model, not a fact about the gate. Sweeping all 695 historical versions of every `.review.md` across git history — deduped to 447 distinct-content versions, then collapsed to material rounds, and split by whether the work ever reached `main` — gives the real picture.

**The gate bites, and every `BLOCK` forces a revision.** On main-reachable history: 232 specs, 308 material review rounds, **23 `BLOCK` verdicts across 21 specs (9.1%)**. Twenty-eight commits exist whose entire purpose is resolving review blockers. **Every one of the 21 specs that opened `BLOCK` required at least one more round — 100%, versus 15.5% for specs opening `PASS_WITH_NOTES`.** All 21 eventually shipped. On main, `BLOCK` is a revision trigger, not a kill switch, and it is the single strongest predictor in the dataset of whether more work is coming.

**The loop is not generally pathological — the pathology is a tail.** 74.6% of main-shipped specs converge in one material round; 93.6% within two. The 3+-round tail is 6.5% of specs but consumes 15.3% of all review rounds. (Both figures are bounds, not point estimates — see the caveat in §A.)

**Where the user's regression intuition is right.** The tail is where review turns destructive, and `test-depth-policy.spec.md` is the extreme case: **ten rounds**, blocker history `8-7-6-4-10-7-2-1-1-0`. At round 5 the author built enforcement machinery *from round 4's own reviewer recommendations*; all three reviewers then found it non-functional and blockers rose 4 → 10. Resolution was a **descope** at round 6, five rounds after the trajectory stopped improving. Across that arc the spec grew **34 KB → 57 KB (+65%) while shrinking in scope**.

**The mechanism:** spec review has no ground truth. Reviewers reason about markdown against markdown. Every consequential round-5 blocker was settled by *reading code* (`write-handoff.mjs:43-46` hashes contents only; `git diff --name-only` omits untracked files; N of 150 plans lack a `**Files:**` block) — facts a command answers in seconds. Worse, round 5's "17 of 150 plans" figure was **wrong**; the correct per-task measurement is 131 of 149, and discovering that consumed round 6. A full round was spent correcting a number a committed command could not have gotten wrong.

**The highest-leverage fix already exists and is mis-scoped.** `lib/loop-convergence.mjs` implements exactly the right guard — `REGRESSED` = `|new| > |addressed|` (the precise round-5 signature), plus `NO_PROGRESS` and `BUDGET_EXHAUSTED`, default budget 2. It is wired **only** into `/adev:build --full`'s auto-retry. The ten-round saga ran interactively through `/adev:review-specs` + `/adev:specify --revise`, where nothing counts rounds and nothing detects regression. Since the median review is healthy and damage concentrates in a small tail, a tail-bounding guard is the right shape of fix — not a redesign of the gate.

## Findings

### A. Corpus census (from git history, not the working tree)

Sweep: every commit touching `.context-index/specs/**/*.review.md`, all refs, test fixtures excluded.

| Layer | Count |
|---|---|
| Raw (commit, file) versions | 695 |
| Distinct-content versions (dedup by blob — removes rebase duplicates) | 447 |
| Material rounds, all refs | 350 across 252 specs |
| **Material rounds, main-reachable** | **308 across 232 specs** |

Three commits × 107 files each (one cross-reference refactor, rebase-duplicated across branches) accounted for 46% of raw versions — hence the dedup layers. A *material* round is one where verdict, `last-reviewed-revision`, or blocker/warning/suggestion counts changed from the prior version.

**Main-reachable is the primary corpus** below: `git log --all` includes branches that were abandoned, and review rounds on dead branches are effort spent but not gate outcomes on shipped work.

**Verdicts (main-reachable, 308 rounds):**

| Verdict | Count | Share | (all refs) |
|---|---|---|---|
| `PASS_WITH_NOTES` | 216 | 70.1% | 66.9% |
| `PASS` | 68 | 22.1% | 22.0% |
| **`BLOCK`** | **23** | **7.5%** | 10.3% |
| unparsed (legacy format) | 1 | 0.3% | 0.9% |

Snapshot-only reading gave 162 / 44 / **0**. The entire `BLOCK` population is invisible in the working tree.

**Rounds per spec (main-reachable):**

| Rounds | Specs | Share | Cumulative |
|---|---|---|---|
| 1 | 173 | 74.6% | 74.6% |
| 2 | 44 | 19.0% | 93.6% |
| 3 | 13 | 5.6% | 99.1% |
| 4 | 2 | 0.9% | 100% |

Effort concentration: 1-round specs are 56.2% of all rounds, 2-round specs 28.6%, and the **6.5% of specs needing 3+ rounds consume 15.3%** of total review effort.

> **These round counts are bounds, not point estimates.** The `.review.md` trail undercounts rounds whenever several rounds land in one commit — `test-depth-policy` shows 4 material versions for a spec whose commit messages document 10 rounds (§C). The undercount runs one direction only: it makes specs look like they converged faster than they did. So **74.6% single-round is an upper bound on convergence**, and **6.5% / 15.3% is a lower bound on the tail**. This does not flip any conclusion — it strengthens the case for Option 1 — but the "not generally pathological" framing rests on the optimistic side of that bound and should be read accordingly.

**First-round verdict predicts loop length (main-reachable):**

| Opening verdict | n | Needed another round |
|---|---|---|
| `BLOCK` | 21 | **100%** |
| `PASS` | 49 | 26.5% |
| `PASS_WITH_NOTES` | 161 | 15.5% |

**Fate of the 21 main-shipped specs that ever recorded `BLOCK`:** 20 ended `PASS_WITH_NOTES`, 1 ended `PASS`. None were abandoned.

**On the eight specs left at `BLOCK` and deleted** — `measurement-integrity` (whose removal commit reads "dissolve … promote its two hard behaviors"), `plan-mode-guard`, `pr-body-advisories`, `pr-body-composition`, and four `test-strategies` profiles killed at "review round 1 — BLOCK on all four revision-5 specs": **none of them ever landed on `main`.** Every commit in their history is unreachable from `main` (verified with `git merge-base --is-ancestor`; main uses real merge commits, 237 of them, and shipped specs trace correctly). They died with abandoned branches. The `BLOCK` is correlated with their deaths, not demonstrably causal — a branch being abandoned is sufficient explanation. **No claim that the gate killed work is supportable from this data.** `measurement-integrity`'s dissolve message is the only case with a stated cause, and it is one spec on an unmerged branch.

Per-reviewer verdicts from the lifecycle event log (257 events; this log postdates much of the corpus):

| Reviewer | PASS | PASS_WITH_NOTES | FAIL | FAIL rate |
|---|---|---|---|---|
| structural-architect | 20 | 56 | 11 | 12.6% |
| security-reviewer | 32 | 41 | 12 | 14.1% |
| consistency-analyzer | 21 | 49 | 15 | 17.6% |

`security-reviewer` is the most bimodal (highest clean-PASS at 38%, mid FAIL rate) — the right profile for a specialist. `consistency-analyzer` is the least bimodal and the most talkative.

### B. Where the value is concentrated — and where it is not

Three classes in the finding corpus:

**Class 1 — Mechanical/metadata (high volume, zero judgment).** Stale `charter-revision` frontmatter, missing source-manifest placeholder, error-code naming unharmonized across siblings, "Task map should include updating hygiene SKILL.md text (twelve → thirteen passes)", dangling references left after a descope. Round 6 of the saga records a reviewer confirming *"no dangling references to conformance, evasion or raise-on-extend anywhere in `.context-index/`"* and *"behaviors 1-19 contiguous, fences balanced, tables intact"* — three reasoning-tier subagents spent on `grep` and a markdown parser.

**Class 2 — Empirical claims about existing code (high value, but settled by running things).** *"`write-handoff.mjs:43-46` hashes test file CONTENTS only, so an assigned_depth field would be unattested"*; *"`git diff --name-only` omits untracked files, which is exactly what `Create:` tasks produce"*. These changed the design. They are facts, not opinions — and one was **measured wrong**, costing a round.

**Class 3 — Genuine design judgment (the real product).** *"pick one: the regex-in-constructor pattern is the precedent"*; *"Behavior #6's retry and orphan recovery both produce 'retry openSync exactly once' but the spec does not specify how they interact with Invariant #2"*. Small class, and the justification for keeping the gate.

The three-reviewer panel is priced for Class 3 and spends most of its output on Class 1.

*Sampling caveat: 153 findings in the working-tree corpus match the strict `- **XX-N (severity):**` format (7 blocker / 63 warning / 48 suggestion / 29 info). Older reviews use looser formats, so the severity split is a sample. Verdict and round counts in §A are full-history.*

### C. The regression mechanism — `test-depth-policy` case study

The extreme tail case. The `.review.md` trail records only 4 material versions for this spec while commit messages document 10 rounds — **the artifact undercounts rounds even in history** (see the §A bounds caveat). Commit messages are the better record here.

| Round | Outcome | Spec size |
|---|---|---|
| 1-4 | blockers 8 → 7 → 6 → 4 | 34 KB @ rev 4 |
| **5** | **blockers 4 → 10 (regression)** | 41 KB @ rev 5 |
| 6 | descope; blockers 10 → 7 | 44 KB @ rev 6 |
| 7-9 | blockers 7 → 2 → 1 → 1 | 50 → 55 KB |
| 10 | **PASS**, 0 blockers | 57 KB @ rev 7 |

1. **Reviewer recommendations are unvalidated designs.** Rev 5 *"built the SEC-6 enforcement machinery from round 4's own recommendations and implemented them faithfully. All three reviewers independently found the machinery does not function."* Neither reviewers nor author could test it — at spec stage there is nothing to run. Review generated the defect it then caught, costing two rounds.

2. **Prose inflation under review pressure.** +65% size across an arc that *removed* three behaviors. Each round's fixes add clarifying clauses, scope-boundary sections, error-code rows — all new surface for the next round to find findings in. The reviewed artifact grows monotonically regardless of scope direction.

3. **Un-anchored measurements propagate.** The "17 of 150" error (correct: 131 of 149 per-task) drove a fail-closed parsing decision that round 6 reversed. Nothing pins a claim to a reproducible command.

### D. What already shipped from the 2026-05 restructuring research

| 2026-05 recommendation | Status | Evidence |
|---|---|---|
| Plan linter ("highest ROI, lowest cost") | **Not shipped** | No lint verb among the 30 in `lib/cli/` |
| Deduplicate review ↔ validate (13 → 7) | **Partial** | validate ~8 checks; double source-manifest drift check (1.5 + 1.6) remains |
| Security specialist routing during implement | **Half shipped** | `security` is a routable specialist (`skills/implement/SKILL.md:333,343`) and secondary matches reach the stage-2 reviewer (`:324`) — but the paired **static anti-pattern scan** (raw SQL concatenation, exec with user input, `innerHTML`, hardcoded secrets) does not exist anywhere in the skill. Tracked as **issue-432** (open). |
| Review skippable for pattern-following specs | **Superseded** | `require_review: true` at all risk levels; replaced by `--tier quick` (`risk-policies.yaml` records that `require_review: false` stalled the strict gate chain) |
| Track warning action rate | **Not shipped** | No disposition field; `PASS_WITH_NOTES` remains modal at 70.1% |

That research reported "118 reviews, 234 findings, **5 blockers**". Those are blocker *findings*, not `BLOCK` verdicts, so it is not directly comparable to the 23 counted here — but 5 blocker findings across 118 reviews cannot be reconciled with a history containing 23 consolidated `BLOCK` verdicts on main alone (a single `BLOCK` review typically carries several blocker findings; the saga's rounds carried 4-10 each). The most likely explanation is that it, too, measured the overwritten snapshot. §F is the structural reason.

Shipped since and directly relevant: **graduated rigor tiers** (`lib/governance/rigor-mode.mjs`) and the **convergence detector** (`lib/loop-convergence.mjs`).

The tier A/B, with a limitation the corrected data makes material:

> `review-specs`: full \$16.42 vs quick \$5.12 (**-69%**); quality **90 (full) vs 88 (quick)**, **verdict parity**. (n=2/tier, interleaved, sandbox reset.)

**Both sampled specs returned `PASS_WITH_NOTES` in both tiers.** The A/B never exercised a spec that should `BLOCK` — and `BLOCK` is 7.5% of real rounds and the one verdict that predicts more work with 100% reliability. Verdict parity on `PASS_WITH_NOTES` cases says nothing about whether one synthesized reviewer catches what three specialists catch on the cases that matter most.

### E. The convergence guard exists and is mis-scoped

`lib/loop-convergence.mjs` exports `partitionBlockers(prev, curr)` and `evaluateStopCondition(...)` → `PASS | CONTINUE | NO_PROGRESS | REGRESSED | BUDGET_EXHAUSTED`. `REGRESSED` is `|new| > |addressed|`, exactly the round-5 signature. `build.max_review_retries` defaults to 2 (`lib/manifest.mjs:87`).

Invoked **only** from `skills/build/SKILL.md:439`. `skills/review-specs/SKILL.md` never mentions convergence, round counting, or a budget. The interactive path — the one the ten-round saga ran on — is ungoverned.

### F. The review artifact destroys its own audit trail

This research had to reconstruct from git because `.review.md` is overwritten per round. Consequences already realized: 23 `BLOCK` verdicts on main are invisible in the tree; the 70.1%-vs-79% `PASS_WITH_NOTES` gap; blocker trajectories (the signal the convergence detector needs) exist only in commit prose; and the 2026-05 research's blocker count cannot be reconciled with history. `/adev:retro` and `/adev:hygiene` read the same snapshot, so **every retrospective this project has run has been reading a survivorship-biased corpus.**

The lifecycle event log (`reviewer_report` events) was built to be canonical and is append-only, but it postdates much of the corpus and carries per-reviewer verdicts, not blocker sets or round indices.

### G. Is the gate worth it? What it catches that TDD and validate structurally cannot

**The closure argument.** Both downstream gates derive their notion of correctness *from the spec*:

- `skills/write-test/SKILL.md:287` — *"Read the spec's Behavioral Contract section. For each `When...then` statement, derive one or more Test Contracts."*
- `skills/validate/SKILL.md:262` — Check 2 is **Spec Compliance**: does the code match the spec's behaviors.

Neither holds an oracle independent of the spec. So a defect **in** the spec is invisible to both *by construction*: TDD encodes the defect into tests that pass, and validate confirms the code faithfully matches the defective spec. Both gates report green.

This is sharpened by a design decision already taken: `check-set-restructure.spec.md` **relocated ADR compliance, cross-cutting compliance, and charter consistency out of validate and into review-specs** (`skills/validate/SKILL.md:486-491`). Of validate's surviving checks — quality gates, source manifest, spec compliance, constitution compliance, boundary, transition gates, visual — only **constitution compliance** is an independent oracle. Cross-artifact contradiction is now checked *nowhere else*.

**Empirical check against the blocker corpus.** Of the 23 main `BLOCK` rounds, **10 are header-only stubs** (the `adev-test-write` batch at `78e5ba3e`, 232-266 bytes each, verdict recorded but no findings) — a further consequence of §F. The 13 rounds with recorded findings yield ~27 blocker findings:

| Class | n | TDD catches? | validate catches? | Why |
|---|---|---|---|---|
| **Design-level security** — spec permits the vulnerability | 4 | No | No | Tests encode the permission and pass. `SEC-13`: the conformance leg is *self-attested by the checked party* — the mechanism works exactly as specified and is worthless. `SEC-1` (hook-driven-capture): transcripts persisted verbatim, no redaction required. |
| **Cross-artifact contradiction** — spec vs charter / ADR / sibling spec | 5 | No | **No — relocated out by design** | `CON-5`: spec says writes continue with a warning, charter says read-only-deprecated. No test can see a charter. `SA-23`: this spec ships fine; the *sibling* becomes unimplementable. |
| **Implementation-visible security** — path traversal in `scope`, `id`, `session_id`, `fromTranscript` | 5 | No | No | Tests derived from a spec that allows the value. *But* implement's stage-2 security specialist plausibly catches these in code review — see caveat below. |
| **Internal contradiction** — spec vs itself | 3 | No — **actively harmful** | No | `CON-39`: two ACs give opposite verdicts for the same input. TDD produces two contradictory tests; the implementer resolves it by weakening one. That is the gaming pattern this project built a detector for. |
| **Underspecification** — spec silent on a case | 3 | No | No | Tests encode an arbitrary choice and pass. `CON-17`: malformed YAML silently creates a duplicate id, violating a stated invariant. |
| **Mechanical/consistency** | 1 | No | No | `CON-1` naming convention — but this belongs in a linter (Option 3), not three reasoning-tier subagents. |
| **Feasibility / genuinely caught downstream** | 6 | **Yes** | Yes | `CON-21`: `title` is required by the sibling's schema, so `writeHeuristic` throws at runtime — the first test written fails. `SA-29`/`SA-30`: not implementable as specified. `SA-31`: the pinned parse doesn't match the shipped format — a fixture-based test catches it. |

**~21 of 27 (78%) are structurally invisible to TDD and validate.** The remaining 6 would have been caught downstream, more expensively.

**Caveat that cuts the other way.** The 5 implementation-visible path-traversal findings are the shakiest "review-only" claim: `/adev:implement` runs a stage-2 code-quality review with security specialist routing (`skills/implement/SKILL.md:324`), and path traversal in written code is exactly what a security code reviewer sees. Those are better described as *cheaper at review* than *only at review*. Discount them and the structurally-invisible share is **16 of 27 (59%)** — still a majority, and still the largest classes (security design, cross-artifact, internal contradiction) untouched.

**What this implies about scope.** The gate's unique product is *an oracle independent of the spec*. That is a real and irreplaceable function, but it is much narrower than what review-specs currently does. Everything it does that is a **conformance check** (does the spec match its own template, are the counts right, is the frontmatter fresh) duplicates work a linter does for free; everything **empirical about existing code** (does the parse match the shipped format) is better settled by a command; and everything about **whether the design is buildable** is better settled by a spike. What remains — and what nothing downstream can replace — is:

1. spec vs charter / ADR / sibling specs (cross-artifact contradiction)
2. spec vs itself (internal contradiction, underspecification)
3. spec vs threat model (security design, not code-level vulnerabilities)
4. spec vs feasibility (routed to a spike rather than argued)

Security is the largest single class (9 of 27, 33%), and `security-reviewer` is the most bimodal reviewer in §A — the one that usually says nothing and occasionally says something decisive. **That is the reviewer to keep unconditionally**, in every tier, on every spec.

**Evidence-base caveat:** 13 rounds, ~27 findings, and the classification is a judgment call per finding rather than a measurement. The 10 stub reviews mean roughly 40% of the `BLOCK` population contributed no evidence at all. Treat the percentages as indicative of shape, not precise.

### H. Existing issue-board coverage

Checked against `.context-index/tasks/tasks.json` (298 issues, 124 open). Much of this is already filed — mostly from the 2026-05 research, and mostly never actioned.

| This research | Existing issue | Status |
|---|---|---|
| Option 2 (append-only review records) | **issue-561** — "Append-only validate/review reports: stop overwriting `.validate.md`/`.review.md` in place, preserve per-attempt history" | Open, p2, epic-101. **Exact match**, no notes, never started |
| Option 3 (spec lint) | **issue-557** — schema-driven artifact linting, tier-2 diagnostics | Open, p3, blocked by issue-585/586 |
| — (plan linter, 2026-05) | **issue-430** | Open, p2, filed from `review-validation-restructuring.md` |
| — (dedup review↔validate) | **issue-431** | Open, p2 |
| — (security specialist in implement) | **issue-432** | Open, p2 — routing shipped, anti-pattern scan did not (see §D) |
| — (skippable review) | **issue-433** | Open, p3 — **superseded** by rigor tiers; should be closed |
| — (security verification in validate) | **issue-434** | Open, p3 |
| Adjacent | **issue-490** (p1) restructure validate around real-signal checks; **issue-514** (p2) unify quality gates and validation checks; **issue-586** (p1) fix the `.review.md` writer — same writer Option 2 touches | Open |

**Not covered by any existing issue:** Option 1 (convergence on the *interactive* path), Option 4 (falsifiable assumptions), Option 5 (spike disposition), Option 6 (spec size delta), Option 7 (tier by opening verdict), Option 8 (warning disposition), and the §G analysis itself.

**Board inconsistencies surfaced while checking:**

- **issue-527** ("Auto-Retry Loop on Review BLOCK", p1, open) — its spec `review-block-auto-retry.spec.md` is `status: validated` with plan, review, and validate reports on disk. The work shipped; the issue is stale. Note this is the *build* loop only — Option 1 (the interactive path) remains genuinely open, so the issue should be closed and Option 1 filed fresh rather than reused.
- **issue-433** — superseded by graduated rigor tiers; `risk-policies.yaml` records why `require_review: false` was rejected.
- **issue-567** ("Measurement Integrity", p1, open) — bound 1:1 to `.context-index/specs/cross-cutting/measurement-integrity.spec.md`, which **does not exist on main**. Both its creation and its dissolve commit live on unmerged branches (§A). A `/adev:reconcile` candidate.

## Options

Ordered by (value ÷ cost).

### Option 1 — Wire the existing convergence detector into the interactive review path
**What:** `/adev:review-specs` derives round number and `partitionBlockers` vs the previous round from the lifecycle log, reports the convergence verdict in Step 8, and on `REGRESSED`/`NO_PROGRESS` replaces "revise and re-review" with an explicit fork: descope, accept-with-risk, or spike.
**Cost:** Low — library, tests, and semantics all exist; wiring plus prose in one skill.
**Evidence:** §A (damage concentrated in a small tail — the shape a bounding guard fits; and the tail is a lower bound), §C round 5, §E.
**Risk:** Low.

### Option 2 — Round-stamped, append-only review records
**What:** Stop overwriting. Either `.review/<spec-slug>/round-<n>.md`, or keep the rendered `.review.md` as the current view and append the full finding set (with `blocker_id`s) per round to the lifecycle log.
**Cost:** Low-medium — a writer change in Step 6b plus readers in retro/hygiene.
**Evidence:** §F. Prerequisite infrastructure: it makes Option 1 trivial, and without it none of Options 3-9 can be evaluated. It is also the reason this research contradicts its own predecessor.

### Option 3 — Deterministic spec lint before any reviewer is dispatched
**What:** `adev spec lint <path>`, no LLM: frontmatter completeness and `charter-revision` freshness; `revision` monotonicity vs `last-reviewed-revision`; Behavior/AC numbering contiguity; Task Map ↔ Behavior coverage; error-code collisions across sibling specs; cross-spec/cross-repo reference resolution; **dangling-reference sweep after a descope**; fence balance and table integrity. Runs at the end of `/adev:specify` and as review Step 0; lint findings never reach a reviewer.
**Cost:** Medium — the repo has the pattern (`lib/diagnostics/`, `adev/*` rule ids, `lib/spec-status.mjs`, `lib/amendment-graph.mjs`).
**Evidence:** §B Class 1; round 6's reviewers hand-verifying contiguity and dangling refs.
**Payoff:** Retires most of `consistency-analyzer`'s output at zero marginal token cost, and makes those checks deterministic so they stop causing round-to-round churn.

### Option 4 — Falsifiable assumptions: pin empirical claims to commands
**What:** Specs gain an `assumptions:` block of `{ claim, command, expected }`. `adev spec verify-assumptions` runs them and records results to the lifecycle log. Reviewers are instructed that an empirical counter-claim about existing code must be filed as an assumption with a command, not as a prose blocker. `/adev:validate` re-runs the block post-implementation.
**Cost:** Medium-high — schema + verb + reviewer prompt changes.
**Evidence:** §C mechanism 3; §B Class 2 is the highest-value finding class and is entirely command-checkable.
**Payoff:** The direct attack on review-injected regression. Removes the class of round that exists only to correct a previous round's confident error, and makes reviewer claims falsifiable — a reviewer can no longer be confidently wrong for free.

### Option 5 — Route feasibility blockers to a spike, not a spec revision
**What:** A fourth reviewer disposition, **`spike`**: "I cannot tell from the spec whether this works." Non-blocking; emits a throwaway prototype task (`/adev:prototype` exists) whose result attaches to the spec as a verified assumption (Option 4).
**Cost:** Medium — reviewer prompts plus a routing rule.
**Evidence:** §C mechanism 1.

### Option 6 — Spec size delta as a review-health signal
**What:** Report spec byte-delta since `last-reviewed-revision`; warn when a round whose stated intent was descope grew the spec.
**Cost:** Trivial.
**Evidence:** §C mechanism 2 — +65% while descoping, undetected across five rounds.

### Option 7 — Tier by opening verdict, not by risk level alone
**What:** Rather than flipping the default to `quick` wholesale: a spec's *first* review runs `full` (opening verdict is the strongest signal in the dataset and is cheap relative to being wrong); rounds 2+ on a spec sitting at `PASS_WITH_NOTES` run `quick`. Specs that opened `BLOCK` stay `full` throughout — they need another round **100%** of the time and are where the panel earns out.
**Cost:** Low — tier machinery shipped; this is a resolution-precedence rule in `rigor-mode.mjs`.
**Evidence:** §A first-round predictor; §D.
**Supersedes** the naive "default everything to `quick`" reading of the A/B, which the corrected data does not support.

### Option 8 — Warning disposition tracking
**What:** Every `warning` carries a disposition (`fixed` / `accepted` / `deferred:<issue-id>`) recorded in the lifecycle log before the spec advances.
**Cost:** Low-medium (needs Option 2 to be meaningful).
**Evidence:** §A (70.1% modal `PASS_WITH_NOTES`); §D (recommended in 2026-05, never shipped, rate unchanged).

### Option 9 — Move charter/constitution/ADR conformance into implement's stage-2 review
**What:** For `quick`-tier specs only, relocate conformance checks to `/adev:implement`'s per-task reviewers, which read actual code and already do specialist routing.
**Cost:** Medium.
**Caution:** Lowest priority. The gate demonstrably forces revisions before code exists (21 specs, 100% follow-up rate), and implement's review already runs up to 3 cycles per task per stage — relocating work there risks trading one loop for another. Do not attempt without Option 8's metrics in place.

## Recommendation

**Now (low cost, high confidence):**
1. **Option 1** — wire `loop-convergence` into interactive review. The pathology is a small tail; this is the fix shaped for a tail.
2. **Option 2** — round-stamped review records. Cheap, and without it nothing else here is measurable.
3. **Option 6** — spec-delta reporting. Nearly free; makes prose inflation visible.

**Next (structural):**
4. **Option 3** — `adev spec lint`. Retires the mechanical class from LLM review permanently.
5. **Option 4** — falsifiable assumptions. The direct fix for review-injected regression.
6. **Option 7** — tier by opening verdict. Captures most of the `quick`-tier savings without betting on an A/B that never tested a `BLOCK` case.

**Then, with measurement in place:** Options 5, 8, and — only if the metrics justify it — 9.

**Keep the gate, but narrow it to its irreplaceable function.** Per §G, TDD and validate both take the spec as ground truth, so neither can catch a defect *in* the spec — ~59-78% of recorded blockers are structurally invisible downstream, concentrated in security design, cross-artifact contradiction, and internal contradiction. That function is real and nothing else in the lifecycle performs it. But it is much narrower than the current gate: conformance checks belong in a linter (Option 3), empirical claims belong in commands (Option 4), and feasibility belongs in a spike (Option 5). The end state is roughly **a linter + a spec-adversary reviewer + an always-on security reviewer**, not a three-specialist panel on every spec.

The problem was never that review runs. It is that review runs at full price on questions that are free to answer deterministically, and that nothing stops it running eleven times on the small minority of specs where it stops converging.

## Open questions

- **Does `quick` tier catch `BLOCK`-class findings?** Unknown and load-bearing: the A/B sampled two specs that both returned `PASS_WITH_NOTES` in both tiers. Re-run seeded from the 21-spec `BLOCK` population before trusting `quick` on anything but repeat rounds.
- **Do the three reviewers find *disjoint* Class 3 findings?** Answerable offline by re-scoring the 447 archived versions — no new dispatches. Determines whether the panel is redundant or complementary.
- **What actually killed the eight abandoned specs?** Their branches were never merged, so `BLOCK` cannot be credited. Whether the gate ever prevents bad work from shipping is **unmeasured**, and Option 2 is what would make it measurable going forward.
- **Were warnings ever acted on?** Still unmeasurable (no disposition field).
- **How much of the corpus predates the current reviewer registry?** Reviewer prompts, profiles, and the rigor-tier system all changed mid-corpus; the aggregate blends regimes.

## Method

Reproduction for the §A census:

```
git log --all --diff-filter=AM --format='C %H %ct' --name-only -- '*.review.md'
git rev-list main > mainrevs           # for the main-reachable split
```

→ 704 (commit, path) pairs; exclude `tests/evals/` fixtures → 695; read every blob via `git cat-file --batch` (byte offsets, not character offsets); dedupe by `(path, blob-sha)` → 447 distinct-content versions; collapse consecutive versions with identical `(verdict, last-reviewed-revision, blocker/warning/suggestion counts)` → 350 material rounds, 308 of them main-reachable. The verdict regex tolerates four historical header formats; 1 legacy artifact on main remains unparsed. All 23 main `BLOCK` matches were spot-checked to confirm the matched line is the consolidated header verdict, not a per-reviewer section verdict.

**Do not measure this corpus from the working tree.** It is survivorship-biased by construction. **Do not measure it from `--all` alone either** — that mixes in abandoned-branch work and inflates both the `BLOCK` rate and the multi-round tail.

## Related

- `.context-index/research/review-validation-restructuring.md` — 2026-05 predecessor; §D tracks what shipped, §F explains why its blocker count cannot be reconciled with history
- `.context-index/research/skill-surface-simplification-audit-2026-08.md` — overlapping checks across validate/hygiene/status/reconcile
- `.context-index/research/token-consumption-patterns-in-adev-lifecycle.md` — review-loop token multipliers
- `.context-index/specs/cross-cutting/graduated-rigor-tiers.spec.md` — `full`/`quick` contract
- `lib/loop-convergence.mjs` — existing, correct, mis-scoped convergence detector
- `lib/governance/rigor-mode.mjs`, `.context-index/governance/risk-policies.yaml`
- `skills/review-specs/SKILL.md`, `skills/build/SKILL.md:422-471`, `skills/implement/SKILL.md:517-548`
- ADR-0003 (Configurable Review Registry), ADR-0004 (Execution Profiles)
