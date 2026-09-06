# Check 14: Gate Executability and Test Collection

Verify that the quality gates this project declares can actually execute, and that the tests it
has written actually get collected by a runner.

This check exists because adev verifies test *authorship* rigorously — RED-state verification,
immutable handoff hashes, gaming detection — and until now verified test *collection* and
*execution* not at all. A 2026-08-10 audit of three adev-built repos found all three had written
tests that never ran, and adev had never noticed.

## Steps

1. Run the doctor and capture its report:

   ```
   adev gate doctor --json
   ```

   The verb is read-only and, by default, executes nothing — it analyses `governance/gates.yaml`,
   `package.json` script bodies, the file tree, and CI configuration statically. Exit code 0 means
   no error-severity finding; 2 means at least one fired; 1 means an argument error.

2. Parse the JSON envelope. It carries `schema_version`, `findings`, `runners`, and `summary`.
   Each finding has `id`, `severity`, `message`, and — where applicable — `gate` and `citation`.

3. Record the check result:

   - **No findings at all:** PASS.
   - **Only warnings:** PASS with the warnings listed. Warnings are legitimate for projects that
     have deliberately not wired a gate into CI, or that use a runner with no collect-only mode.
   - **Any error-severity finding:** WARN, and list each one. This check's registry severity is
     `warning`, so it does not fail validation on its own — but every error-severity finding here
     describes a gate the project believes is protecting it and which cannot run.

4. `gate-doctor/no-gates-configured` means the project has no `governance/gates.yaml`. Record SKIP
   with: "No gates configured. Run `/adev:init` to scaffold `governance/gates.yaml`."

## What each finding means

| Finding | What it means |
|---|---|
| `glob-under-expansion` | A `**` glob in a gate command or npm script matches fewer files under `sh` (which has no globstar) than a true recursive walk. Those files are silently never run. |
| `collection-gap` | Test files exist on disk that the runner's own collect-only query does not report. |
| `no-tests-collected` | The runner collected zero tests while test files exist on disk. |
| `runner-unknown` | The runner could not be identified, or has no collect-only mode. Collection was NOT verified — this is reported rather than passed silently. |
| `binary-not-found` | The gate's executable is neither a shell builtin nor on `PATH` nor in `node_modules/.bin`. |
| `empty-command` | A deterministic gate declares no command. |
| `unsubstituted-placeholder` | The gate command still contains a `{{ }}` template placeholder. |
| `path-missing` | The gate references a path that does not exist. |
| `path-gitignored` | The gate references a gitignored path. It can only run for whoever created that path locally — never in CI, never for a fresh clone. |
| `ci-config-missing` | No CI configuration was found anywhere in the project. |
| `ci-gate-not-invoked` | A declared gate does not appear in any CI configuration. Matching is textual, so a gate invoked through a `make` target or composite action can produce a false warning. |

## Do not

- Do not pass `--execute` from this check. Validate is itself reachable from a gate command, and
  `--execute` would re-enter it. The doctor's `ADEV_GATE_DOCTOR` guard would catch the recursion,
  but the check should not rely on that.
- Do not attempt to fix any finding. This check diagnoses; remediation is the operator's decision.
