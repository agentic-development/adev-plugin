# Scenario C: Code Follows Specs Verification

## Skill
Reverse file-to-spec index + source manifest verification

## Target Project
`tests/evals/work-tracking/fixture` — fixture repo with crafted git history

## Prompt
For each source file under `lib/`, determine which spec (if any) claims it via source manifest, and whether the file has drifted since the manifest was stamped. Build a reverse index mapping files to specs and report the verification status of each.

## Expected Behavior
The system should scan all spec frontmatter for `source-manifest.files` entries, build a reverse lookup map, then verify each claimed file against its manifest SHA.

## Success Criteria
- Reverse index maps lib/login.mjs to auth/login.md
- Reverse index maps tests/login.test.mjs to auth/login.md
- Reverse index maps lib/drifted.mjs to dashboard/widgets.md
- lib/untraced.mjs and lib/orphan.mjs have NO spec in reverse index
- lib/login.mjs verification: reports manifest status (match or drift)
- lib/drifted.mjs verification: reports DRIFT (file modified after manifest was stamped)
- Unclaimed files listed separately with recommendation to create specs or mark intentional
- Report includes total counts: N claimed, M unclaimed, K drifted
