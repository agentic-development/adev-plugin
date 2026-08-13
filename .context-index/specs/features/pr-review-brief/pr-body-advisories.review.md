---
spec: .context-index/specs/features/pr-review-brief/pr-body-advisories.spec.md
charter: .context-index/specs/features/pr-review-brief/charter.md
verdict: BLOCK
tier: full
last-reviewed-revision: 4
file-sha: 09a877fd90cf3ccdb03bc5e200f2f7a3cbe37953527e4ffd687d303d399815dc
---

# Architecture Review: pr-body-advisories

> **Date:** 2026-08-13
> **Spec:** `.context-index/specs/features/pr-review-brief/pr-body-advisories.spec.md` (revision 4)
> **Charter:** `.context-index/specs/features/pr-review-brief/charter.md` (revision 5)
> **Rigor tier:** `full` (risk_level `medium` → `review_mode: full`; no `--tier` override)
> **Verdict:** BLOCK

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | `plugin:review-specs/structural-architect-prompt.md` |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | `plugin:review-specs/security-reviewer-prompt.md` |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | `plugin:review-specs/consistency-analyzer-prompt.md` |

Domain: `software` (resolved at `default` level). Registry: three bundled reviewers, `severity_cap: blocker`, `context_pack: base`. `.context-index/governance/review.yaml` declares `reviewers: []`, so no overlay applied. No skill extensions (`__NONE__`). Three module heuristics injected. `depends-on` carries no cross-repo refs.

---

## Aggregator: parser-state enumeration supplied to all reviewers

Revision 4 removed every value from prose, so the way to review it on the merits is to enumerate the consumed parser's real return states and check the ladder against them. The aggregator probed `parseParallelizationSection` from `lib/parallel/groups.mjs` directly at HEAD and supplied the results to all three reviewers as established fact.

`malformed === (groups.length === 0)` — the two fields are not independent.

| Input | Return | Ladder rung per § Fallback ladder |
|---|---|---|
| `""` (zero-byte plan; the read **succeeds**) | `{groups: [], malformed: false}` | 2 ("no such section") |
| no `## Parallelization` heading | `{groups: [], malformed: false}` | 2 |
| heading present, no recognizable group line | `{groups: [], malformed: true}` | 2 ("nothing recognizable") |
| every group has ≥1 member | `{groups:[…], malformed: false}` | 1 |
| every group has 0 members | `{groups:[…], malformed: false}` | 2 ("no members") |
| **some groups have members, at least one has none** | `{groups:[…], malformed: false}` | **none — see SA-1** |
| `- Group A (independent): Tasks 1-3` (ranged) | `{groups:[{A, members: []}]}` | 2 |
| `- Group A (independent): Tasks 2, 3, 5` (plural) | `{groups:[{A, members: []}]}` | 2 |

**The mixed state is not hypothetical.** `.context-index/specs/features/domain-profiles/domain-aware-skill-integration.plan.md` parses to eleven groups, of which `H` has `members: []` and the other ten are populated, with `malformed: false`. It is one plan in the corpus today, and it matches neither rung 1 (which requires *every* group to have a member) nor rung 2 as its condition column is written.

**Corpus figures, for the record only.** Revision 4 correctly removed these from prose; they are recorded here so the review is checkable, not so the spec can cite them. Under `.context-index/specs/**`: 139 plans carry the section, 80 usable, 59 malformed, 23 with duplicate members. Whole repository (including `tests/fixtures/` and eval sandboxes): 146 / 85 / 61 / 26. The two readings still differ, which is why T1's "explicitly defined corpus root" has to be defined somewhere.

**Charter revision 5 is unchanged since the previous review.** Its § Capability Map still promises "plan task order", its § Consumed APIs still declares no input carrying it, and its § Deferred Capabilities still hardcodes 139 / 80 / 59, the 28 / 19 / 10 / 2 breakdown, and 80→90/139.

---

## Structural Architect (structural-architect)

**Verdict:** BLOCK

### SA-1 — `blocker` — NEW — § Fallback ladder / § Test Obligations T4 / § Acceptance Criteria

- **blocker_id:** `structural-architect:non-total-ladder:3fa1d731`
- **section_anchor:** `fallback-ladder`

