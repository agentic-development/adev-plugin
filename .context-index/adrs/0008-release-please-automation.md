# ADR 0008: Automated Releases with release-please

## Status

Accepted

## Date

2026-05-10

## Context

Releases were manual: bump version in `package.json` and `.claude-plugin/plugin.json`, update `CHANGELOG.md`, create a git tag, create a GitHub Release, then push the tag to trigger npm publish. This process was error-prone — version drift between the two JSON files, changelog entries missing features, and tags created from untested commits were all recurring risks.

The project uses conventional commits (enforced by ADR 0007), which provides the structured commit history needed for automated changelog generation and semantic version bumping.

## Decision

Adopt Google's release-please via GitHub Actions to automate the entire release lifecycle:

1. **Release PR management:** On each push to `main` (or `release/0.x`), release-please scans conventional commits and opens/updates a Release PR containing version bumps and changelog updates.

2. **Version parity:** `release-please-config.json` declares `.claude-plugin/plugin.json` as an `extra-files` entry, ensuring both `package.json` and `plugin.json` are bumped in lockstep.

3. **Publish on release:** When the Release PR is merged, release-please creates a GitHub Release and git tag. The same workflow then runs `npm publish --access=public --provenance`.

4. **Parallel release lines:** The workflow watches both `main` (latest development) and `release/0.x` (maintenance). Maintenance releases publish with the `legacy` npm dist-tag to avoid overriding `latest`.

The old `publish.yml` (tag-triggered) was removed and consolidated into the unified `release.yml` workflow.

## Consequences

- No manual version bumps, changelog edits, or tag creation required
- Merging the Release PR is the single "ship" action
- `package.json` and `plugin.json` versions stay in sync automatically
- The changelog is generated from commit messages — commit quality directly affects release notes quality
- Maintenance patches on `release/0.x` publish as `@legacy` on npm, keeping `@latest` for the active development line
- The `NPM_TOKEN` secret and "Allow GitHub Actions to create pull requests" org setting are required
