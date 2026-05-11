# Live Spec: Mocking Boundary Declaration

<!-- Live Spec within the adev:write-test charter.
     Parent Charter: .context-index/specs/features/adev:write-test/charter.md -->

---
charter: adev:write-test
status: validated
risk_level: medium
milestone:
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
  computed-at: "2025-04-25T00:00:00.000Z"
drift_detected: true
drift_source: skills/write-test/SKILL.md
drift_at: 2026-05-11T00:13:36.884Z
---

## Behavioral Contract

### Preconditions

- Test authoring is in progress (RED phase)
- The skill is about to write a test that stubs, mocks, or spies on a dependency

### Behaviors

1. **When** a test requires mocking a dependency **then** the skill evaluates whether the dependency is an external system boundary. The four permitted boundary types are: `HTTP` (outbound network calls, fetch, axios, got), `DB` (database clients, ORMs, query builders), `filesystem` (fs operations that reach outside the project directory or represent I/O side effects), and `external-api` (third-party SDKs, payment processors, email services, OAuth providers).

2. **When** the dependency is within the same repository (same package, same monorepo workspace) **then** mocking it is a violation. The skill must instead use the real implementation. If the real implementation has an unacceptable side effect (e.g., it writes to a real database), the correct fix is to use a test double at the actual external boundary, not to mock the internal module.

3. **When** a permitted mock is written **then** the skill records a Mocking Boundary entry in the Handoff Block: the mock target path or module name, the boundary type, and a one-sentence justification explaining why this is a legitimate external boundary.

4. **When** the Handoff Block is produced **then** the Mocking Boundaries table is included and all mocks in all test files are accounted for — there must be no mock in a test file that does not have a corresponding Mocking Boundary entry.

5. **When** `--verify` runs post-GREEN **then** it checks that the implementer has not introduced new mocks in the test files that are not in the Handoff Block's Mocking Boundaries table. New undeclared mocks in test files after GREEN phase are flagged as violations.

### Postconditions

- Every mock in every written test file has a declared Mocking Boundary entry with justification
- No internal repository module is mocked
- The Handoff Block's Mocking Boundaries table is complete and accurate

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Mock targets an internal module | Block with mock location, target path, and explanation. Suggest the correct external boundary to mock instead. | MOCK_VIOLATION |
| Mock has no justification provided | Block — justification is required for all mocks | MISSING_JUSTIFICATION |
| New mock introduced in test file during GREEN phase | `--verify` flags as undeclared mock violation | UNDECLARED_MOCK |

## Internal vs External Boundary Examples

| Dependency | Verdict | Reason |
|---|---|---|
| `../services/user-service.mjs` | Internal — VIOLATION | Same repository module |
| `../../lib/email.mjs` | Internal — VIOLATION | Same repository module |
| `node-fetch` / `axios` / `fetch` | External — permitted (HTTP) | Outbound network boundary |
| `pg` / `mongoose` / `prisma` | External — permitted (DB) | Database client boundary |
| `node:fs` for production writes | External — permitted (filesystem) | I/O side effect boundary |
| `stripe` / `sendgrid` / `twilio` | External — permitted (external-api) | Third-party SDK boundary |
| `../utils/format.mjs` | Internal — VIOLATION | Utility in same package |
| `../config/index.mjs` | Internal — VIOLATION | Config in same package |

## System Constitution Reference

- **Principle:** "Skills are primarily markdown" — The boundary classification is a set of rules in SKILL.md. The boundary table is written by Claude following those rules, not by a code scanner.
- **Principle:** "Minimize external dependencies" — No static analysis tool needed. Boundary classification is rule-based judgment from the skill instructions.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Add boundary rules to `SKILL.md` | Document the 4 boundary types, the internal vs external classification table, and the justification requirement | Small |
| Extend `write-handoff.mjs` | Add Mocking Boundaries table to Handoff Block output | Small |
| Extend `--verify` mode | Check for new undeclared mocks introduced during GREEN phase | Small |

## Acceptance Criteria

- [ ] Mocking an internal repository module causes a MOCK_VIOLATION block with location and suggestion
- [ ] Mocking `fetch`, database clients, `node:fs`, or third-party SDKs is permitted with a declared boundary entry
- [ ] Every mock in every test file has a Mocking Boundaries entry in the Handoff Block
- [ ] A mock without a justification causes a MISSING_JUSTIFICATION block
- [ ] `--verify` flags new undeclared mocks introduced during GREEN phase
- [ ] All quality gates pass (`npm test`)
- [ ] No constitutional violations introduced
