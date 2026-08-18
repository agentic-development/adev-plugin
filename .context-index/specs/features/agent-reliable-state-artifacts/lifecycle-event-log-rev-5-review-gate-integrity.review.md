---
spec: .context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log-rev-5-review-gate-integrity.spec.md
charter: .context-index/specs/features/agent-reliable-state-artifacts/charter.md
date: 2026-08-17
verdict: BLOCK
rigor-tier: full
last-reviewed-revision: 3
file-sha: 70ea8f267930b1544d6046dd22409816ee9f5533a5e3f14ba5f0bfbd3297f36a
---

# Architecture Review: lifecycle-event-log-rev-5-review-gate-integrity

> **Date:** 2026-08-17
> **Spec:** `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log-rev-5-review-gate-integrity.spec.md`
> **Charter:** `.context-index/specs/features/agent-reliable-state-artifacts/charter.md`
> **Verdict:** BLOCK
> **Rigor tier:** full (`risk_level: high` → `review_mode: full`; no `--tier` override)

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

| Code | Detail |
|------|--------|
| LEGACY_REVIEWER_OUTPUT | `SEC-1` (security-reviewer, severity `blocker`) was emitted **without** `blocker_id` and **without** `section_anchor`. Per the aggregator contract it is **excluded from the `.blockers.md` sidecar** and carries no canonical identity. It still counts toward the consolidated verdict and is recorded in full below. Because a legacy-output marker is present, the calling build skill MUST fall through to the pre-loop sidecar + fail-loud path — **no `/adev:specify --revise` auto-retry dispatch.** SEC-1 must be carried into any revision by hand. |

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

### SA-1 — `blocker` — contradictory contract

- **blocker_id:** `structural-architect:contradictory-contract:72233b01`
- **section_anchor:** `behaviors-1`
- **Location:** Behavioral Delta → BEH-1; Acceptance Criteria (first AC, and the `risk_level` AC)

