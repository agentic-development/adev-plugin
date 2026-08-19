---
topic: "Can the per-task TDD + 2-stage-review cycle in /adev:implement be simplified or graduated without losing the defect catches?"
date: "2026-08-17"
relates-to: "adev-plugin-tdd-cycle-simplification-xprl"
sources:
  - internal
  - web
status: draft
---

<!-- Design-only structural analysis. No yield measurement was performed: the
     instrumentation blocker named in the request (adev-plugin-882a.1) is
     unresolved, and F-I9 below documents that review-round yield is not
     recoverable from any artifact the framework writes today. Every claim that
     would need yield data to confirm is tagged [NEEDS-YIELD]. -->

## Summary

The graduation mechanism the issue asks for already exists in this repo — twice — and
`/adev:implement` is the one lifecycle skill wired into neither. `lib/governance/rigor-mode.mjs`
resolves a `full | quick` review tier for `/adev:review-specs` and `/adev:validate`, and
`lib/test-strategies/depth.mjs` resolves per-task test depth from `.routing.json` scores through a
monotonic-upward escalation pass plus a hard `thorough` floor. Implement reads only
`selected_agent` from the routing sidecar and discards the four dimension scores entirely, so the
inputs for graduating review depth are already computed, already persisted, and already unused.

The safe recommendation is therefore not to thin the cycle but to **collapse rather than cut**:
replace the two sequential per-task reviewers with one synthesized reviewer on low-risk tasks (the
pattern `graduated-rigor-tiers.spec.md` already specifies for `review-specs`), keep both lenses in
the prompt, and reuse the existing upward-only escalation + floor architecture so risk can only ever
add rigor. Two findings independently argue against uniform thinning: the published
maintainability/functional finding ratio **inverts** for AI-authored code (75% maintainability for
human code vs. 76% functional for AI-authored), and the strongest defect class the issue cites —
built-but-never-wired — is present *right now* in the TDD machinery itself (F-I6: the post-GREEN
tamper check is unwired).

## Findings

### Internal

#### F-I1 — Implement persists the graduation input and then throws it away

`/adev:route` scores every task on four dimensions and writes them to
`<plan-stem>.routing.json` (`skills/route/SKILL.md` Step 2–4). `/adev:implement` resolves that
sidecar per task via `adev implement read-routing` (`skills/implement/SKILL.md:94-114`) but consumes
**only** `selected_agent`. The `scores` object — `spec_completeness`, `pattern_coverage`,
`blast_radius`, `novelty` — is never read. `grep 'tier' skills/implement/` returns only
`model_tiers` (LLM selection) and gate `tier` (fast/integration/e2e); no rigor tier is consulted.

Answering focus area (1) directly: **yes, route's existing scores can modulate review depth, and no
new computation is required.** The plumbing gap is one CLI read away.

#### F-I2 — Routing modulates the human checkpoint, never the review

`skills/implement/SKILL.md:343-347` maps the three routes to three behaviors: `auto-agent` =
standard dispatch, `assisted-agent` = pause after RED for user review, `human-only` = scaffold only.
All three that reach implementation then run step 2f (Stage 1 spec compliance) and step 2g (Stage 2
code quality) **identically**, each with its own independent 3-cycle cap. Review depth is currently
a constant across the entire routing range.

#### F-I3 — The graduation architecture already exists for the two gate skills

`.context-index/specs/cross-cutting/graduated-rigor-tiers.spec.md` defines a `full | quick` rigor
mode with a three-source precedence chain (`--tier` override > routing "easy" signal > `risk_level`
mapped through `risk-policies.yaml` > `full` default). Its `affects:` list is
`[review-specs, validate, route, work, init, build]` — **implement is absent.**

The load-bearing design choice is stated as an invariant: *"`quick` never means 'skip' — the gate
always runs and always emits its lifecycle event"*, and under `quick` `review-specs` dispatches
**one synthesized reviewer (structural + security + consistency in one pass)** instead of three
parallel specialists. That is the exact shape available to implement's two-stage review.

`lib/governance/rigor-mode.mjs` implements `resolveRigorMode({skill, riskLevel, policies,
tierOverride, routingEasy})`. It distinguishes only `skill === "validate"` (→ `validate_mode`) from
everything else (→ `review_mode`), so adding an `implement_mode` key is a small, local change.

Status caveat: the spec is `status: review-pending` with `drift_detected: true`, and all but one of
its acceptance criteria are still unchecked — the lib helper exists, the skill-side consumption is
incomplete. Extending it to implement means building on a partially-landed foundation.

#### F-I4 — Routing-score-driven graduation is already fully built for test depth

`lib/test-strategies/depth.mjs` is the closest existing analogue to what the issue asks for, and it
is more sophisticated than the rigor-mode helper. `resolveTestDepth()` runs three passes:

1. **Static chain**, first-match-wins: spec frontmatter `test_depth:` → `modules[].test_depth` →
   `risk-policies.yaml policies[<risk_level>].test_depth` → domain default → `standard`.
