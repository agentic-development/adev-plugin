# adev — Empirical Audit and Ranked Improvement Plan

> Companion to `adev-vs-compiler-comparison.md` and `adev-vs-compiler-gaps-and-practice.md`.
> Where those notes argued the analogy in principle, this one measures it.
> Five parallel research agents audited specs, reviews, commits, validation
> reports, and code↔spec correspondence; the findings are summarized here and
> turned into a ranked, costed improvement list.

## 0. Executive picture

The compiler analogy held as a research instrument: every weak spot it
predicted is empirically real and measurable in this repo. The unifying
finding across all five dimensions:

> **adev's lifecycle is enforced where it has a Node helper and a test, and
> advisory where it lives in SKILL.md prose. Every degraded surface lives in
> the second class.**

Concrete numbers (from the parallel audits, summarized below):

| Surface | Headline finding |
| --- | --- |
| Specs (n=173) | 170 in "standard" mode; refactor/extract/cross-cutting are dead vocabulary (3/173) |
| Charters (n=41) | 9 missing Capability Map — same 9 as `v1-release-research.md`, zero progress |
| Reviews (n=148) | **0 BLOCK verdicts**; blockers negotiated down to PASS_WITH_NOTES inline |
| Validates (n=77) | 87% PASS; **45% of reports have zero file:line citations**; Check 13 ran in 12/71 PASS reports |
| Commits (n=499) | `Spec:` trailer 47% (not 0% as v1 claimed); `Author-type` 36%; **98% of last 50 commits are meta-framework work** |
| Code↔spec | Functional drift ~10% (sampled); self-reported `drift_detected` 36% — mostly false positives from file-touch triggers |
| Heuristics | 12 extracted from 71 PASS validations (17%) — better than v1's 13%, still poor |
| Sessions | 178 captures on 9 unique dates vs. commits on 31 dates — bursty, not continuous |
| Recovery records | **Zero** in `.context-index/hygiene/recoveries/` despite 60 `fix:` commits |
| Reviewer registry | `governance/review.yaml` empty since 2026-05-11 (8 reviewers stripped, never restored) |

## 1. Cross-dimension diagnosis

Every finding maps to the same root mechanism. Tabulated:

| Compiler-analog weakness | adev observation | Why it degraded |
| --- | --- | --- |
| No IR grammar | Skeleton-stub reviews (10× `write-test/*.review.md` at 7–8 lines) accepted as valid; 167/173 specs missing `Visual Expectations` section | No machine-readable schema check on `.review.md` / `.spec.md` / `.validate.md` |
| Type-checker hallucinates | 45% of validate reports have no file:line citations; one report literally documents *"SKIP: skipping heuristic extraction to avoid side effects from inline Node invocation"* | The validator is a markdown contract; inline Node helpers in SKILL.md are hostile to agents, so SKIP wins |
| Linker is advisory | 9 charters missing capability maps; 29 specs with no companion artifacts | `/adev:hygiene` reports findings but blocks nothing |
| No DCE | 6 charters with zero specs; 3 unused spec modes; orphan files (`lib/provider/detect.mjs`, `lib/provider/registry.mjs`); 6 `multi-repo-workspace` specs review-only and never planned/validated | No pass exists to surface and prune |
| DWARF (trailers) half-adopted | `Spec:` 47%, `Author-type` 36% (should be 100% for agent commits) | Trailer injection runs only on Claude Code SessionStart, not as a git `commit-msg` hook |
| Build driver has escape valve | `lifecycle.gate_mode: advisory` exists and is used; `validate.yaml` explicitly disables Check 11 | Operators reach for the bypass instead of the fix |
| Reviewer-registry attrition | `governance/review.yaml: reviewers: []` since 8 reviewers were stripped over broken prompt paths; never re-added | No test loads the registry on `npm test`, so silent emptying went unnoticed |
| No verdict floor | 0 BLOCK verdicts across 148 reviews despite blocker prose existing | Reviewers (the same LLM in long context) negotiate blockers down inline; `computeVerdict` runs on the *post-negotiation* findings |
| No exit criterion for meta-work | 98% of last 50 commits are framework-internal (`agent-reliable-state-artifacts/*`) | Constitution has no "meta-work budget" gate; recovery records (the signal that would say "stop refactoring") sit at zero |

