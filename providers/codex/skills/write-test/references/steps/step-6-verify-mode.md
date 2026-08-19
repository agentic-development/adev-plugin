## Step 6: Verify Mode (--verify)

Invoked as: `adev:write-test --verify --packet <path>`

### 6a. Hash Check

```bash
result=$(bash scripts/write-handoff.sh verify "<packetPath>")
# Outputs: PASS or HASH_MISMATCH:<stored>:<computed>
```

- `PASS` → verification complete. Report and stop.
- `HASH_MISMATCH` → proceed to semantic diff (Step 6b).
- Packet not found → block: "Packet not found: `<path>`. Run `--red` first." — `PACKET_NOT_FOUND`
- Test file listed in packet no longer exists → block: "Test file missing: `<path>`. Cannot verify integrity." — `STALE_PACKET`

### 6b. Semantic Diff

Dispatch a `fast`-tier subagent with `Agent({description, prompt, run_in_background: false})` and nothing else:
- The original test file contents (from the Handoff Block's `## Original Test File Contents` section)
- The current test file contents (read from disk)
- The 5 tamper classifications and their detection rules (pass Step 6c verbatim)

If the `## Original Test File Contents` section is absent → report: "Unable to produce line-level diff — Handoff Block was written without original content storage. Check git log for the commit where tests were written to retrieve originals." — `DIFF_UNAVAILABLE`

### 6c. Tamper Classifications

The `fast`-tier subagent compares original vs current line-by-line:

| Classification | Description |
|----------------|-------------|
| `REMOVED` | An assertion was deleted entirely |
| `LOOSENED` | Matcher was weakened: `toEqual` → `toMatchObject`, `toBe(false)` → `toBeFalsy()`, `toHaveLength(3)` → `toBeGreaterThan(0)` |
| `HARDCODED_TO_PASS` | Expected value was changed to match actual output instead of specified behavior |
| `SKIPPED` | Test disabled: `.skip`, `.todo`, `xit`, `xdescribe`, commented-out test block |
| `CONDITIONAL` | Conditional wrapper added around assertion: `if/else` guard, `try/catch` swallowing failure |

**Cosmetic changes (not tamper):** whitespace, comments, variable renames that do not affect assertion logic.

### 6d. Verdict and Report

**Persona adaptation:** Verify report files written to disk use the full format. The chat summary presented to the user should follow the active persona's output rules.

- **All changes cosmetic** → `PASS_WITH_COSMETIC_CHANGES`. Log what changed. No report file written.
- **Any tamper found** → `TAMPERED`. Produce diff report.

**Diff report format** — write to `.context-index/packets/<slug>-verify-report.md` AND print inline:

```markdown
# Verify Report: <slug>

**Status:** TAMPERED
**Packet:** .context-index/packets/<slug>-tests.md
**Verified:** <ISO timestamp>

## Tampered Assertions

### 1. LOOSENED — <test-file>:<line>

**Original:**
```
expect(user).toEqual({ id: 1, name: "Alice", role: "admin" })
```

**Current:**
```
expect(user).toMatchObject({ id: 1 })
```

**Why this is a violation:** toMatchObject allows extra properties and omits name and role checks.

---

## Required Action

Revert the above changes in the test files. Fix the production code to make the original assertions pass.
Do NOT modify the tests — fix the implementation.
```

If report file is not writable → print inline only. Do not block on write failure.

### 6e. Undeclared Mock Check

During `--verify`, also check if the implementer introduced new mocks in test files that are **not** in the Handoff Block's Mocking Boundaries table. Flag each new undeclared mock as `UNDECLARED_MOCK`.

---
