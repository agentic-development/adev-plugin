---
spec: .context-index/specs/features/pr-review-brief/pr-body-advisories.spec.md
charter: .context-index/specs/features/pr-review-brief/charter.md
verdict: BLOCK
tier: full
last-reviewed-revision: 3
file-sha: 59a1fae25f1f071d667777fed47e3bbfb74561d82425138c6178c9d8d5b23542
---

# Architecture Review: pr-body-advisories

> **Date:** 2026-08-13
> **Spec:** `.context-index/specs/features/pr-review-brief/pr-body-advisories.spec.md` (revision 3)
> **Charter:** `.context-index/specs/features/pr-review-brief/charter.md` (revision 5)
> **Rigor tier:** `full` (risk_level `medium` → `review_mode: full`; no `--tier` override)
> **Verdict:** BLOCK

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | `plugin:review-specs/structural-architect-prompt.md` |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | `plugin:review-specs/security-reviewer-prompt.md` |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | `plugin:review-specs/consistency-analyzer-prompt.md` |

Domain: `software` (resolved at `default` level). Registry: three bundled reviewers, `severity_cap: blocker`, `context_pack: base`. `.context-index/governance/review.yaml` declares `reviewers: []`, so no overlay applied. No skill extensions (`__NONE__`). Three module heuristics injected.

---

## Aggregator: empirical re-verification of revision 3's stated claims

The caller asked for each measured claim in revision 3 to be re-measured rather than accepted. Reviewer profiles are read-only, so the aggregator measured every claim directly and supplied the results to all three reviewers as established fact.

**Method.** Every `*.plan.md` on disk was walked and parsed with `parseParallelizationSection` imported from `lib/parallel/groups.mjs`, at HEAD of `feat/pr-review-brief/charter`. Two corpora were measured, because the spec never names one.

| Claim | Spec states | Measured (`.context-index/specs/**`) | Result |
|---|---|---|---|
| Plans carrying `## Parallelization` | 139 | **139** | VERIFIED |
| → usable (`groups.length > 0`) | 80 | **80** | VERIFIED |
| → `malformed: true` | 59 | **59** | VERIFIED |
| Usable plans with ≥1 duplicate-member group | 23 (29%) | **23 (29%)** | VERIFIED |
| `plan-task-events.plan.md` group A members | `["1","2","3","1"]` | `{id:"A", members:["1","2","3","1"], independent:false}` | VERIFIED |
| Cause breakdown of the 59 | 28 / 19 / 10 / 2 | **29 / 18 / 10 / 2** (see note) | VERIFIED |
| Qualifier widening recovers N plans | 10 (not 22) | **10**, coverage 80/139 → 90/139 | VERIFIED |
| `grep -rn "Task Summary" lib/` | returns nothing | no output, exit 1 | VERIFIED |

**Note on the breakdown.** Independent re-classification produced 29 / 18 / 10 / 2 against the spec's 28 / 19 / 10 / 2 — same total (59), same qualifier figure (10), same no-parenthetical figure (2). The single-plan difference is `cross-cutting/incremental-artifact-writes.plan.md`, whose line is `- **Independent group B (pure helpers):** Tasks 2, 3, 5 …`: bold-wrapped, but with lowercase "group" and not in the `Group <id>` form, so it is defensibly classified as either "bold-wrapped" or "no `- Group` line at all". Reproducible under a reasonable rule; recorded as VERIFIED, not as a discrepancy. **The operative claim — that widening the qualifier alone recovers exactly 10 plans, not the 22 revision 2 asserted — is exactly right.**

**Corpus sensitivity — this is a finding, not a footnote.** The stated 139 / 80 / 59 reproduces *only* under the undeclared restriction `.context-index/specs/**`. Over the whole repository (including `tests/fixtures/` and `tests/evals/integration-sandbox/`) the same measurement yields **146 / 85 / 61** across 172 plan files. The spec names no corpus, and its Acceptance Criteria requires a script that "recomputes usable-vs-malformed counts **over the plan corpus**". Both readings are defensible and they differ by 7 plans, so a test written against the other reading red-fails on day one. Escalated by two reviewers independently (SA-4, CON-7).

**Drift precedent.** Revision 2's figures (138 / 79) rotted by +1 within a single day from one newly committed plan file. The same mechanism applies to 139 / 80 / 59.

**Additional measured fact supplied to reviewers** (not a claim the spec makes): `parseParallelizationSection("")` returns `{groups: [], malformed: false}` via the `planContent.length === 0` early return at `lib/parallel/groups.mjs:22-25` — the identical state the spec's three-state table labels "section absent entirely". The `stat` gate in § Resource bounds covers the size ceiling and the regular-file check, not zero length.

---

## Structural Architect (structural-architect)

**Verdict:** BLOCK

### SA-1 — `blocker` — NEW — § Fallback ladder (rung 3) / § Behaviors / § Error Cases / § Resource bounds

- **blocker_id:** `structural-architect:inconsistent-enumeration:5f5d440b`
- **section_anchor:** `fallback-ladder`

