---
topic: "Harness Simplification Study — Eval Readiness, Artifact Patterns, Loop Automation, and Conditional HITL"
date: "2026-08-12"
relates-to: "adev-simplification-synthesis.md, review-validation-restructuring.md, anthropic-skill-best-practices.md"
sources:
  - internal
  - web
status: complete
revised: "2026-08-12 — one Part 2 claim retracted after architecture review; see the frontmatter-present row and issue-583"
---

## Summary

Four parallel investigations (eval-infrastructure audit, empirical mining of `.context-index/` artifacts, lifecycle-graph/gate mapping, external literature review) converge on one verdict:

**Simplifying the harness is the right goal, and the codebase already contains most of the primitives needed to do it safely — but the single missing prerequisite is a quality-regression harness.** Today there is no eval that can detect "we simplified skill X and quality dropped." What exists is ~80 prose-shape guards that detect *that skill text changed*, not *whether output got worse*. A simplification sweep would therefore fail CI loudly on rewordings while real regressions pass silently.

The good news is threefold:

1. The exact harness needed (`tests/evals/skill-compression/` — baseline vs. compressed skill variants, deterministic regex elements + LLM-judged dimensions) already exists in the repo. It is inert only because its `outputs/` tree was never captured.
2. The empirical record is unambiguous about what is overhead: two live validation checks that structurally cannot fail, four declared-but-unconsumed governance config surfaces, 647 session files with no signal, and a 4.5:1 advisory-to-blocking review ratio. The load-bearing minority is equally clear.
3. The consolidation targets for automated Plan-Review-Fix already have code: `lib/loop-convergence.mjs` (one caller, four prose reimplementations waiting to be absorbed), the routing sidecar, and the rigor-tier resolver. Conditional HITL is an extension of the existing tier axis, not a new mechanism.

External research (Anthropic 2024–2026, judge-bias literature, self-correction literature, MAST failure taxonomy, METR autonomy work) endorses exactly this direction and supplies the design constraints: build the golden regression suite *before* refactoring prompts; binary per-criterion judges, not 0–100 scores; fix loops must be externally grounded, role-separated, and attempt-budgeted; HITL collapses to a short always-gated list plus structural escalation triggers.

---

## Part 1 — Eval and Rubric Readiness: NOT yet sufficient to refactor safely

### What exists

| Surface | What it measures | Type | State |
|---|---|---|---|
| `tests/skills/*` (~80 files) | Skill prose contains contract strings (routes, headings, `file:line` evidence clauses) | Deterministic string-presence | Live, dense |
| `tests/evals/skill-compression/` | Baseline vs. conservative/summarized/aggressive skill variants; per-skill YAML rubrics (10 regex `required_elements` at 50% + 5 LLM-judged `quality_dimensions` at 50%) | Deterministic + LLM judge | **INERT — no `outputs/` tree; runner globs `outputs/<variant>/<skill>/output.md` and scores nothing** |
| `tests/evals/comparison/` | Cross-agent LLM-judge results | LLM judge | **FROZEN** — judge results committed but all 5 source projects are empty dirs; non-reproducible |
| `tests/evals/{configurable-governance, repomap, data-engineering, work-tracking, assess, test-strategies}` | Feature-specific fixtures | Mixed | Healthy; only repomap + skill-compression have npm scripts; **none in ci.yml** |
| `tests/evals/{data-migration, data-pipeline, process-automation, web-api}` | — | — | Empty (`.gitkeep` only) |
| `/adev:eval` (skills/eval/SKILL.md) | *User project* implementations, 4 layers, 0–100 | Agent-interpreted markdown | Scores user projects, **not adev's own skills**; Layer 3 rubric exists only as prose; `--rubric`/`rubric: default` point at a file that does not exist; zero CLI/lib backing; interactive only |
| `/adev:validate` checks | PASS/FAIL check set (12 external check files, 6 live) | Agent + CLI | Live; see Part 2 for yield analysis |
| `/adev:review-specs` reviewer prompts | blocker/warning/suggestion severity | Reviewer subagents | Externalized as swappable prompt files (good) |

### Confirmed defects