2. **Escalation pass**, gated on `escalationEnabled` and a `.routing.json` entry for the task.
   Rules carry a pinned-grammar `when:` expression (`^(<=|>=|<|>|==)\s*([\d.]+)$`) evaluated by
   regex against routing-score dimensions — never `eval`. **Monotonic upward only**: a matching rule
   naming a lower depth than the chain produced is a no-op.
3. **Floor pass**, applied last, floors depth at `thorough` on any of three legs: `risk_level: high`,
   a crossed `boundaries.yaml` rule, or a target path matching the sensitive-path set. Emits a
   `DEPTH_FLOOR_APPLIED` advisory whenever a leg held, even when it changed nothing.

This is precisely the "graduates by risk rather than thinning uniformly" architecture requested in
focus area (4) — already written, already pure/unit-testable, already reading the routing sidecar.

**But note the direction, because it is the central design tension.** Escalation is upward-only:
depth starts from operator-authored policy and routing can only *raise* it. Applied unchanged to
review depth, that saves nothing — it can only add rounds. To reduce cost you must lower the
*baseline* and let risk raise it, which inverts the safety property. Any review-depth graduation
must therefore keep the floor pass (which is genuinely safety-preserving) while explicitly owning
that the new baseline is a reduction. That is a policy decision, not a mechanical port.

#### F-I5 — Test depth narrows breadth and never removes the RED phase

`skills/write-test/SKILL.md:47` states the existing precedent verbatim: *"Depth selects which case
classes the RED phase authors — it never selects which gaming detectors run."* Depth `minimal`
authors fewer case classes; it does not skip RED, and the 8-detector gaming set in
`lib/test-strategies/gaming.mjs` is depth-invariant. There is **no existing mechanism anywhere in
the framework for skipping the RED-verify step**, and the TDD mandate itself
(`skills/implement/tdd-mandate.md`) is written as an absolute: *"No production code without a
failing test first. No exceptions."*

#### F-I6 — The RED phase's most defensible output is currently consumed by nothing

The RED phase produces more than a failing test. `skills/write-test/SKILL.md` Step 6 defines a
post-GREEN tamper check, `adev:write-test --verify --packet <path>`, which does a hash check
(`write-handoff.sh verify`, stored hash vs. computed) and, on `HASH_MISMATCH`, a semantic diff of
the current test file against the `## Original Test File Contents` stored in the immutable Handoff
Block. That is a cryptographic baseline for detecting an implementer weakening tests to reach GREEN
— a defect class no code reviewer reliably catches and which cannot be reconstructed after the fact.

**No skill invokes it.** `grep -rn 'write-handoff\|--verify' skills/ hooks/ cli/ lib/cli/` returns
zero hits outside `skills/write-test/` itself. `/adev:implement` dispatches write-test for RED only.

This matters twice over. First, it means the RED step's marginal value *today* is lower than its
design implies — the Handoff Block is write-only. Second, it is a live instance of exactly the
built-but-never-wired class the issue named as the strongest argument for keeping a review layer,
sitting inside the TDD machinery itself.

By contrast, gaming detection **is** independently enforced: `hooks/hooks.json:41` wires
`hooks/gaming-gate.sh` as a `PreToolUse` hook that re-runs the detectors regardless of what the RED
step did. So on focus area (2), RED is not the only line of defense for test integrity — the hook is.

#### F-I7 — Both per-task review stages have a whole-spec analogue in /adev:validate

Comparing step 2f/2g (`skills/implement/SKILL.md:558-617`, plus
`skills/implement/code-quality-checklist.md`) against validate's check set
(`skills/validate/SKILL.md`):

| Concern | implement per-task | /adev:validate per-spec |
|---|---|---|
| Missing requirements / spec compliance | 2f Stage 1 | Check 2 |
| Extra, unrequested work (scope expansion) | 2f Stage 1 | Check 2, scope-expansion sub-finding |
| Constitution coding standards | 2g Stage 2 | Check 4 |
| Visual / UI verification | 2e | Check 11 |
| Full test suite green | after review (quality gates) | Check 1 (fail-fast) |

Nothing in Stage 1 or Stage 2 is *uniquely* covered there. What the per-task version buys is
**earliness and granularity** — a smaller diff, a cheaper fix, and attribution to one task — not
additional coverage. This reframes the whole question: removing a per-task stage does not remove a
check, it *delays* it to validate. The tradeoff is rework cost, not coverage, with one real
exception: a wrong foundation laid in task 2 that ten later tasks build on is dramatically more
expensive to fix at validate time than at task 2. Answering focus area (3): the two stages are
distinguished by *lens* (requirements vs. maintainability), and the framework's own separation of
those lenses is mirrored in the validate/review split rather than being unique to implement.

#### F-I8 — Stage-2's cycle cap is hardcoded; the equivalent build-level cap is configurable

