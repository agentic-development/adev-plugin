### Mode: `--epic <id>`

Show comprehensive epic status with child issues and code coverage.

1. Read the epic and all its child issues from the issue board.
2. For each issue, determine if it has code behind it (check for commits with `Issue: <id>` trailer).
3. Flag "paper" issues (no commits found).
4. Check epic completeness: are all issues closed? If so and epic is still open, flag as stale.
5. Show issue-level summary table.

**Output format:**
```
Epic: <id> — <title> (<status>)

| Issue | Title | Status | Has Code | Commits |
|-------|-------|--------|----------|---------|
| issue-1 | ... | closed | yes | 3 |
| issue-2 | ... | open | no (paper) | 0 |

Completeness: <closed>/<total> issues closed
Recommendation: <close epic / create missing issues / review deferred>
```
