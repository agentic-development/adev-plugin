---
spec: .context-index/specs/features/heuristics/failure-capture.spec.md
charter: .context-index/specs/features/heuristics/charter.md
date: 2026-08-15
verdict: PASS_WITH_NOTES
rigor-tier: full
last-reviewed-revision: 3
file-sha: b9c72a8f1529659691f4de1c9ad8d047499c8b13307018a562356d3e6d1ed823
---

# Architecture Review: failure-capture

> **Date:** 2026-08-15
> **Spec:** .context-index/specs/features/heuristics/failure-capture.spec.md
> **Charter:** .context-index/specs/features/heuristics/charter.md
> **Rigor tier:** full (explicit `--tier full`; `risk_level: high` → `review_mode: full` would resolve identically)
> **Spec revision at review:** 3
> **Verdict:** PASS_WITH_NOTES

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

Domain resolution: `software` (source level: default). Registry warnings: none.
Module heuristics injected: 3 (`heuristics` module, tier `summary`).

## Loop Context

This is the third review of this spec in a BLOCK→revise loop.

| Revision | Verdict | Blockers |
|---|---|---|
| 1 | BLOCK | 7 |
| 2 | BLOCK | 4 |
| 3 | **PASS_WITH_NOTES** | **0** |

All four revision-2 blockers were independently re-verified as resolved against live source, not merely reworded:

| Prior blocker_id | Resolution verified |
|---|---|
| `security-reviewer:data-exposure:763ecb0b` | Design change, not wording. Behavior 1a now reads `checks[].id` and `checks[].outcome` only — the two fields the hook's documented input contract names (`hooks/post-validate-extract-heuristics.mjs:15`). No prose field is read anywhere, so there is no free text to leak and no redaction premise to assume. The Preconditions bullet says the spec "declines to read prose". |
| `structural-architect:false-codebase-claim:c4d27eaa` | Behavior 3's three-copy fate table is accurate at all three sites. The harness claim is load-bearing and true: `tests/skills/validate-success-heuristic.test.mjs` and `tests/skills/validate-extraction.test.mjs` both import `runCheck12` from `tests/skills/validate-success-heuristic-harness.mjs` and never invoke the hook. |
| `structural-architect:contradictory-degradation:b6dae273` | Fail-closed restatement is correct — without the verb, recover has neither a signature nor an id, so extraction is skipped entirely. |
| `consistency-analyzer:contract:72de9bcd` | Verified: `inline-node-extraction-sweep.spec.md` has no `source-manifest` frontmatter, no Source Manifest section, and no `.validate.md` sibling. Path prefix corrected to `features/`. |

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES

- **SA-1** (warning) — *Behavioral Contract.* Two line pointers are off by one. `hooks/post-validate-extract-heuristics.mjs:72` is the preceding comment; the `if (verdict.overall !== 'PASS') return;` guard is at `:73`. Behavior 4a cites `autoPromote` at `lib/heuristics.mjs:894`; the declaration is at `:893`. Every other pointer checked is exact — hook `:127`, `:136-138`, `lib/heuristics.mjs:952`, `lib/cli/heuristics.mjs:155`, `:519-523`, harness `:112`, `skills/recover/SKILL.md:387-397`, `docs/cli-reference.md:525`.
  *Recommendation:* shift the two pointers by one. The quoted code identifies both sites unambiguously, so this is cosmetic drift, not a false claim.

- **SA-2** (warning) — *Error Cases, `adev heuristics signature` unavailable row.* The spec never says whether the hook obtains the signature by spawning the CLI verb or by importing `deriveSignature` from `lib/heuristics.mjs`. Behavior 1 says "via the shared primitive" (route-neutral) while the error row names the verb. Under the import route the row is unreachable — the hook already returns early at `hooks/post-validate-extract-heuristics.mjs:106-113` when `lib/heuristics.mjs` fails to import, so `writeHeuristic` is gone too and nothing is written at all. The hook imports the lib directly today (`:107`), and the constitution's "skills name a CLI verb" anti-pattern binds SKILL.md, not hooks.
  *Recommendation:* name the route in Behavior 1 (hook imports from lib; only `skills/recover/SKILL.md` must shell out), and reword the error row as "signature derivation throws → entry written without a `signature`".

