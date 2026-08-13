---
date: 2026-08-13
spec: .context-index/specs/features/pr-review-brief/pr-body-advisories.spec.md
charter: .context-index/specs/features/pr-review-brief/charter.md
verdict: BLOCK
tier: full
last-reviewed-revision: 2
file-sha: 33b7aad52342143567ef3194f8f22c13f4ed89f082cb7cb71860417970379444
---

# Architecture Review: pr-body-advisories

> **Date:** 2026-08-13
> **Spec:** `.context-index/specs/features/pr-review-brief/pr-body-advisories.spec.md` (revision 2)
> **Charter:** `.context-index/specs/features/pr-review-brief/charter.md` (revision 4)
> **Rigor tier:** full (risk_level `medium` → `policies.medium.review_mode: full`)
> **Verdict:** BLOCK

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | `plugin:review-specs/structural-architect-prompt.md` |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | `plugin:review-specs/security-reviewer-prompt.md` |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | `plugin:review-specs/consistency-analyzer-prompt.md` |

Registry: domain `software` (source level `default`); `.context-index/governance/review.yaml` declares `reviewers: []`, so no overrides. All three `dispatch: always`, `severity_cap: blocker`, `context_pack: base`. No load warnings. Skill extensions: `__NONE__`. Heuristics: three module-scoped heuristics retrieved and injected. No cross-repo `depends-on` references; no workspace detected. All reviewers ran read-only and modified no file.

---

## Aggregator: empirical verification of the spec's stated claims

Revision 1 of this spec was blocked for asserting a coverage claim validated against two hand-picked files. The reviewer profiles are read-only, so the aggregator re-measured every empirical claim in revision 2 directly against the corpus before dispatch, and supplied the results to all three reviewers as established fact.

**Method.** `git ls-files` filtered to `.context-index/specs/**/*.plan.md` (151 files), each parsed with `parseParallelizationSection` imported from `lib/parallel/groups.mjs` at HEAD of `feat/pr-review-brief/charter`.

| Claim | Spec states | Measured | Result |
|---|---|---|---|
| Plans carrying `## Parallelization` | 138 | **139** | VERIFIED (drift +1) |
| → `groups.length > 0` | 79 | **80** | VERIFIED (drift +1) |
| → `malformed: true` | 59 | **59** | VERIFIED |
| → `## Task Summary` present | 90 | **91** | VERIFIED (drift +1) |
| → `## Task Summary` absent | 48 | **48** | VERIFIED |
| `Tasks 14, 15, 16, 17` → `members: []`, `malformed: false` | asserted | `{id:"F",members:[],independent:false}`, `malformed:false` | VERIFIED |
| `Task 7 (… depends on Tasks 2, 3, 5, 6)` → `members: ["7"]` | asserted | `["7"]` | VERIFIED |
| Three-state return-value table | asserted | matches source lines 22–49 | VERIFIED |
| Qualifier widening moves "roughly 22 plans" into rung 1 | 22 | **10** | **REFUTED** |
| "The gap is almost entirely one cause: the qualifier" | asserted | qualifier is 10/59 = 17% | **REFUTED** |
| Deferred row: "79/138 to roughly 101/138" | 101 | 80 → **90** | **REFUTED** |

The +1 drift on three counts traces entirely to `review-packet-template.plan.md`, committed today in `889fb116`; it carries `## Parallelization`, parses to usable groups, and carries `## Task Summary`. The spec's figures were accurate when authored and rotted within one day — which is evidence *for* acceptance criterion line 216 (the recompute script), not against the spec's honesty. Claims 1 and 2 are therefore recorded as verified-with-drift, not refuted.

**Cause distribution of the 59 malformed plans** (this is what refutes the "22"):

| Cause | Count | Share |
|---|---|---|
| Rescued by widening `(independent\|sequential)` → `\([^)]*\)` | 10 | 17% |
| Bold-wrapped `- **Group A (sequential):**` — breaks `^\s*[-*]\s*Group` before the qualifier is ever reached | 19 | 32% |
| No `Group <id>` line at all (`- **Sequential spine:** Task 1 → Task 2`, `All sequential: Task 1 → …`) | 28 | 47% |
| No parenthetical (`- Group A: Task 1`) | 2 | 3% |

