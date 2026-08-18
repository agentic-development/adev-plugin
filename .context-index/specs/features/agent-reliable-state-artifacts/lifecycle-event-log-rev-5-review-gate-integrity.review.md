---
spec: .context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log-rev-5-review-gate-integrity.spec.md
charter: .context-index/specs/features/agent-reliable-state-artifacts/charter.md
date: 2026-08-17
verdict: BLOCK
rigor-tier: full
last-reviewed-revision: 4
file-sha: c6f1d90c606925eec5b4fd648c3b2d38554cc2bc05cacf64c41c01895a7e5f0c
---

# Architecture Review: lifecycle-event-log-rev-5-review-gate-integrity

> **Date:** 2026-08-17
> **Spec:** `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log-rev-5-review-gate-integrity.spec.md`
> **Charter:** `.context-index/specs/features/agent-reliable-state-artifacts/charter.md`
> **Verdict:** BLOCK
> **Rigor tier:** full (`risk_level: high` → `review_mode: full`; no `--tier` override)
> **Spec revision reviewed:** 4

## Registry Notes

Registry loaded via `adev governance reviewers --json` — 0 errors, 4 warnings:

| Code | Message |
|------|---------|
| BROADEN_TOOL | Profile 'browser-review': allow_add broadens posture by adding mcp_server 'playwright'. |
| BROADEN_TOOL | Profile 'browser-review': allow_add broadens posture by adding category 'web-fetch'. |
| BROADEN_NETWORK | Profile 'browser-review': network broadened 'deny' → 'read-only'. |
| CONTEXT_PACK_OVERRIDE | Context pack 'review-base' overrides bundled default. |

Governance: `spec-to-plan` transition is commented out in `gates.yaml` — no `approver_role` declared.

Skill extensions: `adev skill-ext load --skill review-specs` → `__NONE__`.

Cross-repo `depends-on` validation: skipped — the spec declares no `depends-on` field.

## Aggregator Advisories

None. All four `blocker`-severity findings carry a well-formed `blocker_id` and a
`section_anchor`; `parseBlockerId` accepted every id and `writeBlockers` reported
0 collisions. The `.blockers.md` sidecar is therefore **complete** — unlike the
revision-3 round, no finding was excluded under `LEGACY_REVIEWER_OUTPUT`, and the
auto-retry path is not suppressed by this report.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | `plugin:review-specs/structural-architect-prompt.md` |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | `plugin:review-specs/security-reviewer-prompt.md` |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | `plugin:review-specs/consistency-analyzer-prompt.md` |

No reviewers are disabled in `.context-index/governance/review.yaml`.

---

## Structural Architect (structural-architect)

**Verdict:** FAIL

The amendment is disciplined about mechanism (optional per-variant field + fail-soft
fold, no new `CANONICAL_EVENTS` variant, ADR-0009 boundary respected, ADR-0011
correctly cited as the reason for the `source-manifest` denylist entry). Its code
claims verify: `lib/cli/gate.mjs:144` is the sole `requireGate` enforcement caller
and passes no sha; `GateError.code === "GATE_BLOCKED"` is what `cli/index.mjs:2005`
keys exit 2 on; `requireGate` performs no I/O; `adev report --type reviewer` exposes
no `--revision` flag; `lib/source-manifest.mjs:83` uses
`createHash("sha256").update(content)`; every skill emits `--status started` before
a terminal, so BEH-7/BEH-8 break no existing call site. Three structural defects block.

### SA-1 — `blocker` — gate-bypass

- **blocker_id:** `structural-architect:gate-bypass:9bf7dc55`
- **section_anchor:** `behaviors-3a`
- **Location:** BEH-3a, interacting with BEH-4/BEH-5

