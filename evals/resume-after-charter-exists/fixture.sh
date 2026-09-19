#!/usr/bin/env bash
set -euo pipefail

git init -q

mkdir -p .context-index/specs/features/csv-export

cat > .context-index/manifest.yaml <<'EOF'
project:
  name: "fixture-app"
  adev_version: "0.27.9"
  type: cli
EOF

cat > .context-index/specs/features/csv-export/charter.md <<'EOF'
---
status: approved
kind: feature
revision: 1
updated: 2026-09-01
---

# Feature Charter: csv-export

## Business Intent

Let users export their own account data as a CSV file from the settings page.

## Scope and Boundaries

### In Scope

- CSV export of the user's own account/profile data
- A download endpoint and a UI trigger button

### Out of Scope

- Bulk/admin exports of other users' data
- Scheduled/recurring exports

## Capability Map

| Capability | Description | Priority | Milestone | Status |
|---|---|---|---|---|
| CSV export endpoint | Serialize account data to CSV and stream it for download | must-have | v1 | approved |
EOF

git add -A
git commit -q -m "seed fixture: approved charter, no spec authored yet"