**Additional measured facts supplied to reviewers** (not claims the spec makes):

- `TASK_RE` (`lib/parallel/groups.mjs:16`) is a global `Task\s+([A-Za-z0-9.]+)` scrape of the entire group-line tail. **23 of the 80 usable plans (29%) yield intra-group duplicate members.** `review-packet-template.plan.md:94` → `members: ["1","2","3","2","1"]`.
- Zero-member groups across the whole corpus: **1** plan.
- `parseParallelizationSection("")` returns `{groups: [], malformed: false}` — a zero-byte or truncated plan is indistinguishable from "section absent".
- `grep -rn "Task Summary" lib/` returns nothing: no parser exists for the section rungs 2–4 depend on.

---

## Structural Architect (structural-architect)

**Verdict:** BLOCK

### SA-1 — `blocker` — § The zero-member trap / § Fallback ladder rung 1 / § Behaviors

- **blocker_id:** `structural-architect:unverified-claim:9b705ec7`
- **section_anchor:** `the-zero-member-trap`

**Finding.** Line 87 claims "no spurious members are collected", generalised from one fixture. `TASK_RE` (`lib/parallel/groups.mjs:16`) is a global `/gi` scrape applied to the *entire* group tail (`:43`), not just its head — so every task mentioned in trailing prose becomes a member. Measured: 23 of the 80 usable plans (29%) yield intra-group duplicate members. This charter's own `review-packet-template.plan.md:94` (`- Group A (sequential): Task 1 → Task 2 → Task 3 (all three write tests/…; Task 2 additionally asserts against the file Task 1 creates)`) yields `members: ["1","2","3","2","1"]`. `skill-ext-load.plan.md` yields `[["1","3","3","1"],["2","3"],["4"],["5"]]`; `sync-target-output.plan.md` yields `[["1","3","1","4","1"],["2"],["5"],["6"]]`.

Rung 1 ("members in the parser's order") and the Behaviors bullet at line 154 carry no dedup, uniqueness, or first-occurrence rule, so those 23 plans render a reading order that tells a reviewer to read Task 2 and Task 1 twice — at rung 1, annotation-free. This is the same defect class the spec was blocked for in revision 1 and the sibling in revision 4: a claim about a consumed module's behaviour generalised from a hand-picked case, with a behavioural rule missing behind it. The parser only ever needed the member *set* for worktree assignment; this spec is the first consumer to treat `members` as an ordered sequence.

**Recommendation.** Correct line 87 to state what the parser actually does with tail prose, and add an explicit member-multiplicity rule to the ladder (and a matching acceptance criterion) covering the duplicate case, as the zero-member case already is.

### SA-2 — `blocker` — § Fallback ladder rungs 2–4 / § Error Cases

- **blocker_id:** `structural-architect:undeclared-dependency:74f607a0`
- **section_anchor:** `fallback-ladder`

**Finding.** Rungs 2, 3 and 4 all resolve their ordering through `## Task Summary` table row order — the fallback path for the 59 malformed plans plus every zero-member case. But no parser for that section exists anywhere in `lib/` (aggregator-confirmed); it is emitted as free prose by `skills/plan/SKILL.md:471`; and it is absent from the charter's Consumed APIs table (`charter.md:112` declares only `## Parallelization` via `lib/parallel/groups.mjs`). The spec asserts "This spec defines no grammar" while its entire degraded path depends on a second undeclared, unowned prose format. Presence is measured (91 present / 48 absent); *parseability* is not, and the ladder has no rung and Error Cases has no row for "`## Task Summary` present but unparseable" — only for a member with no matching row.

**Recommendation.** Declare `## Task Summary` as a consumed interface in the charter's Consumed APIs table with a named owner/parser, and give the ladder a defined outcome when the section is present but yields no rows.

### SA-3 — `warning` — § Measured coverage / § Deferred Capabilities

