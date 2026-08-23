### Context Packet Assembly

The Agent tool only accepts a `prompt` string — there are no env vars, JSON params, or other channels. All context the subagent needs must be serialized into the prompt. The orchestrator assembles a **context packet** per step with two sections: **pipeline context** (common to all steps) and **step context** (specific to each step).

**Do not pass `isolation: "worktree"` on the `Agent({...})` call.** Build's five steps are serial and share the orchestrator's working tree by design. From inside an existing worktree (i.e., `cwd` contains `.claude/worktrees/`), worktree isolation creates a new worktree *inside* the parent's tree; the parent then captures it as untracked content under `.claude/worktrees/`, and every subsequent dispatch nests another level. Pass only `description`, `prompt`, and `run_in_background: false`.



#### Pipeline Context (included in every step's prompt)

The orchestrator reads these once at build start and includes them in every subagent prompt:

```
PIPELINE_CONTEXT:
  spec_path: <absolute path to the spec being built>
  spec_title: <first heading from the spec>
  milestone: <milestone name if --milestone, otherwise null>
  pipeline_position: "Step <N> of 5 (<step-name>)"
  workspace:
    detected: true | false
    name: <workspace name if detected>
    repo_slug: <current repo slug if inside a repo, otherwise null>
    root: <workspace root path if detected>
  issue_board:
    configured: true | false
    backend: <tasks.backend value from manifest, e.g., "file">
    epic_id: <epic ID for this spec's plan, if known>
  pipeline_mode: "full" | "implement"   # "full" when --full is set, "implement" otherwise
  auto: true | false                    # true when --auto is set — subagents must not prompt the user
```

**Read these files in a single turn using parallel tool calls:**
- The spec file (path and title)
- `manifest.yaml` (for `tasks.backend`)
- Workspace detection result (one-time call to `detectWorkspace(cwd)`)
- Issue board state (if configured, look up epic for this spec)

#### Step Context (varies per step)

Each step adds its own section to the prompt. The orchestrator assembles this from **artifacts on disk** (files produced by prior steps), not from memory of what prior subagents reported. This is critical — if the build was resumed, prior steps may have run in a different session.

| Step | Step Context |
|------|-------------|
| **Review** | (none — review is the first step) |
| **Plan** | `review_verdict`: PASS or PASS_WITH_NOTES (read from `.review.md`). `review_notes`: any notes from the review (brief summary, not full report) |
| **Route** | `plan_path`: absolute path to the `.plan.md` file. `task_count`: number of tasks in the plan (parsed from plan file) |
| **Implement** | `plan_path`: absolute path to the `.plan.md` file. `route_annotations`: if a route output file exists, include the routing summary (which tasks are auto/assisted/human). `review_notes`: brief review notes (so implement can consider reviewer concerns) |
| **Validate** | `plan_path`: absolute path to the `.plan.md` file. `implement_summary`: brief note on what was implemented (read from build state's Step 4 notes, or "full plan executed" if no notes). `source_manifest_stamped`: true/false (check spec frontmatter for `source-manifest` block) |

#### Reading Step Context from Disk

The orchestrator reads step context from **artifact files**, not from prior subagent results:

- **Review verdict/notes:** Read the `.review.md` file adjacent to the spec. Parse the verdict line and any notes section.
- **Plan path/task count:** Glob for `.plan.md` adjacent to the spec. Parse task headers (lines matching `### Task N:`) to count tasks.
- **Route annotations:** If `/adev:route` produced output (check build state), read the route annotations from the plan file's frontmatter or inline annotations.
- **Source manifest:** Read the spec's YAML frontmatter for a `source-manifest` block.

This "read from disk" rule ensures correctness across resumed builds and avoids stale in-memory state.
