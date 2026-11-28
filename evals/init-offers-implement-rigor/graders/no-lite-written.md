---
type: regex
target:
  source: file
  path: .context-index/governance/risk-policies.yaml
pattern: 'implement_mode:\s*lite\b'
match: not_contains
---
