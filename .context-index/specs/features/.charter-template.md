# Feature Charter: {{ module_name }}

<!-- Feature Charter for the {{ module_name }} module.
     This defines WHAT the module does and its boundaries, not HOW it is built.
     Live Specs within this charter define specific behavioral contracts. -->

## Business Intent

<!-- Why does this module exist? What user or business problem does it solve?
     Keep this to 2-3 sentences. If you cannot articulate the intent clearly,
     the module scope may be too broad or too vague. -->

...

## Scope and Boundaries

### In Scope

<!-- Capabilities this module owns. Be specific about what it does. -->

- ...

### Out of Scope

<!-- Capabilities that are explicitly NOT part of this module.
     This prevents scope creep and clarifies ownership boundaries. -->

- ...

### Dependencies

<!-- Other modules or external services this module depends on.
     Note the direction of dependency (this module depends on X, not X depends on this). -->

| Dependency | Type | Description |
|-----------|------|-------------|
| ... | internal module / external service / shared library | ... |

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

<!-- The specific capabilities (features, operations) this module provides.
     Each capability is a candidate for a Live Spec.
     Phase indicates WHEN a capability ships (e.g., v1, v2, mvp, post-launch).
     Phase is about timing, not importance (that is Priority). Leave blank if unassigned. -->

| Capability | Description | Priority | Phase |
|-----------|-------------|----------|-------|
| ... | ... | must-have / should-have / nice-to-have | |

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

<!-- Non-functional requirements specific to this module. -->

| Attribute | Requirement |
|-----------|-------------|
| Performance | ... |
| Availability | ... |
| Security | ... |
| Observability | ... |
