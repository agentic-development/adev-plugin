# Validation Report: Hygiene and Injection

**Spec:** `.context-index/specs/features/heuristics/hygiene-and-injection.md`
**Plan:** `.context-index/specs/features/heuristics/hygiene-and-injection.plan.md`
**Validated:** 2026-04-23
**Validator:** /adev:validate (manual run)
**Verdict:** PASS

---

## Check 1: Quality Gates

**Status:** PASS (with known pre-existing skip)

- `npm test`: 1442 pass, 1 fail (`context-pack.test.mjs` — pre-existing, unrelated to this spec)
- Feature-specific tests (`hygiene-heuristic-pass.test.mjs`, `heuristic-injection-widening.test.mjs`): 30/30 pass

---

## Check 2: Spec Compliance

All 11 acceptance criteria verified. Results:

| Criterion | Status | Evidence |
|-----------|--------|----------|
| 1. Pass 16 detects STALE_INDEX | PASS | `skills/hygiene/SKILL.md` line 722–768: "STALE_INDEX check" with severity: warn, listing heuristic id/title/scope |
| 2. Pass 16 detects ORPHAN_TAG | PASS | `skills/hygiene/SKILL.md`: "ORPHAN_TAG check" with severity: info and singleton tag detection |
| 3. --fix triggers /adev:sync on STALE_INDEX | PASS | SKILL.md step 5: "invoke `/adev:sync` to regenerate the index. After sync completes, re-check." |
| 4. --check heuristics runs only Pass 16 | PASS | SKILL.md step 6: "When `--check heuristics` is provided, run only this pass (skip passes 1–15)" |
| 5. /adev:debug loads heuristics with keyword derivation in Phase 1 | PASS | `skills/debug/SKILL.md` Phase 1 step 4: keyword derivation with stop word filtering, `retrieveHeuristics` call, non-blocking |
| 6. /adev:brainstorm loads module heuristics during Step 1 | PASS | `skills/brainstorm/SKILL.md` Step 1: `retrieveHeuristics` with `tier: 'summary'`, `_global` fallback for new modules |
| 7. /adev:specify loads module heuristics during Step 2 | PASS | `skills/specify/SKILL.md` Shared: Load Context (step 2): `retrieveHeuristics` with charter module |
| 8. /adev:review-specs includes heuristics in reviewer subagent prompts | PASS | `skills/review-specs/SKILL.md` Step 4: retrieval, `## Heuristics` section in each reviewer's context pack |
| 9. /adev:validate loads module heuristics during validation | PASS | `skills/validate/SKILL.md` Step 0: `retrieveHeuristics` for spec's charter module |
| 10. All injection points non-blocking | PASS | All 5 skills: "If the call fails or returns empty, proceed without heuristics — non-blocking" |
| 11. Injected heuristics include advisory preamble | PASS | All 5 skills: "The following heuristics are lessons learned from past work in this module. Use them as guidance, not as hard rules." |

### Test File Verification

**`tests/skills/hygiene-heuristic-pass.test.mjs`** (8 tests, all pass):
- defines Pass 16: Heuristic Index Health
- defines STALE_INDEX check
- defines ORPHAN_TAG check
- supports --check heuristics flag
- supports --fix auto-sync for STALE_INDEX
- reports SKIP when store directory missing
- references retrieveHeuristics or readHeuristics
- references Learned Lessons section in sync targets

**`tests/skills/heuristic-injection-widening.test.mjs`** (22 tests, all pass):
- 4 tests per skill × 5 skills: retrieveHeuristics reference, summary tier, canonical preamble, non-blocking behavior
- 2 additional debug tests: keyword extraction, stop word filtering

---

## Check 3: Charter Consistency

**Status:** PASS

Implementation stays within charter scope. Both work streams match plan structure:
- Group A (hygiene): Pass 16 added to `skills/hygiene/SKILL.md`, `--check heuristics` routing added to `--check` argument list
- Group B (injection): `retrieveHeuristics` injection added to debug, brainstorm, specify, review-specs, validate

No out-of-scope files modified. No new library code created — all changes are markdown edits to SKILL.md files as specified in the plan's architecture note.

---

## Check 4: Constitution Compliance

**Status:** PASS

- **No external dependencies:** Keyword extraction uses simple string splitting (no NLP library). No new `import`s in library code.
- **Skills are primarily markdown:** All injection points are inline instructions in SKILL.md files. The `retrieveHeuristics` calls are inline Node.js inside skill markdown, following the established pattern from `skills/implement/SKILL.md` and `skills/plan/SKILL.md`.
- **Pure ESM:** No `.js` or CommonJS files introduced. All new test files use `.mjs` extension.
- **No hardcoded `~/.claude/` paths:** Plugin root derived via `skills/<name>/` suffix stripping as documented.

---

## Checks 5-10: SKIP

Not applicable for this spec (no governance/, no UI, no external references, no sessions, no cross-cutting contracts, no blockers directory).

---

## Check 11: N/A (no UI)

---

## Check 12: Lifecycle Reconciliation

**Status:** PASS

- Spec status: `review-passed` (set in frontmatter)
- Plan file exists: `hygiene-and-injection.plan.md`
- Review file exists: `hygiene-and-injection.review.md`
- Implementation complete: all 6 SKILL.md files modified, 2 test files created
- No orphaned plans, no stale epics detected for this spec

---

## Check 13: Success Heuristic Extraction

Lessons learned from this implementation:

1. **Skill markdown injection follows a stable pattern.** The `retrieveHeuristics` + `renderHeuristic` inline Node.js block is fully reusable across skill files. Future injection specs can reference `skills/debug/SKILL.md` Phase 1 step 4 as the canonical example.

2. **Non-blocking guard phrasing is standardized.** "If the call fails or returns empty, proceed without heuristics — non-blocking." This exact phrase is now used in 7 skill files (including plan/implement) and should be treated as a project idiom.

3. **Hygiene passes with conditional prerequisites reduce noise.** Pass 16 reports SKIP when the heuristic store is absent, avoiding false positives on projects that have not adopted heuristics yet. This pattern (check-for-directory-then-SKIP) is already used by passes 6, 7, 8, 9, 10.

4. **ORPHAN_TAG as advisory (info) vs. STALE_INDEX as warn is the right severity split.** Tag normalization is low-urgency housekeeping; missing index entries may cause retrieval misses in production skill runs.

---

## Summary

| Check | Status | Notes |
|-------|--------|-------|
| 1. Quality Gates | PASS | 1442/1443 pass; 1 pre-existing failure unrelated to spec |
| 2. Spec Compliance | PASS | 11/11 acceptance criteria verified |
| 3. Charter Consistency | PASS | Implementation within charter scope |
| 4. Constitution Compliance | PASS | No violations |
| 5-10 | SKIP | Not applicable |
| 11 | N/A | No UI |
| 12. Lifecycle Reconciliation | PASS | All artifacts present |
| 13. Heuristic Extraction | DONE | 4 lessons documented above |

**Overall verdict: PASS — ready to mark as `validated`.**
