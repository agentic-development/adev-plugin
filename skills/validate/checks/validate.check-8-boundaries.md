# Check 8: Boundary Compliance

Verify that the changed files honour the architecture boundaries this project declares in
`.context-index/governance/boundaries.yaml`.

Do not re-implement the rule algorithm in this check. The regex matching, the `exclude` glob
handling, the severity mapping and the time/size budgets all live in the verb below. This check
runs it and records what came back.

## Steps

1. Run the boundary evaluator and capture its report:

   ```
   adev boundaries check --json
   ```

   With no flags the changed set is `git diff --name-only --diff-filter=ACMR HEAD` plus untracked,
   not-ignored files — the same set the validation run is about. When validate is running outside a
   git checkout, pass the set explicitly with `--changed <path,...>` (repeatable). `--all` evaluates
   every tracked file and is for a deliberate full sweep, not for a per-implementation validation.

   Exit code 0 means SKIP, PASS or WARN; 2 means FAIL (at least one error-severity finding); 1 means
   an argument error or a registry the evaluator refuses (`INVALID_BOUNDARY_PATTERN`,
   `BOUNDARIES_PARSE_ERROR`).

2. Parse the JSON envelope. It carries `verdict`, `reason`, `findings`, `disabled`, `warnings` and
   `summary`. Each finding has `rule`, `severity`, `file`, `line` and `message`. `summary` counts
   `errors`, `warnings`, `infos` and `files_checked`.

3. Record the check result from `verdict` verbatim — do not recompute it from the findings:

   - **`PASS`:** PASS. Cite `summary.files_checked` and the rule count from `reason`.
   - **`WARN`:** WARN, listing each warning-severity finding with its `file:line`. Warning findings
     do not fail validation.
   - **`FAIL`:** FAIL, listing each error-severity finding with its `file:line` and `rule`.
   - **`SKIP`:** SKIP, quoting `reason`. The two SKIP reasons are different facts and must not be
     collapsed: "no boundary rules declared" means the project declares none, and "all N declared
     boundary rule(s) are disabled" means somebody switched them off.

   A project with no rules records SKIP, **never PASS**. PASS would assert that boundaries were
   checked; nothing was read. This is a deliberate change from the previous body, which recorded
   PASS — the pass/fail outcome of a validation run is unchanged, but the verdict is now honest.

4. Report the `disabled` array whenever it is non-empty, on every verdict including PASS and SKIP.
   Each row carries `id`, `enabled: false`, `disabled_reason` and a preformatted `disabledNote`.
   List each disabled rule and its reason, so a switched-off rule reads differently in the report
   from one the project never declared.

5. Report the `warnings` array whenever it is non-empty. These are **registry schema** warnings
   about `boundaries.yaml` itself — a different thing from `summary.warnings`, which counts
   warning-severity findings. They do not change the verdict; surface them as report notes.

## What each finding means

| Finding | What it means |
|---|---|
| `severity: error` finding | A declared boundary was crossed. FAIL, with the rule id and `file:line`. |
| `severity: warning` finding | A boundary the project marked advisory was crossed. WARN; does not fail validation. |
| `BOUNDARY_BINARY_SKIPPED` | A binary file in the changed set was not scanned. Informational. |
| An unevaluatable rule | A blown time budget or oversize input arrives as a **finding**, never as silence. The evaluator fails closed; report it like any other finding of its severity. |
| `disabled` row | The rule is declared with `enabled: false`. It was not run. Name it and its `disabled_reason` in the report. |
| `DISABLED_WITHOUT_REASON` (in `warnings`) | A rule is switched off with no `disabled_reason`. Report it: an unexplained disabled rule is how a boundary quietly stops protecting the project. |
| `INVALID_BOUNDARY_PATTERN` / `BOUNDARIES_PARSE_ERROR` (exit 1) | The registry itself is unreadable. Record FAIL and quote the error — this is not a SKIP, because the project believes it has boundaries. |

## Do not

- Do not run the rule regexes yourself, in any form. The verb owns the algorithm; a second
  implementation in this check would drift from it silently.
- Do not record PASS on an empty or fully-disabled registry. SKIP is the correct verdict and the
  difference is what tells an operator that nothing was checked.
- Do not pass `--all` from a per-implementation validation run. It evaluates the whole tree and
  reports findings that have nothing to do with the change under validation.
- Do not attempt to fix a finding. This check reports; remediation is the operator's decision.