**Finding.** The ladder is not total. Rung 1 requires "every group has at least one member"; rung 2 requires "the parser yields nothing usable — *no members*, nothing recognizable, or no such section". A parse in which some groups carry members and at least one does not satisfies neither condition. Under the strict reading of "no members" (= no members anywhere) the state falls through the ladder entirely; under the loose reading (= some group empty) it matches rung 2 and ten usable groups are discarded, and the disjointness claim becomes unverifiable either way. The state occurs in the corpus today (`domain-aware-skill-integration.plan.md`, group `H`).

The same defect surfaces as a **unit ambiguity**: the ladder classifies per plan ("The rung reached is named in the output, per plan"; Task Map: "per-spec blocks each carrying their rung annotation"), while T4 requires a ranged or plural group to "reach rung 2" — a per-group rung. Mixed-member plans are exactly where the two units disagree, and § Acceptance Criteria demands "a test enumerates parser outcomes and asserts each maps to exactly one rung", which cannot be written against the current text.

Note this is the *class* the rewrite set out to make unreachable, re-manifested on a new fact: revision 3 carried an explicit "zero-member group → rung 2" rule on four surfaces, and the collapse to properties dropped the disposition along with the restatements.

**Recommendation.** Decide the classified entity (plan or group), then state rung 1 and rung 2 as a partition over the parser's return with the mixed case named explicitly, and align T4 to that entity.

### SA-2 — `warning` — § Fallback ladder rungs 2–3 / § Actionable Task Map

Rungs 2 and 3 order by "commit order over the range" — the whole resolved range — while the ladder classifies per plan and the renderer emits per-spec blocks. N referenced specs therefore render N identical commit lists. Writable and testable as stated, so not a blocker, but almost certainly not intended, and it multiplies against the assembly byte ceiling.

**Recommendation.** Scope the degraded block to the commits carrying that spec's trailer, or state the duplication as intended.

### SA-3 — `warning` — § Fallback ladder vs `pr-body-composition.spec.md` Invariant 7 *(Q4)*

Invariant 7 has two clauses. The determinism clause is satisfied. The second — "every ordering the brief applies is total: where a sort key ties, a further key breaks it, down to one that cannot tie" — is asserted here ("Ordering within a rung is total") with no tie-break named for the commit ordering, and § Test Obligations has no counterpart to the sibling's T3. This is the one place the "inherits every invariant and adds no exception" claim is not fully carried.

*Aggregator qualification:* `git log --reverse` over a fixed range in a fixed repository emits a deterministic sequence, so this is not a determinism violation and byte-identical output still holds. The residual is that the spec asserts totality without naming what makes it total — a stated-property gap, not a behavioural one. Held at warning on that basis.

**Recommendation.** Either name the tie-break, or state that the ordering is the parser's / git's sequence and is total by being a sequence rather than a sort.

### SA-4 — `warning` — § Test Obligations T5 / § Resource Bounds / § Deferred Capabilities *(Q2)*

The "each has exactly one home" thesis is falsified twice. (i) T5 pins "the numeric value of each of the four resource bounds", one of which is the cross-slot total this spec explicitly disclaims owning; `pr-body-composition.spec.md` pins that bound's *enforcement location* and has no § Test Obligations row for its *value*, so the value has two homes across two specs. (ii) Charter revision 5 still hardcodes the corpus figures and the cause breakdown, none of them restated here and none pinned by any test. The drift risk was relocated to the parent, not eliminated. *(Escalated to blocker by the consistency analyzer — see CON-A.)*

### SA-5 — `warning` — PERSISTENT (prior SA-7 / CON-10) — § Configuration / § Behaviors / § Acceptance Criteria

§ Configuration states universally that "the brief names the base it resolved and the configuration source it used", but the only Behaviors bullet carrying that requirement is conditioned on configuration being **absent** at `base`, and no acceptance criterion pins it (T6 pins base-side resolution, not disclosure). The merge-base drift case — `--base` omitted, base moving as the default branch advances — is the one a user hits without expecting it, and it is uncovered in every enforceable surface.

