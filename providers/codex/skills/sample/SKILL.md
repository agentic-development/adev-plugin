---
name: adev:sample
description: "Scan codebase for high-quality implementations, score them against constitution, and curate golden samples. In Codex, invoke with $adev:sample"
---

# Golden Sample Curation

Scan codebase for exemplary implementations, score, and extract golden samples.

## Arguments

- `--pattern <name>`: extract for specific specialist pattern
- `--from <file>`: promote specific file to sample
- `--score`: re-score all existing samples
- `--refresh`: re-score, flag stale, update or remove

## Prerequisites

`.context-index/` initialized with constitution and manifest.

## Step 1: Load Context

Read:
1. Constitution (Coding Standards)
2. Manifest (specialists registry)
3. Platform context
4. Existing samples

## Step 2: Discovery

(Skip if `--from`, `--score`, `--refresh`)

1. Expand specialist `trigger_patterns` against codebase
2. Filter candidates:
   - Remove files <20 lines
   - Remove generated, test, migration files
3. Check git activity for recency bonus

## Step 3: Scoring

Five dimensions (0-20 each, max 100):

### Test Coverage
- 20: Test exists with assertions
- 10: Test file exists
- 0: No test

### Naming Conventions
- 20: Follows constitution
- 10: Minor deviations
- 0: Significant violations

### Pattern Adherence
- 20: Demonstrates patterns cleanly
- 10: Minor deviations
- 0: Anti-patterns

### Complexity
- 20: <200 lines, single responsibility
- 10: 200-400 lines
- 0: >400 lines

### Recency
- 20: Modified within 30 days
- 15: 60 days
- 10: 90 days
- 5: 180 days
- 0: 180+ days

## Step 4: Extract

For each candidate:
1. Read source and test file
2. Annotate with coding standards and patterns demonstrated
3. Save to `.context-index/samples/<pattern>-<slug>.md`

## Step 5: Register

1. Note sample in relevant charter (informational)
2. Print summary

## Report Format

```
## Sample Candidates

| Rank | File | Pattern | Score | Test | Naming | Pattern | Complexity | Recency |
|------|------|---------|-------|------|--------|---------|------------|---------|
| 1 | src/lib/auth/session.ts | security | 85 | 20 | 20 | 20 | 15 | 10 |
```

## After Curation

```
Golden sample created:
- .context-index/samples/api-route-crud-endpoint.md (score: 85/100)
  Source: src/app/api/users/route.ts
  Pattern: api-route
  Principles: error-handling, response-shape
```

## Red Flags

**Never:**
- Extract sample <50 score without confirmation
- Include generated/migration/test files
- Modify source files
- Skip annotation
- Create without reading constitution
