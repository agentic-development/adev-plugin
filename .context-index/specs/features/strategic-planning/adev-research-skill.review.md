# Architecture Review: adev-research-skill (rev 3)

> **Date:** 2026-04-09
> **Spec:** `.context-index/specs/features/strategic-planning/adev-research-skill.md`
> **Charter:** `.context-index/specs/features/strategic-planning/charter.md`
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 3
> **file-sha:** 009730fcac2664fc8800504eee89aa6375ed4085

## Resolution Summary (findings from the rev 2 review)

| Prior Finding | Severity | Status |
|---|---|---|
| SA-1 — tool-surface verification | warning | **RESOLVED** — subagent-level probe mechanism defined in Behavior 4 and Migration Step 2.3 |
| SA-2 — 1,500-token cap rationale | warning | **RESOLVED** — rationale documented in Improvement 5 (~4,500-token parallel-return arithmetic) |
| SA-3 — parent charter optionality | warning | **RESOLVED** — `charter: <module-name or null>` specified in Behavior 2 and Migration Step 2.3 |
| SA-4 — NO_VALID_FINDINGS error case | suggestion | **RESOLVED** — new row added to Error Cases table |
| SA-5 — synthesis self-check | suggestion | **RESOLVED** — synthesis-prompt.md core field 12 requires "Before Finalizing" self-check |
| SA-6 — orchestrator context invariant | suggestion | **RESOLVED** — new invariant added explicitly tied to `allowed-tools` exclusion of WebSearch/MCP |
| SEC-1 — owner/repo validation | warning | **PRESERVED** from rev 1 (Behavior 9) |
| SEC-2 — prompt injection from researchers | **BLOCKER** | **RESOLVED** — content-fence rule in Behavior 15 + core field 8 of each researcher prompt |
| SEC-3 — artifact as injection vector | warning | **RESOLVED** — orchestrator sanitization pass in Behavior 16 + Migration Step 5.5 + `injection_warnings` frontmatter field |
| SEC-4 — unbounded internal reads | warning | **RESOLVED** — read-budget cap in Behavior 17 + internal-researcher-prompt core field 10 |
| SEC-5 — sensitive-file exposure | warning | **RESOLVED** — sensitive-file exclusion list in Behavior 18 + internal-researcher-prompt core field 11 |
| CON-1 — topic vs question terminology | suggestion | NO ACTION (spec's frontmatter contract supersedes charter entity definition) |
| CON-6 — relates-to kebab-case | suggestion | NO ACTION (kebab-case is the established YAML convention in this project) |

**12 of 12 actionable findings from rev 2 resolved. 0 deferred without justification.**

---

## Structural Architect

**Verdict:** PASS_WITH_NOTES

Rev 3 resolves all three prior structural warnings with targeted, surgical edits that do not perturb the overall architecture. SA-1's resolution is particularly well-done — rather than invent a new verification layer, the spec correctly identifies that tool-surface verification must live at the subagent layer (because subagents inherit the harness, not the orchestrator's `allowed-tools`), and turns this observation into a concrete probe mechanism that doubles as the graceful-degradation trigger. SA-2's rationale is grounded in the concrete token arithmetic of the three-researcher parallel return. SA-3 makes the parent-charter field unambiguously nullable rather than merely optional. The new injection-defense machinery (Behaviors 15-18, Migration Step 5.5, and the `injection_warnings` frontmatter field) is additive and does not create new boundary crossings — the orchestrator-context-isolation invariant still holds because sanitization operates on already-condensed researcher returns and synthesized output, not on raw tool output.

### SA-7 — suggestion (non-blocking)
- **Location:** Migration Step 4 ("Bump spec revision")
- **Finding:** Step 4's prose said "Bump this spec to `revision: 2` (already done in this write)" but the frontmatter is `revision: 3`. Stale text copied from the rev-2 revision.
- **Status:** **FIXED during rev 3 write** — Step 4 now reads "Bump this spec to `revision: 3` ..."