*Aggregator note:* the consistency analyzer recorded this prior finding as RESOLVED. That disposition is **refuted** — the Behaviors bullet is conditional. The structural architect's reading is correct and the finding is carried as PERSISTENT.

### SA-6 — `warning` — PERSISTENT (prior SA-9) — § Configuration vs `charter.md` § Consumed APIs

The `pr:` manifest block read from `base` is a consumed input with no row in the charter's Consumed APIs, and `pr-body-composition.spec.md` § Inputs declares "Four sources" for the same verb, none of them the manifest. An undeclared inbound dependency on a file the sibling's Preconditions treat as optional. Charter side must carry the row.

### SA-7 — `warning` — § Deferred Capabilities row 2 vs ADR-0012 § Permitted peers

"A structured emitter for `## Parallelization` owned by `/adev:plan`" implies a new plan-adjacent artifact; ADR-0012 closes that set, requiring an ADR amendment or a follow-on ADR to add a peer. The row's Depends On names only "a decision to make `/adev:plan` emit a structured sidecar". Implicit supersession — name the ADR amendment as a dependency.

**Otherwise ADR compliance is clean:** this spec introduces no new peer (it reads `<spec-stem>.plan.md` through the owned parser), and `kind: behavioral` carries the Preconditions / Behaviors / Postconditions / Error Cases shape ADR-0009 § 1 requires.

### SA-8 — `warning` — PERSISTENT (prior SEC-5 residual) — § Resource Bounds

"Every quantity this spec renders is bounded" is falsified in its own paragraph: the number of referenced specs — and therefore plan stats, reads, parses and rendered blocks — is independently unbounded and is not among the four dimensions. Assembly's ceiling truncates the *output* but not the *work*, and no named degradation exists for "additional specs not analyzed".

### SA-9 — `suggestion` — § Fallback ladder rung 3 vs § Error Cases

Rung 3's condition is "absent, unreadable, or refused by a resource bound"; § Error Cases says "absent, unreadable, not a regular file, or over the size bound". The two reconcile only by reading the regular-file check as a "resource bound", which § Resource Bounds itself sets apart ("additionally refused"). One word in the ladder closes the last instance of the recurring class.

### SA-10 — `suggestion` — § Deferred Capabilities row 1 vs `charter.md` § Deferred Capabilities

Near-identical capability names, different scopes, opposite magnitude language: the spec defers "recognize more group-line forms" and calls the lift "material"; the charter defers "widening to a tolerant qualifier" and calls it "17% of the gap, not most of it". One capability, two homes, two characterizations.

---

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES — no blockers this pass.

### SEC-11 — `warning` — input-validation — PERSISTENT (prior SEC-9 / CON-12), softened — § Configuration

Revision 4 still states no rule that the git invocations this spec introduces (`git show <base>:.context-index/manifest.yaml`, the ranged `git log --reverse`, the ranged diff stat) consume `base` and `head` only as already-resolved SHAs passed as discrete argv elements. Mitigating: this spec's Preconditions inherit the sibling's "`--base` resolves via `git rev-parse`" precondition wholesale, which makes ref-as-flag injection structurally unreachable *if* the resolution happens once and only the resolved value threads downstream. Neither spec says so, so the property is implied rather than pinned.

**Recommendation.** One sentence: every git invocation in this module consumes `base`/`head` only as the SHA `pr-body-composition` already resolved, passed as a discrete argv element with a `--` separator. CWE-88.

### SEC-12 — `suggestion` — rate-limiting — PERSISTENT (prior SEC-10) — § Configuration

`mirror_globs` still carries no count or length cap and no syntax rejection (`..`, leading `/`), and is not among § Resource Bounds' four dimensions, then is matched against every changed path (N×M). Mitigated by being read from `base` — the already-reviewed side — which is the same trust argument the spec makes for the threshold. Add it as a fifth bound, or state why it is excluded.

### SEC-13 — `suggestion` — path-traversal — NEW — § Fallback ladder rung 3

Rung 3's cause vocabulary is a closed three-word set. A plan path refused by the inherited containment check (sibling Invariant 6) is not cleanly a member of any of them: it is not a resource bound, and calling it "absent" or "unreadable" is a stretch. No vulnerability results — containment fires before any `stat`, so no new filesystem-oracle state is created — but an implementer has no named home for the case. Fold containment refusal into one of the three by name, or add a fourth.