`skills/implement/SKILL.md` step 2g states its own gap: *"Maximum 3 code-quality review cycles per
task. This is a hardcoded convention because no manifest knob exists for it yet; a config-backed
budget mirroring `build.max_review_retries` … is a follow-up."*

`build.max_review_retries` already exists as a fully validated manifest knob (`lib/manifest.mjs`
:125-157 — defaults to 2, rejects negative/fractional/non-integer with
`INVALID_MAX_REVIEW_RETRIES`, and `0` disables the loop entirely). The convergence primitive is
shared: `lib/loop-convergence.mjs` exposes `partitionBlockers(prev, curr)` and
`evaluateStopCondition()` returning `PASS | PASS_PENDING_HUMAN | CONTINUE | NO_PROGRESS |
REGRESSED | BUDGET_EXHAUSTED`.

So capping or graduating implement's review budget requires no new machinery — only a manifest key
following an existing validated pattern.

#### F-I9 — Review-round yield is not recoverable from any artifact the framework writes

This is the structural reason the request's no-measurement constraint is not merely a scheduling
problem.

- **Commit trailers carry no review provenance.** Over 2026-08-14..17 the trailers present are
  `Operator` (189), `Author-type` (189), `Spec` (108), `Plan-task` (106), `Co-Authored-By` (74),
  `Issue` (44), `Lifecycle` (5). There is no `Review-stage`, `Review-cycle`, or `Finding-id`
  trailer. A fix commit cannot be attributed to Stage 1 vs. Stage 2 vs. implementer self-review,
  even retroactively.
- **Lifecycle events record the verdict, not the findings.** Per-task escalation routes through the
  Step 2d blocker path, and `skills/implement/failure-path-exit-event.md` confirms the Stage-2
  terminals (`LOOP_BUDGET_EXHAUSTED`, `LOOP_NO_PROGRESS`, `LOOP_REGRESSED`) are recorded as a
  `plan_task` `blocked` event whose `notes` field is explicitly capped at ~200 chars and forbidden
  from carrying detail. Finding ids `cq-1`, `cq-2` … exist *within* a task's loop for convergence
  comparison and are discarded afterwards.
- **The spec that was meant to fix this was dissolved.**
  `.context-index/specs/cross-cutting/measurement-integrity.spec.md` is `status: superseded`,
  "dissolved 2026-08-13". Its stated purpose was to *"make measurement trustworthy before any
  loop-automation or simplification work builds on it (epic-101)"* — i.e. it was designed as the
  prerequisite for exactly this research. It fragmented into seven separately-tracked issues.