**Finding.** The rung-3 cause enumeration is stated with four different cardinalities across five surfaces. Ladder line 130 requires the annotation to name "which of the **three** applied"; Behaviors line 200 says "which of the **four** applied"; Behaviors line 202 restates the same rung as "which of the **two** applied" and never names a rung at all — a stale duplicate left behind by the five-to-three collapse; Error Cases line 220 says "which of the **two** applied"; Error Cases line 222 routes an out-of-containment path to rung 3, a fifth cause absent from the ladder's condition column; § Resource bounds line 85 makes "not a regular file" a rung-3 cause also absent from that column; and the closing prose at line 227 says rung 3 covers four things. A renderer and its test cannot both be written against this. This is the same defect class as three of the seven prior blockers — one fact stated inconsistently across surfaces — re-manifested on a different fact after the ladder restructure.

**Recommendation.** Make the ladder's rung-3 condition column the single normative enumeration of rung-3 causes, delete the duplicate Behaviors bullet at line 202, and restate Behaviors, Error Cases and Resource bounds against that one list.

### SA-2 — `blocker` — NEW (escalated from prior SEC-5 suggestion) — § Fallback ladder rungs 2–3 / § Behaviors

- **blocker_id:** `structural-architect:incomplete-contract:a8df42b9`
- **section_anchor:** `fallback-ladder`

**Finding.** `git log --reverse` is named as the ordering for rungs 2 and 3, but no commit range is ever specified, so the degraded ordering contract is undefined. This is internal inconsistency, not merely a security residual: line 155 names its range explicitly (`git diff --numstat base..head`) while lines 129, 130, 199, 200 and 202 do not, in the same document. An unranged walk enumerates all repository history, so commits outside the PR enter the reading order. Revision 3 escalated this from revision 2's assessment: the degraded path now covers 59 of 139 plans — 42% — rather than being a last resort.

**Recommendation.** State the range on every `git log --reverse` occurrence, consistent with the range the size advisory already names.

### SA-3 — `blocker` — NEW — § Resource bounds (bound 4) / § Actionable Task Map / § Acceptance Criteria

- **blocker_id:** `structural-architect:ambiguous-ownership:ff6fc09c`
- **section_anchor:** `resource-bounds`

**Finding.** The 64 KiB "total rendered bytes across both sections" bound spans slots 1 and 3, which are non-adjacent and assembled by `pr-body-composition`. No spec names who accumulates rendered bytes across slots. `pr-body-composition.spec.md:35` states that marker assembly requests each slot from its owner and that "a slot renderer returns section body text" — so neither renderer can observe the other's size. The bound is filed in this spec's Task Map beside per-plan caps it *can* enforce locally, which hides the fact that it needs a cross-slot accumulator this spec does not own. The drift is already visible: Acceptance Criteria line 260 has slipped to the singular ("the rendered **section** stays under the 64 KiB total"). This is the same ownership shape the sibling spec was corrected for on marker emission.

**Recommendation.** Name the owner of the cross-slot byte budget in exactly one spec — either scope the bound per-section here, or state it as an assembly-level bound in `pr-body-composition` — and align line 260 with whichever is chosen.

### SA-4 — `blocker` — NEW — § Measured coverage / § Acceptance Criteria

- **blocker_id:** `structural-architect:ambiguous-acceptance-criterion:371dcad2`
- **section_anchor:** `acceptance-criteria`

**Finding.** The plan corpus is undefined. 139 / 80 / 59 reproduce only under `.context-index/specs/**`; the whole-repo reading yields 146 / 85 / 61, a 7-plan difference. Both readings of "over the plan corpus" are defensible, so a test written against the other one fails immediately. Second and independent: the criterion as worded pins exact counts, and those counts move with any unrelated commit that adds a plan file — revision 2's figures rotted +1 within a day. As written the criterion mandates a test that red-fails on unrelated changes.

**Recommendation.** Name the corpus glob in the spec body where 139 / 80 / 59 are stated, and restate what the criterion pins — that the recomputation is reproducible — rather than pinning literals that drift.

### SA-5 — `warning` — § Fallback ladder rung 3 annotation / § System Constitution Reference

Rung 2's annotation must state "that ordering is chronological rather than planned"; rung 3's must name only the path and cause, despite using the identical `git log --reverse` ordering. Line 48 elevates loud degradation to a behavioral requirement precisely because "a reading order derived from commit order looks identical to one derived from a plan unless the brief says which it is". Rung 3 exempts itself from the spec's own stated invariant.

**Recommendation.** Require the chronological-rather-than-planned statement on every rung above 1.

### SA-6 — `warning` — `charter.md` § Capability Map vs § Consumed APIs *(Q1)*

The charter is internally inconsistent, independent of this spec: the capability row at line 82 promises a sequence derived from "**plan task order** and `## Parallelization` groups", while Consumed APIs at line 112 lists only `## Parallelization` read through `lib/parallel/groups.mjs`. There is no declared input for plan task order — that was `## Task Summary`, which revision 3 correctly dropped. The charter side must change (revision 6), not the spec.

