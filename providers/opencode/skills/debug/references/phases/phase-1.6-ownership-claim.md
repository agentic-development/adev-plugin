### Phase 1.6: Ownership Claim

**Goal:** refuse to investigate a bug another live session is already fixing.

This gate exists because it failed once: two agents independently diagnosed and fixed the same p0 command-injection bug an hour apart, opening duplicate PRs. The board carried the signal the whole time — the issue was already `in_progress` — but nothing re-read it at the moment work began, so stale local knowledge won over the shared record. Reproduction (Phase 1) is cheap; investigation (Phase 2) is where the hour goes. Claim in between.

**Resolve the issue id,** in this order:

1. `--issue <id>` if passed.
2. The issue whose `spec_ref` matches the spec resolved in Phase 1.5, if exactly one is open. More than one match is ambiguous — ask the user rather than guessing.
3. No match: skip this phase. Not every bug has a board entry, and inventing one here would violate the board-granularity invariant.

**Claim it:**

```bash
adev issues claim <issue-id> --owner "${USER}/local" --branch "$(git branch --show-current)"
```

- **`0`** — yours. Proceed to Phase 2. Re-claiming as the same owner is idempotent, so resuming a debug session is free. Exit `0` also covers an **inherited expired lease** — claims expire after `tasks.claim_ttl_minutes` (default 240) and a stale one is taken over automatically, with a `takeover` block naming the displaced owner. Surface it: a crashed session that is about to resume still thinks the bug is theirs.
- **`2`** — **refused.** Held by a different owner whose lease is still **live**, or closed. **STOP before Phase 2.** Report the holding `owner`, `claimed_at`, and any recorded `branch`/`pr` so the user can go read that work instead of reproducing it. Do not investigate, do not propose a fix, and never force a live claim over autonomously — that is the exact failure this phase prevents.
- **`1`** — usage error, unknown issue, or `CLAIM_UNSUPPORTED_BACKEND` (a backend with no atomic write). Warn and continue — a backend that cannot check-and-set cannot offer the guarantee, and blocking on it would train bypassing.

If `tasks.backend` is not configured, skip this phase.

Release the claim in Phase 6, once the fix is recorded:

```bash
adev issues release <issue-id> --owner "${USER}/local"
```
