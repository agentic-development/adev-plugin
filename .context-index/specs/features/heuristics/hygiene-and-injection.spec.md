# Live Spec: Hygiene and Injection

<!-- Live Spec within the heuristics charter.
     Adds hygiene Pass 16 (index staleness + orphan tags) and widens heuristic
     injection to debug, brainstorm, specify, review-specs, and validate skills.
     Parent Charter: .context-index/specs/features/heuristics/charter.md -->

---
charter: heuristics
status: validated
risk_level: low
milestone: 2
test_strategy: unit
revision: 1
charter-revision: 5
created: 2026-04-23
updated: 2026-05-04
source-manifest:
  files:
    - skills/hygiene/SKILL.md
    - skills/debug/SKILL.md
    - skills/brainstorm/SKILL.md
    - skills/specify/SKILL.md
    - skills/review-specs/SKILL.md
    - skills/validate/SKILL.md
    - lib/heuristics.mjs
  computed-at: "2026-05-10T23:51:54.631Z"
drift_detected: true
drift_source: skills/validate/SKILL.md
drift_at: 2026-05-16T02:55:54.157Z
---

## Behavioral Contract

### Preconditions

- `lib/heuristics.mjs` is importable with `retrieveHeuristics` supporting `tier` and `keywords` parameters (depends on keyword-tags-and-tiered-retrieval spec)
- `/adev:sync` generates a `## Learned Lessons` section in sync targets (depends on sync-index spec)
- `/adev:hygiene` has 15 existing audit passes
- Target skills (`debug`, `brainstorm`, `specify`, `review-specs`, `validate`) are functional

### Behaviors — Hygiene Pass 16

1. **When** `/adev:hygiene` runs Pass 16 and high-confidence heuristics exist in the store that are not listed in any sync target's `## Learned Lessons` section **then** flag each missing entry as `STALE_INDEX` with severity `warn`, listing the heuristic id, title, and scope.

2. **When** `/adev:hygiene` runs Pass 16 and a tag value appears on only one heuristic across the entire store (all scope files) **then** flag it as `ORPHAN_TAG` with severity `info`, listing the tag, the heuristic id it belongs to, and a suggestion to either remove the tag or add it to related heuristics.

3. **When** `/adev:hygiene` runs Pass 16 and all high-confidence heuristics are present in sync targets and no orphan tags exist **then** Pass 16 reports `PASS` with a count of indexed entries and total tags.

4. **When** `--fix` is provided and `STALE_INDEX` is detected **then** `/adev:hygiene` invokes `/adev:sync` to regenerate the index. After sync completes, re-check and report the fix result.

5. **When** `--fix` is provided and `ORPHAN_TAG` is detected **then** no auto-fix is applied — orphan tags are advisory only. The report notes: "Orphan tags are advisory. Use `/adev:learn --promote` or edit heuristic files manually to normalize tags."

6. **When** `--check heuristics` is provided **then** only Pass 16 runs (skip all other passes).

7. **When** the heuristic store directory does not exist **then** Pass 16 reports `SKIP` with "No heuristic store found — nothing to audit."

### Behaviors — Skill Injection

8. **When** `/adev:debug` starts Phase 1 (context loading) **then** call `retrieveHeuristics` with `tier: 'summary'` for the module owning the buggy file, and `keywords` derived from the error message or bug description. Keyword derivation: split the error message on whitespace and punctuation, filter to tokens of 3+ characters, remove common stop words (the, and, is, was, not, for, with, from, this, that, etc.), take the first 5 unique tokens as keywords. Example: `"ERR_FS_CP_EINVAL: src and dest cannot be the same"` → `['src', 'dest', 'same', 'err', 'einval']`. If fewer than 3 tokens are extracted, pass an empty keywords array and fall back to module-only retrieval.

9. **When** `/adev:brainstorm` starts Step 1 (explore context) **then** call `retrieveHeuristics` with `tier: 'summary'` for the target module slug. If the module is new (no existing heuristics), fall back to `_global` only.

10. **When** `/adev:specify` starts Step 2 (load context) **then** call `retrieveHeuristics` with `tier: 'summary'` for the charter module. Include the retrieved heuristics in the working context alongside the charter and existing specs.