"The gap is almost entirely one cause: the parser's qualifier is restricted to literally `(independent|sequential)`" is false. Measured distribution: qualifier 10 (17%), bold-wrapped 19, no-group-line 28, no-parenthetical 2. Widening moves usable coverage 80 → 90, not "roughly 22 plans" / "79/138 to roughly 101/138". `charter.md:93` is internally inconsistent on the same point ("sole cause in 10 of those" then "roughly 22 plans"). Recorded as a warning rather than a blocker because the conclusion the numbers support — defer the widening to `worktree-parallelization` — is *more* correct under the true figures, not less, and the three dominant causes are structural rather than qualifier-related, so no unilateral change is licensed either way. The arithmetic itself is escalated to blocker by CON-3.

**Recommendation.** Restate the cause distribution accurately in both the spec and the charter row, so the deferral is justified by the 10-plan gain rather than a 22-plan one.

### SA-4 — `warning` — § Fallback ladder rung 3 / three-state return table

The rung 3 condition is self-contradictory: its first clause reads "groups with a zero-member group and **no** `## Task Summary`", while the row's trailing qualifier reads "in each case **with** `## Task Summary` present". That first clause is also dead — zero-member plus `## Task Summary` present is already rung 2, and zero-member plus absent is rung 4. Separately, the three-state table labels `groups: [], malformed: false` as "section absent entirely" and rung 3's annotation must "state which of the three conditions applied", but `parseParallelizationSection("")` returns that identical state, so an empty or whitespace-only plan file is indistinguishable from an absent section by the return value the table presents as the discriminator. (Overlaps CON-2, which carries the blocker for the first half, and SEC-3/CON-4 for the second.)

**Recommendation.** Delete the dead first clause from rung 3 and state how the verb distinguishes "empty plan content" from "section absent" if the annotation must name which condition applied.

### SA-5 — `suggestion` — § Measured coverage

The corpus figures have already rotted: 139 / 80 / 91 against the spec's 138 / 79 / 90. The entire delta is `review-packet-template.plan.md`, committed today. The spec's figures were accurate when authored, and acceptance criterion line 216 (recompute script) is the correct mitigation and is already present.

**Recommendation.** Refresh the three figures; no structural change needed.

**Explicitly not reported.** The encoder gap raised in `pr-body-composition.blockers.md` names this spec, but this spec's delegation at line 127 (single encoder, no second contract) is the architecturally correct posture — the hole belongs to the contract's owner. The five-slot section list here matches `pr-body-composition.spec.md` exactly; no contradiction. No ADR-0009 or ADR-0012 conflict found.

---

## Security Reviewer (security-reviewer)

**Verdict:** BLOCK

### SEC-1 — `blocker` — input-validation — § Configuration / § Postconditions

- **blocker_id:** `security-reviewer:input-validation:15f974c2`
- **section_anchor:** `configuration`

**Finding.** The verb reads `size_threshold_additions` and `mirror_globs` from the in-tree `manifest.yaml`, which sits inside the very commit range the advisory measures. Postconditions assert the `pr:` block is "read-only input that a human adds"; in a fork PR that human is the attacker. Error Cases validate only shape (positive integer, list of strings), never provenance, so `size_threshold_additions: 999999` passes validation and escalation never fires: no warning, no exception classes, nothing a reader can notice is missing. `mirror_globs` amplifies this — `mirror_globs: ["**"]` drives net additions to 0 and defeats the comparison — though the raw figure remains visible there, which is why the threshold field, not the globs, is the headline. The control the charter's Business Intent exists to provide is disabled from inside the change under review.

**Recommendation.** Read the `pr:` block from the base ref (`git show <base>:manifest.yaml`, consumed as data via argv, never a shell string), not from the working tree. If reading base is rejected, require the advisory to test whether `manifest.yaml` appears in the range's changed-path set and, when it does, report raw-only and annotate loudly that the budget was modified by the change under review. Add an acceptance criterion pinning a fixture where head-side `manifest.yaml` raises the threshold. CWE-15 / CWE-807.