- **The named blocker is not readable on the board.** `adev-plugin-882a.1` does not appear in
  `.beads/issues.jsonl`; only the parent epic `adev-plugin-882a` ("Session Capture & Leak
  Prevention") is present, and its description is zero-length — one of the 11 epic bodies destroyed
  by bug `adev-plugin-g0jj` (`validateEpic` omitted `notes`; confirmed unrecoverable from all 47
  `.br_history` snapshots). Also note `br` cannot run in this worktree at all: the `.beads/beads.db`
  is absent, so read commands refuse to open storage.

There *is* a house methodology for this class of question: `lean-review-validation.md` cites the
"measured no-op table" in `check-set-restructure.spec.md` as the standing method for retiring a
check that has never fired. It cannot be applied to review stages until stage-level provenance
exists.

#### F-I10 — A routing-gated rule would fire on roughly 69% of tasks, and the sidecar data is not clean

Across all 46 `*.routing.json` sidecars in `.context-index/specs/` (385 entries):

- `auto-agent` 277, `assisted-agent` 105, `human-only` 3.
- Zero entries carry a `tier` field — the rigor tier is not persisted anywhere per task.
- Applying route's own "easy" predicate (`auto-agent` AND no dimension below 0.6) to the 373 clean
  entries yields **256 tasks, 69%**.

Two cautions:

1. **69% is too large a blast radius for a first cut.** Route's `quick`-tier predicate was written
   for `review-specs`/`validate`, where `quick` still runs a full synthesized gate. Reusing it
   unchanged to thin implement's review would change behavior on two-thirds of all tasks at once.
2. **One sidecar violates the 0..1 score contract.** All 12 entries in
   `.context-index/specs/features/domain-extensions/init-extension-picker.routing.json` carry
   un-normalized 1..5 scores (`max=5`), despite `skills/route/SKILL.md` Step 4 mandating division by
   5 and `adev route emit-sidecar` claiming to reject out-of-range values with
   `INVALID_ROUTING_ENTRY`. This is a **fail-open** hazard for the escalation design in F-I4:
   escalation rules threshold with `<=` against 0..1 values, so a 1..5-scaled score never matches
   any rule and silently *loses* escalation. Scale validation is a prerequisite, not a nicety.

Also worth flagging: the issue reports 3 auto-agent / 15 assisted-agent for the governance run,
roughly the inverse of the repo-wide 72/27 split. Whatever rule is adopted will behave very
differently on that build than on the corpus average. [NEEDS-YIELD] to know whether the governance
run's distribution or the corpus distribution is the better predictor of where defects actually are.

#### F-I11 — Commit shape corroborates the cost claim but says nothing about yield

`skills/implement/SKILL.md` step 2h item 3 makes commit-per-task mandatory — *"every plan task MUST
produce exactly one git commit"* — so commits-per-task minus one is an upper bound on extra rounds.
Over 2026-08-14..17 across all branches, commits carrying a `Plan-task` trailer: 73 task keys, 106
attributed commits, **33 beyond the one-per-task contract (31%)**; histogram 1 commit × 50 tasks,
2 × 15, 3 × 6, 4 × 2. Commit-type counts in the same window: 57 `fix` vs. 54 `feat`.

This is a commit-shape proxy inflated by docs/chore stamping commits that also carry `Plan-task`
trailers, and it is scoped to a different window than the issue's two specs. It corroborates that
follow-up rounds are a large share of implement's output. **[NEEDS-YIELD]** — it says nothing about
whether a round found a Critical finding.

Qualitatively, the follow-up commits in that window are **not** predominantly cosmetic:
`5f57e010 fix(validation): stop the boundary evaluator dropping a file at a chunk boundary`,
`574ec8ae fix(validation): default gate tier, stop the loader crashing on bad argv, correct the sha
contract`, `de56efa5 fix(lifecycle): resolve actor severity from the materialized registry, not the
domain overlay`, `84144291 fix(cli): write governance registries atomically`. Others are design-class
(`5ba75749 fix(gates): make the materialization opt-out a single named flag`). **[NEEDS-YIELD]** —
commit subjects are not a defect-class taxonomy, and this is the single most important number to
measure before acting.

#### F-I12 — Batching metadata already exists; parallel mode explicitly declines to use it

153 of 165 plan files carry a `## Parallelization` section, and `adev parallel groups --plan <plan>`
already parses it into file-disjoint groups (2–4 tasks each in the sampled plans).
`skills/implement/parallel-mode.md:27` is explicit that this changes scheduling only: *"The per-task
TDD loop, 2-stage review, and commit-per-task rules from Step 2 apply unchanged inside each
worktree."* So the grouping needed for batched review (the issue's question 5) is present and
unused, but batching collides head-on with the mandatory one-commit-per-task recovery guarantee in
step 2h — a group-level review that produces one fix commit would break the checkpoint contract.

#### F-I13 — Plan premises are never verified against the code, and prior research already flagged it

`/adev:plan` assembles a `context_packet` that reads the primary implementation file in full and
siblings as `grep "^export"` signatures only (`skills/plan/SKILL.md:432-444`). Nothing in the skill
requires verifying the plan's own factual assertions about the code. The artifacts show the cost:
`explicit-governance-registries.plan.md`'s Parallelization section carries in-place corrections —
*"the earlier text named Group B, which is wrong"*, and a dependency chain that *"asserted a
dependency"* that did not exist.

`.context-index/research/review-validation-restructuring.md` already ranked *"Implement plan linter
as first step"* as **highest ROI, lowest cost** (line 113), with seven proposed checks (task ordering
vs. dependency graph, behavior→task coverage, files-per-task, infra requirements, test strategy,
no secrets, complexity). Notably **none of the seven verify a premise against actual code** — the
specific failure the issue reports (five false DDR premises in spec 2). That gap is unaddressed.

#### F-I14 — Prior research in this repo concluded the opposite of thinning implement

Two artifacts already cover adjacent ground, and both should be reconciled with rather than
re-derived:

- `review-validation-restructuring.md` recommends deduplicating checks between review and validate
  (remove 5 from validate) and making spec review skippable for pattern-following specs — but says
  explicitly, under "Implementation Review": ***"Keep existing 2-stage subagent review in
  /adev:implement."*** Its additive recommendations are security-specialist routing for high-risk
  tasks and a static anti-pattern scan.
- `lean-review-validation.md` recommends (5) migrating mechanical checks into `lib/diagnostics/` as
  tier-2 deterministic runners — boundary compliance, transition gates, the scope-expansion half of
  spec compliance, and the greppable constitution rules — leaving LLM review only *"genuine
  judgment: does the code match the spec's intent, and does the UI look right."* It also reports a
  measured **4.5:1 advisory-to-blocker ratio** and recommends a finding cap plus a rule-derived
  verdict. (That ratio is measured for `/adev:validate`, **not** for implement's per-task reviews —
  do not transfer it.)

The deterministic-substitution strategy in the second is the one lever that reduces LLM review cost
without reducing coverage, and it has not been applied to implement's 2g checklist.

### Web

#### F-W1 — Test-first *ordering* is not the empirically active ingredient in TDD

