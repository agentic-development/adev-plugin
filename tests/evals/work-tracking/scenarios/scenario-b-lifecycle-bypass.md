# Scenario B: Lifecycle Bypass Detection

## Skill
`commit-msg` validation hook + Code Provenance Hygiene Pass

## Target Project
`tests/evals/work-tracking/fixture` — fixture repo with crafted git history

## Prompt
Analyze the repository for lifecycle bypass. Identify:
1. Files that are claimed by a source manifest but have commits without `Spec:` trailers (post-implementation drift)
2. Files with no lifecycle trailers at all (written entirely outside the lifecycle)
3. Files explicitly marked with `Lifecycle: untracked`

For each finding, report the file, the offending commits, and whether the file is manifest-claimed.

## Expected Behavior
The analysis should cross-reference source manifests in spec frontmatter against git history trailers to detect bypass.

## Success Criteria
- lib/drifted.mjs flagged as DRIFT: manifest-claimed by dashboard/widgets.md but commit 7ba6874 lacks Spec: trailer
- lib/untraced.mjs flagged as UNTRACKED: no spec claims it, no trailers on any commit
- lib/orphan.mjs flagged as UNTRACKED with explicit Lifecycle: untracked marker
- lib/login.mjs NOT flagged (all commits are properly traced)
- tests/login.test.mjs NOT flagged
- Report distinguishes manifest-claimed drift from unclaimed untracked
- Actionable recommendations for each finding (create spec, update manifest, or mark as intentional)