### SEC-2 — `blocker` — rate-limiting — § Output Encoding, length cap

- **blocker_id:** `security-reviewer:rate-limiting:2d1c84aa`
- **section_anchor:** `output-encoding`

**Finding.** The 200-character cap bounds one plan-derived value; nothing bounds how many there are. `TASK_RE` is a global scrape of an unbounded group-line tail, so a fork-edited plan containing one line `- Group A (independent):` followed by `Task 1` repeated 100k times yields 100k members, each under the cap, and the section renders all of them. Group count per plan, member count per group, referenced-spec count (one block each), and the plan read itself (whole file into memory, no size bound, no regular-file check) are all unbounded. The cap's *unit* is also undefined — it does not say whether a member list is one value or many. The spec names the exact harm the cap exists to prevent ("an oversized brief fails delivery entirely, which would break the charter's 'never blocks' guarantee for a transport reason") and the cap does not reach it.

**Recommendation.** (a) `stat` the plan and refuse to read above a named byte ceiling (e.g. 1 MiB → rung 5, "oversized"); require a regular-file check so a committed symlink to a character device cannot hang the read. (b) De-duplicate members per group — 23 of 80 usable plans already yield duplicates, and dedup alone kills the repeated-`Task 1` amplification (coordinates with SA-1). (c) Cap groups per plan, members per group, and total rendered bytes for both sections, each overflow rendered as a named degradation consistent with "truncation is itself a named degradation." CWE-770 / CWE-400.

### SEC-3 — `warning` — input-validation — § Fallback ladder vs § Error Cases

A zero-byte or truncated plan file is indistinguishable from "section absent". `parseParallelizationSection("")` returns `{groups: [], malformed: false}`, which the return-state table maps to "section absent entirely" → rung 3/4. But the Error Cases row requires a truncated plan to reach rung 5 and "state it was unreadable rather than absent". An attacker who truncates a plan to zero bytes therefore gets the quieter outcome: the brief asserts, falsely, that the plan has no `## Parallelization` section, instead of flagging the file as damaged. That defeats the charter's Observability attribute on an attacker-chosen input, and the choice of input is free.

**Recommendation.** Make emptiness a pre-parse decision, not a parser return state: `stat` before read, and route a successful read of zero-length (or whitespace-only) content to rung 5 with the truncated/unreadable annotation. Restrict the "section absent" branch to `{groups: [], malformed: false}` *from non-empty content*. Add an acceptance criterion with a zero-byte plan fixture. (Same underlying gap as CON-4.)

### SEC-4 — `warning` — data-exposure — § Fallback ladder / § Output Encoding

The ladder never names which `## Task Summary` cells are rendered. Rungs 2, 3 and 4 order by "`## Task Summary` table row order", and Error Cases requires an unmatched member to be kept and "marked unmatched" — so row content reaches the output — but neither section says whether the rendered field is the task id alone or the description column. Output Encoding enumerates the values it routes through the shared encoder (group ids, `independent` labels, task references, plan paths, zero-member group ids, rung annotations, manifest globs) and Task Summary cells are not among them. Every one of those cells is free prose in a fork-editable file. This is distinct from `security-reviewer:input-validation:2d90002f` on the sibling, which concerns the encoder's ruleset; here there is no named value routed to the encoder at all.

**Recommendation.** State in the ladder exactly which Task Summary fields render at rungs 2–4 and for unmatched members, add those fields to the Output Encoding enumeration, and add an acceptance criterion using a row whose description carries `|`, a leading `#`, and `<!--`.

### SEC-5 — `suggestion` — rate-limiting — § Fallback ladder rungs 4–5

Directed check on `git diff --numstat base..head` against the charter Security attribute / `issue-582`: no attacker-influenceable value is interpolated into the range. Two residuals worth closing: rungs 4 and 5 order by `git log --reverse` and **the spec never names the range**, so an unranged walk covers all history — commits outside the PR would enter the reading order, and it is a second unbounded-work path. And the sibling's Trailer-reader task row carries the "consumed as data, never interpolated into a shell or `node -e` context" rule explicitly while this spec's Size computation and ladder rows introduce two new git invocation sites without restating it.

