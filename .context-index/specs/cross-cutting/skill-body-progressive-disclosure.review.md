---
spec: .context-index/specs/cross-cutting/skill-body-progressive-disclosure.spec.md
date: 2026-08-19
verdict: BLOCK
rigor-tier: full
last-reviewed-revision: 4
file-sha: 59642c6cb013764aafcddfeb8ff45c1b298ce7daa90ee4c9aa4f1ef746ae1ff2
---

# Architecture Review: skill-body-progressive-disclosure

> **Rounds 1-4.** Each round appends; earlier rounds are retained verbatim so a
> finding id cited elsewhere resolves to the round that raised it. Finding ids are
> round-scoped — `BND-4` in round 2 and round 3 are different findings.

## Round 1 — revision 1

> **Date:** 2026-08-19
> **Spec:** `.context-index/specs/cross-cutting/skill-body-progressive-disclosure.spec.md`
> **Charter:** none (cross-cutting; `affects:` all-skills + 4 providers)
> **Rigor tier:** full (risk_level absent → medium → `review_mode: full`)
> **Verdict:** BLOCK

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt |
|----|------|------|---------|--------|
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | `plugin:review-specs/consistency-analyzer-prompt.md` |
| referent-integrity | Referent Integrity | subagent | reviewer-reasoning | `plugin:review-specs/referent-integrity-prompt.md` |
| wiring-reviewer | Wiring Reviewer | subagent | reviewer-capable | `plugin:review-specs/wiring-reviewer-prompt.md` |
| boundary-reviewer | Boundary Reviewer | subagent | reviewer-capable | `plugin:review-specs/boundary-reviewer-prompt.md` |
| termination-reviewer | Termination Reviewer | subagent | reviewer-fast | `plugin:review-specs/termination-reviewer-prompt.md` |

`termination-reviewer` is `dispatch: triggered`; it scored 1 (keyword `loop`, min_score 1).

## Disabled Reviewers

| ID | Reason |
|----|--------|
| structural-architect | Disabled as part of the reviewer-domain-fit initiative. OWASP/structural scope was retargeted to referent-integrity/wiring-reviewer/consistency-analyzer/boundary-reviewer for the default (Node CLI/plugin) project shape. |
| security-reviewer | Disabled as part of the reviewer-domain-fit initiative. OWASP-scoped review relocated to the web-service domain extension (opt-in). |

## Registry Warnings

| Code | Message |
|------|---------|
| BROADEN_TOOL | Profile `browser-review`: allow_add broadens posture by adding mcp_server `playwright`. |
| BROADEN_TOOL | Profile `browser-review`: allow_add broadens posture by adding category `web-fetch`. |
| BROADEN_NETWORK | Profile `browser-review`: network broadened `deny` → `read-only`. |

`browser-review` is not the profile of any reviewer dispatched here, so these do not affect this review.

## Aggregator Advisories

**`LEGACY_REVIEWER_OUTPUT` — all 5 blockers.** No reviewer emitted a canonical
`blocker_id`; each returned a reviewer-local `id` (`TERM-1`, `BND-1`, …) plus a
`section_anchor`. Per the aggregator contract, findings without a `blocker_id`
are excluded from the `.blockers.md` sidecar and no `/adev:specify --revise`
auto-dispatch occurs — the fail-loud path applies instead.

Cause is the dispatch, not the reviewers: the orchestrator's prompts asked for
`id:` rather than `blocker_id:`. That is an orchestration defect in this run, and
it means the revise loop must be driven by hand. Recorded here rather than
silently worked around.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

