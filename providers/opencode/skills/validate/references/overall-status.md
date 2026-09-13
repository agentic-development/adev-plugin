## Overall Status

- **PASS:** All dispatched checks (Check 1 quality gates plus the surviving registry — 1.5, 2, 4, and conditionally 8, 9, 11) passed. The implementation is validated.
- **FAIL:** One or more checks failed. The report lists every failure with file references. The user should fix the issues and re-run `/adev:validate`.

### Heuristics on FAIL: prior occurrences of this failure

When the Overall Status is FAIL you still hold the live verdict payload — the consolidated `checks[]` array carrying each check's `id` and `outcome`. Read the ids from that live payload and from nowhere else: the per-check event log records only `validator` and `verdict`, never a `checks[]` array, so this key cannot be derived from it.

First derive the recurrence key, passing one flag per check whose `outcome` is not `PASS`:

```bash
adev heuristics signature --origin validate --check-id <id> [--check-id <id> ...]
```

Pass the ids exactly as the verdict carries them, in any order, duplicates included. Do not sort, de-duplicate, or concatenate them into `--text` — the verb normalizes them itself, and reshaping them here would mint a different key from the stored one.

Then re-query the store with the key the verb printed:

```bash
adev heuristics retrieve --module <charter-module> --signature <sig> --tier summary --format text
```

Stdout is either rendered markdown blocks or the literal sentinel `__NONE__`. When it is not `__NONE__`, inject the blocks into your FAIL output under the heading `## Heuristics — prior occurrences of this failure`, prefixed with: "The following heuristics are lessons learned from past work in this module. Use them as guidance, not as hard rules."

Derive the module slug from the spec's `charter:` frontmatter field — the same slug Step 0 uses. Do not pass `--injection-limit`: because `--signature` is present the verb applies the error-time cap itself. Do not read a limit out of `manifest.yaml` and do not hardcode one.

Skip this step silently, emitting nothing at all about heuristics, when the output is `__NONE__`, when either verb exits non-zero, or when no check has a non-`PASS` outcome — never invent or synthesize a key when there are no failing ids. The step is advisory only: the FAIL verdict and the report are emitted unchanged either way, and this step never blocks, never retries a check, and never edits the verdict.

### Completion token (`/goal`-friendly)

After the Overall Status is known, the **final line** of your chat output for this run MUST be the completion token — emit it verbatim:

- Overall PASS → `ADEV-VALIDATE: PASS`
- Overall FAIL → `ADEV-VALIDATE: FAIL`

Rules: emit it exactly once, as plain text (no code fence, no backticks, no trailing prose after it), regardless of the active persona or verbosity level. This is a transcript-provable marker so Claude Code's `/goal` evaluator can read completion from the transcript (see `.context-index/specs/cross-cutting/completion-tokens/`). Subagents dispatched by this skill MUST NOT emit a completion-token line — only this top-level skill does.