### SA-8 — suggestion (non-blocking)
- **Location:** Behavior 4 (probe mechanism)
- **Finding:** The probe semantics are under-specified per tool. "Trivial WebSearch" still consumes a real query and costs quota; "trivial Glob" always succeeds if the tool exists and gives no signal about workspace access; "trivial `mcp__github__*` call" is not named to a specific endpoint. The structural design is sound — this is a prompt-contract precision issue, not a boundary issue.
- **Recommendation:** In each researcher prompt (not in this spec), name the exact probe call (e.g., `mcp__github__search_code` with a known-empty query, or check-only variants if available), and note that probe side effects are acceptable. Defer to the implementation phase when the prompt files are authored.

### SA-9 — suggestion (non-blocking)
- **Location:** Migration Step 5.5 (sanitization pass)
- **Finding:** The pass is purely regex/keyword driven. A cross-source synthesis in `--compare` mode could naturally produce imperative-sounding prose (e.g., "Use option A when X" reads as a directive), generating false positives that get redacted as `[content redacted: potential injection]`. The spec does not say whether false positives are tolerated or how they're distinguished from real injection.
- **Recommendation:** Either (a) narrow the Step 5.5 match set to role-frame breakouts and the explicit phrase list (leaving generic imperatives to the researcher layer), or (b) add a Behavioral Contract note that Step 5.5 is conservative-by-design and may over-redact, with the researcher layer being the precision layer. Either is fine — just make the intent explicit. Can be addressed in a minor rev during implementation if false-positive rates turn out to be a problem.

### Cross-Check Against model-routing.md rev 2 (behaviors 6-10)

All ten behaviors remain compliant; rev 3 does not perturb the tier assignments, return caps, ultrathink placement, or self-check structure. The new sanitization pass (Behaviors 15-18) is additive and does not interact with model-routing semantics.

---

## Security Reviewer

**Verdict:** PASS

Rev 3 cleanly resolves all four outstanding findings from the rev 2 security review. The content-fence rule (SEC-2) is specified with sufficient precision — the exact replacement token, a phrase list, role-frame patterns, and HTML comment detection — and is mandated on all four subagent prompts, not just the web researcher. The orchestrator sanitization pass (SEC-3) is architecturally distinct from the researcher layer, creating genuine defense-in-depth rather than a single point of control. The read-budget cap (SEC-4) and sensitive-file exclusion list (SEC-5) are elevated to Invariants with test coverage, which is the correct level of enforcement for hard security rules.

- **SEC-2 (blocker) — RESOLVED.** Behavior 15 formalizes the content-fence rule. Exact replacement token `[adversarial content detected and omitted]` is specified. Detection patterns are concrete (phrase list, role-frame breakouts, HTML comment imperative verbs). The rule is mandated on all four researcher prompts via core field 8 in Migration Step 1. Test assertions verify presence.
- **SEC-3 (warning) — RESOLVED.** Migration Step 5.5 and Behavior 16 specify the orchestrator-layer sanitization pass. The `injection_warnings: true` frontmatter flag is specified end-to-end (invariants, acceptance criteria, template documentation).
- **SEC-4 (warning) — RESOLVED.** Behavior 17 specifies the read-budget cap at ≤20 files or ≤50,000 tokens. `budget_exceeded: true` return header and leads-not-followed list are specified. Preference for Grep over Read is explicit.
- **SEC-5 (warning) — RESOLVED.** Behavior 18 specifies the hard exclusion list (`.env`, `*.env.*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.keystore`, `id_rsa*`, `id_ed25519*`, `*.ovpn`, plus filename substrings `secret`, `credential`, `token`, case-insensitive). The narrow exception (secrets-management topics → path only, no contents) is appropriate. Classified as a hard rule that regressions must catch.

No new security findings.

---

## Consistency Analyzer

**Verdict:** PASS_WITH_NOTES