- **CON-1** · warning · `### MODIFIED` — All three MODIFIED counts disagree with the branch: 18 modified `skills/*/SKILL.md` (not 30), 36 provider mirrors (not 24), 99 test files (not ~25; 91 import `readSkillSurface`). As the reconciliation artifact of record for work that bypassed the lifecycle, its change inventory is the only trail — wrong counts defeat the purpose.
- **CON-2** · warning · `### Improvements` — Post-refactor byte figures internally inconsistent and stale. hygiene stated 12,997; was 12,135 at 61064c9a and is 13,027 at HEAD. Current tree totals 351,047 B, so `−59.1%` and `505,894 fewer bytes` are both off. HEAD is the spec's own commit and changed hygiene by +892 B — the spec was stale the moment it landed. All `main`-baseline values verified exact.
- **CON-3** · warning · `### RENAMED` — "18 files deliberately not moved" contradicts the spec's own Current State table, which counts 9 + 13 = 22. Underlying claim sound (`review-config.mjs:609`, `validate-config.mjs:316` both verified); only the tally is wrong.
- **CON-4** · warning · `## Migration Path` — All five `Landed:` SHAs unreachable from HEAD. Branch was rebased/amended; survivors are e50948e7, 3b95cc23, bce79691, 25a34fc1, 61064c9a.
- **CON-5** · suggestion · `### RENAMED` — "27 canonical companions" is 28; `skills/eval/default-rubric.yaml` is listed in the Current State table but omitted from the total.

## Referent Integrity (referent-integrity)

**Verdict:** FAIL

- **RI-1** · **blocker** · `## Migration Path` — All five `Landed: commit <sha>` citations name commits that no longer exist in published history. `git merge-base --is-ancestor` returns NO for every one; they resolve only via `refs/original/refs/heads/chore/skills/progressive-disclosure`, the local-only filter-branch backup. On any clone or push, `git show 6281d3ae` fails with `bad object`. This matters more than usual: the spec exists specifically to repair this work's provenance trail, and the trail it writes down is unresolvable.
- **RI-2** · warning · `### Problems` — "takes down every Copilot adapter path — install, uninstall, status, dry-run" does not match the code. `buildPlan()` is invoked from exactly one site (`adapter.mjs:203`, inside `install()`); `uninstall()` and `status()` never call it. Only install and its dryRun branch can throw. `docs/skill-reference.md:900` carries the same overstatement.
- **RI-3** · warning · `## Changes Catalog` — 24 provider mirrors is 36; the canonical half of the 76 moves is 28 not 27; the 18 frozen files are 22 at baseline, of which 17 are named by an actual `plugin:` URI.
- **RI-4** · warning · `### Improvements` — "After" figures measured one commit before the tree the spec ships in. 350,162 B matches 61064c9a exactly; HEAD is 351,047 B. Derived `505,894` becomes `505,009`. All 90fcc8bf baseline values exact.
- **RI-5** · suggestion · `### Problems` — "11 also exceeded its 500-line guidance" counts 12 at the stated baseline (`recover` at 501 lines).
- **RI-6** · suggestion · `## Acceptance Criteria` — The "208 full-path companion references" count is not reproducible at any scope (183 within `skills/` prose, 219 across skills+tests+docs+lib). The substantive half is confirmed: 190 unique paths resolved, exactly one non-resolving (`skills/build/references/prerequisites.md`, appearing only in two session logs), and the two named orphans are exactly right. State the scope the count was taken over.

## Wiring Reviewer (wiring-reviewer)

**Verdict:** FAIL

- **WIR-1** · **blocker** · `## Acceptance Criteria` — BEH-8 and its checked box are false. Canonical `skills/*/references/` holds 183 companions; the codex and opencode mirrors hold 21 each — only the 27 Step-1 relocations, none of the ~156 created in Steps 2–3. Because `sync-provider-skills.mjs` regenerates mirror bodies verbatim, each mirror ships 170 pointer occurrences resolving to 155 distinct absent targets. `providers/codex/adapter.mjs:12-13` and `providers/opencode/adapter.mjs:93` symlink those directories into user installs. Copilot and cursor copy canonical `skills/` recursively and are unaffected. `tests/sync/provider-skill-parity.test.mjs` reports zero drift because the sync script covers `SKILL.md` only. BEH-8's wording is triggered by companions that *move*, so newly *created* companions are outside its remit and a guard derived from it would still miss this.
- **WIR-2** · warning · `### ADDED` — The added routing assertion does not read the body. `tests/hygiene/registry-drift-pass-19.test.mjs:402-413` calls `readSkillSurface("hygiene")`, which concatenates the body with all 23 pass companions; both assertions would be satisfied by any companion. It passes only because neither string currently appears under `references/` — coincidence, not enforcement. This violates the rule stated in `tests/helpers.mjs:161-163`. Same shape at `tests/skills/implement-batched-mode.test.mjs:79-86`, whose `## Prerequisites`→`## Process` slice would silently widen from 4,074 B to ~84,000 B if `## Process` ever moved.
- **WIR-3** · warning · `### Error Cases` — Of Invariant 2's three classes, two have body-scoped guards (verified reading `SKILL.md` directly); `## Prerequisites` has none. Its only test reads the concatenated surface and covers `implement` alone, not `validate` or `build`. The acceptance box is presented as closed while being verified-once-by-hand.
- **WIR-4** · warning · `## Migration Path` — Confirms CON-4 / RI-1 independently. Invariant 7 records the cause without updating the SHAs it invalidated.
- **WIR-5** · suggestion · `## Target State` — 350,162 B vs 351,047 B measured on branch. All other table values reproduce exactly.

