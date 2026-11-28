---
type: regex
target:
  source: file
  path: .context-index/governance/risk-policies.yaml
pattern: 'high:\n(?:    .*\n)*?    implement_mode: lite\b'
match: not_contains
---
