#!/usr/bin/env bash
# Git merge driver for the manifest files that carry a "version" field
# release-please bumps independently on main and on release/next
# (package.json, .claude-plugin/plugin.json, .cursor-plugin/plugin.json).
#
# release/next runs its own always-ahead prerelease version line (see
# docs/releasing.md), so that field is expected to permanently diverge from
# main's. A plain 3-way merge treats any main-side edit near the top of one
# of these files as a real conflict once it lands on a line adjacent to the
# version field, because git's merge is hunk-based, not field-based. That
# broke the "main -> release/next" propagation
# (.github/workflows/propagate-to-next.yml) starting at PR #292, which only
# touched package.json's "description" field, immediately adjacent to
# "version".
#
# This driver neutralizes ONLY that known, by-design divergence — rewriting
# "theirs" version field to match "ours" before delegating to a normal 3-way
# merge — so any other, genuine conflict still surfaces normally instead of
# being silently guessed at.
#
# Invoked by git as: git-merge-keep-version.sh %O %A %B
#   %O = common ancestor version (read-only)
#   %A = "ours" version — merge output path git reads back afterward
#   %B = "theirs" version (rewritten in place before the real merge)
#
# Wired via .gitattributes (`merge=release-next-version`) plus a `git config
# merge.release-next-version.driver` line in the propagate workflow — see
# that file for why the driver is configured there rather than committed to
# repo-wide git config.
set -euo pipefail

ancestor="$1"
ours="$2"
theirs="$3"

our_version=$(sed -n 's/^[[:space:]]*"version": *"\([^"]*\)".*/\1/p' "$ours" | head -1)

if [ -n "$our_version" ]; then
  sed -i.bak "s/\"version\": *\"[^\"]*\"/\"version\": \"$our_version\"/" "$theirs"
  rm -f "$theirs.bak"
fi

exec git merge-file "$ours" "$ancestor" "$theirs"
