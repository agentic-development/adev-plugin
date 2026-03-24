# Feature Charter: adev-assess

<!-- Feature Charter for the adev-assess module.
     This defines WHAT the module does and its boundaries, not HOW it is built.
     Live Specs within this charter define specific behavioral contracts. -->

## Business Intent

Evaluate codebase readiness for agentic development using static file inspection. Provides maturity scores across 11 dimensions (8 structural + 3 adev-specific) to help teams understand their project's agent-readiness and identify improvement areas.

## Scope and Boundaries

### In Scope

- 11 assessment dimensions (Test Infrastructure, Type Safety, Modularity, Naming, Documentation, Dependency Hygiene, Build Configuration, Spec Sources + adev Context Index, adev Skills, adev Hooks)
- Two modes: "raw codebase" (8 dimensions) and "adev-configured" (adds 3 adev dimensions)
- Static file inspection using Glob/Grep/Read only (no external commands)
- Markdown scorecard output
- JSON report output for machine consumption
- Maturity levels 1-5

### Out of Scope

- Runtime code execution or testing
- External command execution (npm test, tsc, etc.)
- Auto-remediation or code fixes
- Integration with CI/CD

### Dependencies

| Dependency | Type | Description |
|-----------|------|-------------|
| None | - | Uses only Node.js built-ins (fs, path, glob, grep) |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| Dimension | An assessment area (e.g., Test Infrastructure) | name, weight, score |
| AssessmentResult | Score for a single dimension | dimension, score, evidence |
| AssessmentReport | Aggregate results | totalScore, level, dimensions, timestamp |

### Relationships

- AssessmentReport contains multiple AssessmentResults
- Each AssessmentResult maps to one Dimension

### Invariants

- Each dimension score is between 0-100
- Total score is weighted average of dimension scores
- Level is derived from total score (L1: 0-20, L2: 21-40, L3: 41-60, L4: 61-80, L5: 81-100)

## Capability Map

| Capability | Description | Priority |
|------------|-------------|----------|
| Run Assessment | Execute static file inspection across all dimensions | must-have |
| Output Markdown | Generate readable scorecard with visual indicators | must-have |
| Output JSON | Generate machine-readable report with scores | must-have |
| Detect Mode | Auto-detect if codebase has .context-index/ for mode selection | must-have |
| Configurable Weights | Allow adjusting dimension weights | nice-to-have |

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|-----------|------|-------------|
| /adev-assess | Skill | Main assessment command |
| --mode raw\|adev | Flag | Force specific assessment mode |
| --output json\|markdown | Flag | Output format |

### Consumed APIs

None — standalone skill

## Quality Attributes

| Attribute | Requirement |
|-----------|-------------|
| Performance | Completes assessment in <5 seconds for typical codebase |
| Reliability | Deterministic results across runs |
| Portability | Zero external dependencies |