**Recommendation.** Reword the capability row to the single declared input, or add "degrading to commit chronology where groups are unusable".

### SA-7 — `warning` — § Configuration ("Config is read from the base ref") / § Behaviors *(Q2)*

The base-ref decision is sound and the determinism argument holds. The gap is the output contract: no Behaviors bullet requires the rendered advisory to name the resolved `base` or where the threshold came from. With `--base` omitted, `pr-body-composition.spec.md` § Preconditions resolves it to a merge base that moves as the default branch advances, so a threshold can change between two runs of the same command with nothing in the output to explain it — silent, in a spec that elevates loud degradation. Separately, `mirror_globs` read from `base` means a PR that legitimately adds a new mirrored path cannot exclude it; the spec names every other cost of this decision but not that one.

**Recommendation.** Require the advisory to name the resolved base and the config source; state the newly-added-mirror-path consequence explicitly as intended.

### SA-8 — `warning` — PERSISTENT (prior SEC-3 / CON-4) — § Error Cases vs § three-state return table

A zero-byte plan file reads successfully; `parseParallelizationSection("")` returns `{groups: [], malformed: false}`, which the return table maps to "section absent entirely" → rung 2. Error Cases still routes "unreadable (permissions, **truncation**)" to rung 3, and the `stat` check covers the size ceiling and regular-file, not zero length. Rated warning here rather than blocker on the reasoning that "unreadable" naturally denotes an `fs`-level throw and the conflict comes only from the parenthetical "truncation" naming a case that is not a throw. *(The consistency analyzer rated the same defect a blocker — see CON-6.)*

**Recommendation.** Drop "truncation" from the row, or define the discriminator between an `fs` throw and a successful zero-byte read.

### SA-9 — `suggestion` — § Preconditions / § Configuration; `charter.md` § Consumed APIs

The `pr:` manifest block is a new consumed input with no row in the charter's Consumed APIs, and `pr-body-composition.spec.md` § Preconditions states the manifest "is read only if present and **only to confirm** [the trailer names]" — a claim about the same verb that this spec now falsifies. Declare the block in the charter and reconcile the sibling sentence.

**Explicitly not reported.** ADR compliance is clean: the spec introduces no new sidecar peer (ADR-0012 § "Permitted peers" untouched — it reads `<spec-stem>.plan.md` only, through the owned parser), and `kind: behavioral` carries the Preconditions / Behaviors / Postconditions / Error Cases shape ADR-0009 § 1 requires. The five-slot section list matches `pr-body-composition.spec.md` exactly. Markdown escaping is correctly delegated to the sibling's single encoder rather than restated.

---

## Security Reviewer (security-reviewer)

**Verdict:** BLOCK

### SEC-6 — `blocker` — input-validation / path-traversal — NEW — § Resource bounds

- **blocker_id:** `security-reviewer:path-traversal:6fed7ac6`
- **section_anchor:** `resource-bounds`

**Finding.** The plan path is containment-checked by the sibling's encoding rule 2, which resolves with `path.resolve` and compares against the *canonicalized root* — it never canonicalizes the *candidate*. This spec then adds a `stat` + regular-file check and a read. `path.resolve` does not follow symlinks and `stat` does, so a fork PR that commits `.context-index/specs/x/x.plan.md` as a symlink to a runner file (e.g. `/home/runner/work/_temp/_github_workflow/event.json`) passes containment, passes the regular-file and 1 MiB checks, and is opened. This spec is the surface that introduces symlink handling — § Resource bounds argues explicitly about "a committed symlink to a character device", and Acceptance Criteria line 259 pins only *symlink to a non-regular file* — so the canonicalize-then-recheck rule belongs here, not in the sibling.

**Failure scenario.** Content exfiltration is gated on the target containing `- Group A (independent): Task 1` lines, but the *annotations* are not gated: rung 3 renders "oversized" vs "not a regular file" vs "unreadable" vs "absent" into the public PR body, giving an attacker a per-path existence / file-type / size oracle over the CI runner's filesystem, one symlink per commit. These annotations are stdout (the brief), so the sibling's "diagnostics go to stderr, repo-relative" rule does not cover them. Compounding: the state the ladder's three-way enumeration drops is precisely non-regular-file (see SA-1).

**Recommendation.** Require `fs.realpath` (or `lstat` plus refusal to follow) on the candidate path and re-assert containment under `.context-index/specs/` *after* canonicalization, before `stat` and before any read. A plan whose realpath escapes the root is treated as out-of-bounds, never opened, and renders the same annotation as any other out-of-bounds trailer — with no distinction between "exists", "wrong type", and "oversized". Add an acceptance criterion: a symlink inside the specs root pointing outside it is never opened and its annotation is byte-identical to the absent-path annotation. CWE-59, CWE-22.

### SEC-7 — `blocker` — data-exposure — NEW — § Output Encoding / § Error Cases

