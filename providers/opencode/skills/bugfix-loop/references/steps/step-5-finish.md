## Step 5: Finish (terminal turn only)

```bash
adev bugfix-loop finish --run-id <run_id> --status <complete|budget_exhausted|blocked> --json
```

Read `degraded_sync_note` from the JSON result — this reflects whatever `adev tracker-sync inbound` (Step 0) wrote into the same run-state file over the course of this run, not a placeholder. If non-null, print `GitHub sync degraded during this run: <degraded_sync_note>` as the line immediately before the token — the token itself is still unconditionally the literal last line.

Reprint the full running summary table (BEH-6) from the result's `summary_table` field — one row per bug attempted this run — before the token. This is a full reprint of everything Step 4 already printed incrementally, not a new computation.

Print `ADEV-BUGFIXLOOP: <token-from-result>` as the **final line** (the last line, verbatim, with no trailing prose) of this turn's output — one of:

- `ADEV-BUGFIXLOOP: COMPLETE` — board drained, no eligible bugs remain
- `ADEV-BUGFIXLOOP: BUDGET_EXHAUSTED` — `--max-bugs`/`--max-turns` hit while eligible bugs remain
- `ADEV-BUGFIXLOOP: BLOCKED` — a structural failure halted the run before any bug was attempted

**Persona-exempt** (like `ADEV-BUILD`/`ADEV-VALIDATE`/`ADEV-DEBUG` — `skills/using-adev/SKILL.md`'s Persona Output Override carve-out names it explicitly). **Excluded from spine-skill chaining** — no "Next Step in the Lifecycle" footer follows this token (`single-front-door.spec.md`).
