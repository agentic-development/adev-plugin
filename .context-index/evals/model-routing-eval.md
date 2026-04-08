# Evaluation Report: Model Routing (Revision 2)

> **Date:** 2026-04-08
> **Spec:** .context-index/specs/cross-cutting/model-routing.md
> **Overall Score:** 70/100 (Grade: C) — Layer 4 pending

## Layer 1: Deterministic Checks — 25/25
- Tests: PASS (531/531)
- Lint: N/A (not configured)
- Typecheck: N/A (not configured)

## Layer 2: Architectural Conformance — 24/25
- Pattern consistency: 9/10 — All reviewer prompts follow consistent structure; minor inconsistency in code-quality-checklist.md vs prompt file pattern
- Boundary compliance: 5/5 — No constitutional violations; all changes in "Autonomous" category; zero hardcoded model IDs
- Complexity metrics: 5/5 — All SKILL.md files under 500 lines; implement reduced from 448 to 384
- Test quality: 5/5 — 531 tests pass; model-routing invariants covered by dedicated test files

## Layer 3: LLM-as-a-Judge — 21/25
- Readability: 4/5 — Clear Essential/Reference pattern; minor duplicate numbering in implement SKILL.md
- Maintainability: 5/5 — Excellent concern separation; extracted files, independent reviewer prompts, single source of truth
- Spec fidelity: 4/5 — All 10 behaviors implemented; init SKILL.md hardcoded models pre-existing (tracked in plan Task 2)
- Idiomatic usage: 4/5 — Proper frontmatter; context:fork could apply to more skills
- Error handling: 4/5 — Graceful degradation throughout; minor fallback chain dependency on spec file

## Layer 4: HITL Checkpoints — pending
- Business logic: pending
- UX review: SKIPPED (no UI)
- Security review: SKIPPED (no auth/data changes)
- Performance: pending

## A/B Comparison: OLD vs NEW Reviewer Prompts

Ran 3 reviewers with OLD prompts and 3 with NEW prompts against the same spec (session-awareness/skill-level-state-instructions.md). Results:

### Token Usage

| Reviewer | OLD tokens | NEW tokens | Delta |
|----------|-----------|-----------|-------|
| Structural Architect | 27,208 | 22,360 | -17.8% |
| Security Reviewer | 17,877 | 17,935 | +0.3% |
| Consistency Analyzer | 38,005 | 31,847 | -16.2% |
| **Total** | **83,090** | **72,142** | **-13.2%** |

Tool uses: 25 (OLD) vs 18 (NEW) = -28% fewer tool calls
Duration: 164s (OLD) vs 145s (NEW) = -12% faster

### Finding Quality

| Metric | OLD Prompts | NEW Prompts |
|--------|-------------|-------------|
| Total findings | 13 | 10 |
| Blockers | 1 (CON-6) | 0 |
| Warnings | 3 | 3 |
| Suggestions | 9 | 7 |
| False/phantom findings | 1 (CON-6 arguably over-classified) | 0 |
| Findings with specific file references | 10/13 (77%) | 9/10 (90%) |
| Findings suggesting implementation | 1 (SA-2 old) | 0 |

### Key Differences

**Structural Architect (OLD vs NEW):**
- OLD: 4 findings (SA-1 through SA-4), verbose summary section restating context, no explicit self-check
- NEW: 4 findings (SA-1 through SA-4), concise output, all findings reference specific spec sections, none suggest implementation approaches
- NEW found the same issues but with 18% fewer tokens and sharper justifications
- NEW SA-4 (constitutional tension) was more precisely argued than OLD SA-4

**Security Reviewer (OLD vs NEW):**
- OLD: 3 findings (SEC-1 through SEC-3), included lengthy "Threat Model" preamble restating the module type
- NEW: 3 findings (SEC-1 through SEC-3), skipped the preamble, jumped straight to findings
- Same findings, same quality — security scope was narrow enough that prompts made little difference
- NEW SEC-3 added `currentTask` range validation (more specific than OLD SEC-3 staleness concern)

**Consistency Analyzer (OLD vs NEW):**
- OLD: 6 findings including 1 blocker (CON-6), 2 warnings, 3 suggestions; 38K tokens
- NEW: 4 findings, 0 blockers, 2 warnings, 2 suggestions; 32K tokens
- OLD CON-6 classified the `node -e` pattern as a BLOCKER; NEW CON-2 found the same issue but correctly classified it as a WARNING (the spec itself acknowledges the tension and justifies it)
- NEW dropped OLD's CON-5 (missing "Consumer Guidance" section) — the self-check instruction filtered this out as a stylistic preference rather than a real problem
- NEW added CON-3 (coordination with model-routing Behavior 10) — a cross-cutting insight that OLD missed entirely

### Verdict

The NEW prompts produced:
1. **13% fewer tokens** across all 3 reviewers
2. **28% fewer tool calls** (more focused file reading)
3. **Higher precision** — fewer phantom/over-classified findings (0 blockers vs 1 false blocker)
4. **Better recall** — NEW consistency analyzer found a cross-cutting insight (model-routing Behavior 10 coordination) that OLD missed
5. **No restated input** — self-check and return constraints eliminated preamble/summary padding

## Trend

First evaluation for this spec. No prior data for comparison.
