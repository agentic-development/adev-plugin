### Check 1: Quality Gates (fail-fast, tiered)

#### Gate Source Resolution

1. Use the resolved gate list computed in Step 0. It is the project's materialized `governance/gates.yaml`, not a run-time merge with the domain overlay (Task 11 removed that). If the list is non-empty, group gates by `tier` into ordered execution: fast → integration → e2e. Execute as sub-checks 1a/1b/1c. Each gate has fields: `id`, `name`, `kind`, `tier`, `command`, `scope`, `required`, `severity`, `triggers`, `group` (e2e-only), and `command_sha` — the SHA-256 of the gate's resolved argv, computed by the loader (`computeCommandSha` in `lib/gates/gate-sets.mjs`) and carried on the `adev domain load-gates` output. Use the value as given; never recompute it.
2. If the gate list is empty and `governance/gates.yaml` does not exist → SKIP Check 1 with advisory: "No governance/gates.yaml found. Quality gates are not configured. Run `/adev:init` to set up gates, then `adev governance materialize --registry gates` to adopt the domain's."

**Legacy gate detection:** If `manifest.yaml` contains a `gates:` section, emit a migration warning: "Legacy gates: section found in manifest.yaml. This is no longer used. Move gate definitions to governance/gates.yaml." This warning is informational and does not affect Check 1 execution.

**Default rules:**
- Gates without explicit `tier` default to `fast`
- Gates without explicit `kind` default to `deterministic`
- Default severity: `error` for fast/integration, `warning` for e2e
- `required: false` forces `severity: warning` regardless of other settings
- `kind: probabilistic` gates → skip with note: "Gate '<id>' is probabilistic — requires manual or eval-based verification."
- Probabilistic with `command` → ignore command, emit WARN: "Gate '<id>' is probabilistic but has a command — command ignored."
- E2E `group: smoke` runs before `group: full`, with independent severity defaults (error for smoke, warning for full). If smoke fails with error severity, skip full.

**Misconfiguration warnings:**
- Empty gates list → SKIP Check 1 with advisory.
- Invalid severity value → default to `error` with WARN.
- Invalid tier value → default to `fast` with WARN.
- Duplicate gate IDs → second definition ignored with WARN.

#### Tiered Execution (sub-checks 1a/1b/1c)

When tiered gates are resolved from `governance/gates.yaml`, Check 1 splits into sub-checks:

**Check 1a: Fast Tier** — Run all fast-tier gates sequentially. If a gate exits non-zero with `severity: error`, skip remaining fast gates (intra-tier fail-fast), skip Checks 1b, 1c, and 2–10. Report FAIL. If `severity: warning`, record WARN and continue to next gate. If no gates are assigned to the fast tier, skip with note: "fast tier — no gates configured, skipped."

**Check 1b: Integration Tier** — Run all integration-tier gates sequentially. Same fail-fast and severity semantics as 1a. If no gates are assigned to the integration tier, skip with note: "integration tier — no gates configured, skipped."

**Check 1c: E2E Tier** — Run all e2e-tier gates sequentially. Gates in `group: smoke` run before `group: full`. Smoke default severity: `error`; full default severity: `warning`. If smoke fails with error severity, skip full. If no gates are assigned to the e2e tier, skip with note: "e2e tier — no gates configured, skipped." E2E gate commands invoke Playwright (or any test runner) via shell — they are independent of Check 11's Playwright MCP visual verification.

**Output truncation:** Command stdout/stderr in failure reports is truncated to the last 8 KB per stream.

**`--fix` behavior:** Auto-fix applies only to the fast tier (Check 1a). If `--fix` was passed and a fast-tier lint or formatting gate fails, attempt auto-fix (e.g., `npx eslint --fix`). Re-run the gate. If it passes, record as PASS (auto-fixed). Integration and E2E commands are never auto-fixed.

**Check 11 exception:** If an error-severity tier fails and Checks 2–13 are skipped, Check 11 (Visual Verification) still follows its existing independent trigger rules — if the spec references UI files, note that visual verification is pending.

**Tier summary:** After Check 1 completes (all tiers pass or warning-only failures), include a tier summary in the report showing each tier's status, commands run, and duration per command. Use GateResult format: `Check 1a (fast): npm test — PASS (2.1s)`.

**If all tiers pass (or only warning-severity tiers fail):** Proceed to Check 2.

#### Per-Gate Outcome Attestation

After the tiers have run, Check 1 emits **exactly one** `validator_report` for the whole check, carrying one outcome per gate in the resolved set. The substantive procedure lives in `skills/validate/checks/validate.check-1-quality-gates.md`; the normative rule is here:

**Check 1 is the only sanctioned writer of `gate_outcomes`.** No other check, no subagent, and no other skill may emit a `validator_report` carrying that field. A `gate_outcomes` record is read downstream as evidence that the named gates actually executed against the code the spec's source manifest pins — a record from any other producer asserts an execution that did not happen.

Each outcome is `{ id, verdict, tier, command_sha }`: `id` and `command_sha` verbatim from the resolved gate set, `verdict` one of `pass` | `fail` | `skip` (lowercase), `tier` the gate's tier. Gates that never ran because an earlier gate failed are recorded as `skip` — omitting them is indistinguishable from never declaring them. `--manifest-sha` carries the `sha` from the spec's `source-manifest` frontmatter block, omitted when the spec has no such block.

Prefer the `@<path>` form of `--gate-outcomes` (a JSON file inside the project root): a non-trivial gate set exceeds what an argv element reliably carries.

Emit it once for the whole check — never once per gate.
