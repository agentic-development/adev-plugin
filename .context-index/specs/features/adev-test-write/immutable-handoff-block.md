# Live Spec: Immutable Handoff Block

<!-- Live Spec within the adev-test-write charter.
     Parent Charter: .context-index/specs/features/adev-test-write/charter.md -->

---
charter: adev-test-write
status: review-pending
risk_level: medium
milestone: v1
created: 2026-03-27
---

## Behavioral Contract

### Preconditions

- RED phase test authoring has completed successfully
- All tests have been confirmed failing for behavioral reasons
- No Gaming Violations or Mocking Boundary violations remain
- `.context-index/packets/` directory exists (created if absent)

### Behaviors

1. **When** RED phase completes **then** the skill writes a Handoff Block to `.context-index/packets/<slug>-tests.md` containing: the list of test file paths written, the exact verification command to reproduce RED state, a failure summary excerpt (last 20 lines of test output), the locked test constraints, and a SHA-256 content hash of all test file contents concatenated in path-alphabetical order.

2. **When** the Handoff Block is written **then** its `locked: true` field is set and the content hash is recorded. Any subsequent modification to the test files will produce a hash mismatch detectable by `--verify` mode.

3. **When** the slug is derived **then** it is generated from the spec title or file name: lowercase, kebab-case, no special characters. If a packet with the same slug already exists, the existing file is overwritten and the previous hash is recorded in a `previous_hash` field for audit trail.

4. **When** `adev-implement` dispatches the implementer subagent **then** it passes the Handoff Block path so the implementer receives the exact test files and verification command without needing to re-read the spec or re-derive the test scope.

5. **When** the Handoff Block is read by any consumer (`--verify`, implementer subagent, `/adev-retro`) **then** the consumer treats the `constraints` field as immutable — it must not modify, relax, or reinterpret the locked constraints.

### Postconditions

- `.context-index/packets/<slug>-tests.md` exists and is readable
- The file's `hash` field matches the SHA-256 of the current test file contents
- The `locked: true` field is present
- The packet directory is created if it did not exist

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Packet directory not writable | Block with filesystem error and path | WRITE_ERROR |
| Test file path listed in block no longer exists on disk | Warn on read — file was deleted after handoff was written | STALE_PACKET |
| Hash computation fails | Block — do not write an incomplete handoff block | HASH_ERROR |
| Slug collision with different test scope | Overwrite. Record `previous_hash` for audit. Log advisory. | — |

### Handoff Block Format

```markdown
---
slug: <kebab-case-slug>
spec: <spec path or "standalone">
locked: true
hash: <sha256-hex>
previous_hash: <sha256-hex or null>
created: <ISO timestamp>
framework: <detected framework name>
---

## Test Files

- <relative path to test file 1>
- <relative path to test file 2>

## Verification Command

```
<exact command to run, e.g. "node --test tests/adev-test-write/red-phase.test.mjs">
```

## RED State Evidence

```
<last 20 lines of test runner output confirming failure>
```

## Locked Constraints

- <constraint 1: e.g. "AssertionError on line 12 must remain — do not change the expected value">
- <constraint 2: e.g. "Mock boundary: only http client at src/lib/http.mjs is permitted">
- <constraint 3: e.g. "Seed data: 3 users seeded before assertion on line 18">

## Mocking Boundaries

| Mock Target | Boundary Type | Justification |
|-------------|--------------|---------------|
| <module/path> | HTTP / DB / filesystem / external-api | <why this is a legitimate boundary> |
```

## System Constitution Reference

- **Principle:** "Minimize external dependencies — prefer Node.js built-ins" — SHA-256 hash is computed with Node.js `crypto.createHash('sha256')`. No external hashing library.
- **Principle:** "Pure ESM — all `.mjs` files" — `write-handoff.mjs` is the companion helper that produces this artifact.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Implement `write-handoff.mjs` | Accepts test file paths, verification command, failure excerpt, constraints, and mocking boundaries. Computes hash, writes packet file. | Small |
| Implement slug generation | Derive kebab-case slug from spec title or filename. Handle collisions by overwriting and preserving `previous_hash`. | Small |
| Write tests for `write-handoff.mjs` | Verify hash computation, file format, overwrite behavior, and error cases. | Small |

## Acceptance Criteria

- [ ] Handoff Block is written to `.context-index/packets/<slug>-tests.md` after every successful RED phase
- [ ] Block contains: `slug`, `spec`, `locked: true`, `hash`, `created`, `framework`, test file list, verification command, RED state evidence, locked constraints, mocking boundaries
- [ ] `hash` is SHA-256 of all test file contents concatenated in path-alphabetical order
- [ ] Re-running `--red` on the same target overwrites the packet and records `previous_hash`
- [ ] Packet directory is created if absent
- [ ] `write-handoff.mjs` uses only Node.js built-ins (`crypto`, `fs`, `path`)
- [ ] All quality gates pass (`npm test`)
- [ ] No constitutional violations introduced