**Finding:** BEH-3a scopes reconciliation to "reports appended after the most recent
`spec_revised` event" but never defines the **empty-window** case.
`lib/specify-revise.mjs` rewrites the spec bytes, emits `spec_revised`, and emits
**no** step event resetting `review` (verified: it only flips frontmatter `status`
and clears `.blockers.md`; line 252 shows it proceeds even when the spec is not
`review-blocked`). So the sequence *review PASS → `adev specify revise` → plan*
leaves a window containing zero `reviewer_report`s. Under BEH-3 ("reports without
the field leave the projection key absent") the only defined outcome is `specSha`
absent, which BEH-5 routes to `SPEC_SHA_UNVERIFIABLE` — explicitly non-blocking —
while the append-only log still projects `steps.review.status: completed,
verdict: PASS` from the pre-revision review. Defect 1 of the Rationale is therefore
reachable through a documented, supported path, on the exact revision boundary the
amendment was built around.

**Recommendation:** Define the empty-window outcome explicitly in BEH-3a and give it
a blocking disposition distinct from "never stamped" (BEH-5's soft path must remain
reserved for pre-amendment history). Add an AC covering revise-without-re-review.

### SA-2 — `blocker` — contradictory-projection-rule

- **blocker_id:** `structural-architect:contradictory-projection-rule:0cb97b9d`
- **section_anchor:** `behaviors-3`
- **Location:** BEH-3 / BEH-3a vs. Acceptance Criteria (the rev-1/rev-2 AC)

**Finding:** BEH-3 projects `spec_sha` onto `byRevision[N]` "for the revision that
event folds into," and BEH-3a states `byRevision[N].specSha` "independently carries
each revision's own reconciled value." But BEH-3a itself establishes — correctly —
that no emitter stamps `revision` on `reviewer_report`. Confirmed in code:
`effectiveRevision()` returns `1` for any event lacking the field, and the CLI has
no `--revision` flag, so **every** reviewer report folds into `byRevision[1]`. The
AC "a rev-1 review and a rev-2 review whose reports carry different digests …
`byRevision["1"].specSha` retains the rev-1 value" is therefore unimplementable:
both digests land in bucket 1, and BEH-3a's own within-set rule reconciles differing
values to `"divergent"`. The bucket-level contract contradicts the premise the window
rule was built on.

**Recommendation:** Either drop `byRevision[N].specSha` from BEH-3 (keeping the audit
trail in the window-scoped top-level projection only), or specify how per-revision
bucketing is obtained given no emitter supplies `revision`. Correct or remove the
dependent AC.

### SA-3 — `blocker` — unsatisfiable-precondition

- **blocker_id:** `structural-architect:unsatisfiable-precondition:baac30d3`
- **section_anchor:** `behaviors-1b`
- **Location:** BEH-1 / BEH-1b and the multi-line-collision AC

**Finding:** BEH-1b requires serializing `JSON.stringify(value)` over "the PARSED
value," and argues at length that raw-line concatenation is a CWE-436 hazard. It
names no parser, and the repo has none capable of this:
`lib/frontmatter.mjs::parseFrontmatter` matches indent-0 `key: value` lines with a
regex and stores **raw trimmed strings**; nested keys are not captured at all
(`source-manifest`'s children are simply invisible). Two consequences: (a) the AC
"a quoted multi-line value versus two separate keys produce DIFFERENT `spec_sha`"
cannot hold — the parser cannot distinguish them; (b) any nested (non-scalar)
frontmatter key other than the denylisted `source-manifest` is silently unattested,
which is the same CWE-345 hole BEH-1b argues must not exist, one nesting level down.
BEH-1b's own aside that "this repo carries no YAML library" states the obstacle
without resolving it, and the constitution gates a new dependency behind an ADR +
human approval.

**Recommendation:** Either name the parser as a deliverable of this amendment with an
explicit fidelity contract (which keys it can represent, what happens to values it
cannot), or narrow the digest to an explicitly enumerated **allowlist** of indent-0
scalar governance keys and retract the multi-line-collision AC.

### SA-4 — `warning`

- **Location:** BEH-9

**Finding:** BEH-9 says `adev gate require` MUST "compute the BEH-1 **body** digest."
BEH-1 defines the input as the *canonical attested region* (denylisted frontmatter +
body) and asserts it is "the sole definition." "Body digest" is a competing
description of the input at the amendment's single mandatory enforcement point, and
the spec's own second AC exists precisely to forbid that.

**Recommendation:** Replace with "canonical attested region (BEH-1)."

### SA-5 — `warning`

- **Location:** BEH-1 (shared-helper invariant)

**Finding:** The "one shared exported helper" invariant has a test AC but no owning
module. The emitter lives in `lib/lifecycle-state.mjs`, the enforcing caller in
`lib/cli/gate.mjs`; leaving ownership unstated invites the duplication the invariant
forbids, and placing it in `lifecycle-state.mjs` newly makes that module a reader of
spec *content* (today it only validates spec *paths*).

**Recommendation:** Name the module, and state the direction of the dependency.

### SA-6 — `suggestion`

- **Location:** BEH-7 / BEH-8

**Finding:** "Reads the projection only" is satisfiable — `steps.<step>.startedAt` is
set solely by a `lifecycle_step` `started` event — but `steps.<step>.status` is not a
valid signal: the aggregation pass synthesizes `completed` from reviewer reports
alone, with no `started` ever recorded. Naming the field the check reads would remove
an easy misimplementation.

---

## Security Reviewer (security-reviewer)

**Verdict:** FAIL

Verified against source: `lib/lifecycle-state.mjs` (`requireGate` L1980–2004 — no I/O,
`GateError.code = "GATE_BLOCKED"` L1892; `reportReviewer` L908–939), `lib/cli/gate.mjs`
L144 (sole enforcement caller, passes no sha — claim accurate), `cli/index.mjs` L2005
(`GATE_BLOCKED` → exit 2 — claim accurate), `lib/source-manifest.mjs` L83
(`createHash("sha256").update(content)` — claim accurate), `lib/cli/report.mjs` L252
(`--status` validated against enum only — defect-2 claim accurate; no `--revision`
flag exists anywhere in `report.mjs` — BEH-3a's premise accurate), `risk-policies.yaml`
(`high` → `require_hitl_approval: true` / `full` / `thorough`; `low` → `quick` /
`minimal` — BEH-1b's escalation claim accurate).

### SEC-1 — `blocker` — input-validation

- **blocker_id:** `security-reviewer:input-validation:9de26d8a`
- **section_anchor:** `behavioral-delta-beh-1b`
- **Location:** BEH-1 / BEH-1b (canonical frontmatter serialization); Acceptance Criterion 3

**Finding:** BEH-1/BEH-1b define the frontmatter half of the attested region as
`JSON.stringify` over "the PARSED value" but never name the parser, and the repo's
shared parser cannot deliver the property BEH-1b claims.
`lib/frontmatter.mjs::parseFrontmatter` captures **only indent-0 scalars** matching
`/^([a-zA-Z][a-zA-Z0-9_-]*):\s*(.*)$/`, with last-wins on duplicate keys; its own
docblock states "nested/indented keys and list items are ignored". Consequences:
(a) every nested key, list item, and continuation line in frontmatter is
**unattested** — real specs in this corpus carry such blocks
(`json-issue-board-adapter.spec.md` has a `revision-history:` list with nested
`date:`/`change:` provenance) and can be rewritten post-review with an unchanged
`spec_sha`; (b) duplicate keys collapse, so two governance states alias onto one
digest; (c) Acceptance Criterion 3 ("a quoted multi-line value versus two separate
keys produce DIFFERENT `spec_sha`") is **unsatisfiable** with this parser — the
continuation line is silently dropped — so the implementer must either fail the AC or
invent a fourth parser. Divergent parsers already exist in-tree
(`lib/test-strategies/profiles.mjs` L57 supports arrays and uses a key regex without
`-`; `lib/meta-tools.mjs` L18; `lib/session-summary.mjs` L948), so an invented parser
reproduces exactly the CWE-436 interpretation conflict BEH-1b exists to close, one
layer down.

**Recommendation:** In BEH-1, (1) name `lib/frontmatter.mjs::parseFrontmatter` as the
sole parser and require the emitter and every enforcing caller to reach it through the
one shared helper; (2) change the frontmatter half of the region from parsed-field
serialization to **raw frontmatter source lines with only the four denylisted keys'
lines (and their indented continuations) removed**, preserving byte order — this
attests nested and multi-line content without reintroducing aliasing, because removal
is line-anchored rather than value-derived; (3) if the parsed-value form is kept, add
a fail-closed round-trip rule: any frontmatter line the parser does not capture, and
any duplicate key, causes `SPEC_SHA_UNCANONICAL` and the digest is omitted (BEH-5 path)
rather than silently attesting a partial view. Rewrite AC 3 to assert the chosen rule.
(CWE-345 / CWE-436; OWASP ASVS V1.2 canonicalization-before-verification.)

### SEC-2 — `warning` — authentication

**Finding:** The "Bounding the claim" paragraph limits the authenticity claim for BEH-7
(`started`/`completed`) only. It is never extended to `reviewer_report`, yet
`adev report --type reviewer --step review --verdict PASS` is a documented,
unauthenticated CLI path and BEH-1 computes `spec_sha` from the file **as it stands at
emit time**. An agent that rewrites a spec can therefore satisfy the strict gate with
one command carrying a digest that matches the rewritten bytes. BEH-4 detects
*unaccompanied drift*, not adversarial or shortcut-driven laundering.

**Recommendation:** Add one sentence to the Rationale stating that `spec_sha` is a
drift detector, not an attestation, and that `reviewer_report` remains unauthenticated
for the same reason `completed` is; add an AC forbidding downstream consumers from
treating a sha-matching gate pass as attested review. If stronger coupling is wanted
later, sequence reviewer reports behind an open `review` step the way BEH-7 sequences
terminals.

### SEC-3 — `warning` — authorization

**Finding:** BEH-9a fails open on an unreadable spec, and
`lib/cli/gate.mjs::resolveSpecOrExit` already exits 1 on ENOENT — so BEH-9a's only
reachable trigger is a spec that **exists but cannot be read** (EACCES, or a race).
Making the file unreadable therefore silently disables the control while the gate still
reports success, and nothing distinguishes a verified pass from a skipped one in the log
or exit code.

**Recommendation:** Split the cases: ENOENT/race keeps the BEH-6 advisory; EACCES on an
existing, contained spec blocks under `mode === "strict"` with
`reason: "GATE_SPEC_SHA_UNREADABLE"` (fail-secure, CWE-636). Independently, make the
verification outcome observable — carry `specShaVerified: false` on the gate result so
audits can separate "checked and matched" from "never checked".

### SEC-4 — `warning` — input-validation

**Finding:** BEH-3 defines projection only for a well-formed `spec_sha`. No rule covers
a value that is non-string, `null`, or not 64-lowercase-hex, and the log is append-only
with no write-time shape check specified. The two plausible readings diverge in security
direction: "treat as absent" is fail-open (BEH-5 skip), "treat as present" is
fail-closed. The sentinel `"divergent"` is also injectable by an emitter.

**Recommendation:** In BEH-1, reject at write time with `EVENT_SCHEMA_INVALID` unless
the value matches `/^[0-9a-f]{64}$/` (this also makes the sentinel uninjectable, since
it is not 64-hex). In BEH-3, state that any folded value failing that shape projects
`"divergent"`, so legacy or corrupted records fail closed rather than skipping. Add an
AC for a fixture log carrying `spec_sha: "divergent"` and `spec_sha: 42`.

### SEC-5 — `suggestion` — data-exposure

**Finding:** Denylisting the whole `source-manifest` key leaves the spec's declared
implementation-file set unattested; re-pointing `source-manifest.files` after review
changes what `/adev:validate` drift-checks and what `adev gate transitions` treats as
fresh, with an unchanged `spec_sha`. This is defensible — the file list legitimately
grows during implementation, after review — but the spec presents the denylist as purely
machine-written keys, which the `files` array is not.

**Recommendation:** Either narrow the denylist to the machine-written `sha`/`computed-at`
subkeys and attest nothing else under that key, or add one sentence to BEH-1b stating
that `files[]` is deliberately unattested because implementation legitimately mutates it
post-review, and naming `adev gate transitions` as the control that covers it.

---

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

The amendment's factual claims were verified against the codebase and sibling specs —
all checked out:

- `lib/cli/gate.mjs:144` (`requireGate(currentState(...), step, { mode })`) confirmed to
  omit `currentSpecSha` today, exactly as BEH-9's rationale claims.
- `lib/lifecycle-state.mjs:1888-1896` confirms `GateError`'s constructor destructures
  exactly `{ requiredStep, currentStatus, mode }` — matching BEH-4's "widens from the
  three-field form" claim precisely.
- `cli/index.mjs:2005` confirms `err.code === "GATE_BLOCKED"` is the actual exit-2
  discriminator, unchanged by this amendment as required.
- `lib/source-manifest.mjs:83` confirms `createHash("sha256").update(content).digest("hex")`
  is the actual existing primitive BEH-1 cites for shared encoding.
- `templates/risk-policies-template.yaml` confirms `require_hitl_approval`, `review_mode`,
  `test_depth` are real field names (BEH-1b's rationale is accurate, not invented).
- `graduated-rigor-tiers.spec.md:62` confirms the Rationale's claim that
  `review_mode: quick` replaced `require_review: false`, correctly bounding what this
  amendment does *not* re-litigate.
- `review-block-auto-retry.spec.md` Behavior 2 confirms
  `spec_revised{from_revision,to_revision,…}` is the real event shape BEH-3a's
  reconciliation window relies on.
- CON-1 naming (base spec) is respected throughout: new event field `spec_sha` is
  snake_case, new projection field `specSha` is camelCase — no violations.
- Error-code naming (`GATE_SPEC_SHA_MISMATCH`, `ORPHAN_STEP_TERMINAL`,
  `SPEC_SHA_UNAVAILABLE`, `SPEC_SHA_UNVERIFIABLE`) follows the base spec's
  SCREAMING_SNAKE_CASE convention.

### CON-1 — `suggestion` — terminology

- **This spec:** introduces `BEH-1a`, `BEH-1b`, `BEH-3a`, `BEH-9a` — letter-suffixed sub-IDs.
- **Conflicts with:** `spec-behavior-ids.spec.md` (BEH-1/BEH-2, lines 60/104-105) defines
  the canonical form as `BEH-<n>` where `<n>` is a positive integer, with no letter-suffix
  grammar.

**Recommendation:** No fix required — `spec-behavior-ids.spec.md`'s own Out of Scope
section explicitly excludes `--amend` artifacts (hardcoded renderer in
`lib/specify-amend.mjs`), so this amendment is not in that spec's contract. Flagged only
because the lettered-suffix scheme is self-invented and not documented anywhere as the
amendment convention; if amendments recur, worth a one-line convention note (e.g. in
`spec-amendment-artifacts.spec.md`) so future amendment authors do not diverge further.

---

> A **per-reviewer** verdict is never BLOCK. BLOCK is the *consolidated* verdict in the
> header above, computed from post-cap findings across all reviewers — PASS (zero
> warnings/blockers), PASS_WITH_NOTES (>=1 warning, zero blockers), BLOCK (>=
> `verdict_rules.blocker_threshold` blockers, default 1). All three reviewers carry
> `severity_cap: blocker`, so no finding was demoted.

---

## Heuristics — prior occurrences of this blocker

The following heuristics are lessons learned from past work in this module. Use them as
guidance, not as hard rules.

> Note: `adev heuristics retrieve --signature review-specs-<hash>` returned no
> signature-scoped entry for any of the four `blocker_id`s; the store degraded to the
> module-scoped set, reproduced once below rather than four times. None of these four
> blockers has a recorded prior occurrence.

### Heuristic: Use session JSONL for token measurement, not file-size estimates (confidence: medium)
- **Pattern:** When evaluating token consumption or cost of adev skills, parse real session JSONL files from ~/.claude/projects/ (message.usage fields: input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens). Dispatch paired A/B subagents and compare their JSONL data for controlled experiments.
- **Anti-pattern:** Estimate tokens using bytes/4 or hardcoded assumptions about thinking budgets and cache hit rates. These overstate savings by 2-2.5x vs real measurements.
- **Evidence:** 1 observations

---

## Summary

**Total findings:** 12 (4 blockers, 5 warnings, 3 suggestions)

**Blockers:**

| ID | Reviewer | blocker_id | Section |
|----|----------|-----------|---------|
| SA-1 | structural-architect | `structural-architect:gate-bypass:9bf7dc55` | `behaviors-3a` |
| SA-2 | structural-architect | `structural-architect:contradictory-projection-rule:0cb97b9d` | `behaviors-3` |
| SA-3 | structural-architect | `structural-architect:unsatisfiable-precondition:baac30d3` | `behaviors-1b` |
| SEC-1 | security-reviewer | `security-reviewer:input-validation:9de26d8a` | `behavioral-delta-beh-1b` |

**Revision-3 blockers, re-checked on their own merits:** the contradictory-contract
defect (BEH-1's duplicate digest definition) is gone — BEH-1 now carries a single
definition and says so. The unenforceable-invariant defect is *partially* addressed:
BEH-3a's window is now keyed on `spec_revised` rather than on an unstamped `revision`
field, which is enforceable, but BEH-3's `byRevision[N].specSha` clause and its dependent
AC were not updated to match, so the same unstamped-`revision` premise resurfaces there
(SA-2). The rev-3 frontmatter-canonicalization blocker was carried across as BEH-1b, and
`JSON.stringify` does close the value-aliasing channel — but the new text specifies a
*parsed*-value input without naming a parser that can produce it, which is what SA-3 and
SEC-1 independently land on.

**Action required:** Revise the spec to rev 5. Two of the four blockers (SA-3, SEC-1)
converge on BEH-1/BEH-1b and are fixed by one decision: either name
`lib/frontmatter.mjs::parseFrontmatter` as the sole parser and accept an explicitly
stated fidelity limit (with a fail-closed rule for anything it cannot represent), or
switch the frontmatter half to line-anchored raw-source removal of the four denylisted
keys. SA-2 is fixed by dropping or re-specifying `byRevision[N].specSha`. SA-1 needs a
new clause defining the empty reconciliation window.

**Auto-retry:** not suppressed. All four blockers carry valid `blocker_id` +
`section_anchor` and are present in
`lifecycle-event-log-rev-5-review-gate-integrity.blockers.md`, so
`/adev:specify --revise` can consume the sidecar without hand-carrying any finding.

**Governance footer:** `spec-to-plan` is not declared in
`.context-index/governance/gates.yaml:transitions` (the entry is commented out), so no
`approver_role` applies to this transition. `risk_level: high` sets
`require_hitl_approval: true` for downstream steps per `risk-policies.yaml`.
