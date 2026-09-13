## Step 4: Test Authoring (RED Phase)

Dispatch a `capable`-tier subagent with `Agent({description, prompt, run_in_background: false})` and nothing else:

- The resolved spec, file interface, or free-form description
- The detected framework, test command, and file naming pattern
- The `## Shared Test Helper Inventory` block from Step 3a, verbatim, when it is non-empty
- All enforcement rules below (pass this section verbatim)

### Deriving Test Contracts

**From `--spec <path>`:** Read the Behavioral Contract section. For each `When...then` statement, derive one or more Test Contracts covering the expected behavior, postconditions, and error cases.

**From `--file <path>`:** Read the file's exported public interface (functions, classes, constants). Derive Test Contracts covering: happy path per export, at least one error/edge case per export, and any documented invariants in JSDoc or comments.

**From free-form description:** Treat the description as the specification. Derive Test Contracts from the described behaviors. Record `spec: inline-description` in the Handoff Block.

### Seed Data Rule

Every assertion must operate on deterministic, explicitly seeded data.

```
Bad:  expect(users.length).toBeGreaterThan(0)   // depends on runtime state
Good: seed 3 users → expect(users).toHaveLength(3) and check specific values
```

Any assertion against unseeded runtime data is a Gaming Violation — `GAMING_VIOLATION`.

### Gaming Violation Detection

Run `scripts/detect-gaming.sh` on each test file before producing the Handoff Block:

```bash
violations=$(bash scripts/detect-gaming.sh test-file1.test.ts test-file2.test.ts)
# Returns JSON array of violations. Exit 0 always — read the JSON for results.
```

- Any `blocking` violation → block with the violation type, file path, line number, and matched text. Error code: `GAMING_VIOLATION`. Do not produce the Handoff Block until resolved.
- Any `advisory` violation → log with file and line. Do not block.

**The 9 canonical blocking patterns (from `scripts/detect-gaming.sh`):**
- `toBeTruthy()` as sole assertion
- `toBeDefined()` as sole assertion
- `toBeGreaterThanOrEqual(0)`
- `toBeGreaterThan(-1)`
- `.skip(` / `test.skip` / `xit(` / `xdescribe(`
- `try { expect } catch {}` without rethrow
- `if (condition) { expect }` without else branch
- `not.toThrow()` as sole assertion
- Hardcoded expected value mirroring an implementation return value

### Mocking Boundary Declaration

Before writing any mock, classify the dependency:

**Permitted boundaries (must declare one of these four types):**

| Type | Examples |
|------|---------|
| `HTTP` | `fetch`, `axios`, `got`, `node-fetch`, `http.request` |
| `DB` | `pg`, `mysql2`, `mongoose`, `prisma`, `knex`, any ORM/query builder |
| `filesystem` | `node:fs` for production I/O side effects, writes outside project |
| `external-api` | `stripe`, `sendgrid`, `twilio`, third-party SDKs, OAuth providers |

**Internal module mocking is a violation:**

```
Internal (VIOLATION): ../services/user-service.mjs, ../../lib/email.mjs, ../utils/format.mjs
External (permitted): node-fetch, pg, stripe, node:fs (production writes)
```

If a test requires mocking an internal module because it has an unacceptable side effect → mock at the actual external boundary (the HTTP call, DB query, or I/O operation it makes), not the internal module.

Every permitted mock requires a justification. No justification → `MISSING_JUSTIFICATION`.

Record all mocks in the Mocking Boundaries table in the Handoff Block.

Any mock targeting an internal module → block with location, target, and boundary suggestion. Error code: `MOCK_VIOLATION`.

### RED State Verification

After writing tests, run the test command **scoped to the new test files**:

```bash
<framework command> <new-test-file-path>
```

Tests must fail because the required behavior is not yet implemented — **not** because of a syntax error, missing import, or test misconfiguration.

- Tests pass immediately → block: "Tests pass before implementation exists — either the behavior is already implemented or the test does not assert the right thing." — `RED_STATE_FAILED`
- Tests fail for wrong reason (syntax/import error) → fix the test setup. Rerun. Maximum 2 fix attempts. If still failing for wrong reason after 2 attempts → block and report. — `SETUP_ERROR`
- Tests fail for behavioral reasons (missing feature, unimplemented function) → RED state confirmed. Proceed to Step 5.

### Shared Helper Duplication Check (advisory)

After RED state is confirmed and **before** producing the Handoff Block, run one batched check
over every test file just authored:

```bash
adev test-helpers check --file <new-test-file-1> --file <new-test-file-2> --format text
```

`--file` is repeatable and the inventory is built once per invocation, so N files cost one
scan. Each finding names a symbol defined locally whose name already exists in a shared helper
module.

**This is advisory and always exits 0.** Report the findings inline so the author can see them,
then continue. Do **not** block the Handoff Block, do not treat a finding as a Gaming Violation,
and do not rewrite tests solely to silence it — exact-name matching produces false positives
(`cleanup`, `setup`, `run`), and a same-named local symbol is often a legitimately different
thing. If a finding is real, replacing the local definition with an import from the shared
module is the fix.

---