1. **CI glob bug (fix first, independently).** `package.json` test script is `node --test tests/*.test.mjs tests/**/*.test.mjs`; npm runs scripts via `sh`, which does not expand `**` recursively. **77 of 415 test files never run** — including ~50 genuine unit tests (`tests/lib/issues/*`, `tests/lib/domains/*`, `tests/lib/parallel/*`, `tests/lib/extensions/*`, `tests/lib/test-strategies/*`) and the token-budget evals. `.github/workflows/ci.yml` inherits the gap.
2. **Constitution principle #2 has zero coverage.** "Skills are primarily markdown; companion code must not be required for the skill to function" — the principle most at risk from a simplification refactor — is tested nowhere. Principles #1 (dependency minimalism) and #3 (pure ESM) are also untested.
3. **The lifecycle graph is not validated as a graph.** `single-front-door-contract.test.mjs` asserts a hardcoded 26-route list exists in prose; nothing checks that `## Next Step in the Lifecycle` targets resolve, or that handoff edges are consistent.
4. **Provider mirrors can silently diverge** — `providers/{codex,opencode}/skills/*/SKILL.md` are copies explicitly out of scope for the prose guards.

### What "comprehensive enough" requires (research-backed blueprint)

Anthropic's "Demystifying evals for AI agents" (Jan 2026), OpenAI's eval guidance, and Hamel Husain's judge work converge:

- **20–50 golden tasks drawn from real failures**, each with a reference solution proving solvability. The repo's own failure archaeology (Part 2) is the task source: the un-implementable copilot-adapter spec, the plan-task-immutability cascade, ghost-validation (issue-184), the SHA-drift bug, orchestration-drift bugs from the 2026-05-15 retro.
- **Outcome-graded** (final artifact/environment state), with trajectory assertions only for genuine invariants (TDD ordering, no out-of-scope writes — both already hook-checkable).
- **Binary per-criterion verdicts**, one dimension per judge, reference-anchored, "Unknown" escape hatch — never a judge asked to emit a number. Aggregate binaries into a score for trend-tracking only. (The 0–100 `/adev:eval` rubric is the anti-pattern here; the skill-compression YAML rubric shape is the right pattern.)
- **Held at ~100% pass as a regression gate**: no skill/prompt refactor lands without a green run.
- **Judge agreement with human verdicts tracked as a metric** — an uncalibrated judge cannot detect regressions from prompt changes.

---

## Part 2 — What the Artifacts Show (empirical)

Corpus: 234 specs, 202 reviews, 150 plans, 123 validate reports, 3,319 lifecycle events (179 append-only JSONL logs), 647 session files, 230 issues + 96 epics.

**Method caveat that is itself a finding:** `.review.md`/`.validate.md` are overwritten in place on re-run, so per-attempt history is unrecoverable except via git archaeology. Current-file state is survivorship-biased — e.g. current reviews show 0 BLOCKs, but git history contains **38 BLOCK verdicts across 24 spec files (~12%)**. The review gate does block; the evidence is being destroyed by overwrites.

### Pure overhead (cut or gate)