- **blocker_id:** `security-reviewer:data-exposure:f6ab8286`
- **section_anchor:** `output-encoding`

**Finding.** § Output Encoding states a **closed** enumeration of values routed to the shared encoder: "group ids, the parser's `independent` labels, task references, plan paths, zero-member group ids, rung annotations, and glob strings from `manifest.yaml`". Two values this spec renders fall outside it. (1) § Error Cases line 222: a plan path resolving outside `.context-index/specs/` renders "naming **the trailer value** as out of bounds" — a raw commit trailer, top of the threat model, fully attacker-controlled. It is not a "plan path" (it never resolved to one), and the sibling never contemplated rendering it: `pr-body-composition.spec.md` treats out-of-containment as "does not exist" and renders the row *as a missing path*. This spec creates a new sink for the raw attacker string. (2) § Error Cases line 217 renders "the rejected value" of `size_threshold_additions`, also outside the list.

**Failure scenario.** A fork commit with `Spec: ../../x](https://attacker.example/p.gif)<!-- /adev:pr-brief -->` produces an out-of-bounds rung-3 annotation containing the raw value; an implementer coding against this spec's closed list does not encode it, and the PR body gets a tracking pixel plus a forged closing marker that lets `cicd`'s boundary-based replace treat attacker text as author-written.

**Recommendation.** Replace the enumeration with the sibling's universal form — "every value interpolated into either section, whatever its source, passes through the encoder" — and name these two explicitly. Better still, do not render the raw trailer at all: render the encoded, repo-relative *derived path* plus a fixed "out of bounds" label. Add an acceptance criterion pinning a trailer containing `](`, `|`, and `<!-- /adev:pr-brief -->` to a single-cell, marker-free row. CWE-116, CWE-79.

### SEC-8 — `warning` — input-validation — § Output Encoding length cap / § Resource bounds

The 200-character cap and the 64 KiB total cap are new operations on rendered values and neither is sequenced against the sibling's contractually-ordered six rules. Truncate-after-encode can cut between `\` and `|` (or mid-`&lt;!--`), emitting a bare pipe at a cell boundary — exactly the cell-shift harm rule 4 exists to prevent. Truncate-before-encode means the 200 budget is measured pre-expansion, so 200 pipes render as 400+ characters and the delivery-size justification fails. The same ambiguity applies to the 64 KiB cap ("truncate at the boundary" — which boundary?).

**Recommendation.** State that the 200-character cap applies to the *input* value before encoding, and that the 64 KiB cap truncates only at a whole-value boundary, never mid-value and never mid-escape-sequence. Add an acceptance criterion with a 5,000-character all-`|` qualifier asserting the rendered row has the expected column count *and* stays under the cap.

### SEC-9 — `warning` — input-validation — § Configuration / § Actionable Task Map

This spec adds three git invocations over refs — `git show <base>:.context-index/manifest.yaml`, `git diff --numstat base..head`, `git log --reverse` — and states no argument-handling rule for any of them. The charter's Security attribute covers *trailer values* only; the sibling carries the rule only on its own trailer-reader task row. The spec-level defect is **argument** injection as much as shell: `<base>` is string-concatenated into `<base>:path` even under `execFile`, and a `base` beginning with `-` is parsed as an option.

**Recommendation.** Resolve `base` and `head` once via `git rev-parse --verify <ref>^{commit}`, reject anything that does not resolve to a 40-hex SHA, pass only those SHAs as argv array elements with `--` separators, and add the rule to the "Base-ref config reader" and "Size computation" task rows. CWE-88, CWE-78.

### SEC-3 — `warning` — input-validation — PERSISTENT — § Error Cases vs § three-state return table

§ Error Cases still promises rung 3 with the annotation "**unreadable rather than absent**" for a truncated file, but `parseParallelizationSection("")` returns `{groups: [], malformed: false}`, which the three-state table maps to "section absent entirely" → rung 2. The `stat` gate checks the size ceiling and file type, not zero length. The harm is not the fs mechanics: the brief asserts to a reviewer, as fact, a distinction the verb cannot make, and an attacker committing an empty plan file chooses which false statement appears.

**Recommendation.** Define the distinguisher explicitly — only an `fs` throw yields "unreadable"; a successful read of a zero-length or whitespace-only file is its own state annotated "present but empty", distinct from both "absent" and "unreadable" — and add an acceptance criterion with a zero-byte fixture.

### SEC-5 — `warning` — rate-limiting — PERSISTENT, escalated from suggestion — § Fallback ladder / § Behaviors

Unchanged across a full revision, and revision 3 now routes *both* degraded rungs through it. The ladder and both rung-2/rung-3 Behaviors say `git log --reverse` and never name the range; § Size Advisory names `base..head` but the ladder does not inherit it. An unranged walk covers all history, so the reading order can list commits outside the PR and the walk cost is repo-lifetime rather than range-sized. The phrasing also implies one invocation per degraded plan, and the number of referenced specs is unbounded (one `Spec:` trailer per commit), giving N × full-history walks. *(Escalated to blocker by the structural architect — see SA-2.)*

