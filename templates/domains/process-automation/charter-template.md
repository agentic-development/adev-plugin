---
status: draft
revision: 1
updated: {{ date }}
---

# Feature Charter: {{ module_name }}

<!-- Feature Charter for the {{ module_name }} module.
     This defines WHAT the module does and its boundaries, not HOW it is built.
     Live Specs within this charter define specific behavioral contracts. -->

<!-- # tracker-ref: -->

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

## Capability Map

| Capability | Description | Status |
|------------|-------------|--------|

## Deferred Capabilities

<!-- Capabilities explicitly deferred to later phases or out of scope with structured tracking.
     Migrated from Out of Scope when a capability has a known target phase or dependency.
     This table enables reliable backlog extraction by /adev:status --backlog. -->

| Capability | Reason | Target Phase | Depends On |
|-----------|--------|-------------|------------|
<!-- | Example capability | Low priority, manual workaround exists | v2 | — | -->

## Interface Contracts

<!-- How other modules interact with this one. Define the public surface area. -->

### Exposed APIs

<!-- Endpoints, functions, events, or messages this module exposes to others. -->

| Interface | Type | Description |
|-----------|------|-------------|
| ... | REST endpoint / function / event / message | ... |

### Consumed APIs

<!-- Interfaces from other modules that this module calls. -->

| Interface | Source Module | Description |
|-----------|-------------|-------------|
| ... | ... | ... |

## Quality Attributes

<!-- Measurable quality targets for this workflow. -->

| Attribute | Target | Measurement |
|-----------|--------|-------------|
| End-to-End Latency | | |
| Retry Success Rate | | |
| Dead-Letter Rate | | |
| Recovery Time Objective (RTO) | | |

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
