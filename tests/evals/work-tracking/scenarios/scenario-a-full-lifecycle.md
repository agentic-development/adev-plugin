# Scenario A: Full Lifecycle Trailer Flow

## Skill
Code Provenance Hygiene Pass (Phase 2, item #3)

## Target Project
`tests/evals/work-tracking/fixture` — fixture repo with crafted git history

## Prompt
Run a code provenance audit on this repository. For each source file under `lib/` and `tests/`, classify it by lifecycle tracing status based on git commit trailers. Report which files are fully traced, partially traced, or untraced.

## Expected Behavior
The provenance audit should examine git blame/log for each source file and check for the presence of `Spec:`, `Plan-task:`, `Session:`, `Issue:`, and `Author-type:` trailers on each commit that touched the file.

## Success Criteria
- lib/login.mjs classified as FULLY TRACED (all commits have Spec + Plan-task + Issue)
- tests/login.test.mjs classified as FULLY TRACED
- lib/drifted.mjs classified as PARTIALLY TRACED (first commit traced, second untracked)
- lib/untraced.mjs classified as UNTRACED (no lifecycle trailers)
- lib/orphan.mjs classified as UNTRACED (has Author-type: human + Lifecycle: untracked)
- Report includes commit counts per classification
- No false positives (traced files not misclassified)
