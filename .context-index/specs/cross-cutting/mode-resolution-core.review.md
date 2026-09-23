---
last-reviewed-revision: 3
file-sha: 2c9159215e93374187eb5d50a1b5185b449582ccc34377660243c4ebee3e8b72
---

# Architecture Review: mode-resolution-core

> **Date:** 2026-09-10
> **Spec:** .context-index/specs/cross-cutting/mode-resolution-core.spec.md
> **Charter:** .context-index/specs/cross-cutting/implementation-mode/charter.md
> **Verdict:** PASS_WITH_NOTES
> **Rigor tier:** full (resolved from `risk_level: medium` → `policies.medium.review_mode: full`)

## Registry Warnings

`adev governance reviewers --json` reported the following warnings (unrelated to the dispatched reviewer set for this spec — they concern the `browser-review` profile, not any of the four reviewers below):

- `BROADEN_TOOL`: Profile 'browser-review': allow_add broadens posture by adding mcp_server 'playwright'.
- `BROADEN_TOOL`: Profile 'browser-review': allow_add broadens posture by adding category 'web-fetch'.
- `BROADEN_NETWORK`: Profile 'browser-review': network broadened 'deny' → 'read-only'.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |
| referent-integrity | Referent Integrity Reviewer | subagent | reviewer-reasoning | plugin:review-specs/referent-integrity-prompt.md |
| wiring-reviewer | Wiring Reviewer | subagent | reviewer-capable | plugin:review-specs/wiring-reviewer-prompt.md |
| boundary-reviewer | Boundary Reviewer | subagent | reviewer-capable | plugin:review-specs/boundary-reviewer-prompt.md |

`termination-reviewer` was not dispatched — triggered-mode, zero keyword matches (loop/retry/poll/polling/iterate/iteration/recurring/convergence/auto-retry) against the target spec text.

## Disabled Reviewers

| ID | Reason |
|----|--------|
| structural-architect | Disabled as part of the reviewer-domain-fit initiative. OWASP/structural scope was retargeted to referent-integrity/wiring-reviewer/consistency-analyzer/boundary-reviewer for the default (Node CLI/plugin) project shape. Prompt retained on disk; still resolvable for any project whose materialized review.yaml already names it. |
| security-reviewer | Disabled as part of the reviewer-domain-fit initiative. OWASP-scoped review relocated to the web-service domain extension (opt-in via adev extension install web-service) where it fits the artifact class. Prompt retained on disk. |

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

Note: revision 2's blockers CON-1 (and referent-integrity's RI-1, same underlying defect) are resolved in revision 3. The precision fix confirmed against live source: `lib/manifest.mjs:56` — `loadManifest()` is exported and its `parseYaml(raw)` call has no surrounding try/catch (uncoded `YamlParseError`); `lib/gates/gate-sets.mjs:175` — `readManifest()` is module-private (not exported) and does throw `{code: "MANIFEST_PARSE_ERROR"}`. Revision 3's Task Map ("Write resolver" row) and Error Cases table now agree: the new resolver itself catches `loadManifest()`'s uncoded error and re-throws it coded as `MANIFEST_PARSE_ERROR`, rather than depending on (or misattributing the code to) `readManifest()`. Revision 2's CON-3 naming suggestion (snake_case output fields) is also resolved as a non-issue: `lib/risk-tiers/resolve.mjs` — the pattern this spec explicitly claims to follow — itself returns snake_case fields (`{resolved_tier, source}`), so the spec's casing matches its cited precedent.

