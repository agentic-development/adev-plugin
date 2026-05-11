# Process Automation Extension

Domain profile for workflow automation, RPA, and event-driven processes.

Extends the `software` base profile with process-automation-specific templates, reviewers, gates, and verification config.

## Install

```bash
npx adev-cli extension install ./extensions/process-automation
```

## Contents

- `charter-template.md` — Charter template with workflow orchestration, trigger patterns, and recovery action sections
- `spec-template.md` — Spec template with flow-level behavioral contracts and event handling expectations
- `reviewers.yaml` — Integration reviewer for cross-system touchpoints
- `gates.yaml` — Flow coverage gate for integration point and recovery action tests
- `verification.yaml` — Flow-type verification config for workflow artifacts
- `gate-config.yaml` — File exclusions and allowed commands for process automation projects
- `test-config.yaml` — Permitted test tools and skip patterns for process automation projects
