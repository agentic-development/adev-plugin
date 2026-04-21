---
charter: test-strategies
status: review-passed
revision: 1
charter-revision: 2
created: 2026-04-20
updated: 2026-04-20
---

# Spec: Strategy Type Registry

## Capability

Define the 8 strategy types with summary traits (RED/GREEN semantics, domain, typical tools).

## Preconditions

- The test-strategies module is loaded by a consuming skill (plan, write-test, implement, validate)

## Behavioral Contract

### Behaviors

1. When the module is loaded, then it exposes a registry of exactly 8 strategy types: `unit`, `schema`, `contract`, `fixture`, `policy`, `threshold`, `visual`, `smoke`
2. When a consumer queries a strategy by ID, then the registry returns: `id` (slug), `name`, `description`, `red_semantics` (what RED means for this strategy), `green_semantics` (what GREEN means), `domain` (what kind of work this strategy applies to), `typical_tools` (frameworks/tools commonly used)
3. When a consumer queries a strategy ID that is not one of the 8 defined types, then the registry returns `null` (not an error — fallback is handled by the assignment protocol)
4. When the registry is enumerated, then strategies are returned in a stable, alphabetical order by ID

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Query with empty string | Returns null | STRATEGY_NOT_FOUND |
| Query with undefined/null | Returns null | STRATEGY_NOT_FOUND |

## Constitution Reference

- "Skills are primarily markdown" — Strategy type definitions are markdown tables consumed by skills, not executable code
- "Minimize external dependencies" — Registry is a pure data structure using Node.js built-ins only

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Define strategy type data structure | Create the 8 strategy type objects with all required fields | medium |
| Implement registry lookup function | `getStrategy(id)` and `listStrategies()` functions | small |
| Write registry documentation | Markdown reference table of all 8 strategies and their traits | small |

## Acceptance Criteria

- [ ] Registry contains exactly 8 strategy types
- [ ] Each strategy has all required fields: `id`, `name`, `description`, `red_semantics`, `green_semantics`, `domain`, `typical_tools`
- [ ] Unknown strategy IDs return `null` without throwing
- [ ] Enumeration returns strategies in stable alphabetical order
- [ ] No external dependencies introduced
- [ ] All quality gates pass
- [ ] No constitutional violations introduced