- **SA-3** (warning) — *Postconditions, "No shipped code contains a second copy of the derivation rules."* This depends on removing `export function deriveId(...)` at `lib/cli/heuristics.mjs:128` — the last live absolute-path copy of the id rule — but no Behavior or Task Map row names it. `lib/heuristics.mjs:112-114` explicitly assigns that removal to this spec. Its only caller is `lib/cli/heuristics.mjs:394` inside the `extract` verb, so "Delete the `extract` verb" covers it in practice, but `deriveId` is an `export` and an implementer removing only the subcommand dispatch could leave a dead public export standing.
  *Recommendation:* name `lib/cli/heuristics.mjs::deriveId` in Behavior 7 and the "Remove the dead path" row; add an acceptance criterion that `lib/cli/heuristics.mjs` exports no id-derivation function.

- **SA-4** (warning) — *Behavior 5a, `--digest-only`.* The one genuinely new API in this spec is under-specified. `runSignature` validates `--origin` against the closed enum before mode selection (`lib/cli/heuristics.mjs:594-600`), so digest-only mode inherits a mandatory `--origin` with no effect on output. The spec does not say whether `--origin` stays required, which value `/adev:recover` passes, or whether `--origin review-specs --digest-only` is a distinct error from the `--blocker-id` conflict.
  *Recommendation:* state the full flag contract — `--origin` requiredness and recover's value, `--text` still required and still subject to the post-normalization non-empty check, and the error code for `--digest-only` with `--origin review-specs`.

- **SA-5** (warning) — *Behavior 1.* The spec adds a fifth writer of `evidence[].source` (the FAIL path) without stating its value, so it widens existing enum drift by default. The charter's `EvidenceRef` enum (`charter.md:99`) lists `recovery|validation|debug|retro|manual`; the live store holds four spellings (`learn`, `recover`, `validate`, `validation`) and `lib/heuristics.mjs` enforces no enum.
  *Recommendation:* pin the FAIL path's `evidence[].source` to `validation`, matching `hooks/post-validate-extract-heuristics.mjs:148`, so this spec does not add a sixth spelling. (The charter and sibling-spec corrections belong to their owning revisions — see Known Out-of-Scope Defects below.)

- **SA-6** (suggestion) — *Error Cases.* The table omits the Behavior 1a terminal condition ("no non-PASS `checks[]` entry present → write nothing, exit 0"), which does appear as an acceptance criterion. Add the row for symmetry.

- **SA-7** (suggestion) — *Task Map, "Retire the dead path's tests".* Two imprecisions in an otherwise well-verified row: (1) `inline-node-extraction-sweep.spec.md:77` names only "paired test", not the filename, which appears at `:89` only; (2) that spec is `status: implemented` and its line-89 criterion asserts `adev heuristics extract` *works* — a criterion this spec permanently falsifies, so "note the coupling in prose" leaves a shipped spec carrying an unpassable criterion. Verified exactly: 27 matching lines in `tests/cli/heuristics.test.mjs`, no `source-manifest` frontmatter, no Source Manifest section, no `.validate.md` sibling.
  *Recommendation:* cite line 89 as the by-name reference and mark that criterion superseded-by `failure-capture.spec.md`.

**Independent verification (not findings).** Behavior 4a's unreachability argument is sound against `autoPromote`'s distinct-path set and `mergeEvidence`'s `(path,date)` dedup. Behavior 6's byte-identity claim holds: recover's id digest and the signature digest both run `normalizeFailureText` over the same root cause, so `--digest-only` returns exactly the digest recover needs. The `extract` verb is confirmed reachable from no skill and no hook.

## Security Reviewer (security-reviewer)

**Verdict:** PASS

No findings.