**Recommendation.** State `git log --reverse --no-merges <base-sha>..<head-sha>` explicitly in the ladder and both Behaviors, computed **once** per invocation and reused for every degraded plan. Add a fifth resource bound capping distinct referenced specs (plan files stat-ed/read) per run, with a named "additional specs not analyzed" degradation.

### SEC-10 — `suggestion` — secrets/configuration — § Configuration

`mirror_globs` is read from `base` with no cap on entry count or length and no glob-syntax validation, then matched against every changed path (N×M). Bound it (e.g. 50 entries, 200 characters each), reject entries containing `..` or a leading `/`, and render the count applied. Reading globs from base means a PR adding a legitimately-mirrored path cannot exclude it — that is the safe direction (net over-counts, erring toward more review) and should be stated as intentional rather than left as an implicit wart.

**Explicitly not reported.** Authentication and authorization have no surface here — a local CLI reading git objects and on-disk files as the invoking CI identity, writing to stdout; no principal, no resource-ownership model. Markdown escaping is delegated to the sibling's encoder and its gaps are tracked against `pr-body-composition.spec.md`, not re-reported. Prior SEC-1 (working-tree config) and SEC-2 (unbounded rendering) are resolved.

---

## Consistency Analyzer (consistency-analyzer)

**Verdict:** BLOCK

### CON-5 — `blocker` — domain-model — NEW — § Fallback ladder rung 3

- **blocker_id:** `consistency-analyzer:domain-model:5ae12fbf`
- **section_anchor:** `fallback-ladder`

**This spec (§ Fallback ladder, rung 3):** condition is "No plan file … or the plan is unreadable, or the plan exceeds the byte ceiling", annotation "names the path and **which of the three** applied."

**Conflicts with (the same file, five other places):** § Behaviors line 200 — "exceeds 1 MiB, **is not a regular file**, is unreadable, or does not exist … which of the **four** applied"; § Behaviors line 202 — a second, overlapping bullet ("no plan file, or … unreadable … which of the **two**") that never names a rung; § Error Cases line 220 — "which of the **two** applied"; § Error Cases line 222 — out-of-containment path → rung 3, a fifth condition absent from the ladder; § Resource bounds line 85 — non-regular-file → rung 3, also absent from the ladder; closing prose line 227 — "Rung 3 covers absent, unreadable, oversized, and non-regular-file" (four, excluding containment).

**Failure.** The rendered annotation is a contract with five candidate causes and four different stated cardinalities (2 / 3 / 4 / 5). Acceptance Criteria line 251 ("each rung has a test asserting … the presence of its annotation") cannot be written against it.

**Recommendation.** The spec changes. Make § Fallback ladder rung 3 the single normative list (absent, unreadable, oversized, non-regular-file, out-of-containment — five), delete the duplicate Behaviors bullet at line 202, and restate every other surface as "which of the five applied". This is prior SA-4 re-manifested on a different fact, not prior CON-2 (whose `## Task Summary` cause is gone), hence a new id.

### CON-6 — `blocker` — domain-model — PERSISTENT (prior CON-4 / SEC-3, escalated) — § Error Cases

- **blocker_id:** `consistency-analyzer:domain-model:ee9fb6f2`
- **section_anchor:** `error-cases`

**This spec (§ Error Cases line 219):** "Plan file present but unreadable (permissions, **truncation**) → **Rung 3**; … state it was **unreadable rather than absent**."

**Conflicts with (the same file, § Reading Order three-state table line 106 + ladder line 129):** `groups: [], malformed: false` = "**section absent entirely**" → **rung 2**. Per `lib/parallel/groups.mjs:22-25`, a zero-byte or whitespace-only file is read *successfully* and returns exactly that state. The spec defines no rule anywhere distinguishing an `fs`-level throw from a successful empty read; § Resource bounds line 85 checks the size ceiling and regular-file, not zero length.

**Failure.** A truncated-to-zero plan is simultaneously rung 3 ("unreadable") and rung 2 ("absent"). Same one-fact-two-ways class as prior CON-1 and CON-2. Escalated from warning because it survived a full revision that was specifically tasked with eliminating this defect class.

**Recommendation.** The spec changes: state that rung 3 is entered only on an `fs` throw or a failed pre-read check, and that a successful read of any content (including empty) enters the parser and is classified by the three-state table.

### CON-7 — `blocker` — contract — NEW — § Measured coverage / § Acceptance Criteria

- **blocker_id:** `consistency-analyzer:contract:146bdbe4`
- **section_anchor:** `acceptance-criteria`

**This spec (§ Measured coverage line 140 / AC line 268):** "the **139** plan files carrying `## Parallelization` … usable for **80** … `malformed: true` for **59**"; the criterion requires a script that "recomputes usable-vs-malformed counts **over the plan corpus**."

