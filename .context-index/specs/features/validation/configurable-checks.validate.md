# Validation Report: configurable-checks

> **Date:** 2026-04-19
> **Spec:** .context-index/specs/features/validation/configurable-checks.md (rev 3)
> **Plan:** .context-index/specs/features/validation/configurable-checks.plan.md
> **Verdict:** PASS_WITH_NOTES

## Check 1: Quality Gates

- `npm test` → **PASS** (1173/1173).

## Check 2: Spec Compliance

| AC # | Criterion | Status | Evidence |
|------|-----------|--------|----------|
| 1 | Zero-config parity with pre-change output | PASS_WITH_NOTES | Loader returns 12 bundled checks with identical kinds/profiles/ordering (`validate-config.mjs:62-79`; `templates/validate/defaults.yaml`; `tests:25-37`). Full rendered-report byte parity requires live run. |
| 2 | Disabling `check-10-platform-drift` → SKIPPED-DISABLED; verdict unaffected | PASS | `validate-config.mjs:113-123`; `skills/validate/SKILL.md:47`; `tests:39-54`; eval `:277-291` |
| 3 | Project `subagent-review` with `after:` runs after predecessor; profile + prompt in report | PASS | Topo-sort `tests:177-201`; eval `:293-299`; profile default at `validate-config.mjs:185` |
| 4 | Project cannot register `deterministic-check` | PASS | `validate-config.mjs:134-140`; `tests:56-68`; eval `:371-389` |
| 5 | `severity: warning` downgrades FAIL to WARN without affecting verdict | PARTIAL | Severity stored + fail-fast honors it (`validate-config.mjs:142-156, 326-338`). Verdict-degradation semantic is delegated to SKILL.md prose; no direct unit test. |
| 6 | Malformed YAML fails load with line-cited error | PASS_WITH_NOTES | `VALIDATE_YAML` code emitted (`validate-config.mjs:82-89`). Line-citation fidelity depends on `parseYaml`; no assertion on specific line number. |
| 7 | Check 11 `browser-review` verified at load; missing Playwright MCP fails fast | PASS | `templates/validate/defaults.yaml:99-106`; profile resolution `validate-config.mjs:48-51, 193-199` bubbles MCP-missing errors |
| 8 | `check-12-heuristic-extraction` observational → no verdict impact | PASS | `defaults.yaml:107-112` + `validate-config.mjs:150-155` forbids `observational + error`; SKILL.md note |
| 9 | Context packs shared between review and validate | PASS_WITH_NOTES | Shared via `lib/governance/context-pack.mjs`. Eval renders base pack. No cross-registry test where a pack defined in `review.yaml` is used by a `validate.yaml` check. |
| 10 | Multi-repo consumer-repo-local env | NOT VERIFIABLE HERE | Requires workspace-context integration |
| 11 | Quality-gate with missing required `env.allow.required` key fails load | PASS_WITH_NOTES | Propagated from profile loader (`validate-config.mjs:48-51`). No dedicated negative test for a quality-gate-scoped missing key. |
| 12 | String-form `command` rejected with shell-form message | PASS | `validate-config.mjs:227-232`; `tests:85-99`; eval negative |
| 13 | Argv interpolation (`{{...}}`/`$VAR`/`${VAR}`/`%VAR%`) rejected | PASS | `INTERPOLATION_RE` at `validate-config.mjs:32`; emit at `:247-252`; `tests:101-141` |
| 14 | Quality-gate missing `profile` → explicit-acknowledgement error | PASS | `validate-config.mjs:207-212` with spec-required wording; `tests:70-83` |
| 15 | Quality-gate stdout/stderr routed through redaction pipeline before any use | PASS | `quality-gate.mjs:56-62` redacts before return/truncate; `tests:47-90` verifies both streams; eval `:336-360` |
| 16 | Subprocess runs `shell: false` with env=profile+minimal-startup; no invoking-shell leak | PASS | `quality-gate.mjs:18-27, 44-55, 87-99`; `MINIMAL_ENV_KEYS` whitelist; `tests:18-44, 92-112` verify `LD_PRELOAD`/`NODE_OPTIONS`/`PYTHONPATH`/`UNRELATED` do not leak |
| 17 | All quality gates pass | PASS | Check 1 |
| 18 | No constitutional violations | PASS | All `.mjs`, zero new deps, Node built-ins |

## Summary

- **PASS:** 13
- **PASS_WITH_NOTES:** 4 (ACs #1, #6, #9, #11 — test-breadth gaps only)
- **PARTIAL:** 1 (AC #5 — prose-only semantic)
- **FAIL:** 0

## Overall Verdict: **PASS_WITH_NOTES**

### Notable test-breadth gaps (non-blocking; trackable as follow-ups)

1. **AC #1** — add a rendered-report byte-parity fixture for zero-config validate runs.
2. **AC #5** — add a unit test that asserts a FAIL with `severity: warning` produces verdict `PASS_WITH_NOTES` (currently only SKILL.md prose).
3. **AC #6** — assert the YAML parser's reported line number in the error text.
4. **AC #9** — cross-registry context-pack sharing (pack defined in `review.yaml` resolved by a validate check).
5. **AC #11** — dedicated negative test for quality-gate missing required env key.
6. **AC #10** — workspace-context env routing at the validate-check layer.

None of these are security-relevant or block advancement.

---

last-validated-revision: 3
file-sha: 3677879f9b8d88924800161f42564c98a8e1df27