## Boundary Reviewer (boundary-reviewer)

**Verdict:** FAIL

- **BND-1** · **blocker** · `## Acceptance Criteria` — 156 of 169 conditional-loading pointers in each mirror body name files absent from the mirror tree, across 18 skills. Only 5 of 30 codex mirrors have a `references/` dir at all. A codex/opencode user installs bodies instructing "Read `<path>` … Do not act on this section from the summary above" pointing at nothing — the skill silently loses its instructions with no error. The spec names this exact failure in its Error Cases table but records it as residual risk rather than the shipped state.
- **BND-2** · **blocker** · `## Invariants` — Invariant 3 mandates a repo-root-relative pointer form that is unanchored at every install surface: cursor publishes to `~/.cursor/skills/adev-<name>/` (directory renamed), copilot to `<destRoot>/skills/<name>/`, codex to `~/.agents/skills/<name>/`. In a user project the agent's cwd is the project root, so the pointer resolves to nothing or binds to a same-named file in a project-owned `skills/` tree — a confused deputy across the plugin/project boundary. The repo already has the anchoring convention and uses it for exactly one relocated companion (`<ADEV_ROOT>/skills/eval/references/default-rubric.yaml`), echoed by the constitution's "No hardcoded paths to `~/.claude/`". Neither Invariant 3, BEH-3, nor `docs/skill-reference.md:884` states which root the pointer is relative to.
- **BND-3** · warning · `### Dependencies` — The `plugin:` contract's consumer enumeration is incomplete. `resolveReviewerPath` resolves `plugin:` against the whole `skills` tree generically, and `lib/extensions/content-install.mjs:284-302` and `lib/extensions/install.mjs:100-102` are two further consumers the spec never mentions. All 76 moved files were inside the same published URI surface as the 18 frozen ones; the freeze's conclusion holds only because no shipped template, doc, or extension names a moved path. "governance | None, by design" overstates the isolation, and `lib/extensions/*` is absent from both `affects:` and the Module Impact Map.
- **BND-4** · suggestion · `## Acceptance Criteria` — `skills/eval/references/default-rubric.yaml:3` still reads "Ships with the plugin at `skills/eval/default-rubric.yaml`" — a dead reference to its own pre-move location. The guard, when written, should walk companion files too, not just bodies.

## Termination Reviewer (termination-reviewer)

**Verdict:** FAIL

- **TERM-1** · **blocker** · `### Behaviors` — BEH-9 is the only place telling the conductor what to do when a stage must re-run, and names two escapes with no bound on either. The only retry ceilings in the system (`build.max_retries`, `build.max_review_retries`) are counted in `/adev:build`'s own state; a conductor continuing in-context re-runs implement/validate entirely outside that budget, so nothing decrements. No cap-trip verdict is stated. The only brake is `work`'s interactive confirmation, which by its own wording gates *invocation* — and the in-context escape is expressly not an invocation, so under `--intake --file` batch mode there is no stated stop. Termination is not deadlocked (the subagent escape is unconditional), but the escape listed first is an uncapped repeat path.
- **TERM-2** · warning · `### Behaviors` — BEH-9's first escape collides with BEH-4 under the very split this spec introduces. After progressive disclosure, what is in context is the body plus only the companions the first branch loaded; a re-run taking a different branch has no in-context instructions for it, and BEH-4 forbids acting from the stub. Read literally, escape (a) is unavailable in exactly the case BEH-9 was written for.
- **TERM-3** · warning · `## Invariants` — No bound on pointer nesting and no acyclicity rule. The shipped tree nests three deep (`implement/SKILL.md` → `repo-mode-advisory.md` → `steps/step-2-per-task-loop.md` → `batched-mode.md`). The current graph was verified forward-only and acyclic, but BEH-7's reachability test would be satisfied by a mutually-referencing pair A↔B — cyclic and unreachable from the body, yet passing.