**Conflicts with:** the measured corpus. 139 / 80 / 59 holds only under the undeclared restriction `.context-index/specs/**`; the whole-repo reading (including `tests/` fixtures and eval sandboxes) yields 146 / 85 / 61. Neither the spec, nor the charter's Deferred row (which repeats 139 / 80 / 59 / 10 / 90), nor any cross-cutting spec defines "the plan corpus".

**Failure.** A test author taking the other defensible reading gets 146 / 85 / 61 and the criterion fails on day one. Revision 2's 138 / 79 also rotted +1 within a day, so the restriction must live in the spec, not in a test author's head.

**Recommendation.** The spec changes: name the corpus in § Measured coverage (`.context-index/specs/**/*.plan.md`, excluding `tests/` and eval sandboxes), have the criterion cite that glob verbatim, and mirror it into the charter's § Deferred Capabilities row. Also tighten the denominator in the same paragraph: "Rung 1 covers roughly 58% of plans" is 80/139 (plans *carrying the section*), not 80/151 (plan files).

### CON-8 — `warning` — contract — *(Q1 verdict)* — `charter.md` § Capability Map vs this spec § Fallback ladder

**Charter line 82:** "Reading order for multi-commit PRs | Derive a suggested reading sequence from **plan task order** and `## Parallelization` groups."
**This spec (lines 132–134):** `## Task Summary` — the only source of plan task order — is deliberately dropped; 59 of 139 plans now order by commit chronology.

**Verdict.** Yes, the charter row outruns its only implementing spec. **The charter side must change** (drop "plan task order and", or add "degrading to commit chronology where groups are unusable"). The spec's trade is stated correctly and does **not** overclaim: line 134 names commit chronology as "a worse ordering" and line 140 states the coverage figure. Warning, not blocker — the deviation is documented in the spec; the stale text is in the charter.

### CON-9 — `warning` — contract — PERSISTENT (prior SEC-5), escalated — § Fallback ladder / § Behaviors

Rungs 2 and 3 and Behaviors lines 199 / 200 / 202 all say "`git log --reverse` commit order" and never name the range. Conflicts with `charter.md` § Invariants: "Every commit in the `base..head` range appears in exactly one Traceability Row." An unranged walk enumerates all history. Revision 3 escalated this: chronology is now the ordering for every rung-2 and rung-3 plan, not a last resort. Fix: `git log --reverse base..head` at every occurrence. *(Carried as a blocker by SA-2.)*

### CON-10 — `warning` — contract — *(Q2 residual)* — § Configuration

Line 73 acknowledges only that "two runs at **different bases** may legitimately differ in threshold". `pr-body-composition.spec.md` § Preconditions line 192: with `--base` omitted the base **defaults to the merge base with the default branch**, which moves as that branch advances — so the identical command at two times silently resolves different thresholds and different `mirror_globs`. Not a violation of the charter invariant (stated over a fixed `(base_ref, head_ref)` pair), but the acknowledgment does not cover the drift case. Fix: require the advisory to render the resolved base ref it read config from. Related: `mirror_globs` read from `base` means a PR adding a new mirrored path cannot exclude it — state this consequence.

### CON-11 — `warning` — pattern — § Output Encoding

Line 169 says "This spec states no escaping rules of its own", then line 173 adds a 200-character truncation. `pr-body-composition.spec.md` § Output Encoding Contract defines six rules, no truncation, and asserts "Encoding is applied once, at the interpolation boundary, by a single function." Order is undefined: truncating after rule 4 can sever `\|` to a trailing `\`, or cut a rule-5 marker-neutralized sequence mid-escape. Fix: state truncate-then-encode, and place the cap in the sibling's contract. *(Same underlying gap as SEC-8.)*

### CON-12 — `warning` — pattern — § Configuration / § Actionable Task Map

Line 69 and line 239 give `git show <base>:.context-index/manifest.yaml` with no argv statement. `<base>` is user-supplied via `--base`; the sibling spec carries the argv rule explicitly on its trailer-reader row and `charter.md` § Quality Attributes → Security forbids shell interpolation of externally-supplied values. Add the argv clause. *(Same underlying gap as SEC-9.)*

**Verified clean.** § Section Placement's five-slot table matches `pr-body-composition.spec.md` exactly. The "block is not at the top of the PR body" rationale is consistent with `review-packet-template.spec.md`. The zero-member rule, the de-duplication rule, and the 10 / 80→90 / 139 figures are stated identically on every surface that carries them.

**§ Actionable Task Map — swept, one finding.** The caller named this surface explicitly. Its rung reference is correct: row 237 says "Three rungs with per-plan rung tracking", consistent with the ladder, and no row contradicts a rung number or a bound value. The 400 / 200 / 1 MiB / 50 / 100 / 64 KiB literals appear consistently wherever they recur. Two defects touch this table and are filed elsewhere: the "Resource bounds" row carries the 64 KiB cross-slot bound the spec does not own (SA-3), and the "Base-ref config reader" and "Size computation" rows introduce git invocation sites without the argv-not-shell rule the sibling carries (SEC-9 / CON-12).

**Aggregator override — one consistency finding withdrawn.** The reviewer raised a `suggestion` (CON-13) that § Preconditions line 179's reference to "this charter's **Dependencies** table" is wrong because the charter has no such table. The aggregator verified this directly: `charter.md` lines 35–46 contain a `### Dependencies` table under § Scope and Boundaries, and it carries the `worktree-parallelization` row the spec cites. The finding is **refuted** and is not carried into the totals.