**Explicitly not reported.** Authentication and authorization have no surface: a local CLI reading git objects and on-disk files as the invoking CI identity, writing to stdout. Encoding is delegated wholly to the sibling's universal Invariant 5 and is not re-reported here.

---

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

### CON-A — `warning` — contract — NEW — § Behavioral Contract / § Test Obligations / § Deferred Capabilities

*Filed by this reviewer as a blocker (`consistency-analyzer:contract:c3355134`); **demoted to warning by the aggregator** and split by owner — see the disposition note at the end of this finding.*

**This spec:** "Counts and thresholds now live in § Test Obligations, where each has exactly one home and a test that recomputes it."

**Conflicts with:** `charter.md` § Deferred Capabilities (revision 5, unchanged since the prior review), which states as fact "the 139 plans carrying `## Parallelization` … usable groups for 80 and `malformed: true` for 59", the breakdown "28 … 19 … 10 … 2", and "widening alone takes coverage from 80/139 to 90/139" — none of it cross-referenced to T1 or T2, none of it recomputed, and the 28/19/10/2 line already measured as 29/18/10/2 under an equally defensible classification in the previous review.

**Failure.** The recurring defect — one fact written in two places, one copy going stale — was relocated one file up rather than eliminated, and § Deferred Capabilities leans on T2 for a breakdown that also exists, unpinned and already divergent, in the parent.

**Aggregator disposition — demoted to warning, and split by owner.** Two things were bundled here.

*The charter half is charter-side and is not a blocker on this spec.* Read in context, the spec's sentence is scoped to itself — the surrounding prose is explicitly about "revisions 1 through 3 … restated across five sections" — and all three reviewers confirm no literal survives anywhere in this spec's prose. The claim is true of what it is about. Blocking `pr-body-advisories.spec.md` over it would buy a reworded thesis sentence in revision 5 while charter revision 5 keeps the stale literals, leaving the drift being objected to untouched. It joins SA-6 and prior SA-6/CON-8 as charter-revision-6 work, at the same severity the previous review used for every charter-side inconsistency.

*The circularity half is genuinely spec-side and is what this warning now carries.* § Deferred Capabilities row 1 argues the widening "would lift coverage materially — the measured cause breakdown in T2 says how much and in what order". That cites a test for the magnitude that justifies the deferral, and the deferral is what the test exists to support. It is also the one characterization the removed data contradicted: the charter's own row concludes the qualifier is "17% of the gap, not most of it".

**Recommendation.** Strike the magnitude clause from § Deferred Capabilities row 1 — the deferral rests on the cross-charter coupling with `worktree-parallelization`, which holds at any magnitude and needs no figure. Optionally scope the "one home" sentence to this spec's own prose. Charter revision 6 should point its Deferred row at the checked-in script instead of restating literals.

### CON-B — `warning` — domain-model — § Fallback ladder rung 3 / § Resource Bounds / § Actionable Task Map

Rung 3's condition says "refused by a resource bound", but § Resource Bounds and the Task Map describe two different failure shapes among the four: the plan-size ceiling (and the regular-file check) is a **pre-read refusal**, while the group cap, member cap and total-bytes bound are **post-parse truncations with a named degradation** that leave the plan in rung 1. As written, a group-count overflow could be routed to rung 3 rather than rendered as an annotated rung-1 truncation.

**Recommendation.** Rung 3 should name the pre-read bounds specifically, not "a resource bound" generically.

### CON-C — `warning` — pattern — § Fallback ladder rung 2

Rung 2's condition column ("no members, nothing recognizable, or no such section") does not literally cover the corpus-observed mixed zero-member state; totality holds only if the reader infers rung 2 as the complement of rung 1 rather than reading its stated condition. *(Filed by this reviewer as a suggestion; raised to warning by the aggregator because it is the same defect as SA-1 and the ladder's own totality claim is what it undercuts.)*

