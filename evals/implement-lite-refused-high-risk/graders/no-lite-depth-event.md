---
type: regex
target:
  source: file
  path: .context-index/lifecycle-state/shout.jsonl
pattern: '"event":"review_depth_resolved"[^\n]*"depth":"lite"'
match: not_contains
---
