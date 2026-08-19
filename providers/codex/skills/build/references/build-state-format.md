### State File Format

```json
{
  "spec": ".context-index/specs/features/<module>/<spec>.spec.md",
  "milestone": "<milestone-name or null>",
  "status": "in_progress",
  "steps": [
    {
      "name": "review",
      "status": "completed",
      "timestamp": "2026-04-05T10:00:00Z"
    },
    {
      "name": "plan",
      "status": "completed",
      "timestamp": "2026-04-05T10:05:00Z"
    },
    {
      "name": "route",
      "status": "skipped",
      "timestamp": "2026-04-05T10:05:01Z"
    },
    {
      "name": "implement",
      "status": "failed",
      "timestamp": "2026-04-05T10:15:00Z",
      "error": "Quality gate failure: 2 tests failing"
    }
  ],
  "started": "2026-04-05T10:00:00Z",
  "updated": "2026-04-05T10:15:00Z"
}
```