**Verified clean.** No surface anywhere in the spec states a literal cardinality for any rung's cause set — the prior 2/3/4/5-way mismatch is gone by removal of the count claim, not by reconciliation. The five-slot section list matches `pr-body-composition.spec.md` exactly. The de-duplication rule, the zero-member disposition and the marker-ownership disclaimer are each stated once. `kind: behavioral` and the `.spec.md` suffix conform to `spec-file-suffixes.spec.md`.

---

## Prior-blocker disposition (revision 3 → revision 4)

| Prior id | blocker_id | Status | Evidence |
|---|---|---|---|
| SA-1 / CON-5 | `structural-architect:inconsistent-enumeration:5f5d440b`, `consistency-analyzer:domain-model:5ae12fbf` | **RESOLVED as stated** | No cardinality claim survives on any surface; the duplicate Behaviors bullet is gone. All three reviewers concur. The *class* re-manifests on a different fact as this review's SA-1 — new id, not a reuse. |
| SA-2 | `structural-architect:incomplete-contract:a8df42b9` | **RESOLVED** | "Commit order over the range" in both degraded rungs; "`git log --reverse` over the resolved range" stated once. Residual scoping filed as SA-2 (warning). |
| SA-3 | `structural-architect:ambiguous-ownership:ff6fc09c` | **RESOLVED** | The cross-slot total is assigned to marker assembly here and **accepted by the sibling**: `pr-body-composition.spec.md` § Section ownership states assembly owns the total rendered size and names this spec as relying on it, with a matching acceptance criterion. Cross-spec obligation confirmed in both directions. Residual on the bound's *value* filed as SA-4. |
| SA-4 / CON-7 | `structural-architect:ambiguous-acceptance-criterion:371dcad2`, `consistency-analyzer:contract:146bdbe4` | **RESOLVED as a blocker** | No literal remains in prose to red-fail. Residual: T1 promises "an explicitly defined corpus root" without saying where it is defined, while the two defensible readings still differ (139/80/59 vs 146/85/61). Carried in SA-4 / CON-A. |
| SEC-6 | `security-reviewer:path-traversal:6fed7ac6` | **RESOLVED** | Sibling Invariant 6 now canonicalizes **both** the candidate path and the root before any filesystem call, which binds this spec's `stat` and read by inheritance. The annotation-oracle half is narrowed by the ladder's closed three-word vocabulary; residual filed as SEC-13 (suggestion). |
| SEC-7 | `security-reviewer:data-exposure:f6ab8286` | **RESOLVED** | § Output Encoding deleted; encoding delegates to the sibling's Invariant 5, stated universally ("from any source, including ones added later"), which structurally cannot omit a value. |
| CON-6 | `consistency-analyzer:domain-model:ee9fb6f2` | **RESOLVED** | Rung 3 is now "the plan cannot be read at all". A zero-byte plan reads successfully, so it cannot reach rung 3 by construction and lands in rung 2. Verified against the parser. |

Non-blocking prior findings: **SA-7 / CON-10 PERSISTENT** (base disclosure pinned only in the config-absent branch — see SA-5). **SA-9 PERSISTENT** (`pr:` block undeclared in the charter — SA-6). **SEC-5 residual PERSISTENT** (referenced-spec count unbounded — SA-8). **SEC-9 / CON-12 PERSISTENT, softened** (SEC-11). **SEC-10 PERSISTENT** (SEC-12). **SEC-3 / CON-4, SEC-8 / CON-11 RESOLVED** — the first by the read/parse split, the second moot: no bound truncates characters any more, so there is no encode-order hazard left to sequence.

## Adversarial questions — consolidated answers

**(a) Is the three-rung ladder genuinely total and disjoint?**

**No — one state falls through, and it exists in the corpus today.** Every other parser outcome maps cleanly: `{[], false}` and `{[], true}` both to rung 2, all-groups-populated to rung 1, all-groups-empty to rung 2 ("no members"), and read failure to rung 3. The gap is the **mixed** case — some groups populated, at least one empty — which satisfies neither rung 1's "every group has at least one member" nor rung 2's "yields nothing usable". `domain-aware-skill-integration.plan.md` is that case: eleven groups, `H` empty, `malformed: false`.