What works — and importantly, *why* it works:

| Surface | Why it works |
| --- | --- |
| `agent-reliable-state-artifacts` charter — 8/9 specs fully implemented, 1 partial | Every spec has a `source-manifest.files` block, every code file has a header `Spec:` block, every behavior has a test in `tests/` |
| Trailer adoption at 47% (much higher than v1 claimed) | `.githooks/prepare-commit-msg` exists and runs in some configurations |
| `tiered-test-gates` retired cleanly into `unified-gates` | All 5 superseded specs carry explicit `status: superseded` with a pointer; lineage is grep-able |
| Phase ordering (specify → plan → implement → validate) | `lib/lifecycle-state.mjs` (1296 LOC) actually enforces it — strict mode throws `GateError` |
| Plan-task immutability post-checkpoint | `lib/plan-immutability.mjs` exists with tests |

The pattern is exact: the surfaces with Node helpers + tests don't drift. The
surfaces governed by SKILL.md prose drift toward the path of least
resistance — skeleton stubs, SKIPs, negotiated PASS_WITH_NOTES.

## 2. What the web recommends (2026 state-of-art)

Synthesizing recent research and best-practice guides:

- **Schema-validate markdown frontmatter (Astro / Zod pattern).** Validate
  at write-time; reject missing/extra fields; generate types for downstream
  consumers. The 2026 Astro 6 content-collections docs describe this as the
  default expectation for any system that treats markdown as data.
- **Citation-grounded verification with interval arithmetic.** Recent papers
  (GSAR, "Citation-Grounded Code Comprehension") require LLM outputs to cite
  specific line ranges that must overlap retrieved chunks, enforced
  mechanically. Span-level verification reduces hallucination 42–68 % when
  combined with RAG.
- **commit-msg hook + commitlint.** The 2026 default for trailer/format
  enforcement is a `commit-msg` hook running commitlint with a config that
  declares required trailers. Husky is the common installer.
- **V-Model with phase-gated handoffs.** mgm-insights and agentic-dev.org
  frame the 2026 agentic SDLC as the V-Model with *every phase* a
  quality-assured, machine-readable handoff. Deloitte's State of AI 2026
  reports only 1 in 5 companies has mature governance — adev is in the 4-of-5
  majority, and the path to maturity is "lift advisory phases into enforced
  gates with deterministic checks."
- **Constrained generation.** When agents must produce a structured
  artifact, constrain via JSON schema / function calling rather than asking
  for markdown that happens to follow a template. adev's current "fill in
  the template" approach is the opposite, and it's exactly what produced
  the skeleton-stub reviews.

