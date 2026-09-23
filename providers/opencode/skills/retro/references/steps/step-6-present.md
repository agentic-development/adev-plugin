## Step 6: Present to User

After writing the report, present a concise summary and the top 3 recommendations:

```
Retrospective complete for <start-date> to <end-date>.

Key metrics:
- Specs: N completed of M planned (N% completion rate)
- Quality: N% first-run validation pass rate
- Recoveries: N (top cause: <category>)
- Scope drift: N unplanned files changed

Top 3 recommendations:
1. <highest priority recommendation with one-line rationale>
2. <second recommendation>
3. <third recommendation>

Full report saved to <path to retro file>.

Suggested next actions:
- Review the full report for detailed analysis
- Address high-priority recommendations before the next sprint
- Run /adev:hygiene to verify context health after applying changes
- Schedule the next retrospective in 2 weeks
```

If `--auto-apply` was used, also report what was applied:

```
Auto-applied:
- Flagged N golden sample candidates (run /adev:sample to extract)
- Flagged N missing ADR topics (run /adev:brainstorm to draft)
- Updated drift-report.md with retro findings
```
