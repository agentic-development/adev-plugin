### Mode: `--file <path>`

Reverse lookup from a source file to its lifecycle context.

1. Use `buildReverseIndex()` from `lib/source-manifest.mjs` to find which spec claims the file.
2. If claimed: read the spec, find the plan, find the issue, check drift via `verifyManifest()`.
3. If unclaimed: report as unclaimed, check git history for any lifecycle trailers.
4. Show recent commits touching the file with their trailer status.

**Output format:**
```
File: <path>
Claimed by: <spec-path> (source manifest) — or "Unclaimed (no spec)"
Drift: <match/drift/missing>
Issue: <id> (<status>) — or "No issue linkage"
Epic: <epic-id>

Recent commits:
  <sha> <subject> (Spec: <yes/no>, Author-type: <type>)
  ...
```
