<!-- Companion to skills/implement/SKILL.md. Extracted from the SKILL body
     because implement exceeded the 65,536-byte cap the Copilot provider
     enforces (lib/providers/copilot/skill-validator.mjs). Content is
     verbatim; only the heading level changed. Loaded conditionally — see
     the pointer stub in SKILL.md. -->

# Step 2-post: Integration Gate

After all tasks are complete, run the integration tier gate if configured.

1. Resolve the gate set from the **merged** gate list — domain gates merged with the project's governance gates — via the CLI:

   ```bash
   adev domain load-gates --module <module-slug> [--charter <charter-path>]
   ```

   This is the same source `/adev:validate` Check 1 uses, so both integration-gate consumers see the same gates. Filter the merged list to `tier: integration`. A gate that omits `tier` is `fast` and is not an integration gate. If the merged list yields no integration-tier gates, skip this step silently (current behavior preserved — Step 3 follows Step 2 directly). Surface any loader `warnings` (`INVALID_GATE`, `GATE_OVERRIDE`) in the step output rather than swallowing them — an `INVALID_GATE` naming a gate whose command is still the unwired sentinel is the actionable signal that a declared tier was never seeded.
2. **Argv guard.** Execute only gates that are deterministic and carry a non-empty argv-list `command`. The merged list **drops `kind`**, so an entry with no `kind` is treated as `deterministic` (the same default `/adev:validate` states) — never require a literal `kind: deterministic` on a merged entry, which would skip every integration gate. Any gate whose `command` is empty, absent, or not an argv list is recorded as **skipped** with a named reason (for example, `skipped: command is the unwired sentinel — run /adev:init or set the command in governance/gates.yaml`) and nothing is spawned for it. Gate commands execute without shell interpolation, consistent with the argv-only contract.
3. If `--task <N>` was passed (single-task re-run), skip this step. Integration gates only run when all tasks complete in a full plan execution.
4. **E2E exclusion:** Only the fast tier (per-task in Step 2) and integration tier (this step) execute during implementation. The E2E tier is excluded from `/adev:implement` — E2E gates execute only during `/adev:validate` Check 1c.

**Execute gates sequentially.** Each gate's severity is its own `severity` field when present; a gate that omits `severity` inherits the tier default (`error` for the integration tier). A gate with `required: false` is always `warning`, whatever its explicit severity says. This matches `/adev:validate` Check 1, so both integration-gate consumers agree on both the source and the severity of every gate. (`required` is not observable on a merged entry — the merge narrows each gate — so the `required: false` rule governs wherever the raw gate entry is visible, such as Step 2h and `/adev:validate`'s own resolution; here per-gate `severity` applies with the tier default as fallback.)

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
