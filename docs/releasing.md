[adev docs](README.md) > Maintainers > Releasing

# Releasing

How adev versions and publishes `@adev-org/adev-cli`. This is a maintainer procedure — if you just want to install a build, see [Installation](installation.md).

Releases are automated by [release-please](https://github.com/googleapis/release-please). It reads Conventional Commit messages, opens a release PR that bumps versions and writes the changelog, and merging that PR triggers the npm publish. **You never hand-edit a version number.** `package.json`, `.claude-plugin/plugin.json`, `.cursor-plugin/plugin.json`, and `.release-please-manifest.json` are all maintained by the tooling and must stay in sync.

## Channels

Each release branch publishes to its own npm dist-tag.

| Branch | dist-tag | Version shape | Install with |
|---|---|---|---|
| `main` | `latest` | `0.28.0` | `npx @adev-org/adev-cli install` |
| `release/next` | `next` | `0.28.0-next.3` | `npx @adev-org/adev-cli@next install` |
| `release/0.x` | `legacy` | `0.x.y` | `npx @adev-org/adev-cli@legacy install` |

The mapping lives in the `Determine npm dist-tag` step of `.github/workflows/release.yml`.

## Cutting a stable release

1. Merge your work to `main` with Conventional Commit messages (`feat:`, `fix:`, `chore:` — a `feat!:` or `BREAKING CHANGE:` footer drives the major/minor bump).
2. release-please opens or updates a release PR titled `chore(main): release adev-cli X.Y.Z`. It accumulates every unreleased commit, so it is normal for it to sit open across several merges.
3. Review the generated changelog, then merge the release PR.
4. The publish job runs the test suite and publishes to npm under `latest`, and tags the GitHub release.

## Cutting a pre-release

Use this to get a fix into users' hands before it is ready for a stable release.

1. Land the change on `main` first, following the stable flow above through step 1. Pre-releases are cut *from* main's history, never authored directly on the channel branch.
2. Merge `main` into `release/next` and push:
   ```bash
   git checkout release/next
   git merge main
   git push origin release/next
   ```
3. release-please opens a release PR **against `release/next`** for `X.Y.Z-next.N`.
4. Merge it. The publish job publishes to npm under the `next` dist-tag and marks the GitHub release as a pre-release.
5. Users install it with `npx @adev-org/adev-cli@next install`. Remind them to delete the stale plugin cache directory for the old version so their assistant picks up the new skills.

Promoting a pre-release to stable needs no special step: the same commits are already on `main`, so the next stable release includes them.

### Automated propagation

Step 2 above (merging `main` into `release/next`) is automated by the **Propagate main to release/next** workflow (`.github/workflows/propagate-to-next.yml`). Every push to `main` merges `main` into `release/next` and pushes it, so release-please keeps the pre-release PR current without a manual merge. You still review and merge the pre-release PR yourself — automation only advances the branch, it never publishes.

The merge is always a merge commit (never a fast-forward, because `release/next` carries a branch-only prerelease-config commit) and the three-way merge preserves `release/next`'s own `release-please-config.json`. The job aborts loudly on a merge conflict or if the prerelease config is lost, rather than risk mis-tagging a release.

**Version-field merge driver.** `release/next` carries its own always-ahead prerelease `"version"` field in `package.json`, `.claude-plugin/plugin.json`, and `.cursor-plugin/plugin.json`, bumped independently by release-please on that branch. A plain merge treats any main-side edit near the top of one of those files as a real conflict, because git merges hunk-by-hunk rather than field-by-field. The workflow configures a custom merge driver (`scripts/git-merge-keep-version.sh`, wired via `.gitattributes`) that neutralizes only that known, by-design divergence before delegating to a normal three-way merge — a genuine conflict elsewhere in the file still surfaces normally. Without the `git config merge.release-next-version.driver ...` line the workflow runs before merging, the `.gitattributes` entries are inert and git falls back to its default merge.

**Required secret — `RELEASE_PLEASE_PAT`.** A push made with the default `GITHUB_TOKEN` does not trigger other workflows (GitHub's recursion guard), so the automated push would advance `release/next` but never re-run the Release workflow — the pre-release PR would go stale. Configure a repo secret `RELEASE_PLEASE_PAT` (a fine-grained PAT or GitHub App installation token with `contents: write`) so the push originates from a non-Actions identity and the Release workflow fires. Without it, the branch still advances but you must re-run the Release workflow on `release/next` manually. If `release/next` has branch protection, the token's identity must be allowed to push to it.

## Branch-scoped configuration

`release-please-config.json` differs by branch **on purpose**, and the difference must not be merged across:

- On `main` (and `release/0.x`): `"prerelease": false`.
- On `release/next`: `"prerelease": true`, `"prerelease-type": "next"`, `"versioning": "prerelease"`.

release-please reads its config from the branch it targets. If the prerelease config ever reaches `main`, every stable release is cut as `X.Y.Z-next.N` and published to the `latest` dist-tag — breaking installs for everyone on the default channel. When merging `main` into `release/next`, keep the branch's own version of this file; never merge `release/next` back into `main`.

The workflow passes `target-branch: ${{ github.ref_name }}` to the release-please action. Without it the action opens its release PR against the repository's default branch regardless of which branch triggered the run, so non-main channels can never release correctly.

## Troubleshooting

**No release PR appears.** release-please only opens one when there is a releasable commit since the last release. `chore:`, `ci:`, and `docs:` commits alone do not trigger a version bump — that is expected, not a failure.

**Version numbers disagree across files.** Something bypassed release-please with a manual bump. The fix is to reconcile `.release-please-manifest.json` with the actually-published version rather than hand-editing further; release-please computes the next version from the manifest, not from `package.json`.

**Publish fails with a 404 on the PUT.** This almost always means the `NPM_TOKEN` secret is expired or revoked, not that the package or version is missing. Rotate the token — it must be an automation or granular access token with publish rights on `@adev-org/*`.

**A pre-release PR targets `main`.** The `target-branch` input is missing or the workflow on that branch is out of date. Merge the current `main` workflow into the channel branch.
