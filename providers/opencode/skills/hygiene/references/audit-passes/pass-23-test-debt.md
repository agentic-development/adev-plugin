## Audit Pass 23: Test Debt

**Goal:** Surface accreted debt in the *test suite itself*. No other pass looks at tests, and `/adev:codehealth` cannot: its detection passes subtract `hygiene.coverage_exclude`, whose `tests/**` entry makes test debt invisible by construction. This pass deliberately does NOT apply `coverage_exclude` — `hygiene.test_debt.exclude` is its only exclusion key.

**Layer 1 posture (non-blocking):** every finding is a *candidate for human review*, never a defect. Severity (`error` / `warn` / `info`) conveys triage priority only; the pass never gates the hygiene exit code. These are heuristics with known false-positive classes — see the precision table in the spec before acting on a finding in bulk.

**Steps:**

1. Run the pass:

```bash
adev test-debt scan --json
```

2. Optionally narrow the scan with `--root <dir>` (a subtree of the project root; it does not establish the root) or restrict to a single detector with `--detector <CODE>`.
3. Read `scannedFileCount`, `verdict`, `summary`, `headerNotes`, and `findings` from the returned JSON. Surface `headerNotes` in the report header (missing manifest, absent `hygiene.source_roots`, unreadable files).
4. Render findings grouped by detector code in the standard hygiene table.

**Detector codes:**

| Severity | Code | Trigger | Resolution Hint |
|---|---|---|---|
| `warn` | `APPEND_CHAIN` | ≥ `append_chain_threshold` (default 4) distinct test files reference the same source module | Review whether the suites are intentionally partitioned or were appended one task at a time |
| `warn` | `REV_NUMBERED` | Test basename carries a revision marker (`rev\d+` by default; prefixes configurable) | Consolidate the revisions into one suite |
| `warn` | `PLAN_TASK_STRUCTURED` | A test declaration's title contains a literal `plan-task <N>` or `Task <N>` | Rename the test after the behavior it verifies, not the plan task that produced it |
| `error` | `DEAD_TEST_REFERENCE` | A test references a resolvable source path under `hygiene.source_roots` that does not exist | Check whether the target moved or was removed; the test may be exercising nothing |
| `info` | `PROSE_ASSERTION` | Test reads a `.md` artifact and ≥ `prose_ratio_threshold` (default 0.5) of its assertions are containment checks | Consider whether the behavior can be asserted directly instead of through prose |

**Configuration** (`manifest.yaml`, all keys optional): `hygiene.test_debt.{enabled, test_globs, exclude, append_chain_threshold, prose_ratio_threshold, rev_numbered_prefixes}`.

**Output format:**
```