**Recommendation.** Write the range into the ladder as `git log --reverse base..head` (rungs 4 and 5) and into the corresponding Behaviors bullet. Restate the argv-not-shell constraint on the Size computation and Fallback ladder task rows.

**Explicitly not reported, verified as handled:** markdown-escaping of plan-derived values (delegated to the sibling encoder; the gap is already tracked as `security-reviewer:input-validation:2d90002f` against `pr-body-composition.spec.md` and is not re-reported here); path containment for plan paths; the review-packet-pointer heading interlock; the no-write postcondition; the parser's plural-`Tasks` zero-member trap (named and given a rung).

---

## Consistency Analyzer (consistency-analyzer)

**Verdict:** BLOCK

### CON-1 — `blocker` — domain-model — § The zero-member trap

- **blocker_id:** `consistency-analyzer:domain-model:fff0c66a`
- **section_anchor:** `fallback-ladder`

**This spec:** § The zero-member trap — "**A parsed group with zero members drops its plan to rung 3.**"

**Conflicts with:** the same file in three places — Fallback ladder rung 2 ("Parser returns groups, `## Task Summary` present, but any group has zero members" → rung 2), Behaviors ("drops to rung 2 or 4"), and Acceptance Criteria ("drops to rung 2 (or 4) for all of its tasks"). The one sentence that motivates the whole rule states a different rung from the three normative places that implement it.

**Recommendation.** Fix the prose sentence to read "rung 2 (or 4)". The ladder table, Behaviors and AC are mutually consistent and outvote the prose.

### CON-2 — `blocker` — domain-model — § Fallback ladder, rung 3

- **blocker_id:** `consistency-analyzer:domain-model:ffa1a7ca`
- **section_anchor:** `fallback-ladder`

**This spec:** rung 3 Condition — "Parser returns groups with a zero-member group and no `## Task Summary`; **or** `malformed: true`; **or** section absent — in each case with `## Task Summary` present".

**Conflicts with:** itself — the first disjunct asserts "no `## Task Summary`" while the trailing qualifier requires "`## Task Summary` present" for every disjunct including that one. That exact condition (zero-member + Task Summary absent) is also rung 4's own definition ("Any rung-2 or rung-3 condition holds **and** `## Task Summary` is absent"), so the disjunct duplicates a different rung it cannot simultaneously be. An implementer cannot derive a total rung function from this table.

**Recommendation.** Drop the first disjunct from rung 3 entirely; zero-member-without-Task-Summary already routes to rung 4 via the rung-4 rule. (Coordinates with SA-4.)

### CON-3 — `blocker` — domain-model — § Deferred Capabilities / § Measured coverage

- **blocker_id:** `consistency-analyzer:domain-model:2ad4f1f1`
- **section_anchor:** `deferred-capabilities`

**This spec:** § Deferred Capabilities — "lift rung-1 coverage from 79/138 to roughly 101/138"; § Measured coverage — "Widening it would move roughly 22 plans into rung 1."

**Conflicts with:** the measured cause distribution of the 59 malformed plans — qualifier widening rescues **10**, not 22 (bold-wrapped 19, no-group-line 28, no-parenthetical 2 are the rest). The "22" is inherited unreconciled from `charter.md:93`, which says "the sole cause in **10** of those is the qualifier … a tolerant qualifier moves roughly **22** plans into the parsed set" — a contradiction within one charter sentence that the child spec resolved by keeping the wrong number.

**Recommendation.** Charter and spec should both use 10, giving rung-1 coverage 80 → 90, not 101/138. Fix `charter.md:93` first, since the spec's error traces to it. This is a blocker rather than a warning because the figure is the sole quantitative justification offered for the deferral, and because the spec was blocked at revision 1 precisely for an unverified coverage number.

### CON-4 — `warning` — contract — § Error Cases vs § Reading Order return-state table

**This spec:** Error Cases — "Plan file present but unreadable (permissions, truncation) → Rung 5."

