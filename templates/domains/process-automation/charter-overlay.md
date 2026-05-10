## Business Intent

<!-- Why does this workflow exist? What process does it automate? -->

## Scope and Boundaries

<!-- What triggers, steps, and integrations are in scope? -->

### In Scope

### Out of Scope

## Domain Model

### Entities

<!-- Key domain objects: workflows, steps, triggers, actions, events. -->

### Relationships

<!-- How entities relate: trigger-to-workflow, workflow-to-steps, step-to-integration. -->

### Invariants

<!-- Rules that must always hold: ordering constraints, idempotency guarantees. -->

## Workflow Steps

<!-- Ordered steps of the workflow with triggers, actions, and outcomes. -->

| Step | Trigger | Action | Outcome | Timeout |
|------|---------|--------|---------|---------|

## Integration Points

<!-- External systems this workflow connects to. Protocol, authentication, SLA. -->

| System | Protocol | Auth Method | SLA | Retry Policy |
|--------|----------|-------------|-----|--------------|

## Recovery & Compensation

<!-- What happens when a step fails. Compensation actions, dead-letter handling, manual intervention triggers. -->

| Failure Point | Recovery Action | Compensation | Escalation |
|---------------|----------------|--------------|------------|

## Capability Map

| Capability | Description | Status |
|------------|-------------|--------|

## Quality Attributes

<!-- Measurable quality targets for this workflow. -->

| Attribute | Target | Measurement |
|-----------|--------|-------------|
| End-to-End Latency | | |
| Retry Success Rate | | |
| Dead-Letter Rate | | |
| Recovery Time Objective (RTO) | | |
