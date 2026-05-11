# Live Spec: Post-GREEN Semantic Verification

<!-- Live Spec within the adev:write-test charter.
     Parent Charter: .context-index/specs/features/adev:write-test/charter.md -->

---
charter: adev:write-test
status: validated
risk_level: high
milestone: v1
revision: 1
charter-revision: 1
created: 2026-03-27
updated: 2026-05-04
source-manifest:
  sha: "794bc64"
  files:
    - skills/write-test/SKILL.md
    - skills/write-test/write-handoff.mjs
    - skills/write-test/write-handoff.sh
    - tests/write-test/write-handoff.test.mjs
  computed-at: "2025-04-25T00:00:00.000Z"
drift_detected: true
drift_source: skills/write-test/SKILL.md
drift_at: 2026-05-11T00:13:36.884Z
---

## Behavioral Contract

### Preconditions

- `adev:write-test --verify --packet <path>` is invoked
- The Handoff Block at `<path>` exists and is readable
- The test files listed in the Handoff Block exist on disk
- The implementer subagent has completed the GREEN phase

### Behaviors

1. **When** `--verify` is invoked **then** the skill reads the Handoff Block and recomputes the SHA-256 hash of the current test file contents (same algorithm as `write-handoff.mjs`: path-alphabetical concatenation). If the hash matches the Handoff Block's `hash` field, verification passes immediately with status `PASS`.

2. **When** the hash does not match **then** the skill does not immediately fail — it proceeds to semantic diff to distinguish meaningful changes from cosmetic ones (whitespace, comments, variable renames that do not affect assertion logic).

3. **When** a semantic diff is performed **then** the skill reads the original test file contents from the Handoff Block's `## Original Test File Contents` section (stored verbatim at RED phase) and compares them line-by-line against the current test files. Changes that weaken a test are flagged as TAMPERED:
   - Assertion removed entirely (`REMOVED`)
   - Matcher loosened (`LOOSENED`) — e.g., `toEqual` → `toMatchObject`, `toBe(false)` → `toBeFalsy()`, `toHaveLength(3)` → `toBeGreaterThan(0)`
   - Expected value changed to differ from the original (`HARDCODED_TO_PASS`) — detected by comparing original expected value to current expected value in the diff; does not require running the implementation
   - Test skipped or commented out (`SKIPPED`) — `.skip`, `.todo`, `xit`, `xdescribe`, commented-out test block
   - Conditional logic added around an assertion (`CONDITIONAL`) — `if/else` guard or `try/catch` swallowing assertion failure

4. **When** only cosmetic changes are found (whitespace, comments, non-assertion code reformatting) **then** the skill returns `PASS_WITH_COSMETIC_CHANGES` and logs what changed without blocking.

5. **When** one or more TAMPERED assertions are found **then** the skill returns `TAMPERED` with a structured diff report listing: test file, line number, original assertion, current assertion, and tamper classification. The implementer must revert the test to its original form and fix the production code instead.

6. **When** `adev:implement` dispatches `--verify` **then** it uses the `fast` model tier resolved from `platform-context.yaml` for the semantic diff subagent, per the model-routing cross-cutting spec.

### Postconditions

- Verification status is one of: `PASS`, `PASS_WITH_COSMETIC_CHANGES`, or `TAMPERED`
- `TAMPERED` status includes a full diff report with every weakened assertion identified
- The Handoff Block is not modified by `--verify` (read-only operation)

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Handoff Block not found at `<path>` | Block with "Packet not found: <path>. Run `--red` first." | PACKET_NOT_FOUND |
| Test file listed in Handoff Block no longer exists | Block with "Test file missing: <path>. Cannot verify integrity." (verification reads always block on STALE_PACKET) | STALE_PACKET |
| Hash recomputation fails | Block with filesystem error | HASH_ERROR |
| All tests now pass (GREEN achieved) but hash mismatches | Still perform semantic diff — passing tests do not exempt from tamper check | — |

## System Constitution Reference

- **Principle:** "Skills are primarily markdown" — The semantic diff logic is an instruction to the `fast`-tier subagent. The hash comparison is performed by a `.mjs` helper. Neither is required for the skill to function — a human could follow the same instructions manually.
- **Principle:** "Minimize external dependencies" — Hash recomputation uses `crypto`, file reads use `fs`. No diff library needed — the semantic comparison is performed by the subagent reading both versions.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Add `--verify` mode to `SKILL.md` | Document the verify invocation, hash check, semantic diff dispatch, and tamper classifications | Medium |
| Implement hash recheck in `write-handoff.mjs` (or separate `verify-handoff.mjs`) | Recompute hash from current files and compare to stored hash | Small |
| Define tamper classification rules | Document the 5 tamper patterns in SKILL.md so the `fast`-tier subagent has a concrete checklist | Small |
| Write tests for verify mode | Test PASS, PASS_WITH_COSMETIC_CHANGES, and each TAMPERED classification | Medium |

## Acceptance Criteria

- [ ] `--verify --packet <path>` returns `PASS` when the test file hash matches the Handoff Block hash
- [ ] `--verify` returns `PASS_WITH_COSMETIC_CHANGES` when hash mismatches but no assertions are weakened
- [ ] `--verify` returns `TAMPERED` with a diff report when any assertion is removed, loosened, or conditionally skipped
- [ ] Each item in the diff report includes: test file, line number, original assertion, current assertion, tamper classification
- [ ] `--verify` uses the `fast` model tier from `platform-context.yaml` for semantic diff
- [ ] The Handoff Block is not modified by a `--verify` run
- [ ] A missing packet file causes an immediate block with a clear message
- [ ] All quality gates pass (`npm test`)
- [ ] No constitutional violations introduced
