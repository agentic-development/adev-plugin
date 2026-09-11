---
last-reviewed-revision: 2
file-sha: d65fae382f93bd1486e3439e50cd7653327ddb14bbfb2588ce1cd8bbc2d38f80
---

# Architecture Review: mode-resolution-core

> **Date:** 2026-09-10
> **Spec:** .context-index/specs/cross-cutting/mode-resolution-core.spec.md
> **Charter:** .context-index/specs/cross-cutting/implementation-mode/charter.md
> **Verdict:** BLOCK
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

**Verdict:** FAIL

**Pack-Delivery Note (non-finding, operational observation):** this reviewer's materialized `context_pack` is `base` (constitution + platform context only) per this project's `review.yaml` — it does not extend `review-base`/`consistency` the way the skill's documented default does. The reviewer received no Parent Charter, Sibling Specs, Cross-Cutting Specs, or ADRs block and used its own Read/Grep access where needed. This is a registry-configuration matter (`.context-index/governance/review.yaml`), not a defect in the target spec. (Carried forward from the revision-1 review — unchanged.)

**CON-1** — Severity: blocker
Category: contract
This Spec: The Actionable Task Map ("Write resolver" row) and Integration Points §1 both state the resolver "reads `manifest.yaml` via `loadManifest()`." The Error Cases table, however, attributes the reused `MANIFEST_PARSE_ERROR` code to `readManifest()` in `lib/gates/gate-sets.mjs`.
Conflicts With: Internal self-conflict — two sections of this same spec (Task Map line "Write resolver"; Integration Points item 1) name `loadManifest()` as the read function, while Error Cases names `readManifest()` as the function that throws the error being reused.
Recommendation: Confirm which function actually exists in `lib/` (or `lib/gates/gate-sets.mjs`) and use one name consistently everywhere. If they are genuinely different functions, the Error Cases contract ("reuses the code already thrown by readManifest()") is unverifiable as written and the AC "malformed manifest.yaml … exits 2 with MANIFEST_PARSE_ERROR" cannot be implemented against `loadManifest()` without confirming it also throws that code.
finding-type: contract
section_anchor: error-cases
blocker_id: consistency-analyzer:contract:6a70023b

**CON-2** — Severity: warning
Category: terminology
This Spec: The same UI warning is named inconsistently across sections: "sensitive-path-floor warning" (Task Map "Update `/adev:init`" row; Module Impact Map `setup` row; Acceptance Criteria's BEH-5/BEH-6 parenthetical) vs. "sensitive-path-floor-bypass warning" (BEH-6 itself; a separate Acceptance Criteria bullet) vs. "sensitive-path-floor bypass" / "bypass warning" (Module Impact Map's deferred-work sentence and BD-1 reference).
Conflicts With: No external doc available to confirm the canonical name, but the drift is internal — the normative behavior clause (BEH-6) and its own AC restatement use different names for what must be the identical warning artifact.
Recommendation: Pick one canonical term (recommend the fuller "sensitive-path-floor-bypass warning") and use it uniformly in BEH-6, both Acceptance Criteria bullets, the Task Map row, and the Module Impact Map cell.

**CON-3** — Severity: suggestion
Category: naming
This Spec: The resolver's output contract fields are snake_case: `dispatch_red`, `ordering_enforced`, `coverage_check` (Behavioral Contract intro, BEH-4, Integration Points §3).
Conflicts With: Constitution "Coding Standards → Conventions → Naming": "camelCase for functions/variables." These are JS object fields returned by a `.mjs` resolver function, which the naming convention would put in camelCase, though the repo does use snake_case for manifest.yaml config keys which may justify keeping CLI JSON output aligned with config casing.
Recommendation: Confirm whether adev's CLI JSON-output convention is snake_case (matching config) or camelCase (matching JS variables) by checking an existing verb's output shape (e.g. `lib/risk-tiers/`) and align explicitly; if snake_case is the established CLI-output convention, add a one-line note to the spec documenting that as an intentional deviation.

## Referent Integrity Reviewer (referent-integrity)

**Verdict:** FAIL