| Item | Evidence |
|---|---|
| **Validate Check 8 (boundaries)** | 40 PASS / 0 FAIL — a full `subagent-review` LLM dispatch per spec per run, at `severity: error`, evaluating `boundaries: []` (empty). Structurally cannot fail. |
| **Validate Check 9 (transition gates)** | 39 PASS + 1 PWN / 0 FAIL — same dispatch pattern over `transitions: {}` (empty). Always returns SKIP. |
| **Check 11 (visual)** | 34 PASS / 0 FAIL here; check-set-restructure measured 100% NO-OP over 79 dispatches. Dead weight on any non-UI repo. |
| ~~**`adev/frontmatter-present` diagnostic**~~ **— RETRACTED 2026-08-12** | ~~1,737 of 3,319 events (52%) carry this identical payload — zero discriminative value.~~ **This was wrong.** Architecture review of `measurement-integrity.spec.md` established that `lib/diagnostics/tier1/frontmatter-present.mjs` returns `{ fired: false }` for well-formed frontmatter and fires only on missing/malformed frontmatter at severity `error`. The 52% volume is **genuine violations** — 130 of 201 `.spec.md` files break the first-non-blank-line `---` rule (tracked by issue #3448, whose designated fix is a reconciliation spec, explicitly *not* a change to the diagnostic). Keep the diagnostic; fix the artifacts. See issue-583. |
| **`sessions/` capture** | 647 files, 100% git-hook auto-commits, 85% with empty `specs-touched` (even for unambiguous spec work). Adds no signal over `git log`. Wire `specs-touched` properly or stop writing them. |
| **"First-run PASS" heuristics** | 13 of 28 memory heuristics are a content-free template; 0 entries ever contradicted; no promotions ever observed. |
| **4 declared-unconsumed governance fields** | `require_hitl_approval`, `approver_role`, `transitions`, `additional_gates` — zero code consumers (see Part 3). |

### Load-bearing (keep, sharpen)

| Item | Evidence |
|---|---|
| **Check 1 (quality gates)** | The only check that ever fails (23 PASS / 12 PWN / 11 FAIL). Needs *scoping*, not removal — see escape-hatch pattern below. |
| **consistency-analyzer reviewer** | 12.3% FAIL rate; 64% of all reviewer FAILs. Highest-yield reviewer. |
| **Review gate overall** | 38 historical BLOCKs; L1 (BLOCK→revise→re-review) is the one fully automated, code-converged loop and it demonstrably fires. |
| **Check 1.5 (source manifest)** | Cheap, deterministic, occasionally fires (1 FAIL, 12 PWN). |
| **Blocker escalation** | `hygiene/blockers/copilot-adapter-task-1.md` — an agent caught a physically un-implementable spec that had passed review, documented 3 options, escalated instead of looping. This is the stuck-handling model to preserve and template. |

### Weak signal (reconsider)

- **structural-architect reviewer**: 1 FAIL in 75 reports (1.3%) despite emitting the most finding codes (813 `SA-*`). High volume, near-zero blocking yield — candidate for demotion to the quick-tier synthesized reviewer permanently. **Counterexample (2026-08-12):** in the review of `measurement-integrity.spec.md`, structural-architect produced the ADR-0012 conflict — the blocker that most changed the spec's shape — plus six substantive warnings. One data point does not overturn a 1.3% historical rate, but it argues for measuring *blocker severity/impact*, not just FAIL counts, before demoting this reviewer. Conversely, consistency-analyzer produced 2 of the 4 blockers in that same review, corroborating its "highest yield" status.
- **Check 2 (spec compliance)**: 0 FAILs, and the most expensive live subagent-review.
- **`/adev:route` human-only tier**: 0 of 270 task decisions ever routed human-only (217 auto, 53 assisted); sidecar coverage only 23% of plans.

### Dominant failure patterns

1. **"Pre-existing failure" is the validation escape hatch: 40% of validate reports contain the phrase.** All 6 current FAILs trace to harness instability (ENOTEMPTY cleanup races, missing node_modules in worktrees, another feature's untracked hooks) — not implementation defects. The 2026-05-19 retro: "the dominant quality signal this sprint was a false-negative pattern, not implementation quality." No FAIL recorded since 2026-05-17, so the fix likely landed — verify before acting.
2. **The one documented dead-end loop cost ~2.5 hours and ~$40–50** (2026-05-15 retro): 10 implement+validate dispatches sent *knowing* each would fail on the same systemic pre-existing test failure. The fix is a **pause-on-systemic-failure rule**: if the same finding ID fails N specs in a batch, halt the batch and escalate once — this is a batch-level analogue of `loop-convergence.mjs`'s NO_PROGRESS.
3. **Validate is 3× the token cost of implement** (~95K vs ~25K per dispatch; validates consumed ~1.05M of 1.48M tokens in that session) — for a read-only step. Check-set trimming already helped (check-set-restructure removed 7 checks with a measured-no-op method worth reusing); Checks 8/9/11 are the remaining known waste.
4. **A validate check that was wrong 100% of the times it fired** (Check 12 plan-checkbox warning, contradicting plan-task-events.spec.md) — since removed, but the lesson generalizes: any check whose WARN rate is 100% is either mis-specified or checking a stale contract.
5. **82 specs are marked `status: validated` with no `.validate.md` artifact** — the entire multi-repo-workspace charter among them. Status is self-asserted. Also: gate checks G1–G6 read lifecycle events *self-reported by the same agent* (`adev report --verdict PASS`) — schema-valid ≠ truthful.
6. **Check-ID vocabulary drift** — the same check logged under 4 free-text IDs (`check-1.6-code-drift|drift|drift-detection|drift-warning`). Fixable with an enum in `adev report`.
7. **Drift detection is concentrated and low-information**: `cli/index.mjs` alone accounts for 292 of 803 `code_drift_detected` events — one shared hot file re-flags against every spec that touches it.
8. **`/adev:recover` has never produced a record** (no `hygiene/recoveries/` anywhere; 4 `blocked` + 7 `step_failed` in 1,051 plan-task events). Given patterns 1–2, stuck-ness is under-recorded, not absent.

---

## Part 3 — Automating Plan-Review-Fix; Conditional HITL

### Current state of gating

- **Step gates (G1–G6) are real and code-enforced** — `requireGate` in `lib/lifecycle-state.mjs` (strict by default in this repo) refuses plan-without-review, implement-without-plan, etc. Two latent no-ops: `lib/cli/gate.mjs` maps `brainstorm` and `retro` to steps absent from `STEP_ORDER`, so those gates pass unconditionally.
- **47 interactive human stop-points (H1–H47) exist across the skills; exactly one is code-enforced** (`build --require-human-final-pass`, opt-in, off by default). Everything else is prose an agent can talk itself past.
- **Four governance config fields promise risk-conditional HITL and deliver nothing**: `require_hitl_approval` (declared in risk-policies.yaml, cited by ADR-0010, read by no code), `approver_role` (explicitly informational everywhere), `transitions: {}`, `additional_gates: []`. Wire them or delete them.
- **Session-level hook gates (lifecycle-gate-edit/bash/advisory) are dead code here** — `user-config` lifecycle.gate is unset, default off. Note the confusing dual default: `manifest.lifecycle.gate_mode` defaults **strict**, `user-config lifecycle.gate` defaults **off**.
- **Rigor tiers modulate breadth only** (1 synthesized reviewer vs 3; trimmed check set) — no HITL gate is conditional on tier/risk/routing today, except H20/H21 (assisted-agent / human-only), driven by the routing sidecar. The repo's own precedent (risk-policies.yaml:28 comment) is: don't skip gates, make them cheaper.

### Loop inventory — the consolidation opportunity

Four prose reimplementations of the same reviewer→fix→re-review→cap→escalate pattern (plan reviewer, implement Stage 1, implement Stage 2, implement visual), while `lib/loop-convergence.mjs` — pure, tested, code-enforced (`partitionBlockers`, `evaluateStopCondition` → PASS | PASS_PENDING_HUMAN | NO_PROGRESS | REGRESSED | BUDGET_EXHAUSTED | CONTINUE) — has **exactly one caller** (build's spec-revision loop L1).

Defects to fix in the process:

- **Implement Stage-2 review is unbounded** ("Repeat until approved", implement/SKILL.md:532) while siblings cap at 3. The MAST failure taxonomy calls this class "step repetition without progress"; cap it and route the cap-trip through convergence verdicts.
- Retry budgets are hardcoded prose strings ("maximum 3") in three places; make them config-backed per loop like `build.max_review_retries`.
- L2 (validate FAIL → scoped re-implement) is automated but default-disabled (`build.max_retries=0`) and uses prose convergence instead of `loop-convergence.mjs`.

**Research constraint (self-correction literature):** loops only work when each retry injects *external* evidence — test output, spec diffs, lint results — never transcript-only self-critique (Huang et al. ICLR 2024; CRITIC; CriticGPT). The reviewer must stay a separate agent/prompt from the fixer, armed with tools, tuned for precision (nitpick churn is a documented critic failure mode — and the 4.5:1 advisory-to-blocker ratio in our review corpus suggests we already have it). Every retry should cite what changed since the last attempt; "no new information" is itself an escalation trigger.

### Conditional-HITL design (extend the tier axis, don't invent a new mechanism)

Converged industry pattern (Claude Code permissions, Permit.io/LangGraph practice, Feng et al. autonomy levels, Mitchell et al.): **short always-gated list + structural escalation triggers + audit-by-default**, with the human as async *approver* rather than blocking collaborator. LLM self-reported confidence is too poorly calibrated to be a trigger — use structural signals only (routing score, failed-attempt counts, scope-expansion findings, anomalous diff size).

**Always-gated (keep blocking):** the constitution's existing "Requires Human Approval" list — merge/deploy, dependency adds, lifecycle-order changes, hook-protocol changes — plus spec sign-off when risk_level=high, and the copilot-adapter-style un-implementable-spec escalation.

**Escalation-triggered (auto until a signal fires):** convergence verdicts NO_PROGRESS/REGRESSED/BUDGET_EXHAUSTED; N verifier-checked failed attempts on a task; scope-expansion sub-finding from validate; routing dimension = 1; batch-level systemic-failure detection.

**Auto-answer (mechanical prompts with deterministic answers — wire through rigor tier / `--auto`):**

| Prompt | Why safe |
|---|---|
| H19 implementation probe "skip this task?" when files exist *and tests pass* | Deterministic condition already computed |
| H8/H11/H41 `.partial` resume prompts when `schema_allowed: true` | Marker already answers the question |
| H27 merge confirmation under `merge_policy: merge` | Redundant with code-enforced `merge-guard.sh` |
| H32 recover diagnosis confirmation for deterministic TOOL_FAILURE | Fix is mechanical (missing dep, codegen) |
| H14 constitution-boundary alert for `severity: warning` entries | boundaries.yaml already carries severity; only `error` should block |
| H39/L10 `--kind` re-prompt under `build --auto` | Currently hard-stalls unattended full-pipeline builds; needs an `--auto` default or FAILED report |

Since the only code-enforced HITL primitive is `--require-human-final-pass` + `reportHumanApprovalRequired`, the implementation path is to generalize that pair into a `hitl` policy consulted at each H-point class, driven by `risk-policies.yaml` — which finally gives `require_hitl_approval` its consumer.

### Simplification targets beyond loops (prose→code, dedup)

Near-verbatim prose duplicated across skills, all better served by one CLI verb or shared include: infra-preflight block (4 skills), `.partial` resume matrix (4), specialist match-scoring (3 — code version already exists in `lib/governance/review-config.mjs::shouldDispatch`), Playwright-missing message (2), merge-policy branch (2 + hook), capability-map status writes (6 independent markdown mutators), spec-status frontmatter transitions (4 hand-editors despite `lib/spec-status.mjs` enum), heuristics-retrieval block (6). Anthropic's context-engineering guidance ("right altitude": control flow in code, not prose) and the project's own cli-driver-surface charter both point the same way.

---

## Part 3b — The Missing Gate: Concurrent Ownership (found by using the framework, 2026-08-12)

This finding came from executing Phase 0 rather than from the four investigations, and it is the one the corpus analysis could not have produced — the artifacts record what each run did, never what two runs did at once.

**What happened.** While this study's Phase 0 was being filed and worked, a second workstream was active on the same shared board: `epic-102` ("Skill surface consolidation & provider-agnostic plumbing simplification", issues 568–581, PRs #210–#214) — pursuing substantially the same goal as this study. Neither side saw the other. Two agents independently fixed the same p0 command injection an hour apart (PR #214 and duplicate PR #215, both citing issue-582), and this study independently re-derived several conclusions epic-102 had already itemised (CLI verb consolidation, hoisting the Load Skill Extensions boilerplate, consolidating the three lifecycle-gate hooks, demoting deterministic skills to CLI verbs).

**Root cause — an asymmetry between two state stores.** The issue board resolves storage via `git rev-parse --git-common-dir` (`lib/issues/resolve-root.mjs`) and is deliberately shared across worktrees. Execution state does not: `lib/execution-state.mjs` reads `<projectRoot>/.context-index/.execution-state.json`, which is worktree-local. Measured live: `/adev:work` Step 1 reported `status: idle` in one worktree while four `epic-102` issues were `in_progress` and five PRs were open. The state scan is blind by construction, not by accident.

**Second, behavioural half.** The board *did* carry the signal — issue-582 was already `in_progress` — but nothing re-reads an issue at the moment work begins, so stale local knowledge beat the shared record.

**The structural point for this study.** The framework has code-enforced gates for lifecycle *order* — `requireGate` blocks plan-before-review, implement-before-plan, validate-before-implement — and none for concurrent *ownership*. It rigorously prevents doing things in the wrong sequence and does nothing to prevent two agents doing the same thing simultaneously. Every gate in Part 3's inventory answers "is this step allowed yet?"; no gate answers "is someone already doing this?"

This matters directly for the simplification thesis. Part 4's research endorses parallel agents for disjoint work, and the repo ships `adev parallel` with collision detection for exactly that. But collision detection operates on file overlap *within* one orchestrated run. Two independently launched sessions share a board and nothing else.

**Remedy — `epic-107`,** five issues, all reusing existing machinery rather than adding concepts:

1. **issue-606** — extend `/adev:work` Step 1 to scan open PRs, remote branches, and other-owner `in_progress` issues. Highest value, lowest cost, no new data model. Would have surfaced epic-102 before any work began.
2. **issue-607** — resolve execution state through `resolveStorageRoot()` like the board already does (or merge sibling worktrees). Decide deliberately between *shared* and *merged*, since sharing changes semantics for legitimate `--parallel` worktree work.
3. **issue-608** — `adev issues claim <id>`, an atomic check-and-set modelled on the `requireGate` precondition pattern, enforced in implement/debug preflight. **Blocked by issue-594**: claim semantics on a shared board are unverified while the JsonAdapter's concurrent-appender test is failing.
4. **issue-609** — bind issues to `branch`/`pr` so ownership is answerable offline.
5. **issue-610** — claim TTL and release path; without expiry the first crashed session locks an issue forever and the gate trains people to bypass it, which is worse than no gate.

**A note on cost ordering.** The duplicate PR cost about an hour. The duplicated *analysis* cost considerably more. The cheap scan (issue-606) addresses the expensive failure; the durable claim/lease work addresses the cheap one. Sequence accordingly.

**Loop closure worth recording:** the coordination fix depends on issue-594 (board concurrency), which surfaced only because Phase 0's test-discovery fix (issue-560) restored the ~50 unit suites that had never run. Fixing measurement first produced the prerequisite for a fix nobody had scoped.

## Part 4 — External Research Digest (condensed)

Full source list with URLs at the end. Key claims and their implication here:

- **Anthropic, "Building Effective AI Agents" (2024):** simplest structure that works; the lifecycle is a *workflow* (endorsed), and Plan-Review-Fix is their evaluator-optimizer pattern — which they gate on having clear evaluation criteria first. → Evals before automation.
- **Anthropic multi-agent research system (2025):** multi-agent wins on parallelizable read-heavy work at ~15× token cost; explicitly not most coding work. **Cognition "Don't Build Multi-Agents"** and **LangChain's** reconciliation agree: parallel review yes, parallel implementation skeptical. → Keep 3-way parallel spec review (though see structural-architect's 1.3% yield); don't expand parallel implement beyond the existing worktree isolation.
- **Anthropic context engineering (2025):** context rot; just-in-time retrieval; "right altitude" prompts. → Audit skills for pre-stuffed context and over-specified branching (the duplication table above is the hit list).
- **Anthropic "Writing effective tools for agents" (2025):** consolidate tools workflow-shaped; use the model itself to critique verb help text against failed-run transcripts (cut task time 40% in their system). → Applies directly to the `adev <verb>` surface.
- **Anthropic Agent SDK (2025):** verification ranking: rules-based > visual > LLM-judge ("generally not a very robust method" inline). → Push validate/eval toward deterministic checks; judges as calibrated offline graders only.
- **Anthropic "Demystifying evals" (Jan 2026) + OpenAI + Hamel Husain:** the golden-suite blueprint in Part 1; binary verdicts; error analysis precedes judge-building; regression suites held at ~100%.
- **Judge-bias literature (Zheng 2023; Ye 2024; Shi 2024; Chen 2025):** position/verbosity/self-enhancement biases; panels can amplify shared bias; mitigate with reference-anchored single-dimension binary rubrics and tracked human agreement.
- **Self-correction (Huang ICLR 2024; Reflexion; Self-Refine; CRITIC; CriticGPT):** intrinsic self-critique fails or degrades; external feedback + separate critic + tools works. `/adev:recover`'s corrective-context re-dispatch is Reflexion-shaped — make the failure-classification artifact mandatory in re-dispatch prompts.
- **MAST (Berkeley, NeurIPS 2025):** 14 failure modes; most agent failures are organizational (weak verification, premature termination, step repetition), not model-capability. Our known pain points (subagent scope violations, loops) are catalogued modes with known mitigations: precise dispatch specs, structural output verification (git-diff scope checks), attempt budgets.
- **METR (2025):** reliability drops sharply with task length; sub-hour task decomposition is itself a reliability intervention. → The plan skill's task decomposition is load-bearing; keep it.
- **Autonomy levels (Feng 2025; Mitchell 2025) + HITL practice:** human-as-approver (async) for most gates; risk-tier the action space; audit logs substitute for pre-hoc approval on low tiers.

---

## Recommended Roadmap

### Phase 0a — Coordination (do first; cheapest, and it protects every phase after it)

Extend `/adev:work`'s state scan to open PRs, remote branches, and other-owner `in_progress` issues (`issue-606`), and reconcile against `epic-102` before starting any simplification work. Running a simplification sweep while another workstream simplifies the same surface is the most expensive failure available here, and it already happened once. See Part 3b and `epic-107`.

### Phase 0 — Fix measurement (prerequisite for everything; small, independent PRs)

> **Packaging correction, 2026-08-13.** Phase 0 was first written up as a single cross-cutting spec (`measurement-integrity.spec.md`). That spec was **dissolved** after two review rounds. It grouped seven fixes by shared *motivation* rather than shared *contract* — different files, different modules, different failure modes — and reviewers evaluate contracts, so it fragmented: round 1 blocked on report rotation, round 2 on the check-ID enum, and both were resolved by removing them rather than revising in place. Every remaining behavior touched files another spec's source manifest already claimed, so it added a competing ownership claim without adding traceability; of ten acceptance criteria one was met, and that one was implemented from its issue before the spec passed review.
>
> The two genuinely entangled behaviors were promoted to their own specs — `check-id-enum.spec.md` and `report-rotation.spec.md`, each blocked on a real architecture decision (ADR-0010 and ADR-0012 respectively). The remaining three proceed as direct fixes under the specs that already own their files.
>
> **The generalisable lesson, and a sharper version of this study's thesis:** the review gate earned its cost on entangled design — it caught an enum that would have deleted Check 1's outcome from the event log, and a retired-ID policy contradicted by 46 spellings in the live corpus. It was pure overhead on "fix a glob", "remove two map entries", "populate a field". The framework currently applies identical ceremony to both. That is the conditional-rigor argument in Part 3, demonstrated on live work rather than inferred from the corpus.

1. Fix the `package.json` test glob (recovers ~50 silently-dropped unit tests; update ci.yml expectation).
2. Append-only validate/review reports (`*.validate.<n>.md` or timestamped sections) — already a 2026-05-19 retro recommendation; unblocks rework measurement.
3. Enum-enforce check IDs in `adev report`. (~~Drop the `adev/frontmatter-present` diagnostic~~ — retracted; see the corrected row in Part 2. The real work is fixing frontmatter placement in ~130 spec files under issue #3448.)
4. Hygiene rule: `status: validated` requires a co-located `.validate.md` (closes 82 unbacked claims).
5. Fix or stop `sessions/` capture (wire `specs-touched` or retire the writer).
6. Fix the two no-op gate mappings in `lib/cli/gate.mjs`.

### Phase 1 — Build the regression harness (before touching any skill prose)

1. Revive `tests/evals/skill-compression/`: capture baseline `outputs/` for the current skills; wire the deterministic layer into CI; run the LLM-judge layer on demand with binary per-dimension verdicts.
2. Assemble the 20–50 golden-task suite from the failure archaeology (Part 2) + reference solutions; outcome-graded; hold at ~100%.
3. Materialize the `/adev:eval` default rubric as a file; restructure its Layer 3 from 0–5 scales to binary criteria; track judge–human agreement.
4. Add tests for constitution principles #1–#3 and for lifecycle-graph edge resolution.

### Phase 2 — Automate the loops (with the harness as safety net)

1. Promote `lib/loop-convergence.mjs` to the single review-loop primitive; absorb the four prose loops; cap implement Stage-2; config-backed budgets per loop.
2. Enable L2 (validate-fail retry) by default with `max_retries: 1–2`, converged by code.
3. Batch-level systemic-failure detection (same finding ID failing N specs → halt batch, escalate once).
4. Mandatory failure-classification artifact in every recover re-dispatch; persist recovery records.

### Phase 3 — Conditional HITL

1. Generalize `reportHumanApprovalRequired` into a policy-driven `hitl` consult; wire `require_hitl_approval` (or delete it plus `approver_role`, `transitions`, `additional_gates` if not wiring).
2. Auto-answer the six mechanical prompt classes under `--auto`/quick tier (table in Part 3).
3. Keep the constitution's always-gated list blocking; move everything else to escalation triggers + audit log.

### Phase 4 — Simplification sweep (now protected by Phases 0–1)

1. Delete/gate Checks 8, 9, 11 on non-empty config; reconsider Check 2 and the structural-architect reviewer against their measured yield.
2. Dedup the nine cross-skill prose blocks into CLI verbs/shared includes; re-run the skill-compression eval after each batch.
3. Use the "measured no-op table" method from check-set-restructure.spec.md as the standing procedure for any future check/gate removal.

---

## Key sources

Anthropic: [Building Effective AI Agents](https://www.anthropic.com/research/building-effective-agents) · [Multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) · [Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) · [Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents) · [Claude Code best practices](https://www.anthropic.com/engineering/claude-code-best-practices) · [Agent SDK](https://claude.com/blog/building-agents-with-the-claude-agent-sdk) · [Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

Evals/judges: [Hamel Husain — evals](https://hamel.dev/blog/posts/evals/) · [LLM-as-judge guide](https://hamel.dev/blog/posts/llm-judge/) · [Zheng et al. MT-Bench](https://arxiv.org/abs/2306.05685) · [Ye et al. judge biases](https://arxiv.org/abs/2410.02736) · [Shi et al. position bias](https://arxiv.org/abs/2406.07791) · [Chen et al. panel bias amplification](https://arxiv.org/abs/2505.19477) · [OpenAI eval best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices) · [LangSmith trajectory evals](https://docs.langchain.com/langsmith/trajectory-evals)

Self-correction/loops: [Huang et al. — LLMs Cannot Self-Correct Reasoning Yet](https://arxiv.org/abs/2310.01798) · [Reflexion](https://arxiv.org/abs/2303.11366) · [Self-Refine](https://arxiv.org/abs/2303.17651) · [CRITIC](https://arxiv.org/abs/2305.11738) · [CriticGPT](https://openai.com/index/finding-gpt4s-mistakes-with-gpt-4/) · [MAST — Why Do Multi-Agent LLM Systems Fail?](https://arxiv.org/abs/2503.13657)

Autonomy/HITL: [METR long-task horizon](https://metr.org/blog/2025-03-19-measuring-ai-ability-to-complete-long-tasks/) · [Feng et al. — Levels of Autonomy](https://arxiv.org/abs/2506.12469) · [Mitchell et al. — Fully Autonomous Agents Should Not Be Developed](https://arxiv.org/abs/2502.02649) · [Cognition — Don't Build Multi-Agents](https://cognition.ai/blog/dont-build-multi-agents) · [LangChain — when to build multi-agent](https://www.langchain.com/blog/how-and-when-to-build-multi-agents)

## Key internal pointers

- Prior art on check removal (method to reuse): `.context-index/specs/features/validation/check-set-restructure.spec.md`
- Best failure narrative with cost numbers: `.context-index/hygiene/retros/2026-05-15-lifecycle-artifacts-build.md`
- Sprint metrics + fail-fast false-negative analysis: `.context-index/hygiene/retros/2026-05-19.md`
- The model escalation record: `.context-index/hygiene/blockers/copilot-adapter-task-1.md`
- Gate engine: `lib/lifecycle-state.mjs` (STEP_ORDER:1563, requireGate:1643, reportHumanApprovalRequired:1176); no-op mappings in `lib/cli/gate.mjs:25`
- Loop convergence primitive: `lib/loop-convergence.mjs` (partitionBlockers:66, evaluateStopCondition:95)
- Rigor tiers: `lib/governance/rigor-mode.mjs:60`; `.context-index/specs/cross-cutting/graduated-rigor-tiers.spec.md`
- Inert eval harness: `tests/evals/skill-compression/` (rubric shape to standardize on)
- Live governance config with empty rulesets: `.context-index/governance/{validate,gates,boundaries,review}.yaml`