**Finding:** BEH-1 defines the digest input twice, incompatibly. First it defines a **canonical attested region**: "the spec's frontmatter with an explicit denylist … the surviving keys serialized `key: value` one per line sorted by key name … then the literal byte `\n`, then the body". Then, in the same bullet, it says "The digest input is the exact byte range following the second `---` line, taken from the `Buffer` returned by `readFile` with no decode step". The second sentence is the body-only definition that revision 3 was supposed to replace, and it is unsatisfiable alongside the first — a derived, sorted, key-filtered serialization cannot simultaneously be "the exact byte range following the second `---` line … with no decode step". The Acceptance Criteria inherit the split: the first AC gates on "current **body** bytes", while a later AC requires mutating `risk_level` (a frontmatter key) to change the digest. An implementer has no single contract to build against, and the two readings differ in exactly the security property (BEH-1's own CWE-345 argument) the amendment exists to add.

**Recommendation:** Delete or rewrite the `readFile`-buffer sentence so it describes only the *primitive* (`createHash("sha256")`, matching `lib/source-manifest.mjs:83`) and not the *input range*. State the canonical region once, and re-word the first AC from "body bytes" to "attested-region bytes".

### SA-2 — `blocker` — unenforceable invariant

- **blocker_id:** `structural-architect:unenforceable-invariant:8efa0bef`
- **section_anchor:** `behaviors-3a`
- **Location:** Behavioral Delta → BEH-3a; the two `"divergent"` Acceptance Criteria

**Finding:** BEH-3a's correctness rests entirely on `reviewer_report` events carrying `revision`, but nothing in this amendment or the base contract requires that, and no shipping emitter supplies it. The base spec makes it explicitly optional ("Emitters that do not know the spec's revision MAY omit the field"); `reportReviewer` in `lib/lifecycle-state.mjs` accepts `revision` only when passed; `lib/cli/report.mjs` exposes **no** `--revision` flag on `--type reviewer` (verified: zero occurrences of `revision` in that file); and `skills/review-specs/SKILL.md`'s reviewer-report emission — the sole emission site — omits it. With `effectiveRevision()` folding those events into `byRevision[1]`, "the latest revision of that step" resolves to the entire history, and BEH-3a degenerates into precisely the history-wide reconciliation it declares unacceptable: the first BLOCK→revise→re-review cycle latches `"divergent"` permanently, making the spec un-plannable under `gate_mode: strict`. The AC "a rev-1 review and a rev-2 review whose reports carry different digests do NOT project `divergent`" cannot pass as written.

**Recommendation:** Make `revision` a *paired* mandatory field: any `reviewer_report` carrying `spec_sha` MUST also carry `revision`, with the emitter surface (`adev report --type reviewer`) widened to accept it. Alternatively, specify a reconciliation key derivable from data the emitter already has.

### SA-3 — `warning`

- **Location:** BEH-1, BEH-9, the shared-helper Acceptance Criterion

**Finding:** Three places mandate that the emitter and the gate caller use "one shared exported helper", and an AC asserts that identity by test, but the helper is never given a name, signature, or home module. The spec's central anti-divergence guarantee names no contract.

**Recommendation:** Name the exported symbol and its module in BEH-1, with its parameter and return shape.

### SA-4 — `warning`

- **Location:** BEH-1 / BEH-1a

**Finding:** A whole-file spec digest already exists: `skills/review-specs/SKILL.md` Step 6c computes `createHash('sha256')` over the spec `Buffer` and writes it as `file-sha` in `.review.md`, explicitly ordered *after* the Step 7 status write for the same staleness reason BEH-1's denylist addresses. The amendment introduces a second digest over the same artifact with a different scope, a different storage location, and a different capture point, and never mentions the first. Two competing content identities for one spec is an ownership ambiguity that will drift.

**Recommendation:** State the relationship explicitly — whether `file-sha` is superseded, retained as a distinct drift signal, or should be re-derived from the shared helper.

### SA-5 — `warning`

- **Location:** BEH-1 (canonical serialization rule)

**Finding:** "the surviving keys serialized `key: value` one per line sorted by key name" is undefined for non-scalar frontmatter values, and such keys exist in this very charter: `json-issue-board-adapter.spec.md` carries a `revision-history:` array-of-maps, which is not denylisted. It is also unstated whether `value` is the raw post-colon source text or a re-serialization of the parsed value — these differ for quoted, folded, or commented values.

**Recommendation:** Define the serialization for non-scalar values (or denylist/flatten them) and fix whether the input is raw source text or parsed-and-re-emitted.

### SA-6 — `warning`

- **Location:** BEH-9, BEH-5

**Finding:** BEH-9 mandates that *every* `adev gate require` invocation compute and pass `currentSpecSha`, but BEH-3 projects `specSha` only from `reviewer_report` events. Only a `review` predecessor can therefore ever carry one; `adev gate require --skill review` (prior step `specify`), and every gate whose predecessor is `plan`/`implement`, will take the BEH-5 `SPEC_SHA_UNVERIFIABLE` path unconditionally and forever. The enforcement surface is far narrower than BEH-9's blanket phrasing implies.

**Recommendation:** Scope BEH-9 to gates whose predecessor step can carry a `specSha`, or state the permanent-advisory outcome for the others so it is not read as a defect later.

### SA-7 — `suggestion`

- **Location:** BEH-7 / Amendment Rationale ("Bounding the claim")

**Finding:** BEH-7's orphan check lives on the `adev report --type step` CLI surface, so `reportStep`/`appendEvent` library callers bypass it entirely. The Rationale bounds the claim only against the `--status started` two-call path and does not mention the library bypass.

**Recommendation:** Add the library-caller bypass to the bounding paragraph.

---

## Security Reviewer (security-reviewer)

**Verdict:** FAIL

The reviewer confirmed, against the text on disk, that revision 2's four blockers read as closed: BEH-1's denylist now retains `risk_level` / `charter` / `amends` / `target-revision` in the digest; BEH-3a scopes reconciliation to the latest revision; BEH-4 keeps `code: "GATE_BLOCKED"` with the new `reason` discriminator, matching `cli/index.mjs`'s exit-2 dispatch on `err.code`. `lib/cli/gate.mjs:144` and `lib/source-manifest.mjs:83` were read and match the spec's factual claims. The finding below is **new to revision 3** — it is a defect in the canonicalization scheme revision 3 introduced.

### SEC-1 — `blocker` — input-validation

> **Advisory:** emitted without `blocker_id` / `section_anchor` → `LEGACY_REVIEWER_OUTPUT`. Excluded from the `.blockers.md` sidecar; must be carried into any revision by hand. Implicated section is BEH-1 (`behaviors-1`).

**Finding:** BEH-1 defines the attested-frontmatter digest as "the surviving keys serialized `key: value` one per line sorted by key name" — a text-concatenation scheme, not a digest over a re-parsed and re-canonicalized structure. This codebase has no YAML library (`lib/source-manifest.mjs`'s `extractManifestFromFrontmatter` parses frontmatter by regex line-splitting, consistent with the constitution's zero-dependency rule), so an implementer following this prose will split on top-level `key:` lines and concatenate raw values. Any frontmatter value containing an embedded newline plus a line that *looks* like `otherkey: x` — a YAML block scalar, or a quoted multi-line string — can serialize identically to two separate keys. Two semantically different frontmatter states therefore hash identically (CWE-436 interpretation conflict, feeding directly into the CWE-345 tamper-evidence goal this amendment exists to deliver). The spec's own "Bounding the claim" paragraph does not name or scope out this ambiguity, so it does not qualify for the already-bounded carve-out.

**Failure scenario:** An author adds a frontmatter field with a block-scalar value (e.g. a free-text `notes: |`) whose content contains a line shaped like `risk_level: low`. The naive per-line serializer includes that literal line in the canonical string, and the reviewer stamps `spec_sha` over it. Post-review the author restructures the same visible content into an actual top-level `risk_level: low` key, deleting the block-scalar wrapper. Governance now reads `risk_level: low` (`require_hitl_approval: false`, `test_depth: minimal` per `risk-policies.yaml`) while the canonical serialization is byte-unchanged, so `spec_sha` does not change and the strict gate passes on a spec whose real governance posture silently downgraded. This is the same class of hole revision 3 was authored to close, one level down.

**Recommendation:** Specify the digest input over the **parsed** frontmatter object, not raw per-line text: for each surviving key (after the denylist), serialize as `key + ": " + JSON.stringify(value)` — JSON escaping closes the embedded-newline/colon/quote smuggling channel — sort by key, join with `\n`. Because this project avoids YAML libraries, the parser used to extract per-key values must itself be specified precisely enough to be deterministic (line-continuation rules for block scalars and lists). Add an AC exercising a multi-line / non-scalar frontmatter key (e.g. `revision-history`) to prove the scheme does not collide.

### SEC-2 — `suggestion` — data-exposure

**Finding:** BEH-9a / BEH-6 fail open (skip the sha comparison) whenever the spec cannot be read, per the base spec's never-block-on-missing-provenance doctrine — explicitly named and justified in the spec text, so this is hardening only. An actor able to transiently make the spec file unreadable at exactly `adev gate require` time forces the no-digest path even when a prior reviewed digest exists.

**Recommendation:** When falling back under BEH-9a for a step that *does* carry a projected `specSha` — provenance existed but became unreadable at gate time, as opposed to genuinely never-stamped history — use a distinct warning code (e.g. `SPEC_SHA_READ_RACE`) rather than reusing `SPEC_SHA_UNVERIFIABLE`, so operators can distinguish "no history to check" from "history existed, read raced".

### SEC-3 — `suggestion` — input-validation

**Finding:** The BEH-1 denylist is a fixed 4-key hardcoded list. It is fail-secure by construction (unknown and future keys default to *attested*, not excluded), so it is not a bypass today, but any future lifecycle-machine-written key not added to the denylist causes false gate blocks rather than false passes — a robustness gap, not a security one.

**Recommendation:** No change required for security. Consider a test asserting that the denylist and the set of keys the lifecycle machine actually rewrites (the `status` / `updated` / `drift_detected` / `source-manifest` write sites) stay in sync.

---

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS

No findings. The spec was checked against the base spec, sibling specs, and the cross-cutting corpus and found consistent on every axis:

- **Naming:** event field `spec_sha` is `snake_case`, projection field `specSha` is camelCase — correct per the base spec's Naming Conventions / CON-1. New error codes (`GATE_SPEC_SHA_MISMATCH`, `SPEC_SHA_UNVERIFIABLE`, `SPEC_SHA_UNAVAILABLE`, `ORPHAN_STEP_TERMINAL`) match the existing shouty-snake-case taxonomy.
- **Contract:** `GateError` widens from the 3-field to the 5-field form additively; `code` stays `"GATE_BLOCKED"`, preserving `cli/index.mjs`'s exit-2 mapping. Implementation claims verified — `lib/source-manifest.mjs:83` uses `createHash("sha256")`; `cli/index.mjs` tests `err.code === "GATE_BLOCKED"`.
- **Pattern:** follows the established optional-field-plus-fail-soft-fold pattern; no new `CANONICAL_EVENTS` variant.
- **Cross-cutting:** BEH-3a's revision scoping is correctly justified against `review-block-auto-retry.spec.md`'s retry loop; `lifecycle-gate.spec.md` is unaffected (the predicate is extended, not the mechanism); `graduated-rigor-tiers.spec.md`'s "quick never skips" invariant is not weakened.
- **Backward compatibility:** BEH-5 / BEH-6 keep missing-provenance paths non-blocking; legacy events without `revision:` fold as revision 1.

> Note: the Structural Architect reached the opposite conclusion on the *enforceability* of the revision scoping (SA-2) after reading `lib/cli/report.mjs` and confirming no `--revision` flag exists on `--type reviewer`. The consistency reviewer assessed the contract as written; SA-2 assesses whether any emitter can satisfy it. SA-2 stands.

---

> A **per-reviewer** verdict is never BLOCK. BLOCK is the *consolidated* verdict in the
> header above, computed from post-cap findings across all reviewers — PASS (zero
> warnings/blockers), PASS_WITH_NOTES (>=1 warning, zero blockers), BLOCK (>=
> `verdict_rules.blocker_threshold` blockers, default 1). All three reviewers carry
> `severity_cap: blocker`, so no finding was demoted.

---

## Summary

**Total findings:** 10 (3 blockers, 4 warnings, 3 suggestions)

**Blockers:**

| ID | Reviewer | blocker_id | Section |
|----|----------|-----------|---------|
| SA-1 | structural-architect | `structural-architect:contradictory-contract:72233b01` | `behaviors-1` |
| SA-2 | structural-architect | `structural-architect:unenforceable-invariant:8efa0bef` | `behaviors-3a` |
| SEC-1 | security-reviewer | *(none — `LEGACY_REVIEWER_OUTPUT`)* | BEH-1 |

**Action required:** Revise the spec to rev 4. Two of the three blockers converge on BEH-1: SA-1 says the digest input is defined twice incompatibly, and SEC-1 says the frontmatter half of that definition is not canonical enough to be tamper-evident. Fixing BEH-1 once, by stating a single parsed-and-JSON-escaped canonical serialization, addresses both. SA-2 is independent and requires either widening `adev report --type reviewer` with `--revision` (and making it mandatory alongside `spec_sha`), or choosing a reconciliation key the emitter can already supply.

**Auto-retry:** suppressed. The `LEGACY_REVIEWER_OUTPUT` advisory on SEC-1 means the calling build skill must take the pre-loop sidecar + fail-loud path. SEC-1 is **not** in the `.blockers.md` sidecar and must be carried into the revision from this report by hand.

**Governance footer:** `spec-to-plan` is not declared in `.context-index/governance/gates.yaml:transitions` (the entry is commented out), so no `approver_role` applies to this transition. `risk_level: high` sets `require_hitl_approval: true` for downstream steps per `risk-policies.yaml`.