---

## Prior-blocker disposition (revision 2 → revision 3)

| Prior id | blocker_id | Status | Evidence |
|---|---|---|---|
| SA-1 | `structural-architect:unverified-claim:9b705ec7` | **RESOLVED** | Measured 23/80 (29%) stated at line 118; explicit per-group keep-first de-duplication rule at line 120; cap applied after de-duplication (line 87); Behaviors line 198 and AC line 255 pin it. All three reviewers concur. |
| SA-2 | `structural-architect:undeclared-dependency:74f607a0` | **RESOLVED** | `## Task Summary` removed from the ladder entirely with rationale at line 132; AC line 252 asserts the module contains no reference to the heading. Aggregator re-verified `grep -rn "Task Summary" lib/` returns nothing. |
| SEC-1 | `security-reviewer:input-validation:15f974c2` | **RESOLVED** (residual → CON-10 / SA-7) | Config read via `git show <base>:.context-index/manifest.yaml`; Postconditions line 210 and AC line 257 pin it with a head-side `999999` fixture. |
| SEC-2 | `security-reviewer:rate-limiting:2d1c84aa` | **RESOLVED** (new residuals → SA-3, SEC-5) | Four named bounds with named degradations; group count, member count, plan byte ceiling and total rendered bytes all bounded, not only value length. |
| CON-1 | `consistency-analyzer:domain-model:fff0c66a` | **RESOLVED** | Zero-member → rung 2 stated identically at lines 112, 129, 199 and 253. |
| CON-2 | `consistency-analyzer:domain-model:ffa1a7ca` | **RESOLVED as stated** | The `## Task Summary` self-contradiction is gone. The rung-3 condition is inconsistent again on a *different* fact — filed as SA-1 / CON-5 (NEW), not a reuse of this id. |
| CON-3 | `consistency-analyzer:domain-model:2ad4f1f1` | **RESOLVED** | 10 plans, 80/139 → 90/139, breakdown 28/19/10/2 — all confirmed against direct measurement; charter corrected at revision 5 and consistent with the spec. |

Non-blocking prior findings: **SA-4 PERSISTENT** (re-manifested as SA-1 / CON-5, escalated to blocker). **SEC-3 / CON-4 PERSISTENT** (zero-byte plan; escalated to blocker by the consistency analyzer as CON-6, held at warning by the other two as SA-8 / SEC-3). **SEC-5 PERSISTENT** (unranged `git log`; escalated to blocker by the structural architect as SA-2). **SA-3 and SA-5 RESOLVED.**

## Adversarial questions — consolidated answers

**Q1 — Does dropping `## Task Summary` quietly lose something the charter promised?**

The decision is correct and the trade is correctly reasoned. Removing the section is right on ownership grounds (no parser in `lib/`, no owner, no Consumed-APIs entry — all three re-verified), and the spec does **not** overclaim: line 134 states plainly that commit chronology "is a worse ordering", and every rung-2/rung-3 annotation is required to disclose that the ordering is chronological rather than planned, so no reader can mistake a degraded ordering for a planned one.

It does, however, quietly leave the **charter** promising something the spec no longer delivers. `charter.md` line 82 still reads "Derive a suggested reading sequence from **plan task order** and `## Parallelization` groups", and the charter's own Consumed APIs table (line 112) declares no input that carries plan task order. Two reviewers flagged this independently (SA-6, CON-8), both at `warning`: the charter must move to revision 6, not the spec. One residual the spec should close on its own: SA-5 notes rung 3 is exempted from the chronological-disclosure requirement that rung 2 carries, which is the one place the loud-degradation invariant is not applied uniformly.

**Q2 — Is the base-ref config compatible with the determinism criterion?**

Yes, as stated. The charter invariant is "Output is deterministic for a fixed `(base_ref, head_ref)` pair"; `base` is an element of that fixed pair, so configuration derived from it is a function of the declared inputs. All three reviewers concur that this is not a determinism violation, and the change closes SEC-1's core.

