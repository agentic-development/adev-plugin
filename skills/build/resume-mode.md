## Mode: Resume

When `--resume` is invoked, the skill resumes an interrupted or failed build from the last successful step.

### Resume without `--spec` or `--milestone`

Scan `.context-index/build-state/` for any JSON file with `"status": "in_progress"` or `"status": "failed"`. If multiple are found, list them and ask the user which to resume. If none are found, print:

> No interrupted build found. Nothing to resume.

### Resume with `--spec <path>`

Read the build state file for the specified spec. Identify the last step with `status: completed` and resume from the next step in the pipeline.

### Resume with `--milestone <name>`

Re-discover all specs with `milestone: <name>` in their frontmatter by scanning `.context-index/specs/`. Do NOT rely solely on cached build state files -- specs may have been added or modified between sessions. For each discovered spec, check if a build state file exists:

- If build state exists with `status: in_progress` or `status: failed`, resume from the next step after the last completed one.
- If build state exists with `status: completed`, skip that spec.
- If no build state exists, start a fresh build for that spec.

### The `--from <step>` Override

When `--from <step>` is combined with `--resume`, force the build to restart from the specified step regardless of what the build state file says. Valid step names: `specify`, `review`, `plan`, `route`, `implement`, `validate`.

This is a safety valve for situations where:
- The build state file is corrupted
- External changes have invalidated a previously-completed step
- The user wants to re-run a step that passed but produced suboptimal results

When `--from` is used, all steps before the specified step are marked `skipped` in the new build state, and execution begins at the specified step.

Valid step names: `specify`, `review`, `plan`, `route`, `implement`, `validate`. Note: `specify` is only applicable in Full Pipeline builds; using `--from specify` on an Implement Pipeline build dispatches specify (which may update the spec) — use with care.