**Conflicts with:** the return-state table, which maps `groups: [], malformed: false` to "section absent entirely", and `parseParallelizationSection("")` is confirmed to return exactly that. A truncated file that is still successfully read (no `fs` error, just empty/partial content) flows through the normal parser path and lands on the "section absent" row — a rung-3/4 condition, not rung 5. The spec never defines how the implementation distinguishes an `fs`-level read failure from a successfully-read-but-truncated file.

**Recommendation.** Either restrict this Error Cases row to genuine `fs` read errors and explicitly route content-level truncation through the normal parser path, or define a truncation-detection mechanism (byte-size sanity check) that this spec currently omits. (Same gap as SEC-3.)

**Verified clean:** § Section Placement's five-slot table matches `pr-body-composition.spec.md` exactly. `lib/parallel/groups.mjs` behaviour (Group F → `members: []`; Group G → `members: ["7"]`; empty-string input; three-state return) matches every claim the spec makes about it.

---

## Summary

**Total findings:** 14 (7 blockers, 5 warnings, 2 suggestions)

| Reviewer | Verdict | Blockers | Warnings | Suggestions |
|---|---|---|---|---|
| structural-architect | BLOCK | 2 | 2 | 1 |
| security-reviewer | BLOCK | 2 | 2 | 1 |
| consistency-analyzer | BLOCK | 3 | 1 | 0 |

**Blockers:**

| blocker_id | section_anchor | One-line |
|---|---|---|
| `structural-architect:unverified-claim:9b705ec7` | `the-zero-member-trap` | `members` is a global tail scrape; 23/80 usable plans yield duplicates and rung 1 has no multiplicity rule |
| `structural-architect:undeclared-dependency:74f607a0` | `fallback-ladder` | Rungs 2–4 depend on `## Task Summary`, a second prose format with no parser, no owner, and no charter declaration |
| `security-reviewer:input-validation:15f974c2` | `configuration` | `pr:` block is read from the working tree inside the range it measures; a head-side threshold silently disables the advisory |
| `security-reviewer:rate-limiting:2d1c84aa` | `output-encoding` | The 200-char cap bounds one value but nothing bounds their count — the stated delivery-failure harm is not reached |
| `consistency-analyzer:domain-model:fff0c66a` | `fallback-ladder` | Zero-member prose says rung 3; ladder, Behaviors and AC all say rung 2 (or 4) |
| `consistency-analyzer:domain-model:ffa1a7ca` | `fallback-ladder` | Rung 3's first disjunct contradicts its own trailing qualifier and duplicates rung 4 |
| `consistency-analyzer:domain-model:2ad4f1f1` | `deferred-capabilities` | "roughly 22 plans" / "101/138" refuted — qualifier widening moves 10, giving 80 → 90 |

**Coordination notes for the revision.** CON-1 and CON-2 are both in the ladder and should be fixed as one edit that makes the rung function total. SA-1(b) and SEC-2(b) are closed by the same dedup rule. SA-3 is the prose half of CON-3 — one correction to § Measured coverage and § Deferred Capabilities closes both, and `charter.md:93` must be corrected in the same pass or the contradiction re-enters on the next spec revision. SEC-3 and CON-4 are the same empty-vs-absent gap from two angles.

**What survived scrutiny.** Every claim revision 2 makes about `lib/parallel/groups.mjs` is correct against the source: both fixtures, the three-state return table, and the zero-member trap. The decision to delete revision 1's grammar and consume the owned parser is right, and no reviewer contested it. The corpus counts were accurate when authored. The single refuted claim is the qualifier's share of the coverage gap.

**Action required:** BLOCK. Run `/adev:specify --revise --spec .context-index/specs/features/pr-review-brief/pr-body-advisories.spec.md` to address the seven blockers, then re-run `/adev:review-specs`. Blocker detail keyed by `blocker_id` with `section_anchor` is in `pr-body-advisories.blockers.md`.

**Governance footer.** `.context-index/governance/gates.yaml` declares `transitions: {}` — no `approver_role` for the `spec-to-plan` transition. Informational only; does not block.