**Verified (no issues), for the record:**
- `VERB_REGISTRY` — exists, `cli/index.mjs:2009` (also exported at `:2198`).
- `templates/manifest-template.yaml` — exists; "Test Policy" block confirmed at `templates/manifest-template.yaml:129-148`, matching the spec's "near the existing Test Policy block" claim.
- `lib/risk-tiers/` pattern — exists with both `constants.mjs` and `resolve.mjs` present, matching the cited precedent for the new `lib/implementation-modes/` module.
- `loadManifest()` — exists and is exported, `lib/manifest.mjs:40`.
- `tracker-ref: adev-plugin-8u2a` — exists, `.beads/issues.jsonl:158`.
- `BD-1` (Module Impact Map row) — resolves to a real prior-review finding ID, `mode-resolution-core.review.md:102`, not a fabricated charter ID.
- Prospective new artifacts (`lib/implementation-modes/*`, `implementation-mode resolve` verb, `UNKNOWN_IMPLEMENTATION_MODE`, `dispatch_red`/`ordering_enforced`/`coverage_check`, `implementation_mode` manifest key) — confirmed absent from the codebase today; consistent with the spec presenting them as work to create, not current-state claims.

**RI-1** — Severity: blocker
Referent: `MANIFEST_PARSE_ERROR` (Error Cases table) / `loadManifest()` (Task Map, "Write resolver" row)
Location: Error Cases table, cross-referenced with the Task Map's "Write resolver" row
Verification: Read `lib/manifest.mjs:40-56` (`loadManifest`, exported) — the malformed-YAML path is `parseYaml(raw)` at line 56 with no surrounding try/catch, so a parse failure propagates the raw error from `lib/profiles/yaml.mjs`. Read `lib/profiles/yaml.mjs:17-23` — `YamlParseError` sets only `.name = "YamlParseError"` and `.line`, no `.code` property at all. Read `lib/gates/gate-sets.mjs:175-186` — a *different*, module-private function `readManifest()` (not exported) does throw `{code: "MANIFEST_PARSE_ERROR"}`, but it is not the function the spec's own Task Map commits to using.
Finding: The spec's Task Map says the new resolver "reads `manifest.yaml` via `loadManifest()`," but the Error Cases table claims malformed-YAML handling "reuses the code already thrown by `readManifest()` in `lib/gates/gate-sets.mjs`; not a new code." These are two different functions with different error behavior: `loadManifest()` throws an uncoded `YamlParseError`, while `readManifest()` (which does throw `MANIFEST_PARSE_ERROR`) is private to `gate-sets.mjs` and not importable by the new resolver as-is. The acceptance criterion "A malformed `manifest.yaml` causes the resolver to exit 2 with `MANIFEST_PARSE_ERROR`" is therefore not satisfied by the read path the spec itself specifies. (Context: the revision-1 review blocked on a related but different problem — the spec then used a new `CONFIG_INVALID` code instead of `MANIFEST_PARSE_ERROR`. That was fixed by swapping in the correct code name, but the fix wired the citation to the wrong function, reintroducing a fresh mismatch.)
Recommendation: Either (a) have `lib/implementation-modes/resolve.mjs` catch `loadManifest()`'s thrown error and re-throw it coded as `MANIFEST_PARSE_ERROR` itself, or (b) export `readManifest()` from `lib/gates/gate-sets.mjs` and have the new resolver call that instead of `loadManifest()`, and update the Task Map row accordingly. Either way, the Error Cases table's "reuses the code already thrown by `readManifest()`" phrasing should be corrected to describe whichever mechanism is actually chosen.
finding-type: misattributed-error-source
section_anchor: error-cases
blocker_id: referent-integrity:misattributed-error-source:61524fc2

## Wiring Reviewer (wiring-reviewer)

**Verdict:** PASS_WITH_NOTES

Note: revision 1 of this spec was already reviewed with a wiring-reviewer verdict of PASS_WITH_NOTES (5 warnings: WR-1, WR-3, WR-4, WR-5, plus WR-2/WR-6 fully wired). Comparing revision 2's text: WR-1 (no write-then-read test) is now fixed via an explicit acceptance-criterion integration test. WR-4 (false Principle-2 claim) is fixed — the Task Map explicitly states the verb "documents the read path, it is not invoked during the write itself." WR-5 (no verification named for BEH-5/6) is fixed via a golden-transcript/scripted-input acceptance criterion. WR-3 remains open, restated below (renumbered WR-1 in this pass).

**WR-1** — Severity: warning
Producer: `lib/implementation-modes/resolve.mjs`'s output contract `{dispatch_red, ordering_enforced, coverage_check}` (BEH-4) / `adev implementation-mode resolve` CLI verb.
Location: BEH-4, Integration Point 3
Consumer: named only categorically — "future dispatch-behavior spec (`implementation`, `write-test`)" per Integration Point 3, which the spec itself says "is not yet filed and the call mechanism ... is not yet decided." No concrete function, skill, or call site reads this contract today.
Finding: this is the spec's central deferred wiring point, self-acknowledged rather than hidden. Because the charter names concrete future-consumer modules even though unfiled, this stays a warning rather than a no-caller blocker — but it is unresolved since the prior review.
Recommendation: once the dispatch-behavior spec is filed, update Integration Point 3 with its name and the chosen call mechanism (import vs. CLI shell-out).