The structure is right and is a genuine improvement: the read/parse split makes rungs 2 and 3 disjoint by construction (a successful read cannot reach rung 3, which is what retires CON-6), and no cause enumeration remains to go inconsistent. But "total by construction" is asserted, not achieved, and the missing case is the one revision 3 handled explicitly with a rule the rewrite dropped. Compounding it, T4 assigns a rung to a *group* while the ladder assigns rungs to a *plan* — the two units diverge precisely on mixed plans. Filed as SA-1 (blocker), CON-C (warning), SA-9 and CON-B on the rung-3 edge of the same question.

**(b) Removing the measured numbers: legitimate delegation or hollowed-out claims?**

**Legitimate as a technique; the specific claim built on top of it is overstated, and the § Deferred Capabilities argument survives for a reason other than the one the spec gives.**

Delegation is the right call. Every figure that rotted across three revisions was a fact about a corpus and a parser this charter does not own, and a table of test obligations that must recompute is a stronger guarantee than prose that must be re-verified by hand.

Two things do not survive. First, "each has exactly one home" is true of this spec and false of the charter: revision 5 still carries the corpus figures and the cause breakdown as static prose, unlinked to T1/T2 and already divergent under re-classification (28/19/10/2 vs 29/18/10/2). The risk moved one file up. Filed as CON-A and SA-4, both warnings — the fix is charter revision 6, and holding the spec at BLOCK for it would rewrite a sentence here while leaving the stale literals exactly where they are.

Second, and directly to the question asked: § Deferred Capabilities says widening the parser "would lift coverage materially — the measured cause breakdown in T2 says how much and in what order". As an argument that is now circular — it cites a test for the magnitude that justifies the deferral, and the deferral is what the test exists to support. It is also the one characterization the removed data contradicted: the charter's own row concludes the qualifier is "17% of the gap, not most of it". **But the deferral does not actually rest on magnitude.** Its load-bearing premise is the cross-charter coupling — the same widening moves plans from serial fallback into concurrent execution in `/adev:implement --parallel`, another charter's module — which is unconditional and holds at any magnitude. The argument is supportable as *reasoning* and unsupportable as *written*: strike the magnitude clause and it stands on its own; leave it and it leans on a figure the spec deliberately does not state and the charter states differently.

**(c) Does anything real get lost by refusing `## Task Summary`, and is the "correspondingly narrowed" claim honest?**

**Something real is lost, the spec is honest about it, and the charter overpromises — persistently.**

What is lost is genuine and the spec says so plainly: 59 of 139 plans fall to commit chronology, which is a worse ordering, and every rung above 1 must disclose that the ordering is chronological rather than planned. Refusing the section is nonetheless right on ownership grounds — no parser in `lib/`, no owner, no Consumed-APIs entry — and it is the same reasoning that blocked revision 1 for authoring a second grammar. The security reviewer adds that not writing a second free-form prose parser is a net reduction in attack surface.

**The narrowing is not honest as a statement about the charter, because the charter did not narrow.** Revision 5 § Capability Map still reads "Derive a suggested reading sequence from **plan task order** and `## Parallelization` groups", and § Consumed APIs declares no input carrying plan task order. A spec cannot narrow a charter promise by asserting that it has been narrowed; the charter text is what a reader checks. Worse than the previous review recorded: plan task order is delivered on **no** rung, not merely lost on the degraded ones — rung 1 orders by parser group order and within-line scrape order, which coincides with plan task order only where the author happened to write it that way. The charter must move to revision 6. Filed as SA-6 / CON-A context and carried PERSISTENT from prior SA-6 / CON-8; the spec's own sentence should say the charter *requires* narrowing rather than that it *is* narrowed.

**(d) Does the spec inherit every invariant of `pr-body-composition.spec.md` with no exception?**

**Verified for eight of nine, and for the determinism clause of the ninth. One exception, and it is not the one the question anticipated.**

Determinism is fine. `base` is an element of the fixed resolved `(base, head)` pair over which Invariant 7 is scoped, so making configuration a function of `base` is a function of the declared inputs, not a violation. All three reviewers concur, as they did in the previous round. Invariants 1, 2, 3, 4, 5, 6, 8 and 9 are inherited cleanly — notably 5 (encoding, now delegated wholly rather than re-enumerated) and 6 (containment, whose strengthening to canonicalize the candidate is what retires SEC-6).

