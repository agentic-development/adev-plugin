---
type: regex
target:
  source: file
  path: .context-index/governance/risk-policies.yaml
pattern: 'medium:\n(?:    .*\n)*?    implement_mode: lite\n[\s\S]*?low:\n(?:    .*\n)*?    implement_mode: lite\b'
match: contains
---