---

## Summary

**Total findings:** 23 (5 blockers, 13 warnings, 5 suggestions)

**Distinct defects** (several findings corroborate the same issue across reviewers):

| # | Defect | Findings | Severity |
|---|--------|----------|----------|
| 1 | codex/opencode mirrors ship ~155 broken companion pointers | BND-1, WIR-1 | blocker |
| 2 | All 5 Migration Path SHAs orphaned by filter-branch | RI-1, CON-4, WIR-4 | blocker |
| 3 | Invariant 3 mandates an install-unanchored pointer form | BND-2 | blocker |
| 4 | BEH-9's in-context re-run escape is uncapped | TERM-1 | blocker |
| 5 | Byte figures stale by one commit | CON-2, RI-4, WIR-5 | warning |
| 6 | Changes Catalog counts wrong (MODIFIED, RENAMED, frozen) | CON-1, CON-3, CON-5, RI-3 | warning |
| 7 | Named guards read the concatenated surface, not the body | WIR-2, WIR-3 | warning |
| 8 | BEH-9 escape (a) collides with BEH-4 | TERM-2 | warning |
| 9 | No acyclicity / depth bound on pointer nesting | TERM-3 | warning |
| 10 | `plugin:` consumer enumeration incomplete | BND-3 | warning |
| 11 | Copilot blast-radius overstated (install only) | RI-2 | warning |
| 12 | Misc count/scope corrections | RI-5, RI-6, BND-4 | suggestion |

**What held.** Every reviewer that checked the `main` baseline found it exact:
total 856,056 B, the four near-cap headrooms (186/191/680/1,417), all sixteen
Before values, `route` at 47,688 B headroom, 76 total moves, 161 added
companions, 0 broken pointers in the canonical tree, exactly the 2 named
orphans, all 23 hygiene companions named in the body, and `readSkillSurface`
correctly excluding `checks/` per Invariant 5. The URI-contract reasoning that
justified freezing 18 files was independently confirmed sound at both
enforcement points.

**Action required.** Two of the blockers (1, 3) are defects in the shipped
implementation, not in the prose — the spec must not simply be reworded to match
a broken tree. Fix order:

1. Mirror the 156 missing companions into codex/opencode, and extend
   `scripts/sync-provider-skills.mjs` to cover `references/` so parity is
   enforced rather than manual. Re-word BEH-8 to cover *created* companions, not
   only moved ones.
2. Re-anchor every pointer to `<ADEV_ROOT>/skills/<name>/references/...` and
   correct Invariant 3, BEH-3, and `docs/skill-reference.md`.
3. Bound BEH-9's in-context re-run path, state the cap-trip verdict, and make the
   unattended default stop-and-report; resolve the BEH-4 collision by stating that
   loading a companion is a permitted continuation, not a re-entry.
4. Replace the five SHAs with e50948e7, 3b95cc23, bce79691, 25a34fc1, 61064c9a.
5. Re-measure byte figures against the shipping tree and correct all counts.

Then re-review. Because all five blockers carry `LEGACY_REVIEWER_OUTPUT`, there
is no `.blockers.md` sidecar and no auto-revise dispatch — this loop is manual.

---

## Round 2 — revision 2

**Verdict:** BLOCK · 23 findings (2 blockers, 15 warnings, 6 suggestions) · rigor tier full

| Reviewer | Verdict |
|----------|---------|
| consistency-analyzer | FAIL |
| referent-integrity | FAIL |
| wiring-reviewer | PASS_WITH_NOTES |
| boundary-reviewer | PASS_WITH_NOTES |
| termination-reviewer | PASS_WITH_NOTES |

Both blockers were revision 1's fixes landing incompletely, not new defects:

- **CON-1 / RI-1** (blocker) — the Target State pointer template still showed the bare
  `skills/<name>/references/...` form Invariant 3 forbids. The block a future author
  copies taught the failure the invariant exists to prevent.