**WR-2** — Severity: warning
Producer: `lib/implementation-modes/constants.mjs` (mode config objects).
Location: Task Map ("Define mode constants"), Task Map ("Update /adev:init")
Consumer: `resolve.mjs` is a named, tested consumer. The parent charter also names `/adev:init`'s prompt menu as a second consumer, but this spec's own `/adev:init` Task Map row never states that the prompt sources its option list/ordering from `constants.mjs` rather than a separately hardcoded list.
Finding: risk of two independent lists of the 3 mode names, undermining the charter's own "no skill hardcodes per-mode branching logic independently" quality attribute.
Recommendation: state explicitly that `/adev:init`'s menu is generated from `constants.mjs` rather than a separately authored literal list.

No blocker-severity findings. All producers introduced by this spec have an identifiable consumer either within the spec itself or in the charter's explicitly-referenced future work.

## Boundary Reviewer (boundary-reviewer)

**Verdict:** PASS_WITH_NOTES

No conflicts and no items where the spec's design actively contradicts an existing containment, consent, or validation contract were found. Zero blocker-severity findings.

**BD-1** — Severity: suggestion (carried from rev-1 review, now explicitly acknowledged in spec text)
Checklist item: 4 (Privilege posture)
Location: Behaviors (BEH-6), Module Impact Map (`setup` row)
Finding: The sensitive-path-floor-bypass warning fires only at the one-time `/adev:init` prompt; `resolve.mjs`/the CLI verb accept a stored `agent-default` value with no re-assertion, so any non-interactive route to that value (a hand-edited manifest, a scaffolding tool) reaches the bypass silently.
Recommendation: Unchanged from prior review — confirm in the named future `using-adev`-owning sibling spec that the warning is surfaced at every discovery point, not solely the `/adev:init` prompt.

**BD-2** — Severity: suggestion
Checklist item: 6 (Destructive filesystem operations)
Location: Task Map (`/adev:init` row)
Finding: The spec does not state whether the `implementation_mode` write to `manifest.yaml` uses a comment-preserving splice (the pattern `writeSessionCaptureBlock` and `governance-splice.mjs` establish for this exact file) or a full reserialization.
Recommendation: State that the write reuses (or is equivalent to) the existing splice-preserving pattern rather than a naive full-file rewrite.

---

## Heuristics — related prior lessons (signature-ranked)

The following heuristics are lessons learned from past work in this module, ranked with any exact matches for this blocker first. They are not necessarily prior occurrences of this blocker. Use them as guidance, not as hard rules.

### Heuristic: A universal coverage claim must ship with the predicate that checks it (confidence: medium)
- **Pattern:** When closing a coverage gap in a spec or acceptance criterion, state the executable check alongside the claim — the exact command or match, and the paths it runs over. Scope it to live surfaces (skills/, providers/, docs/) and exclude directories that archive review and validate artifacts, since those necessarily quote the pattern being forbidden. Match on the meaningful component rather than an exact string, so equivalent forms (absolute vs repo-relative) are both caught.
- **Anti-pattern:** Answer a repeatedly-missed surface by widening the assertion — "no occurrence anywhere in the repository". An unbounded universal followed by a bounded list of examples cannot be discharged, and reads as coverage while providing none.
- **Evidence:** 1 observations

(No signature-exact match was found for either blocker in this review — the store currently holds only `_global`-scope entries for this module, so the block above is module/global fallback content, not a prior occurrence of CON-1 or RI-1.)

## Summary

**Total findings:** 7 (2 blockers, 3 warnings, 2 suggestions)
**Action required:** Resolve CON-1 and RI-1 — both point at the same underlying defect: the spec's Task Map/Integration Points commit the new resolver to `loadManifest()`, but the Error Cases table's `MANIFEST_PARSE_ERROR` reuse claim is only true of the different, non-exported `readManifest()` in `lib/gates/gate-sets.mjs`. Pick one mechanism (resolver catches and re-codes `loadManifest()`'s error, or the new resolver calls an exported `readManifest()`) and make the Task Map, Integration Points, and Error Cases table agree on it. Then run `/adev:specify --revise` and re-review.