Sources used:
- [Astro Content Collections — Schema validation](https://docs.astro.build/en/guides/content-collections/)
- [Mitigating LLM Hallucinations (arxiv 2510.24476)](https://arxiv.org/html/2510.24476v1)
- [GSAR: Typed Grounding for Hallucination Detection (arxiv 2604.23366)](https://arxiv.org/html/2604.23366)
- [Citation-Grounded Code Comprehension (arxiv 2512.12117)](https://arxiv.org/html/2512.12117v1)
- [Enforcing Conventional Commits with husky & commitlint](https://www.codu.co/articles/enforcing-conventional-commit-messages-using-git-hooks-with-husky-commitlint-hgcazwml)
- [mgm-insights — Agentic Coding & the V-Model SDLC](https://insights.mgm-tp.com/en/2026/quality-assurance/agentic-coding-why-the-software-development-lifecycle-needs-to-be-reimagined/)
- [agentic-dev.org Handbook — Spec-Driven Development](https://www.agentic-dev.org/handbook/framework/spec-driven-development)

## 3. Ranked improvement plan

Ranking convention: **P_x** where lower = higher priority. Each item carries
**Impact** (1–5, behavior change vs. status quo) and **Effort** (1–5,
implementation cost). Items grouped by category.

### A. Deterministic scripts (highest leverage — convert prose mandates into code)

| # | Improvement | Impact | Effort |
| --- | --- | --- | --- |
| **P1** | **Frontmatter schema validator** (`lib/schemas/<artifact>.mjs`, zero-dep, ~150 LOC). Validate `*.spec.md`, `*.review.md`, `*.validate.md`, `charter.md` frontmatter on every write. Hook-enforced; reject skeleton stubs (e.g., review must have ≥3 reviewer sections; spec must have non-empty Acceptance Criteria). | 5 | 3 |
| **P2** | **Citation-grounding enforcer** (`lib/validate/grounding.mjs`). Parse every `path:line` in a `.validate.md`, open the file, verify the line range exists and contains tokens the claim mentions. Reject reports with citation density below a configurable floor. Closes "ghost validation" mechanically. | 5 | 3 |
| **P3** | **Move every inline Node snippet out of `skills/**/SKILL.md`** into `lib/skills/<skill>/<check>.mjs`. SKILL.md says `node lib/skills/validate/check-13.mjs --spec X`. Agents will run a CLI; they flee from 30-line inline snippets (Check 13 self-admits this). | 5 | 3 |
| **P4** | **Extend `.githooks/prepare-commit-msg` to a `commit-msg` hook that fails closed** when the diff touches `.context-index/specs/**` or `skills/**` and no `Spec:` trailer is present. Use the commitlint-style policy file in `.context-index/governance/commits.yaml`. Brings `Spec:` adoption from 47% → ~95%. | 5 | 2 |
| **P5** | **Status-advancement gate in `lib/lifecycle-state.mjs`.** `requireValidated(spec)` rejects unless `.validate.md` exists, passes schema (P1) and grounding (P2), and the projection in the event log shows a `step_completed: validate` event. | 4 | 2 |
| **P6** | **Reviewer-registry attrition test.** Add `tests/governance/review-registry.test.mjs`: assert `governance/review.yaml` lists ≥3 reviewers with resolvable prompt paths. Prevents another silent empty-registry regression. | 4 | 1 |
| **P7** | **Deterministic verdict computation in review.** After dispatch, compute the consolidated verdict from the *original, severity-stamped* findings — not from post-negotiation prose. Severity `blocker` from any reviewer → `BLOCK`, no exceptions. Restores verdict floor. | 5 | 2 |
| **P8** | **Make `drift_detected` semantic.** Compare a hash of "AC text + cited code excerpts" against a stored snapshot; trigger only on semantic divergence, not file timestamps. Drift signal goes from 36% noisy → ~10% truthful. | 4 | 4 |
| **P9** | **Skeleton-charter rejector.** Hook on `.context-index/specs/features/*/charter.md` writes: reject if any of the 6 template sections is missing or shorter than N words. Fixes the 9-missing-capability-map regression at write-time. | 4 | 2 |

### B. Lifecycle commands (new or modified skills)

| # | Improvement | Impact | Effort |
| --- | --- | --- | --- |
| **P10** | **`/adev:dce`** — Dead-Code/Dead-Spec Elimination pass. Lists charters with no specs (6 found), specs with no companions (29), unused spec modes (3 of 5 are practically unused), orphan code (3 lib files), and proposes deletions or promotions to validated. Run weekly. | 5 | 3 |
| **P11** | **`/adev:hygiene --strict`** turned into the default and made blocking, not advisory. Existing `lifecycle.gate_mode: advisory` becomes a per-skill flag, not a project-wide toggle. The advisory mode was an escape valve that erodes the invariant; remove the global override. | 4 | 2 |
| **P12** | **Rewrite `/adev:init`** to stop producing 9 skeleton charters. Either produce zero charters and let users invoke `/adev:brainstorm` per feature, or pipe each `/adev:init`-generated charter through the brainstorm review loop. Prevents the 9-capability-map regression from recurring on new installs. | 4 | 2 |
| **P13** | **`/adev:validate --citations-required N`** as a default. Hard-fail when fewer than N `file:line` citations are present for the spec's acceptance-criteria count. | 4 | 1 |
| **P14** | **Heuristic extraction as a separate skill** (`/adev:learn`), invoked deterministically post-validate via the lifecycle log rather than as an inline Node block in the validate SKILL.md. Heuristic extraction goes from 12/71 → ~71/71. | 4 | 2 |
| **P15** | **`/adev:retro --since=<commit>`** that surfaces recovery records mechanically by walking the commit history for `fix:` commits with no recovery artifact, and *creates the skeleton*. Files the 0-recovery-records gap automatically. | 3 | 2 |

### C. Instructions / SKILL.md & constitution edits

| # | Improvement | Impact | Effort |
| --- | --- | --- | --- |
| **P16** | **Remove dead vocabulary.** Drop `--extract`, `--from-diff` modes from `/adev:specify` documentation (3 uses across 173 specs). Keep only modes that have a path through the framework. Reduces cognitive surface. | 3 | 1 |
| **P17** | **Constitution amendment — Artifact Integrity Invariants.** Codify: (a) a spec cannot be `validated` without a citation-grounded `.validate.md`; (b) a review cannot be `PASS` if any reviewer emitted a blocker; (c) a charter cannot be `approved` without all 6 template sections; (d) `Spec:` trailer required when touching spec-tracked files. All hook-enforced (P1, P2, P4, P7). | 5 | 2 |
| **P18** | **Constitution amendment — Meta-Work Budget.** "`/adev:hygiene` blocks ship of a release if >70% of its commits are framework-internal, unless a Meta-Refactor milestone is explicitly declared and time-boxed." Forces the current state (98% meta in last 50 commits) to be a declared, ending phase. | 5 | 2 |
| **P19** | **Update `v1-release-research.md`** with corrected numbers (47% trailer adoption, not 0%; 12/71 heuristic ratio, not 2/15). Bad baseline data is worse than no baseline. | 3 | 1 |
| **P20** | **Document `drift_detected` as event-triggered**, not semantic, until P8 lands. The current field is being treated as "is the code wrong"; it actually means "files in the source manifest changed." Mis-reading it leads to noise-driven re-validation. | 3 | 1 |

## 4. Suggested execution order

If only one quarter's effort is available, the highest-leverage ordering is:

1. **P1** schema validator → unblocks P9, P5, P17.
2. **P4** commit-msg hook → trailer adoption jumps in days.
3. **P3** move inline Node out of SKILL.md → unblocks P2, P14.
4. **P2** citation grounding → ghost validation closes.
5. **P7** deterministic verdict floor → 0 BLOCK problem closes.
6. **P10** `/adev:dce` → charter sprawl gets measured and reversed.
7. **P17 + P18** constitution amendments — codify what's now mechanically enforced.

Steps 1–5 are all ≤3-effort items with impact 5; they convert the four
worst-degraded surfaces (specs, reviews, validates, trailers) from
prose-advisory to code-enforced.

## 5. Tying back to the compiler analogy

Each improvement is a specific, named gap from the prior research notes:

| Compiler concept | Gap noted in prior notes | Improvement that closes it |
| --- | --- | --- |
| IR grammar | "Specs are markdown convention, not a parseable language" | P1, P9 |
| Verified type-checker / no ghost diagnostics | "Validate fabricates PASS" | P2, P13, P3 |
| Symbol table integrity | "Reviewer registry silently emptied" | P6 |
| Verdict floor (compiler errors aren't negotiable) | "0 BLOCK across 148 reviews" | P7 |
| DWARF mandatory | "0% trailer adoption" (actually 47% — still bad) | P4 |
| DCE | "40 charters accumulate; no pass surfaces orphans" | P10 |
| Reproducibility / semantic dependency tracking | "drift_detected is event-triggered" | P8 |
| Time-boxed self-rewrite | "98% of last 50 commits are meta-framework" | P18 |
| Build driver without escape valve | "advisory gate_mode is used as bypass" | P11 |
| Standard library hygiene | "/adev:init produces 9 skeleton charters" | P9, P12 |

The improvement plan is, in effect, a closing of each gap the analogy
predicted with the cheapest deterministic mechanism the project's
zero-dependency principle allows. None of these are new ideas — they are
adev finally taking the compiler analogy literally instead of metaphorically.

## 6. Caveats and follow-up

- All five audits were single-pass. Numbers are accurate to a few percent
  but should be reproduced by a follow-up `/adev:hygiene --audit` once P1
  and P9 land. The audit itself wants to be a deterministic script.
- This note does not propose schema changes to the JSON state files
  introduced by `agent-reliable-state-artifacts`. That charter's design is
  sound; the gaps are in surfaces *outside* its scope.
- The compiler analogy is genuinely useful but it is not a target. The goal
  is not to imitate LLVM — it is to find the cheapest mechanism that makes
  each adev invariant actually hold. Compilers are a library of those
  mechanisms; we are shopping.
