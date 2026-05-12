# Data Engineering Extension

Domain profile for data pipelines, ETL, dbt, and data quality workflows.

Extends the `software` base profile with data-engineering-specific templates, reviewers, gates, and verification config.

## Install

```bash
npx adev-cli extension install ./extensions/data-engineering
```

## Contents

- `charter-template.md` — Charter template with data model, pipeline stages, and data contract sections
- `spec-template.md` — Spec template with data quality expectations and output schema sections
- `reviewers.yaml` — Data contract reviewer
- `gates.yaml` — Data quality gate
- `verification.yaml` — Output verification config for data artifacts
- `gate-config.yaml` — File exclusions and allowed commands for data projects
- `test-config.yaml` — Permitted test tools and skip patterns for data projects
