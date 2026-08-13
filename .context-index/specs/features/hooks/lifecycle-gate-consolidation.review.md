# Review — lifecycle-gate-consolidation.spec.md

- tier: quick (single synthesized reviewer: structural + security + consistency)
- date: 2026-08-12
- spec revision reviewed: 1
- verdict: BLOCK

## Blockers

See lifecycle-gate-consolidation.blockers.md (2 entries: capture-delegation-target-missing, dispatch-stdin-premise-unverified).

## Advisory notes (do not block)

1. Advisory-throttle cadence: lifecycle-gate-advisory.sh:80-96 keeps a stateful `.advisory-counter` emitting every Nth call — add a counter/interval dimension to the equivalence-fixture matrix for the advisory surface.
2. Capture golden output fixtures BEFORE step 3 deletes the three gate scripts — existing tests assert exit code + substring, not byte-diff; post-deletion there is no source of truth to diff against.
3. Test migration is more than path updates: lifecycle-gate-registration.test.mjs asserts ordering by script filename (same filename in 3 matchers after consolidation → rework to matcher/position semantics); context-read-tracker.test.mjs (6 tests) needs explicit disposition.
4. _parse-stdin.sh eval hardening (pre-existing, opportunistic): keys from tool_input are interpolated unsanitized into export statements — allowlist key names (^[A-Za-z_][A-Za-z0-9_]*$) while touching the file; new exports must use fixed literal names.

## Claim verification summary

Verified: shared skeleton + line counts; find_context_index ×5; read-tracker subset + safe ordering (consumer reads on a later PreToolUse, intra-batch order irrelevant); hook ordering within matcher groups is load-bearing and tested; protocol boundary correctly avoided.
Refuted: lib/session-capture.mjs per-tool-call entry path (blocker 1).
Partial/unverified: plugin-mode stdin field presence (blocker 2); byte-identical fixtures exist (to-be-built — sequencing note 2).