**CON-1** — Severity: warning (carried forward from revision-2 review's CON-2, unresolved)
Category: terminology
This Spec: The warning that fires when a user selects `agent-default` is named "sensitive-path-floor warning" in the Task Map ("Update `/adev:init`" row) and the Module Impact Map (`setup` row), but "sensitive-path-floor-bypass warning" in the normative BEH-6 clause and one Acceptance Criteria bullet.
Conflicts With: The spec's own BEH-6 (Behaviors section), which is the authoritative definition of the warning being asserted — a different name is used in the descriptive sections restating that same behavior.
Recommendation: Standardize on "sensitive-path-floor-bypass warning" (matching BEH-6, the normative clause) everywhere it's referenced: the Task Map row, Module Impact Map cell, and both Acceptance Criteria bullets.
finding_type: terminology
section_anchor: behaviors-6

**CON-2** — Severity: suggestion
Category: pattern
This Spec: The Task Map's "Update `/adev:init`" row states the new prompt "writes `implementation_mode` to `manifest.yaml` directly," without specifying whether this uses a comment/format-preserving splice or a full reserialization.
Conflicts With: `lib/cli/init-prompt-session-capture.mjs`'s `writeSessionCaptureBlock()` (lines ~125–201) establishes the existing pattern for writing a new key into `manifest.yaml` from `/adev:init`: a line-level splice that preserves existing comments/formatting rather than a full-file rewrite. The repo also has no general-purpose YAML serializer (only the minimal `parseYaml` reader in `lib/profiles/yaml.mjs`), making a naive full reserialization non-trivial without violating Constitution Principle 1 (minimize external dependencies).
Recommendation: State explicitly that the `implementation_mode` write reuses (or is equivalent to) the existing splice-preserving pattern. (Overlaps boundary-reviewer's BD-2 below, raised there under a filesystem-safety lens.)

## Referent Integrity Reviewer (referent-integrity)

**Verdict:** PASS

No findings. Every concrete referent this spec names either (a) exists exactly as described, or (b) is explicitly framed as new work this spec proposes to create (and is correctly confirmed absent today, consistent with that framing).

**Verified (existing referents), for the record:**
- `loadManifest()` — exported, `lib/manifest.mjs:40`.
- `lib/manifest.mjs:56` — `const parsed = parseYaml(raw) ?? {};`, no surrounding try/catch, matching the spec's exact citation.
- `parseYaml` / `YamlParseError` — `lib/profiles/yaml.mjs:17-30`; `YamlParseError` sets only `.name`/`.line`, no `.code` property — confirms the uncoded-error claim.
- `readManifest()` in `lib/gates/gate-sets.mjs` — non-exported (`:175`, no `export` keyword), throws `MANIFEST_PARSE_ERROR` at line 182. Matches the spec's claim that this string is reused "for consistency" only and the function itself is not called, imported, or depended on by the new resolver.
- `VERB_REGISTRY` — `cli/index.mjs:2009` (exported again at `:2198`).
- `templates/manifest-template.yaml` — "Test Policy" block at line 129, matching "near the existing Test Policy block."
- `lib/risk-tiers/` — exists with `constants.mjs` and `resolve.mjs`, matching the cited precedent for `lib/implementation-modes/`.
- Parent Charter — `revision: 2`, matching the spec's `charter-revision: 2`.
- `tracker-ref: adev-plugin-8u2a` — exists, `.beads/issues.jsonl:158`.
- `BD-1` (Module Impact Map's deferred-work reference) — resolves to a real finding in this review's own history (`mode-resolution-core.review.md`), with matching content.
- Constitution Principle 1 / Principle 2 citations — match verbatim.
- "future dispatch-behavior spec (`implementation`, `write-test`)" — confirmed genuinely unfiled.

**Correctly-framed prospective referents** (confirmed absent today, presented as new work, not defects): `lib/implementation-modes/` (and `constants.mjs`/`resolve.mjs`), the `adev implementation-mode resolve` CLI verb, the `implementation_mode` manifest key, `UNKNOWN_IMPLEMENTATION_MODE`, and the `{dispatch_red, ordering_enforced, coverage_check}` output contract.

Revision-2's referent-integrity blocker RI-1 (Task Map committed to `loadManifest()` while Error Cases attributed `MANIFEST_PARSE_ERROR` to private `readManifest()`) is resolved in revision 3: the Task Map and Error Cases table now consistently state the new resolver itself catches `loadManifest()`'s error and re-codes it, citing `readManifest()` only as prior art for the same string. No new referent-integrity gap replaces it.

## Wiring Reviewer (wiring-reviewer)

**Verdict:** PASS_WITH_NOTES

Producers checked: `lib/implementation-modes/constants.mjs`, `lib/implementation-modes/resolve.mjs` (output contract + `UNKNOWN_IMPLEMENTATION_MODE`/`MANIFEST_PARSE_ERROR`), `implementation-mode resolve` CLI verb, `/adev:init`'s new `implementation_mode` manifest write, BEH-5/BEH-6 prompt behavior, `templates/manifest-template.yaml` doc update. Verified against repo: `lib/risk-tiers/{constants,resolve}.mjs` precedent exists; `VERB_REGISTRY` in `cli/index.mjs:2009` matches the described single-token-verb pattern; `lib/manifest.mjs:56` confirms `loadManifest()` has no try/catch around `parseYaml()` (uncoded `YamlParseError`), and `lib/gates/gate-sets.mjs:175`'s `readManifest` is indeed private/unimported — the revision-3 fix to the Error Cases row is accurate.

**WR-1** — Severity: warning (carried forward, unresolved since revision-2 review)
Producer: `resolve.mjs`'s output contract `{dispatch_red, ordering_enforced, coverage_check}` (BEH-4).
Location: BEH-4, Integration Point 3
Consumer: named only categorically — "future dispatch-behavior spec (`implementation`, `write-test`)," which the spec itself says is "not yet filed" with the call mechanism "not yet decided." No concrete function/skill/call site consumes this today; only the CLI verb + acceptance-criteria tests exercise it in this spec's own scope.
Finding: self-acknowledged deferred wiring, unchanged from revision-2 text — stays a warning, not a blocker, since the charter names the future consumer modules concretely.
Recommendation: once the dispatch-behavior spec is filed, update Integration Point 3 with its name and chosen call mechanism.
finding_type: unwired-producer
section_anchor: integration-points

**WR-2** — Severity: warning (carried forward, unresolved since revision-2 review)
Producer: `lib/implementation-modes/constants.mjs` (mode config objects).
Location: Task Map ("Define mode constants"), Task Map ("Update /adev:init")
Consumer: `resolve.mjs` is named and tested. The parent charter also names `/adev:init`'s prompt menu as a second consumer, but the Task Map's `/adev:init` row never states the prompt sources its option list/ordering from `constants.mjs` rather than a separately authored literal list.
Finding: unchanged from revision-2; text still does not tie the prompt's option source to `constants.mjs`.
Recommendation: state explicitly that `/adev:init`'s menu is generated from `constants.mjs`.
finding_type: unwired-producer
section_anchor: actionable-task-map

**WR-3** — Severity: warning (new)
Producer: `templates/manifest-template.yaml` documentation of `implementation_mode` (Task Map row "Update `templates/manifest-template.yaml`").
Location: Task Map, Acceptance Criteria
Consumer: confirmed real — `cli/index.mjs:342` copies this template to `manifest.yaml` during install/init scaffold.
Finding: no acceptance criterion or test asserts the template documents the new key, despite an established precedent for exactly this kind of check (`tests/lib/lifecycle-state-event-diagnostics.test.mjs:129`).
Recommendation: add an acceptance criterion/test asserting the template documents the new key, mirroring the existing precedent test.
finding_type: missing-test-coverage
section_anchor: acceptance-criteria

No blocker-severity findings — every producer has an identifiable consumer either within this spec's own scope or in the charter's explicitly-referenced (if unfiled) future work.

## Boundary Reviewer (boundary-reviewer)

**Verdict:** PASS_WITH_NOTES

No new crossing found for path containment, subprocess interpolation, or artifact leakage — the spec touches only the fixed `manifest.yaml` path via the existing `loadManifest()`, introduces no subprocess, and resolves `implementation_mode` against a closed 3-value enum (refuse-don't-escape posture, `UNKNOWN_IMPLEMENTATION_MODE` on any other value) rather than coercing or sanitizing untrusted input. Zero blocker-severity findings.

**BD-1** — Severity: suggestion (carried forward, self-acknowledged in spec text)
Checklist item: 4 (Privilege posture)
Location: Behaviors (BEH-6), Module Impact Map (`setup` row)
Finding: `agent-default` bypasses the sensitive-path test-depth floor (parent charter's "Guardrail integrity" attribute) — an elevated-capability trade-off. The bypass warning fires only once, at the interactive `/adev:init` prompt; `resolve.mjs`/the CLI verb accept a stored `agent-default` value with no re-assertion, so a hand-edited manifest or non-interactive scaffold reaches the bypass silently thereafter. Architecturally the inverse of `lib/extensions/exec-consent.mjs`'s contract, where consent is re-collected per-install and never persisted precisely so a cached grant can't silently cover future exposure.
Recommendation: Unchanged from prior review — this is explicitly self-acknowledged in the spec text (Module Impact Map's deferred-work sentence, citing this same finding as BD-1) and deferred to a named, not-yet-filed `using-adev`-owning sibling spec per the charter's own scope split. Confirm that sibling spec surfaces the bypass at every discovery point before treating the charter's "Guardrail integrity" attribute as fully satisfied.

**BD-2** — Severity: warning
Checklist item: 6 (Destructive filesystem operations)
Location: Task Map (`Update /adev:init` row), Postconditions
Finding: The spec states `/adev:init` "writes `implementation_mode` to `manifest.yaml` directly" but does not say whether this write is a targeted, comment-preserving splice or a full reparse/rewrite of the file. The repo already has an established splice-preserving pattern for this exact file — `writeSessionCaptureBlock` (`lib/cli/init-prompt-session-capture.mjs:125`) rewrites only its own block's lines while explicitly preserving unrelated keys and being idempotent/byte-identical on rerun. A naive full-file rewrite of `manifest.yaml` (which by this point already carries risk-tier settings, the Test Policy block, comments, etc.) risks the destructive-serialization failure class `governance-splice.mjs`'s header documents.
Recommendation: State explicitly that the `implementation_mode` write reuses (or is equivalent to) `writeSessionCaptureBlock`'s splice-preserving approach — write only the new key's line(s), leave every other byte of `manifest.yaml` untouched — rather than a full YAML reparse-and-reserialize.
finding_type: unsafe-write-mechanism
section_anchor: actionable-task-map

## Summary

**Total findings:** 7 (0 blockers, 5 warnings, 2 suggestions)
**Action required:** No blockers — the spec is ready for planning. The revision-2 blockers (CON-1/RI-1, both pointing at the same `loadManifest()`/`readManifest()` misattribution) are resolved in revision 3. Five open warnings and two suggestions remain, none blocking: standardize the bypass-warning's name across sections (CON-1), state the `manifest.yaml` write mechanism explicitly (CON-2/BD-2, overlapping), tie `/adev:init`'s option list to `constants.mjs` (WR-2), add template-documentation test coverage (WR-3), and note the deferred dispatch-behavior consumer wiring (WR-1) plus the persisted-bypass-grant trade-off (BD-1) for future follow-up. Address at your discretion before or after planning.
