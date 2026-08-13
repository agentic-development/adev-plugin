---
spec: .context-index/specs/features/hooks/lifecycle-gate-consolidation.spec.md
spec-revision: 2
status: ready
created: 2026-08-12
---

# Implementation Plan: Lifecycle-Gate Hook Consolidation

Tasks map 1:1 to the spec's Migration Path (rev 2). Strict ordering; every task ends with the full `tests/hooks/` suite green and, from Task 2 onward, the golden-fixture equivalence gate green. TDD per task: write/extend the named tests first where a new behavior or file exists; golden fixtures serve as the regression oracle for pure moves.

| # | Task | Files | TDD expectation | Verify |
|---|---|---|---|---|
| 1 | Golden-fixture capture harness: run the three existing gate hooks across (level off/warn/confirm/block × surface edit/bash/advisory × plugin/settings.json invocation × advisory counter positions 1..interval) and snapshot stdout + exit codes | `tests/fixtures/lifecycle-gate-golden/`, `tests/hooks/lifecycle-gate-equivalence.test.mjs` (new; initially asserts old scripts reproduce their own snapshots) | Harness test first — it must pass against the UNMODIFIED scripts before anything moves | Snapshots committed; equivalence test green |
| 2 | `_parse-stdin.sh`: hoist `find_context_index()` (5 consumers switch to sourced copy); key-name allowlist before `eval` | `hooks/_parse-stdin.sh`, `hooks/context-preflight.sh`, 3 gate hooks, `hooks/session-start.sh`; `tests/hooks/parse-stdin.test.mjs` (new: allowlist rejection case, injection-shaped key) | Allowlist test first (malicious key not exported) | Hook suite + equivalence green |
| 3 | Merge checker shims → `hooks/_lifecycle-gate-check.mjs --surface file\|bash`; delete the two old shims | `hooks/_lifecycle-gate-check.mjs`, gate hooks' dispatch lines, checker tests | Extend checker tests for both surfaces + unknown-surface fail-open first | Hook suite + equivalence green |
| 4 | Consolidated `hooks/lifecycle-gate.sh <surface>`; re-register 3 matchers in `hooks.json` with argv args; delete 3 old gate scripts; rework registration test to matcher/position semantics | `hooks/lifecycle-gate.sh`, `hooks/hooks.json`, `tests/hooks/lifecycle-gate-registration.test.mjs`, delete 3 scripts | Registration-semantics test first; equivalence test flips to compare consolidated output vs Task-1 snapshots | Byte-diff equivalence across full matrix; 216-baseline suite |
| 5 | Fold `context-read-tracker.sh` into `session-capture.sh` (Read branch); deregister + delete; migrate its 6 tests into the session-capture suite | `hooks/session-capture.sh`, `hooks/hooks.json`, tests migrated | Migrated tests first (against session-capture path) | Migrated tests + context-preflight consumer tests green |
| 6 | **Build `tool-use` capture path in `lib/session-capture.mjs`** (HIGH RISK): port JSONL append, provider resolution, issue/epic enrichment, token-usage cursor from the shell program; entry schema byte-compatible | `lib/session-capture.mjs`, `tests/lib/session-capture-tool-use.test.mjs` (new) | Schema byte-compat tests FIRST, written against fixtures captured from the current shell writer's real output | New unit tests green; fixture diff empty |
| 7 | Switch `session-capture.sh` to delegate to the lib path; delete the inline program | `hooks/session-capture.sh` | End-to-end hook test diffing `.session-tracking.jsonl` entries pre/post | Hook tests + fixture diff green |
| 8 | Regenerate provider hook projections; parity tests | `providers/copilot/hooks.json` etc. | — (generated) | `tests/copilot-hooks-sync.test.mjs` + sibling parity tests |

Constraints carried from the spec: hook protocol untouched (constitution P4); ADR 0016 (no state moves out of `.context-index/`); no new dependencies; no new inline Node (net removal); fail-open surfaces must emit stderr diagnostics.