- **CON-2** (blocker), with **WIR-1** and **BND-3** reaching it independently — four
  sections still asserted companion sync was manual and UNGUARDED, including
  Invariant 6, which instructed maintainers to hand-mirror: the exact procedure that
  produced the round-1 blocker.

Guard holes proven by probe: `resolveSkillPointer` accepted bare pointers via a no-op
replace; `provider-companion-parity` checked only canonical ⊆ mirror, so a stale mirror
copy masked a deleted canonical target; the Prerequisites guard pinned 3 of 21 skills.

---

## Round 3 — revision 3

**Verdict:** BLOCK · 1 blocker, 5 warnings · first round on correct per-reviewer models

| Reviewer | Model | Verdict |
|----------|-------|---------|
| consistency-analyzer | claude-haiku-4-5 | PASS (0 findings) |
| referent-integrity | claude-opus-5 | PASS_WITH_NOTES |
| wiring-reviewer | claude-sonnet-5 | PASS_WITH_NOTES |
| boundary-reviewer | claude-sonnet-5 | FAIL |
| termination-reviewer | claude-haiku-4-5 | PASS_WITH_NOTES |

- **BND-4** (blocker) — `providers/cursor/adapter.mjs` had no path containment; `\S+` in
  the frontmatter name grammar admits `..`. Escalated from a round-2 suggestion because
  it was neither fixed nor recorded as a carried gap, while this refactor's recursive
  `references/` copy widened what flows through the unvalidated destination.
- **WIR-6** — a fifth stale UNGUARDED row. **RI-1** — the test total stale again, this
  time by the tier commit landing after the spec commit.

---

## Round 4 — revision 4

**Verdict:** BLOCK · 1 blocker, 5 warnings, 1 suggestion

| Reviewer | Model | Verdict |
|----------|-------|---------|
| consistency-analyzer | claude-haiku-4-5 | PASS_WITH_NOTES |
| referent-integrity | claude-opus-5 | PASS_WITH_NOTES |
| wiring-reviewer | claude-sonnet-5 | PASS_WITH_NOTES |
| boundary-reviewer | claude-sonnet-5 | FAIL |
| termination-reviewer | claude-haiku-4-5 | PASS_WITH_NOTES |

- **BND-1 / WIR-9** (blocker, found independently by two reviewers) — the regression
  test written for the round-3 containment fix never exercised it.
  `publishSkillsFromCache` is not exported and its real signature differs from the one
  the test assumed, so the test always fell into a fallback that grepped the adapter's
  source for three identifiers — matching anywhere, including a comment. It would have
  passed against a guard declared but never called, called after the write, or inverted.
- **BND-2** — the new containment check compared paths lexically, omitting the
  `realpathSync` step of `lib/extensions/exec-payload.mjs::assertContained`, the
  primitive it cited as its model. A symlinked skills root defeats a lexical check.
- **WIR-8** — no Error Cases row for the new guard, whose signal shape (`failed[]`
  entry) differs from every existing row. **CON-1** — no acceptance criterion.
- **RI-1/2/3** — test-file added-count stale by the last commit; a cited issue id that
  did not resolve in this tree; reviewer finding ids colliding across rounds.

**Termination lane closed.** TERM-2 resolved outright; TERM-1 and TERM-3 ruled
tolerable as documented, with reasoning recorded rather than restated a third time.

**What round 4 confirmed holds.** Referent-integrity re-derived every figure
independently, including running the suite against a clean `git archive main` copy to
reproduce the 7152 baseline: all byte totals, per-skill pairs, headroom, pointer counts
(185/181/0 broken under the guard's own regex), 211 companions per tree, 76 renames,
22-frozen-of-which-16-named, the 21 Prerequisites skills, the 3-hop chain, and all five
`Landed:` SHAs as ancestors of HEAD. First round every figure reproduced.

### Resolution

All round-4 findings are addressed in revision 5. The containment guard was extracted
into the exported pure function `resolvePublishTarget` so its behaviour is reachable,
and falsified against three reintroduced defects — allowlist disabled, containment made
lexical, unresolvable root allowed — each failing the suite, with every probe asserted
to have actually applied. That check caught a fourth vacuous guard: the first repair
still passed with the allowlist disabled, because the test never created the skills root
and every input threw `SKILL_PATH_ESCAPE` for an unrelated reason.
