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

<!-- Why does this data pipeline exist? What business questions does it answer? -->

## Scope and Boundaries

<!-- What data sources, transformations, and outputs are in scope? -->

### In Scope

### Out of Scope

## Domain Model

<!-- Key entities, value objects, and their relationships within this module.
     Use a brief textual description or a simple diagram. -->

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| ... | ... | ... |

### Relationships

- ...

### Invariants

<!-- Business rules that must always hold true within this module. -->

- ...

## Capability Map

| Capability | Description | Status |
|------------|-------------|--------|

## Deferred Capabilities

<!-- Capabilities explicitly deferred to later milestones or out of scope with structured tracking.
     Migrated from Out of Scope when a capability has a known target milestone or dependency.
     This table enables reliable backlog extraction by /adev:status --backlog. -->

| Capability | Reason | Target Milestone | Depends On |
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

<!-- Measurable quality targets for this pipeline. -->

| Attribute | Target | Measurement |
|-----------|--------|-------------|
| Freshness SLA | | |
| Completeness (null rate) | | |
| Accuracy | | |
| Row Count Stability | | |
| Schema Drift Detection | | |

## Data Model

### Sources

<!-- Input data sources. Schema, format, refresh frequency, ownership. -->

### Transformations

<!-- Data transformation steps. Business logic, aggregation rules, join conditions. -->

### Outputs

<!-- Output tables, views, or files. Schema, granularity, partitioning. -->

## Data Lineage

<!-- End-to-end data flow from source to output. Dependencies between models. -->

## Pipeline Stages

<!-- Ordered stages of the pipeline: extract, load, transform, test, publish. -->

| Stage | Description | Models | SLA |
|-------|-------------|--------|-----|

## Data Contract

<!-- Agreements between producers and consumers. Schema guarantees, freshness SLAs, quality thresholds. -->
