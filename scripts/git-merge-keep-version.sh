#!/usr/bin/env bash
# Git merge driver for the manifest fields that release/next carries as a
# permanent, by-design divergence from main:
#   - the "version" field in package.json, .claude-plugin/plugin.json, and
#     .cursor-plugin/plugin.json (release-please bumps it independently on
#     each branch — see docs/releasing.md)
#   - the packages["."] "prerelease" / "prerelease-type" / "versioning" keys
#     in release-please-config.json (release/next always runs prerelease
#     mode; main never does)
#
# A plain 3-way merge treats any main-side edit near one of these fields as
# a real conflict once it lands on an adjacent line, because git's merge is
# hunk-based, not field-based — that broke the "main -> release/next"
# propagation (.github/workflows/propagate-to-next.yml) starting at PR #292
# (package.json's "description" field, adjacent to "version"). Worse: when
# main leaves the field's line(s) untouched across a propagation, git's
# single-side-changed fast path skips this driver entirely and just takes
# whichever side actually differs from the merge base — which silently
# dropped release/next's prerelease block during a manual "main ->
# release/next" merge on 2026-08-24, since release-please-config.json had no
# driver assigned at all at the time and main's side (unchanged, "prerelease":
# false) looked like the side to keep. This driver's job is narrower than
# preventing that fast path (nothing can, short of always touching the file);
# it's to make sure that whenever a real 3-way merge on this file DOES run,
# release/next's own version/prerelease values win instead of surfacing as a
# spurious conflict or silently taking main's.
#
# This driver neutralizes ONLY those known, by-design divergences — rewriting
# "theirs" to match "ours" for the version field and the prerelease block
# before delegating to a normal 3-way merge — so any other, genuine conflict
# elsewhere in the file still surfaces normally instead of being silently
# guessed at.
#
# Invoked by git as: git-merge-keep-version.sh %O %A %B
#   %O = common ancestor version (read-only)
#   %A = "ours" version — merge output path git reads back afterward
#   %B = "theirs" version (rewritten in place before the real merge)
#
# Wired via .gitattributes (`merge=release-next-version`) plus a `git config
# merge.release-next-version.driver` line in the propagate workflow — see
# that file for why the driver is configured there rather than committed to
# repo-wide git config. Assumes "ours" is always release/next's side of the
# merge (the only direction this driver runs in); it is not safe to reuse for
# a merge in the opposite direction.
set -euo pipefail

ancestor="$1"
ours="$2"
theirs="$3"

our_version=$(sed -n 's/^[[:space:]]*"version": *"\([^"]*\)".*/\1/p' "$ours" | head -1)

if [ -n "$our_version" ]; then
  sed -i.bak "s/\"version\": *\"[^\"]*\"/\"version\": \"$our_version\"/" "$theirs"
  rm -f "$theirs.bak"
fi

# The prerelease block is not a single-value substitution like "version": ours
# can carry 3 lines ("prerelease", "prerelease-type", "versioning") where
# theirs (main) carries only 1 ("prerelease": false, and no prerelease-type/
# versioning keys at all). Extract ours' complete contiguous block starting at
# "prerelease" into a temp file, then splice it into theirs via sed's `r`
# (read-file) command in place of theirs' own "prerelease" line, after first
# stripping any prerelease-type/versioning lines theirs might separately
# carry. Spliced through a file rather than an awk/sed -v string, because a
# multi-line value in a -v assignment is not portable: BSD awk (macOS)
# rejects an embedded newline in -v with "newline in string" and silently
# truncates at the first line, unlike gawk/mawk (Linux CI runners).
prerelease_block_file=$(mktemp)
trap 'rm -f "$prerelease_block_file"' EXIT

awk '
  /^[[:space:]]*"prerelease":/ { capturing = 1 }
  capturing && /^[[:space:]]*"(prerelease|prerelease-type|versioning)":/ { print; next }
  { capturing = 0 }
' "$ours" > "$prerelease_block_file"

if [ -s "$prerelease_block_file" ]; then
  grep -v -E '^[[:space:]]*"(prerelease-type|versioning)":' "$theirs" > "$theirs.tmp"
  sed -e "/^[[:space:]]*\"prerelease\":/{r $prerelease_block_file
d
}" "$theirs.tmp" > "$theirs"
  rm -f "$theirs.tmp"
fi

exec git merge-file "$ours" "$ancestor" "$theirs"
