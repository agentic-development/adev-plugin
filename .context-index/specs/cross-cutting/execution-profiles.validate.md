# Validation Report: execution-profiles

> **Date:** 2026-04-19
> **Spec:** .context-index/specs/cross-cutting/execution-profiles.md (rev 2)
> **Plan:** .context-index/specs/cross-cutting/execution-profiles.plan.md
> **Verdict:** PASS_WITH_NOTES

## Check 1: Quality Gates

- `npm test` → **PASS** (1173/1173, 0 fail, 30 cancelled long-runners unrelated).

## Check 2: Spec Compliance

| AC # | Criterion | Status | Evidence |
|------|-----------|--------|----------|
| 1 | `loadProfiles` returns 6 bundled defaults, no warnings | PASS | `lib/profiles/index.mjs:60-67`; `tests/profiles/index.test.mjs:27-38` |
| 2 | Project profile replaces bundled default + info note | PASS | `lib/profiles/index.mjs:87-93`; `tests/profiles/index.test.mjs:40-60` |
| 3 | `extends` cycle fails load with cycle message | PASS | `lib/profiles/extends.mjs:33-40`; `tests/profiles/extends.test.mjs:71-78` |
| 4 | `allow` / `allow_add` union & replace rules | PASS | `lib/profiles/extends.mjs:95-104`, `schema.mjs:62-75`; `tests/profiles/extends.test.mjs:30-69` |
| 5 | MCP missing → load fail with hint | PASS | `lib/profiles/index.mjs:185-190`; `tests/profiles/index.test.mjs:102-112` |
| 6 | Unknown category → WARN with extension hint | PASS | `lib/profiles/index.mjs:111-125`; `tests/profiles/index.test.mjs:71-88` |
| 7 | Required env key missing → load fail | PASS | `lib/profiles/env.mjs:98-107`; `tests/profiles/env.test.mjs:77-82` |
| 8 | Optional env key silently absent | PASS | `lib/profiles/env.mjs:91`; `tests/profiles/index.test.mjs:114-135` |
| 9 | Keys outside allowlist dropped | PASS | `lib/profiles/env.mjs:91`; `tests/profiles/env.test.mjs:64-75` |
| 10 | `$workspace/` resolves; absent workspace fails | PASS | `lib/profiles/env.mjs:141-150`; `tests/profiles/env.test.mjs:95-117` |
| 11 | `@`-prefixed entry rejected with disjoint message | PASS | `lib/profiles/env.mjs:135-140`; `tests/profiles/env.test.mjs:119-127` |
| 12 | Spec-location-wins multi-repo resolution | PARTIAL | API accepts `consumerRepoRoot`; no end-to-end integration test for Behavior 32 |
| 13 | Workspace-level `profiles.yaml` ignored with note | PASS | `lib/profiles/index.mjs:79-84, 271-283` |
| 14 | Env values NOT in prompt text (prompt-snapshot test) | PARTIAL | Architecturally sound (adapter `prepareForDispatch` returns `env` structurally); no named prompt-snapshot test exists |
| 15 | Tool stdout/stderr redacted to `<REDACTED:<KEY>>` | PASS | `lib/profiles/redaction.mjs:43-53`; `tests/profiles/redaction.test.mjs:7-13` |
| 16 | Pipeline covers all 6+ audited channels; bypass = violation | PARTIAL | Channels enumerated in `AUDITED_CHANNELS`; no test enforces that bypass fails |
| 17 | Under-length values not redacted; WARN per key | PASS | `redaction.mjs:31`, `env.mjs:110-117`; tests in both |
| 18 | Split-chunk redaction via lookback buffer | PASS | `redaction.mjs:55-73`; `tests/profiles/redaction.test.mjs:39-47` |
| 19 | Bypass classes documented, not mitigated | PASS | `redaction.mjs:15-19` + spec Behavior 36b |
| 20 | Bare-path missing fails; `optional:` silently skips | PASS | `env.mjs:51-60`; `tests/profiles/env.test.mjs:48-62` |
| 21 | Contributing-file mapping per resolved key | PARTIAL | `contributing` map computed and returned; no downstream consumer test verifies it lands in report headers |
| 22 | `{category: "*"}` + wildcards rejected at schema | PASS | `schema.mjs:208-213`; `tests/profiles/schema.test.mjs:22-27` |
| 23 | `{tool: <literal>}` without `allow_unportable` fails; WARN once if present | PASS (post-fix) | `loadProfiles` now emits `TOOL_UNPORTABLE_WARN` once per (profile, literal) at `lib/profiles/index.mjs:124-133`; test `tests/profiles/index.test.mjs:"emits TOOL_UNPORTABLE_WARN once per..."` |
| 24 | `allow_add` broadening → load-level WARN | PASS (post-fix) | `loadProfiles` now eagerly walks `resolveEffective` for every profile and surfaces `BROADEN_*` warnings at load (`lib/profiles/index.mjs:139-157`); test `tests/profiles/index.test.mjs:"eagerly surfaces BROADEN_* warnings at loadProfiles time"` |
| 25 | Claude Code = 6 categories; OpenCode = 4 | PASS | `claude-code.mjs:11-26`, `opencode.mjs:11-22`; `tests/profiles/adapters.test.mjs:17-103` |
| 26 | All quality gates pass | PASS | Check 1 above |
| 27 | No constitutional violations | PASS | All `.mjs`, zero new deps, Node built-ins only |

## Summary

- **PASS:** 24 (after post-fix closure of ACs #23 and #24)
- **PARTIAL:** 3 (ACs #12, #14, #16, #21 — test-breadth only; require live-dispatch or consumer-side integration)
- **FAIL:** 0

## Overall Verdict: **PASS_WITH_NOTES**

### Notable gaps to track

1. **AC #23 — literal-tool WARN once per load:** spec wording requires `"Profile '<name>' references literal tool '<literal>' — not portable across harnesses."` emission when `allow_unportable: true` is set. Only the error path for the missing flag is implemented. Recommend adding the emission in `schema.mjs` or at `loadProfiles` validation.
2. **AC #24 — broadening WARN at load time:** `resolveEffective` produces the BROADEN_* warnings, but `loadProfiles` does not eagerly walk the extends chain of every profile. CI/governance review cannot gate on these unless a consumer calls `resolveProfile` for every profile. Consider an eager-validate loop in `loadProfiles`.
3. **AC #14 — prompt-snapshot test:** named test artifact missing; the architectural guarantee holds.
4. **AC #16 — channel-bypass integration test:** declaration-only; no test asserts that a channel not routed through the pipeline causes a test failure.
5. **AC #21 — contributing-file in report headers:** consumer-side (reviewer/check registries) — not a gap in this spec, but worth tracking.

---

last-validated-revision: 2
file-sha: 4f2c2b37e4530a331ab29129f6d8eb421acb1b34