The exception is Invariant 7's **second** clause: "every ordering the brief applies is total: where a sort key ties, a further key breaks it, down to one that cannot tie." The spec asserts "Ordering within a rung is total" and names no tie-break, and § Test Obligations has no counterpart to the sibling's T3, which exists for exactly this. In practice `git log --reverse` over a fixed range in a fixed repository emits a deterministic sequence, so no output differs run to run — which is why this is held at warning (SA-3) rather than escalated. It is a stated-property gap, not a behavioural one, but it is the one place "adds no exception to any of them" is not literally true.

**Cross-spec obligation confirmed.** The total-rendered-size bound is assigned here to the sibling's marker assembly, and `pr-body-composition.spec.md` revision 6 states the same obligation from its side — § Section ownership ("Assembly also owns the total rendered size of the brief … `pr-body-advisories.spec.md` § Resource Bounds relies on this") plus a matching acceptance criterion requiring the ceiling to be enforced in assembly and not in a slot renderer. The two specs agree; no orphaned obligation.

---

## Summary

**Total findings:** 16 (1 blocker, 11 warnings, 4 suggestions)

| Reviewer | Verdict | Blockers | Warnings | Suggestions |
|---|---|---|---|---|
| structural-architect | BLOCK | 1 | 7 | 2 |
| security-reviewer | PASS_WITH_NOTES | 0 | 1 | 2 |
| consistency-analyzer | PASS_WITH_NOTES | 0 | 3 | 0 |

**Blockers:**

| id | blocker_id | NEW / PERSISTENT | One-line |
|---|---|---|---|
| SA-1 | `structural-architect:non-total-ladder:3fa1d731` | NEW id, PERSISTENT class | A plan with some populated and some empty groups matches neither rung 1 nor rung 2; the state exists in the corpus, and T4 assigns rungs per group while the ladder assigns them per plan. |

One blocker carries the verdict. CON-A was filed as a second blocker by the consistency analyzer and demoted to warning by the aggregator: its charter half is charter-side work at the severity the previous review used for every charter-side inconsistency, and its spec-side half (the circular magnitude clause in § Deferred Capabilities) does not make the spec unplannable.

**Action required.** Revision 4's method is right and it retired seven of the previous nine blockers — every one that the earlier ladder, the earlier encoder enumeration, and the earlier corpus literals produced. The single remaining blocker is the recurring class in the one hiding place a collapse creates: not a fact restated inconsistently, but a fact **dropped** while the restatements were being removed. Revision 3 disposed of zero-member groups explicitly on four surfaces; revision 4 removed all four and did not carry the rule into the two-rung partition that replaced them. It does not require re-litigating a design decision and is closable inside `pr-body-advisories.spec.md`.

Run `/adev:specify --revise` against `pr-body-advisories.blockers.md`, then re-review.

**Scope note for the revise pass.**

- **SA-1 (blocker)** — name the classified entity (plan or group) and state rungs 1 and 2 as a partition over the parser's return with the mixed case explicit. No sibling edit needed.
- **CON-A (warning), spec-side half** — strike the "would lift coverage materially — the measured cause breakdown in T2 says how much and in what order" clause from § Deferred Capabilities row 1; the deferral rests on the cross-charter coupling, which needs no figure. Worth taking in the same pass.

Two files carry residual inconsistencies that `--revise` will not touch and that must be handled separately:

- `charter.md` → revision 6, for three things: the § Capability Map row still promising "plan task order" (PERSISTENT since the prior review), the missing `pr:` manifest row in § Consumed APIs (SA-6), and the § Deferred Capabilities row that restates corpus literals (CON-A charter half, SA-4, SA-10).
- `pr-body-composition.spec.md` is **not** required to change. Its § Section ownership already carries the cross-slot size obligation this spec delegates to it, and its Invariants 5 and 6 already carry the universal forms that retire SEC-7 and SEC-6. SA-3's tie-break gap and SEC-11's argv rule are both statable inside this spec.

**Governance footer:** `.context-index/governance/gates.yaml` declares `transitions: {}` — no `spec-to-plan` approver role is configured.