The claim survives; its *rendering* does not. Three edges the spec does not cover:
1. **Merge-base drift.** With `--base` omitted, `pr-body-composition.spec.md` line 192 resolves the base to a merge base that moves as the default branch advances. The spec's acknowledgment — "two runs at different bases may legitimately differ in threshold" — is literally true of this case, but it reads as covering an explicitly-changed `--base`. The drift case is the one a user hits without expecting it, and nothing in § Behaviors requires the resolved base or the config source to appear in the output, so the change is silent in a spec whose central quality attribute is loud degradation (SA-7, CON-10).
2. **Attacker choice of branch point.** The justification "the side of the range that already passed review" conflates *reviewed* with *current policy*: branching from a commit predating a threshold tightening or a `mirror_globs` narrowing silently restores the old knob. Reading the `pr:` block from the PR's target-branch tip rather than the merge base would close this.
3. **`mirror_globs` from base.** A PR that legitimately adds a new mirrored path cannot exclude it. This errs toward over-counting and therefore toward more review, which is the safe direction — but the spec names every other cost of this decision and not this one, so it should be stated as intentional.

None of these three is rated a blocker. Q2's answer is: the reasoning is correct, the statement is correct, and the output contract behind it is incomplete.

---

## Summary

**Total findings:** 24 (9 blockers, 13 warnings, 2 suggestions)

| Reviewer | Verdict | Blockers | Warnings | Suggestions |
|---|---|---|---|---|
| structural-architect | BLOCK | 4 | 4 | 1 |
| security-reviewer | BLOCK | 2 | 4 | 1 |
| consistency-analyzer | BLOCK | 3 | 5 | 0 |

**Blockers:**

| id | blocker_id | NEW / PERSISTENT | One-line |
|---|---|---|---|
| SA-1 | `structural-architect:inconsistent-enumeration:5f5d440b` | NEW | Rung-3 cause enumeration stated as 2 / 3 / 4 / 5 across six places; the annotation contract is unwritable. |
| SA-2 | `structural-architect:incomplete-contract:a8df42b9` | NEW (prior SEC-5 escalated) | `git log --reverse` never names a range, on the path that now covers 42% of plans. |
| SA-3 | `structural-architect:ambiguous-ownership:ff6fc09c` | NEW | The 64 KiB cross-slot byte bound has no owner; neither slot renderer can observe the other's size. |
| SA-4 | `structural-architect:ambiguous-acceptance-criterion:371dcad2` | NEW | The plan corpus is undefined; 139/80/59 vs 146/85/61, and the criterion pins drifting literals. |
| SEC-6 | `security-reviewer:path-traversal:6fed7ac6` | NEW | Containment canonicalizes the root but not the candidate; a committed symlink escapes and the rung-3 annotations become a filesystem oracle in a public PR body. |
| SEC-7 | `security-reviewer:data-exposure:f6ab8286` | NEW | The encoder enumeration is closed and omits the raw `Spec:` trailer value and the rejected threshold value, both rendered by § Error Cases. |
| CON-5 | `consistency-analyzer:domain-model:5ae12fbf` | NEW | Same defect as SA-1, reached independently from the consistency sweep. |
| CON-6 | `consistency-analyzer:domain-model:ee9fb6f2` | PERSISTENT (prior CON-4 / SEC-3) | A zero-byte plan is simultaneously rung 3 ("unreadable") and rung 2 ("absent"); no discriminator is defined. |
| CON-7 | `consistency-analyzer:contract:146bdbe4` | NEW | Same defect as SA-4, reached independently. |

SA-1/CON-5 and SA-4/CON-7 are each one defect found by two reviewers under distinct ids; addressing either member of a pair addresses both. Seven distinct defects underlie the nine blocker entries.

**Action required:** revision 3 resolved all seven of revision 2's blockers and every empirical claim it makes is reproducible. The remaining blockers are of two kinds: four are the *same class* as the prior seven — one fact restated inconsistently across § the ladder, § Behaviors, § Error Cases, § Resource bounds and § Acceptance Criteria, surviving the five-to-three ladder collapse (SA-1/CON-5, CON-6, SA-4/CON-7). Three are new surfaces the revision opened: the cross-slot byte budget's ownership (SA-3), symlink canonicalization introduced alongside the regular-file check (SEC-6), and the closed encoder enumeration versus two newly-rendered attacker-controlled values (SEC-7).

Run `/adev:specify --revise` against `pr-body-advisories.blockers.md`, then re-review.

**Scope note for the revise pass.** Two files that some recommendations point at are outside this spec and will not be edited by `--revise`:

- `charter.md` must move to revision 6 to close SA-6 / CON-8 (the Capability Map row promising "plan task order"). SA-9 also asks for a `pr:` row in its Consumed APIs.
- `pr-body-composition.spec.md` is named as an *option* by three findings. Each has an in-scope alternative that must be taken instead: **SEC-7** — restate this spec's encoder enumeration as open-ended ("every value interpolated into either section, whatever its source") within this spec, rather than editing the sibling's contract; **CON-11 / SEC-8** — state the truncate-then-encode ordering here; **SA-3** — scope the 64 KiB bound per-section here rather than moving it to the sibling's assembly step.

Neither file is required for the blockers to be resolved inside `pr-body-advisories.spec.md`, but both leave a residual inconsistency until they are updated separately.

**Governance footer:** `.context-index/governance/gates.yaml` declares `transitions: {}` — no `spec-to-plan` approver role is configured.