**Basis.** Confirmed against `hooks/post-validate-extract-heuristics.mjs` and `configurable-checks.spec.md` Behavior 25a that the redaction pipeline covers only `kind: quality-gate` subprocess bytes — exactly the gap the prior blocker exploited via `checks[].detail` on `subagent-review` checks, which carry LLM-quoted `file:line` evidence. Revision 3's Behavior 1a removes `detail` from the read set entirely, naming only `id` and `outcome`. This structurally forecloses the leak vector rather than depending on an unverifiable redaction premise.

Noted as calibration-consistent, not re-raised: `checks[].id` values are not a fully platform-fixed enum (`configurable-checks.spec.md` Behavior 3 lets projects register custom check ids via `governance/validate.yaml`), but they are config-time author-chosen identifiers rather than runtime-derived free text — a materially different trust class from LLM-authored `detail` content.

New-in-scope Behavior 5a (`--digest-only`) changes output formatting only, on an already-shipped and already-hardened derivation path (`sanitizeForEcho`, control-char stripping, typed error codes). No new exposure surface. Auth/authz/rate-limiting remain N/A — local dev-tool CLI plus a non-blocking hook, no network surface.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

- **CON-1** (warning) — *Task Map, "Retire the dead path's tests".* The row claims `tests/cli/heuristics.test.mjs` is referenced by `inline-node-extraction-sweep.spec.md` "in its Task Map (line 77) and Acceptance Criteria (line 89) only". Verified: line 89 names the file literally; line 77 does not — it names `lib/cli/heuristics.mjs` and says only "paired test". The conclusion drawn (no source manifest, nothing to update) is still correct, so the actionable outcome is unchanged.
  *Recommendation:* reword to cite line 89 as the by-name reference, or drop the line-77 half of the claim.

- **CON-2** (warning) — *Behavioral Contract, first paragraph.* "returns early at line 72" — line 72 is the preceding comment; the guard is at line 73. Off-by-one; the condition text is quoted and unambiguous. (Duplicates SA-1's first half.)
  *Recommendation:* update to line 73, or drop the line number and rely on the quoted condition.

**Independent verification.** Every substantive contract claim was checked against live source: `id` vs `signature` semantics, write-path reconciliation, `autoPromote` unreachability, `--digest-only` being genuinely new, the retired check id, the 27 test references, and the dangling-reference citations. Cross-checked against `failure-signature-key.spec.md` and `signature-retrieval.spec.md` — no contradictions.

## Known Out-of-Scope Defects (reported, not blocking)

These were confirmed present and are owned by other artifacts' revisions, not by this spec:

- `charter.md:182` Exposed API row for `adev heuristics signature` omits `--blocker-id` (and now `--digest-only`); `charter.md:97`'s `FailureSignature.digest` describes only derived mode, while inherited mode reuses a `blocker_id` location hash and hashes nothing.
- `charter.md:99`'s `EvidenceRef.source` enum (`recovery|validation|debug|retro|manual`) does not match the live store's four spellings (`learn`, `recover`, `validate`, `validation`); `lib/heuristics.mjs` enforces no enum. SA-5 asks only that this spec not widen the drift.
- `failure-signature-key.spec.md` lags its implementation in several documented places.

---

## Summary

**Total findings:** 9 (0 blockers, 7 warnings, 2 suggestions)

**Action required:** None blocking. The spec is implementable and internally consistent; all codebase claims were verified true against live source, with two cosmetic off-by-one line pointers. The verdict is PASS_WITH_NOTES and the spec proceeds to planning.

Two warnings are worth folding into planning rather than a further spec revision, since both are decisions a planner must make anyway:

- **SA-2** — decide the hook's signature-derivation route (lib import vs CLI spawn) and align the corresponding Error Cases row.
- **SA-4** — pin the full `--digest-only` flag contract, including `--origin` requiredness and the `review-specs` interaction.

**SA-3** (name `lib/cli/heuristics.mjs::deriveId` explicitly) and **SA-5** (pin `evidence[].source` to `validation`) are one-line additions that would strengthen the postcondition and prevent new enum drift.

**Governance:** no `.context-index/governance/gates.yaml` `spec-to-plan` approver role applies. Next step: `/adev:plan --spec .context-index/specs/features/heuristics/failure-capture.spec.md`.
