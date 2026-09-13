## Audit Pass 8: Governance Policy Health

**Goal:** Verify that governance policy files are well-formed and internally consistent.

**Prerequisite check:**

If `.context-index/governance/` does not exist, SKIP this pass entirely. Print:
```
## Governance Policy Health

Skipped — no governance/ directory configured. Run `/adev:init` to set up governance.
```

**Steps (when governance/ exists):**

1. **YAML parsing.** Parse each file (`gates.yaml`, `boundaries.yaml`, `risk-policies.yaml`). Flag PARSE_ERROR on failure.
2. **Gate ID uniqueness.** Check that all gate `id` values in `gates.yaml` are unique. Flag DUPLICATE_GATE_ID if any two gates share an `id`: "Duplicate gate ID '<id>' — second definition ignored."
3. **Tier value validation.** For each gate in `gates.yaml`, verify `tier` is one of `fast`, `integration`, or `e2e`. Flag INVALID_TIER: "Gate '<id>' has invalid tier '<value>', defaulting to fast."
4. **Severity value validation.** For each gate in `gates.yaml`, verify `severity` (if present) is `error` or `warning`. Flag INVALID_SEVERITY: "Invalid severity '<value>' for gate '<id>', defaulting to error."
5. **Empty gates list.** If `gates:` key exists in `gates.yaml` but is empty or null, flag EMPTY_GATES: "gates.yaml has an empty gates list."
6. **Gate executability and test collection.** Run:

   ```
   adev gate doctor --json
   ```

   Do NOT pass `--execute`. The doctor is static by default, which preserves this step's
   long-standing "do not run the command" guarantee, and `--execute` would re-enter gates that
   can themselves reach `/adev:hygiene`.

   The doctor subsumes the binary-on-PATH check this step used to perform by hand and adds four
   more families that a PATH check cannot see: `**` globs that `sh` under-expands (silently
   skipping test files), runner collection gaps, unsubstituted `{{ }}` placeholders, gate
   commands referencing gitignored or nonexistent paths, and gates that appear in no CI
   configuration. Surface every finding from the JSON envelope's `findings` array using its `id`
   and `message`; error-severity findings become unchecked boxes, warnings become notes.

   `gate-doctor/no-gates-configured` means there is nothing to check — report it and move on.
7. **Regex validation.** For each boundary rule, compile the `pattern` as a regex. Flag INVALID_REGEX on failure.
8. **Charter override references.** For each file in `governance/overrides/`, verify the charter exists at `.context-index/specs/features/<slug>/charter.md`. Flag ORPHAN_OVERRIDE if the charter does not exist.
9. **Transition gate references.** For each gate ID in `transitions.*.required_gates`, verify it exists in the `gates` list. Flag MISSING_GATE_REF.
10. **Risk policy completeness.** Verify all three levels (high, medium, low) are defined in `risk-policies.yaml`. Flag INCOMPLETE_POLICY.
11. **Legacy manifest gates.** Read `manifest.yaml`. If a top-level `gates:` section exists, flag LEGACY_GATES: "Legacy gates: section found in manifest.yaml. This is no longer used. Move gate definitions to governance/gates.yaml."
12. **Duplicate manifest keys.** Run `adev manifest lint --json`. Flag each `duplicates` entry DUPLICATE_MANIFEST_KEY: "manifest.yaml declares `<key>` twice — merge the blocks."

**Output format:**
```
## Governance Policy Health

- [x] gates.yaml: valid YAML, 4 gates defined
- [x] boundaries.yaml: valid YAML, 2 rules defined
- [x] risk-policies.yaml: valid YAML, 3/3 levels defined
- [ ] Gate "custom-build": gate-doctor/binary-not-found — "turbo" not on PATH or in node_modules/.bin
- [ ] Gate "test": gate-doctor/glob-under-expansion — pattern 'tests/**/*.test.mjs' matches 451 files
      with true '**' recursion but only 326 under 'sh'; 125 files are silently skipped
- [ ] Boundary "no-direct-db": INVALID_REGEX — unclosed group
- [ ] Override "payments.yaml": ORPHAN_OVERRIDE — no charter at specs/features/payments/
- [x] Transition gate references: all valid

**Actions:**
- [ ] Install turbo or update gate command
- [ ] Replace the shell glob in the test script with an in-runner recursive walk
- [ ] Fix regex pattern in boundary "no-direct-db"
- [ ] Remove orphan override payments.yaml or create the charter
```