Fucci & Turhan's replicated controlled experiment found no evidence that external code quality or
productivity improves from test-first over test-last
(https://www.semanticscholar.org/paper/A-Replicated-Experiment-on-the-Effectiveness-of-Fucci-Turhan/753ac1d6c09f895a9055aaf716c6a3c748cd1e1b).
Fucci et al.'s multi-site longitudinal replication found no statistically significant effect on
external quality or productivity versus test-last, even though TDD participants wrote significantly
more tests (https://link.springer.com/article/10.1007/s10664-016-9490-0). Munir et al.'s
meta-analysis concluded sequencing had no important influence, attributing any TDD benefit to
fine-grained steady-step cadence rather than test-first ordering
(https://www.researchgate.net/publication/260649027_The_Effects_of_Test-Driven_Development_on_External_Quality_and_Productivity_A_Meta-Analysis).
A related synthesis referencing Erdogmus et al. (2010) and Karac reports the same
(https://arxiv.org/pdf/2011.11942).

This is the strongest external support for treating strict RED ordering as procedural ceremony on
mechanical tasks — with the important caveat from F-I6 that adev's RED step also captures a tamper
baseline, which is a different value proposition than ordering and is not what these studies measured.

#### F-W2 — The maintainability/functional finding ratio inverts for AI-authored code

Mäntylä & Lassenius (9 industrial + 23 academic systems) found roughly **75% of review findings
relate to evolvability/maintainability and 25% to functional defects**, corroborated by Beller et al.
The same source reports that for AI-authored code the split **flips to 75.9% functional / 24.1%
evolvability**, with functional defects the single most common category at 43.3%
(https://www.researchgate.net/publication/224327153_What_Types_of_Defects_Are_Really_Discovered_in_Code_Reviews).

This is the most decision-relevant external finding in this study. The intuitive move — cut the
maintainability pass, keep the correctness pass — is directionally right for agent-authored code,
and it is the opposite of what the human-code literature alone would suggest.

#### F-W3 — Agent-authored code carries a materially higher defect rate

CodeRabbit's analysis of 470 GitHub PRs (Dec 2025) found AI-co-authored PRs contained ~1.7× more
issues overall than human-only, with logic/correctness +75%, security vulnerabilities ~2.74×,
readability ~3×, and performance inefficiencies ~8× more common
(https://www.coderabbit.ai/blog/state-of-ai-vs-human-code-generation-report). Watanabe et al. (2026)
found 9.9% of agent-generated methods are eventually deleted during review
(https://arxiv.org/html/2605.06464v1). Practitioner guidance recommends *more* human review time on
AI-written PRs, especially on critical paths, and warns that AI review tools may share blind spots
with AI generators (https://arxiv.org/pdf/2512.05239).

Directly relevant to the safe-under-uncertainty framing: the base rate this framework is reviewing
against is higher than the code-review literature's human baseline, which argues for graduating by
risk rather than lowering the floor.

#### F-W4 — Reviewer/round returns diminish sharply after the first pass

The SmartBear/Cisco study (~50 developers, 2,500 reviews, 3.2M LOC, 10 months) found detection
degrades beyond 200–400 LOC per session and reviews hit diminishing returns past ~60–90 minutes
regardless of size, while lightweight async review achieved comparable defect yield in under 20% of
formal-inspection time
(https://static0.smartbear.co/support/media/resources/cc/book/code-review-cisco-case-study.pdf).
A secondary analysis reports the first reviewer finds ~50% of defects, the second ~25% incremental,
with returns falling sharply beyond two reviewers due to overlap and social loafing
(https://hemaks.org/posts/why-code-reviews-are-often-a-waste-of-time-and-what-to-do-instead/).

Read against F-I7, this supports capping *rounds* more confidently than it supports removing a
*lens*: the second reviewer still contributes ~25% incremental, which is not nothing.

#### F-W5 — Distinct lenses do find distinct defects

Dunsmore et al. (2000) found reviewers struggle specifically with defects whose information is
scattered across multiple locations, which motivates specialized role-based passes rather than one
undifferentiated review (https://arxiv.org/pdf/2405.18216). Classic inspection literature puts
design/code inspection detection at ~55–60% versus ~25% unit testing, ~35% function testing, and
~45% integration testing (https://codeant.ai/blogs/code-review-process-guide).

This is the counterweight to collapsing Stage 1 and Stage 2: the distinct-lens split has empirical
backing, so the collapse should merge the two lenses into one *prompt* rather than drop one.

#### F-W6 — The built-but-never-wired class is structurally invisible to tests

Dead or disconnected code "compiles, passes tests, and hides in plain sight" because tests only
exercise what is invoked; detection requires tracing call graphs rather than reading test results
(https://axify.io/blog/dead-code). Mutation testing establishes the general limit: coverage shows a
line executed, not that an assertion validates behavior, and a mutant can survive at 100% coverage —
a semantic blind spot shared by code and by the tests written alongside it
(https://www.diffblue.com/resources/what-is-mutation-testing-java/,
https://blog.trailofbits.com/2025/09/18/use-mutation-testing-to-find-the-bugs-your-tests-dont-catch/).

This confirms the issue's own reasoning about the unwired consent prompt, and it points at a
deterministic substitute (see Recommendation 2) rather than at an LLM review round.

## Code Examples

The existing escalation architecture that a review-depth graduation should reuse. Note the
`higherDepth` guard, which is what makes the pass safe under uncertainty — a matching rule can only
raise, never lower:

```javascript
// Source: lib/test-strategies/depth.mjs (resolveEscalation / resolveTestDepth)
const matched = [];
let winner = null;
for (const rule of escalationRules ?? []) {
  const dims = Object.entries(rule.when ?? {});
  const allMatch = dims.every(
    ([dim, expr]) => routingScore[dim] !== undefined && evalExpr(expr, routingScore[dim]),
  );
  if (allMatch) {
    matched.push(rule);
    winner = winner === null ? rule.depth : higherDepth(winner, rule.depth);
  }
}
const finalDepth = higherDepth(depth, winner);   // monotonic upward only
```

The resolver that would need one new key (`implement_mode`) to bring implement into the existing
tier system:

```javascript
// Source: lib/governance/rigor-mode.mjs (resolveRigorMode)
if (tierOverride != null && tierOverride !== "") {
  if (!isValidTier(tierOverride)) throw new InvalidTierError(tierOverride);
  return tierOverride;
}
if (routingEasy === true) return "quick";
const key = skill === "validate" ? "validate_mode" : "review_mode";
const level = RISK_LEVELS.includes(riskLevel) ? riskLevel : "medium";
const modeFromPolicy = policies?.[level]?.[key];
if (isValidTier(modeFromPolicy)) return modeFromPolicy;
return "full";
```

## Recommendations

Ordered so that everything which reduces cost *without* reducing coverage comes before anything that
trades coverage for speed. Recommendations 1–3 are safe under total uncertainty about yield;
4–6 are the graduation itself and should not ship before 1.

1. **Add review-stage provenance before changing review behavior.** Extend the per-task record with
   the stage and cycle that produced each fix commit — a `Review-stage: spec-compliance|code-quality`
   plus `Review-cycle: <n>` commit trailer is the cheapest option, since the trailer mechanism,
   the `Spec:`/`Plan-task:` precedent, and the `cq-<n>` finding ids all already exist (F-I9, F-I8).
   Without this, every proposal below is unfalsifiable, and the repo's own standing method for
   retiring a check — the "measured no-op table" (F-I9) — cannot be applied. This also respects
   Principle 1: no new dependency, and `lib/loop-convergence.mjs` already computes the partition
   that would be recorded. It is the prerequisite the dissolved `measurement-integrity.spec.md` was
   meant to deliver.

2. **Wire the two catches that are currently unwired, and substitute determinism for LLM rounds.**
   Three concrete items, all coverage-increasing:
   - **Invoke `adev:write-test --verify --packet <path>` after GREEN.** The hash + semantic-diff
     tamper check is fully built and called by nothing (F-I6). This is the single largest
     coverage-per-token item in this study, and it makes the RED step's Handoff Block earn its
     keep instead of being write-only.
   - **Add a production-unreachable-export check.** `/adev:codehealth` Pass 1 searches *all* edges
     for a reference, so a symbol imported only by a test file is not flagged dead — which is
     exactly why the unwired consent prompt survived. Since `dependency-graph.json` edges carry
     `from`, "exported, referenced only from test-file paths, never from a production-reachable
     path" is computable from existing artifacts with Node built-ins only. This targets the issue's
     strongest defect class (F-W6) deterministically, at no per-task LLM cost.
   - **Migrate the greppable half of the 2g checklist into `lib/diagnostics/` tier-2 runners**, per
     `lean-review-validation.md` recommendation 5 (F-I14). Deterministic checks also run in CI and
     pre-commit, where LLM review cannot, and every item moved out shrinks the reviewer prompt
     without shrinking coverage.

3. **Add a plan-premise verification pass, and make `implement.max_review_cycles` configurable.**
   Two independent cost reducers upstream of review:
   - Prior research already ranks a plan linter highest-ROI/lowest-cost, but none of its seven
     proposed checks verifies a plan assertion against actual code — the specific failure mode the
     issue reports (F-I13). Add one check that resolves each factual claim in a task's
     `context_packet` against the current file, since a false premise corrected during implementation
     costs a full review round downstream. **[NEEDS-YIELD]** to size the saving.
   - Replace the hardcoded 3-cycle Stage-2 cap with a manifest key mirroring the already-validated
     `build.max_review_retries` (F-I8). The skill itself names this as a follow-up. This is a knob,
     not a policy change — it lets the cap be tuned once yield data exists rather than requiring a
     skill edit.

4. **Graduate by collapsing the two stages into one synthesized reviewer, never by dropping a
   stage.** This is the answer to focus areas (1) and (4). Add `implement_mode: full | quick` to
   `risk-policies.yaml` and pass `skill: "implement"` through the existing
   `resolveRigorMode()` (F-I3) — a new key, not a new mechanism. Under `quick`, dispatch **one**
   reviewer whose prompt carries both lenses (spec compliance *and* the code-quality checklist),
   mirroring exactly what `graduated-rigor-tiers.spec.md` already specifies for `review-specs`
   under `quick`. Under `full`, behavior is unchanged.

   Why collapse rather than cut: F-W5 and F-W4 together say the distinct-lens split has real
   value and the second pass still contributes meaningfully, so merging the lenses into one prompt
   preserves them while halving dispatch count and round-trip latency; and F-I7 shows neither stage
   is uniquely covered anywhere, so a dropped stage would silently defer the check to validate.
   This honors the spec's existing invariant — *`quick` never means skip* — and Principle 2, since
   the change is skill-markdown branching over a named lib helper.

5. **Reuse the escalation-plus-floor architecture, and set the trigger far tighter than route's
   existing "easy" predicate.** Port `resolveTestDepth`'s structure (F-I4): a policy-authored
   baseline, an upward-only escalation pass keyed on `.routing.json` dimensions with the same pinned
   `when:` grammar, and — critically — the **floor pass preserved verbatim**, so `risk_level: high`,
   any `boundaries.yaml` crossing, or any sensitive-path match forces `full` regardless of score.
   Two guardrails specific to review depth:
   - **Do not reuse route's `quick` predicate as-is.** It selects 69% of all tasks (F-I10), far too
     large a first cut. Start from a much tighter conjunction — for example `auto-agent` **and** all
     four dimensions at 1.0 **and** no boundary crossing **and** additive-only file changes — and
     widen only as Recommendation 1's data arrives. F-W3's higher agent-code defect base rate is
     the reason to start conservative.
   - **Validate score scale before thresholding.** The 1..5-scaled sidecar in F-I10 would make every
     `<=` escalation rule silently fail to match — a fail-open. Reject or normalize out-of-range
     scores at read time, and fall back to `full` when a task's scores are unusable.
   Also emit an advisory whenever a floor leg held, as `DEPTH_FLOOR_APPLIED` does, so a graduated run
   is auditable rather than invisible.

6. **Treat "escalate on a Critical finding" as an explicit rule, and defer batching.**
   - The issue's own suggested rule — a task that produced a Critical finding earns another round —
     fits the upward-only escalation model exactly and should be adopted as a floor leg once
     Recommendation 1 makes Critical findings observable across cycles.
   - **Defer group-level batched review** (the issue's question 5). The grouping metadata exists in
     153 of 165 plans and is deliberately unused by parallel mode (F-I12), but a group-level review
     producing a group-level fix commit collides with the mandatory one-commit-per-task recovery
     guarantee in step 2h. Per the constitution's Architecture Boundaries, that contract is not an
     autonomous change. **[NEEDS-YIELD]** and a separate spec.

**Reconciliation note.** Recommendation 4 partially contradicts
`review-validation-restructuring.md`'s explicit *"Keep existing 2-stage subagent review in
/adev:implement"* (F-I14). The contradiction is narrow and deliberate: that artifact predates the
`graduated-rigor-tiers` collapse pattern, and Recommendation 4 keeps both lenses — it changes the
dispatch count, not the check set. It should be recorded as a revision to that recommendation
rather than an unacknowledged reversal.

**Constitutional check.** Recommendations 1–5 sit inside the "Autonomous (Agent May Decide)" boundary
(editing skill markdown, refactoring within module boundaries, adding tests) and add no external
dependency (Principle 1 — all reuse `lib/governance/rigor-mode.mjs`,
`lib/test-strategies/depth.mjs`, `lib/loop-convergence.mjs`, and Node built-ins). All keep executable
logic out of SKILL.md, naming CLI verbs and lib helpers instead (Principle 2 and the
cli-driver-surface rules). Recommendation 6's batching item crosses into "Requires Human Approval"
because it alters the commit-per-task recovery contract. No recommendation changes the hook protocol,
the lifecycle skill order, or any plugin manifest.

## References

### Internal Files

- `skills/implement/SKILL.md` — per-task loop; routing consumption (94-114), routing tag check
  (343-347), Stage 1 (558-575), Stage 2 (576-617), mark-complete and commit-per-task (618-633)
- `skills/implement/tdd-mandate.md` — RED-GREEN-REFACTOR mandate and test-integrity rules
- `skills/implement/code-quality-checklist.md` — Stage 2 check list
- `skills/implement/parallel-mode.md` — group execution; line 27 preserves per-task review
- `skills/implement/integration-gate.md` — gate tiers executed during implement
- `skills/implement/failure-path-exit-event.md` — how Stage-2 convergence terminals are recorded
- `skills/route/SKILL.md` — four dimensions, thresholds, rigor-tier signal, sidecar contract
- `skills/write-test/SKILL.md` — depth pin (45), depth-invariant gaming (47), Handoff Block,
  Step 6 verify mode (458-478)
- `skills/plan/SKILL.md` — context_packet assembly (432-444)
- `skills/validate/SKILL.md` — Check 1/1.5/1.6/2/4/8/9/11
- `skills/codehealth/SKILL.md` — Pass 1 dead exports (83-111), Pass 2 orphan files
- `skills/build/SKILL.md` — `build.max_review_retries` resolution (39)
- `lib/governance/rigor-mode.mjs` — `resolveRigorMode`, `RIGOR_MODES`, `TEST_DEPTHS`
- `lib/test-strategies/depth.mjs` — chain, escalation, floor passes
- `lib/loop-convergence.mjs` — `partitionBlockers`, `evaluateStopCondition`, six verdicts
- `lib/manifest.mjs` — `build.max_review_retries` validation (125-157)
- `hooks/hooks.json` — `gaming-gate.sh` PreToolUse wiring (41)
- `.context-index/specs/cross-cutting/graduated-rigor-tiers.spec.md` — full/quick tier design
- `.context-index/specs/cross-cutting/measurement-integrity.spec.md` — dissolved; measurement
  prerequisite framing
- `.context-index/research/lean-review-validation.md` — deterministic-substitution strategy;
  4.5:1 advisory-to-blocker ratio (validate only)
- `.context-index/research/review-validation-restructuring.md` — plan linter; "keep 2-stage review"
- `.context-index/specs/features/domain-extensions/init-extension-picker.routing.json` — the
  un-normalized 1..5 sidecar
- `.beads/issues.jsonl` — issue `adev-plugin-tdd-cycle-simplification-xprl`; epic
  `adev-plugin-882a`; bug `adev-plugin-g0jj`

### Web Sources

- [A Replicated Experiment on the Effectiveness of Test-First Development](https://www.semanticscholar.org/paper/A-Replicated-Experiment-on-the-Effectiveness-of-Fucci-Turhan/753ac1d6c09f895a9055aaf716c6a3c748cd1e1b) — no quality/productivity effect from test-first ordering
- [An External Replication on the Effects of Test-Driven Development (Springer, EMSE)](https://link.springer.com/article/10.1007/s10664-016-9490-0) — multi-site replication, no significant effect
- [The Effects of TDD on External Quality and Productivity: A Meta-Analysis](https://www.researchgate.net/publication/260649027_The_Effects_of_Test-Driven_Development_on_External_Quality_and_Productivity_A_Meta-Analysis) — sequencing not influential; cadence is
- [Synthesis referencing Erdogmus et al. and Karac](https://arxiv.org/pdf/2011.11942) — ordering does not affect quality
- [What Types of Defects Are Really Discovered in Code Reviews?](https://www.researchgate.net/publication/224327153_What_Types_of_Defects_Are_Really_Discovered_in_Code_Reviews) — 75/25 evolvability/functional for human code; 75.9/24.1 inverted for AI-authored
- [Expectations, Outcomes, and Challenges of Modern Code Review (Bacchelli & Bird)](https://www.microsoft.com/en-us/research/publication/expectations-outcomes-and-challenges-of-modern-code-review/) — review value skews to knowledge transfer over defect detection
- [Google eng-practices: What to look for in a code review](https://google.github.io/eng-practices/review/reviewer/looking-for.html) and [The Standard of Code Review](https://google.github.io/eng-practices/review/reviewer/standard.html) — correctness required, style non-blocking
- [SmartBear/Cisco code review case study](https://static0.smartbear.co/support/media/resources/cc/book/code-review-cisco-case-study.pdf) — 200–400 LOC and 60–90 min limits; lightweight review at <20% cost
- [Secondary analysis of reviewer-count returns](https://hemaks.org/posts/why-code-reviews-are-often-a-waste-of-time-and-what-to-do-instead/) — ~50% first reviewer, ~25% incremental second
- [Code review roadmap referencing Dunsmore et al. (2000)](https://arxiv.org/pdf/2405.18216) — scattered-information defects motivate role-based passes
- [Code review process guide](https://codeant.ai/blogs/code-review-process-guide) — inspection vs. testing detection-rate baselines
- [Dead code guide](https://axify.io/blog/dead-code) — never-wired code passes tests; needs call-graph tracing
- [What is mutation testing](https://www.diffblue.com/resources/what-is-mutation-testing-java/) and [Use mutation testing to find the bugs your tests don't catch](https://blog.trailofbits.com/2025/09/18/use-mutation-testing-to-find-the-bugs-your-tests-dont-catch/) — coverage does not imply assertion
- [State of AI vs Human Code Generation (470 PRs)](https://www.coderabbit.ai/blog/state-of-ai-vs-human-code-generation-report) — AI PRs ~1.7× more issues
- [Watanabe et al. 2026](https://arxiv.org/html/2605.06464v1) — 9.9% of agent-generated methods deleted in review
- [Survey on AI code review blind spots](https://arxiv.org/pdf/2512.05239) — more human review on AI-authored critical paths

### GitHub Sources

None — GitHub code search was not enabled for this study (no `--github` argument).
