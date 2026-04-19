# Validation Report: configurable-reviewers

> **Date:** 2026-04-19
> **Spec:** .context-index/specs/features/review/configurable-reviewers.md (rev 3)
> **Plan:** .context-index/specs/features/review/configurable-reviewers.plan.md
> **Verdict:** PASS_WITH_NOTES (initial validation found FAIL on AC #8 — remediation landed in the same commit as this report)

## Check 1: Quality Gates

- `npm test` → **PASS** (1173/1173).

## Check 2: Spec Compliance (pre-remediation)

| AC # | Criterion | Status | Evidence |
|------|-----------|--------|----------|
| 1 | Zero-config byte-identical `.review.md` | PARTIAL | Requires live subagent dispatch to verify bytes. Loader returns correct 3 bundled defaults (`templates/review-specs/defaults.yaml`; `tests/governance/review-config.test.mjs:27-38`). |
| 2 | `enabled: false` excludes reviewer | PASS | `review-config.mjs:273-275`; `tests:40-54`; eval `configurable-governance.test.mjs:174-183` |
| 3 | Project `dispatch: triggered` reviewer dispatches on score ≥ min_score | PASS | `shouldDispatch` in `review-config.mjs:155-181`; `tests:201-223`; eval `:185-197` |
| 4 | Package-mode runner+adapter two-stage | PARTIAL | Loader resolves skill + adapter paths (`review-config.mjs:328-348`; `tests:131-155`). Pipeline described in `SKILL.md:116-122`. Requires live dispatch for end-to-end. |
| 5 | `severity_cap` clamps blocker → warning | PASS | `applySeverityCap` in `review-config.mjs:186-197`; `tests:226-244`; eval `:199-205` |
| 6 | Missing profile reference fails load | PASS | Posture check path bubbles profile-load errors (`review-config.mjs:111-115`) |
| 7 | Profile-disallowed tool call → warning finding | PARTIAL | Harness-level enforcement; documented in `SKILL.md:135`. No library code. |
| **8** | **Adapter parse failure → sanitized suggestion (redact, 8 KiB, path-normalize)** | **FAIL** | **Behavior 33 described in `SKILL.md:127-133` prose only. No helper in `lib/governance/` applies redaction, 8 KiB truncation, or path normalization. SEC-1 data-exposure vector not actually closed.** |
| 9 | Traversal / symlink guards on `prompt`/`package.skill`/`package.adapter` | PASS | `resolveReviewerPath` rejects `..` pre-resolution, realpath + symlink check (`review-config.mjs:397-438`); tests + eval |
| 10 | Profile not read-only-compat → load fail | PASS | `checkReadOnlyCompatible` in `review-config.mjs:447-469`; tests + eval `implementer-reviewer` negative |
| 11 | Manifest specialists deprecation advisory + in-memory conversion | PASS | `review-config.mjs:80-102`; `tests:174-187` |
| 12 | Cross-plugin (`plugin:<other>:...`) fails load | PASS | `review-config.mjs:359-364`; `tests:85-98`; eval negative |
| 13 | Multi-repo consumer-repo-local env | PARTIAL | Profile-layer verified (`configurable-governance.test.mjs:120-136`). No reviewer-scoped workspace integration test. |
| 14 | All quality gates pass | PASS | Check 1 |
| 15 | No constitutional violations | PASS | All `.mjs`, zero new deps |

## Summary (pre-remediation)

- PASS: 10
- PARTIAL: 4
- **FAIL: 1 (AC #8 — sanitized fallback not implemented)**

## Remediation (landed with this report)

Implemented `sanitizeAdapterOutput(rawText, { redactor, contextIndexRoot, pluginRoot, homeDir })` in `lib/governance/review-config.mjs`:

1. Run the raw text through the reviewer's `redactor` (from `resolveProfile`) — covers the profile `redactionSet` via the cross-cutting pipeline.
2. Normalize absolute paths matching `contextIndexRoot`, `pluginRoot`, or `$HOME` to repo-relative / `plugin:` form.
3. Truncate to 8192 bytes; append `"\n…[truncated <N> bytes of adapter output — see dispatch record for full text]"` to the visible portion.
4. Return `{ visible, full }` — `visible` for `.review.md`; `full` (post-redact, pre-truncate) for the dispatch record only.

Unit test suite at `tests/governance/review-config.test.mjs` covers:
- Redaction applied before truncation
- 8 KiB truncation tail marker present
- Absolute `.context-index/` paths normalized
- Absolute plugin-root paths normalized to `plugin:` form
- Home-dir paths normalized to `~/`
- Full output retained in `full` (pre-truncate)

After the remediation commit, AC #8 → PASS.

## Overall Verdict (post-remediation): **PASS_WITH_NOTES**

Remaining ACs (#1, #4, #7, #13) are runtime-dispatch behaviors that require a live `/adev:review-specs` execution (not library-level testable).

---

last-validated-revision: 3
file-sha: a36d06f9ddb974a4f68505a6818ed79ba017ce1e
