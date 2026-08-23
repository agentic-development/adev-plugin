## From-Diff Mode (`--from-diff`)

Generates a retroactive Live Spec from a git diff or PR. Useful for documenting work done before adev was adopted, or hotfixes that skipped the spec milestone.

### Step 0: Lifecycle entry event

Emit the entry event from the Shared: Lifecycle Events section before any other action in this mode.

### Step 1: Identify the Diff

1. If no argument: use `git diff --cached`, or if nothing staged, `git diff`.
2. If a commit range (e.g., `HEAD~3..HEAD`): use `git diff <range>`.
3. If a branch name: diff against main: `git diff main..<branch>`.
4. If a PR number: fetch the PR diff.

```
Analyzing diff...

Changes:
  Modified: src/app/api/tasks/route.ts (+45, -12)
  Created:  src/lib/tasks/priority-engine.ts (+89)
  Modified: prisma/schema.prisma (+8)

Total: 3 files, 142 additions, 12 deletions

→ Generate a retroactive spec for these changes? (yes / narrow scope / cancel)
```

### Step 2: Resolve Charter

Analyze the changed files to determine which module they belong to. Match against existing charters. If changes span multiple modules:

```
These changes touch 2 modules:
  - task-boards (3 files)
  - notifications (1 file)

→ Create one spec under task-boards? Or separate specs per module?
```

### Step 3: Analyze the Diff

Load context per the shared section above. Read the full diff content. For each changed file, identify:
- Behavior added (new functions, endpoints, UI elements)
- Behavior modified (changed logic, updated validation)
- Behavior removed (deleted functions, removed endpoints)

### Step 4: Generate Retroactive Spec

Produce a Live Spec where:

- **Behavioral Contract** describes behavior as it exists after the diff.
- **Behaviors** map to changes in the diff — each significant code change becomes a behavior statement. Render them with behavior IDs exactly as standard mode's *Step 4: Interactive Spec Authoring* describes: an unordered list, each item opening with a bolded `BEH-<n>`, under a `<!-- retired-behavior-ids: (none) -->` comment.
- **Error Cases** extracted from new or modified error handling.
- **Actionable Task Map** replaced with **Changes Summary**:
  ```
  ## Changes Summary
  | File | Change Type | Description |
  |------|------------|-------------|
  | src/lib/tasks/priority-engine.ts | Created | New priority scoring algorithm |
  | src/app/api/tasks/route.ts | Modified | Added priority field to task creation |
  ```
- **Acceptance Criteria** use checked boxes for existing behaviors, unchecked for missing:
  ```
  - [x] Priority field accepted on task creation
  - [ ] Priority validation (no validation found in diff — may be missing)
  - [ ] Test coverage for priority engine (no tests found in diff)
  ```

Set frontmatter per the shared section with `mode: from-diff` and `diff-source`. Save to `.context-index/specs/features/<module>/<spec-slug>.spec.md`.

### Step 4.5: Update Spec Status

After saving the spec, update its status to `review-pending` (same as Step 5.5 in standard mode).

### Step 5: Summary

Emit the lifecycle exit event from the Shared: Lifecycle Events section (`--status completed --verdict PASS`).

Output the shared summary template with these stats:
```
  Diff source: <source>
  Files analyzed: <count>
  Behaviors documented: <count>
  Gaps identified: <count> (details)

  This spec documents existing changes. Review the gaps — they may
  need follow-up specs or immediate fixes.
```

---
