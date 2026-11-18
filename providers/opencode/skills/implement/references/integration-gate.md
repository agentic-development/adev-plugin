<!-- Companion to skills/implement/SKILL.md. Extracted from the SKILL body
     because implement exceeded the 65,536-byte cap the Copilot provider
     enforces (lib/providers/copilot/skill-validator.mjs). Content is
     verbatim; only the heading level changed. Loaded conditionally — see
     the pointer stub in SKILL.md. -->

# Step 2-post: Integration Gate

After all tasks are complete, run the end-of-implement gates once.

1. Resolve the gate set from the **merged** gate list — domain gates merged with the project's governance gates — via the CLI:

   ```bash
   adev domain load-gates --module <module-slug> [--charter <charter-path>] --changed-since merge-base
   ```

   This is the same source `/adev:validate` Check 1 uses, so both integration-gate consumers see the same gates. Surface any loader `warnings` (`INVALID_GATE`, `GATE_OVERRIDE`) in the step output rather than swallowing them — an `INVALID_GATE` naming a gate whose command is still the unwired sentinel is the actionable signal that a declared tier was never seeded.

   **Select the end-of-implement gates:**
   - A merged entry that declares `triggers` is selected when its `triggers` include `post-implement`, whatever its tier. This is what lets a project move a slow suite out of the per-task loop: `triggers: [post-implement]` runs it here once instead of after every task.
   - A merged entry with no `triggers` (the domain starters and extension overlays declare none) falls back to `tier: integration`. A gate that omits `tier` is `fast` and is not selected by this fallback.
   - **Already ran against this tree:** a gate with `__source: governance` whose `triggers` also include `post-task` was just run by the last task's Step 2h, against the same tree. After a serial or batched run, record it as `skipped: ran in the last task's Step 2h against the final tree` and do not run it again. After `--parallel`, run it: Step 2h ran inside each group's worktree, and nothing has yet gated the merged result. The rule is limited to `__source: governance` because Step 2h reads only `governance/gates.yaml`, so a domain gate was never run per task.

   - **Path scope:** a selected gate with `applies: false` declares `paths` and nothing this run changed matches them. Record it as `skipped: <skip_reason>` and do not run it.

   If nothing is selected, skip this step silently (Step 3 follows Step 2 directly).
2. **Argv guard.** Execute only gates that are deterministic and carry a non-empty argv-list `command`. The merged list **drops `kind`**, so an entry with no `kind` is treated as `deterministic` (the same default `/adev:validate` states) — never require a literal `kind: deterministic` on a merged entry, which would skip every integration gate. Any gate whose `command` is empty, absent, or not an argv list is recorded as **skipped** with a named reason (for example, `skipped: command is the unwired sentinel — run /adev:init or set the command in governance/gates.yaml`) and nothing is spawned for it. Gate commands execute without shell interpolation, consistent with the argv-only contract.
3. If `--task <N>` was passed (single-task re-run), skip this step. Integration gates only run when all tasks complete in a full plan execution.
4. **E2E exclusion:** Only `post-task` gates (per task, Step 2h) and the gates selected above (this step) execute during implementation. The E2E tier is excluded from `/adev:implement`, even when an e2e gate declares `post-implement` — E2E gates execute only during `/adev:validate` Check 1c.

**Execute gates sequentially.** Each gate's severity is its own `severity` field when present; a gate that omits `severity` inherits its tier's default (`error` for the fast and integration tiers). A gate with `required: false` is always `warning`, whatever its explicit severity says. This matches `/adev:validate` Check 1, so both integration-gate consumers agree on both the source and the severity of every gate. (`required` is not observable on a merged entry — the merge narrows each gate — so the `required: false` rule governs wherever the raw gate entry is visible, such as Step 2h and `/adev:validate`'s own resolution; here per-gate `severity` applies with the tier default as fallback.)

**If a gate exits non-zero with `severity: error`:**
- Emit a standalone failure report immediately with command output (truncated to last 8 KB per stream).
- Steps 3 (Final Review), 4 (Completion), and all subsequent steps do not execute.
- Write execution state: `status: "blocked"`, `blockers` set to the integration gate failure details, `nextAction` set to "Fix integration issues and re-run /adev:implement or /adev:validate."
- Report: "Integration gates failed. Fix the integration issues and re-run `/adev:implement --task <last>` or `/adev:validate`."

**If a gate exits non-zero with `severity: warning`:**
- Record the failure as WARN.
- Step 3 (Final Review) proceeds.
- The warning is included in the Step 4 completion report.

**If every executed gate passes:** Proceed to Step 3. Gates recorded as skipped by the argv guard do not block — they are reported, not run.

**Integration Gates section in completion report:** If integration gates were executed, the Step 4 completion report includes an "Integration Gates" section showing a GateResult per gate: tier name, gate id, command, pass/fail/warn/**skipped** status (skipped entries carry their named reason), duration, and output for failures.