Rev 3 is internally consistent. All SEC-2/SEC-3/SEC-4/SEC-5 defenses are properly threaded through Behaviors 15-18, the Invariants section, the Migration Path, and the Acceptance Criteria. The model-routing.md cross-cutting contract is fully honored (behaviors 6-10 all verified). The two-layer injection defense (researcher content-fence + orchestrator sanitization) is clearly specified and tested. The sensitive-file exclusion list and read-budget cap are hardened at the prompt level and verified in tests. No regressions introduced.

### CON-7 — suggestion (non-blocking)
- **Category:** terminology
- **Location:** Behavioral Contract Behavior 2, Migration Step 2.3
- **Finding:** The spec does not explicitly state that `subagent_type: general-purpose` is the only supported type for this skill. Future revisions might be tempted to use specialized routing, which would change tool availability guarantees.
- **Recommendation:** Add one line: "All researcher subagents use `subagent_type: general-purpose` to inherit the harness tool surface; do not switch to specialized routing without an explicit spec revision, as this changes tool availability guarantees."

### CON-8 — suggestion (non-blocking)
- **Category:** terminology
- **Location:** Invariants list, Behaviors 15-16
- **Finding:** The Invariants section uses "orchestrator context isolation" while the Behavioral Contract uses "content-fence rule" and "sanitization pass" as the two layers. The Invariants could be clearer about which layer is input-side (researcher → orchestrator) vs output-side (orchestrator → artifact).
- **Recommendation:** Split the defense-in-depth invariant phrasing to name the input-side (content-fence rule at each researcher) and output-side (Step 5.5 sanitization pass) layers explicitly.

### CON-9 — suggestion (non-blocking)
- **Category:** domain-model
- **Location:** Behavior 2, Acceptance Criteria
- **Finding:** "Ad-hoc invocation" (used in acceptance criteria) is not explicitly defined as "no `--issue <id>` AND no calling-skill context." Consistent with SA-3 resolution but a new reader might not immediately see the equivalence.
- **Recommendation:** No change required — SA-3 is adequately resolved. This is a documentation clarity suggestion only.

### Cross-Cutting Compliance Summary

All ten model-routing.md rev 2 behaviors remain correctly implemented:
1-5 ✅ unchanged from rev 2. 6 ✅ tier assignments unchanged. 7 ✅ return size caps unchanged (with new rationale documented). 8 ✅ `ultrathink` placement unchanged. 9 ✅ reviewer self-check unchanged and extended to the synthesis subagent. 10 ✅ scope discipline unchanged.

---

## Domain Specialists

None dispatched — `specialists` registry in `manifest.yaml` is empty.

---

## Summary

**Total findings in rev 3 review:** 6 (0 blockers, 0 warnings, 6 suggestions)
**Prior-round findings resolved:** 12 of 12

| Reviewer | Verdict | Blockers | Warnings | Suggestions |
|---|---|---|---|---|
| Structural Architect | PASS_WITH_NOTES | 0 | 0 | 3 (SA-7 already fixed, SA-8 + SA-9 defer to implementation) |
| Security Reviewer | PASS | 0 | 0 | 0 |
| Consistency Analyzer | PASS_WITH_NOTES | 0 | 0 | 3 (CON-7, CON-8, CON-9 — optional documentation refinements) |
| **Overall** | **PASS_WITH_NOTES** | **0** | **0** | **6** |

**Action required:** The spec is cleared for `/adev:plan`. The 6 suggestions are optional documentation refinements and do not gate planning. SA-8 (probe precision) and SA-9 (sanitization false positives) are best addressed during implementation when the prompt files are authored, where the context is most relevant. CON-7, CON-8, and CON-9 can be applied opportunistically as documentation improvements.

The blocker from rev 2 (SEC-2) is fully resolved with a two-layer defense-in-depth architecture (researcher-layer content fence + orchestrator-layer sanitization pass) backed by an auditable `injection_warnings` frontmatter signal. All three structural warnings (SA-1, SA-2, SA-3) and all three remaining security warnings (SEC-3, SEC-4, SEC-5) are resolved with additive, backward-compatible changes.
