## Step 2: Load Context

### Essential Context (load now)

**Optimization:** Load spec + charter + constitution in a single Bash call via the CLI. This replaces items 1, 3, and 4 below with one turn:

```bash
adev context load --spec <spec-path>
```

The verb wraps `lib/meta-tools.mjs::loadSpecContext` and emits a JSON object `{ context }`; the `context` field is a markdown bundle containing the spec body, the parent charter's Capability Map, and the constitution's Non-Negotiable Principles.

If the CLI call fails, fall back to reading each file individually.

1. **Constitution:** Read `.context-index/constitution.md`. Extract non-negotiable principles, architecture boundaries, quality gate commands, and coding standards.

2. **Platform context:** Read `.context-index/platform-context.yaml`. Note the tech stack, framework versions, and deployment targets.

3. **Parent charter:** Read the feature charter (`.context-index/specs/features/<module>/charter.md`). Extract the capability map. Every task must trace to a capability listed here.

4. **The spec:** Read the Live Spec itself. Extract behavioral contract, acceptance criteria, and actionable task map (if present).

5. **Review verdict and notes:** The review-gate read in Step 1 already returned `state.steps.review`. Use its `verdict` and `notes` fields directly — do not re-read or parse the `.review.md` artifact. The plan should address or acknowledge any `PASS_WITH_NOTES` notes.

### Workspace-Aware Target-Repo Context Loading

When in workspace-aware Spec Mode (target-repo detected), load context from the target repo instead of (or in addition to) the current repo:

1. **Target repo constitution:** Read `<target-repo-path>/.context-index/constitution.md`. If the target repo's `.context-index/` directory is missing, handle gracefully — proceed without target repo constitution and note the gap in the plan header.
2. **Target repo platform-context:** Read `<target-repo-path>/.context-index/platform-context.yaml`. This determines the target repo's tech stack for task structure.
3. **Target repo orientation:** Read `<target-repo-path>/.context-index/orientation/architecture.md` for module placement and import patterns specific to the target repo.
4. **Special case — `target-repo: workspace`:** When the spec's target-repo value is literally `workspace`, the spec targets the workspace root itself rather than any registered repo. In this case, load the workspace-level `.context-index/` constitution, platform-context, and orientation. There is no repo-specific constitution to load.

### Workspace-Aware Cross-Repo Depends-On Resolution

When in workspace-aware Spec Mode, parse the spec's `depends-on` frontmatter for cross-repo references in the `@repo-slug/spec-slug` format:

1. **Identify cross-repo refs:** Entries matching the pattern `@<repo-slug>/<spec-slug>` are cross-repo dependencies.
2. **Resolve each ref** via `resolveRef(workspaceRoot, config, ref)` from `lib/workspace.mjs`. This returns the absolute path to the referenced spec in the sibling repo.
3. **Include resolved specs in Context Packets:** Add each resolved cross-repo spec as a Context Packet entry so subagents can read the dependency's behavioral contract.
4. **Warn on unresolvable refs:** If a cross-repo ref cannot be resolved (repo not in workspace registry, spec file not found), emit a warning but do not block:
   ```
   Warning: cross-repo dependency @<repo-slug>/<spec-slug> could not be resolved.
   The referenced spec may not exist or the repo may not be registered in the workspace.
   ```

### Reference Context (load when relevant)

Read these as needed during task writing. Do not load everything upfront — load when a task requires this context.

6. **Orientation:** Read `.context-index/orientation/architecture.md` when determining file structure, module placement, or import patterns for tasks.

7. **ADRs:** Read only the ADRs referenced in the spec or charter. Reference specific ADRs in tasks where they apply.

8. **External references:** Read `.context-index/references/**/*.md` only if the spec references external contracts or interfaces.

9. **Cross-cutting specs:** Read files from `.context-index/specs/cross-cutting/` only those that the spec depends on (check spec frontmatter or behavioral contract for references).

10. **Samples:** Read `.context-index/samples/` when writing context packets for tasks. Reference relevant golden samples in task guidance.

11. **Boundary rules:** Read `.context-index/governance/boundaries.yaml` only if the directory exists. Extract boundary rules as additional planning constraints.

12. **Heuristics:** Load module-scoped heuristics for inclusion in the plan via the CLI:

    ```bash
    adev heuristics retrieve --module <charter-module> --format text [--injection-limit N]
    ```

    Derive the module slug from the spec's `charter:` frontmatter field. Pass `--injection-limit` only when `heuristics.injection_limit` is configured in `manifest.yaml` (otherwise omit the flag for the library default of 8). Stdout is either rendered markdown blocks (one per heuristic) or the literal sentinel `__NONE__` when no heuristics match. The verb exits 0 regardless — failures degrade to `__NONE__` so heuristic injection stays non-blocking.

    Store the rendered output for use in Step 5.