11. **When** `/adev:review-specs` dispatches reviewer subagents **then** include `retrieveHeuristics` output at `summary` tier for the spec's charter module in each reviewer's prompt, under a `## Heuristics` section with the canonical preamble (same as Behavior 14).

12. **When** `/adev:validate` starts validation checks **then** call `retrieveHeuristics` with `tier: 'summary'` for the spec's charter module. Include in the validation context so checks can reference learned patterns.

13. **When** heuristic retrieval fails in any of the above skills (debug, brainstorm, specify, review-specs, validate) **then** the skill proceeds without heuristics. A single-line warning is logged but the skill does not fail or block.

14. **When** heuristics are injected into a skill context **then** they are preceded by the preamble: "The following heuristics are lessons learned from past work in this module. Use them as guidance, not as hard rules."

### Postconditions

- `/adev:hygiene` reports heuristic index health as part of its standard output
- All five target skills load relevant heuristics during their context-loading phase
- No skill is blocked or fails due to heuristic retrieval issues
- Heuristic injection adds approximately 200-320 tokens per skill invocation (8 entries × ~40 tokens at summary tier)

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Heuristic store missing | Pass 16 reports PASS, skills skip injection | N/A |
| `retrieveHeuristics` throws in a skill | Skill proceeds without heuristics, logs warning | N/A |
| Sync target missing `## Learned Lessons` | Pass 16 flags STALE_INDEX if high-confidence entries exist | STALE_INDEX |
| No sync targets configured in manifest | Pass 16 skips index staleness check, only checks orphan tags | N/A |

## System Constitution Reference

- **Principle 2:** "Skills are primarily markdown" — Injection points are added as instructions in SKILL.md files. The retrieval call is inline Node.js in the skill markdown, following the pattern established by plan and implement injection.
- **Principle 1:** "Minimize external dependencies" — Keyword extraction from error messages uses simple string splitting, no NLP library.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Add Pass 16 to hygiene SKILL.md | Define STALE_INDEX and ORPHAN_TAG checks | medium |
| Implement index staleness detection | Compare high-confidence entries against sync target `## Learned Lessons` sections | medium |
| Implement orphan tag detection | Scan all scope files, count tag occurrences, flag singletons | small |
| Add `--check heuristics` routing | Route to Pass 16 only when flag is provided | small |
| Add `--fix` auto-sync for STALE_INDEX | Invoke `/adev:sync` and re-check | small |
| Add injection to debug SKILL.md | Load heuristics at summary tier with error-derived keywords in Phase 1 | small |
| Add injection to brainstorm SKILL.md | Load heuristics at summary tier for target module in Step 1 | small |
| Add injection to specify SKILL.md | Load heuristics at summary tier for charter module in Step 2 | small |
| Add injection to review-specs SKILL.md | Include heuristics in reviewer subagent prompts | small |
| Add injection to validate SKILL.md | Load heuristics at summary tier in validation context | small |
| Tests: hygiene Pass 16 STALE_INDEX | Verify detection when index is out of date | medium |
| Tests: hygiene Pass 16 ORPHAN_TAG | Verify detection of singleton tags | small |
| Tests: hygiene Pass 16 PASS | Verify clean pass when index is current | small |
| Tests: skill injection structure | Verify each SKILL.md contains retrieveHeuristics call and preamble | small |

## Acceptance Criteria

- [ ] `/adev:hygiene` Pass 16 detects high-confidence heuristics missing from sync target index
- [ ] `/adev:hygiene` Pass 16 detects orphan tags (tags appearing only once)
- [ ] `/adev:hygiene --fix` triggers `/adev:sync` to regenerate index on STALE_INDEX
- [ ] `/adev:hygiene --check heuristics` runs only Pass 16
- [ ] `/adev:debug` loads heuristics with error-derived keywords during Phase 1
- [ ] `/adev:brainstorm` loads module heuristics during Step 1
- [ ] `/adev:specify` loads module heuristics during Step 2
- [ ] `/adev:review-specs` includes heuristics in reviewer subagent prompts
- [ ] `/adev:validate` loads module heuristics during validation
- [ ] All injection points are non-blocking — retrieval failures never stop a skill
- [ ] Injected heuristics include the advisory preamble
- [ ] All quality gates pass (tests, lint)
- [ ] No constitutional violations introduced
