---
name: adev:sample
description: "Scan codebase for high-quality implementations, score them against constitution, and curate golden samples. In OpenCode, invoke with skill({ name: 'adev:sample' })"
---

# Golden Sample Curation

Scan the codebase for exemplary implementations, score candidates, and extract annotated golden samples into `.context-index/samples/`.

## Arguments

- `--pattern <name>`: extract a golden sample for a specific specialist pattern
- `--from <file>`: promote a specific file directly to golden sample
- `--score`: re-score all existing samples
- `--refresh`: re-score, flag stale samples, and update or remove invalid ones

## Prerequisites

The project must have `.context-index/` initialized with `constitution.md` and `manifest.yaml`.

## Process

### Step 1: Load Context

Read:

1. `.context-index/constitution.md` — Coding Standards (quality rubric)
2. `.context-index/manifest.yaml` — Specialists registry
3. `.context-index/platform-context.yaml` — Framework conventions (if exists)
4. Existing samples — List files in `.context-index/samples/`

### Step 2: Discovery

**Skip if `--from`, `--score`, or `--refresh` provided.**

1. For each specialist in manifest, expand `trigger_patterns` globs against codebase
2. Filter candidates:
   - Remove files shorter than 20 lines
   - Remove generated files, test files, migration files
   - Remove files in build output directories
3. Check recent git activity for recency bonus

### Step 3: Scoring

Score each candidate on five dimensions (0-20 each, max 100):

**Dimension 1: Test Coverage (0-20)**

- 20: Corresponding test exists with assertions
- 10: Test file exists but coverage unclear
- 0: No test file

**Dimension 2: Naming Conventions (0-20)**

- 20: Follows constitution naming rules
- 10: Minor deviations
- 0: Significant violations

**Dimension 3: Pattern Adherence (0-20)**

- 20: Demonstrates specialist patterns cleanly
- 10: Minor deviations
- 0: Anti-patterns

**Dimension 4: Complexity (0-20)**

- 20: Under 200 lines, single responsibility
- 10: 200-400 lines or mixed responsibilities
- 0: Over 400 lines, unclear interfaces

**Dimension 5: Recency (0-20)**

- 20: Modified within 30 days
- 15: Modified within 60 days
- 10: Modified within 90 days
- 5: Modified within 180 days
- 0: 180+ days

### Step 4: Extract

For each selected candidate:

1. **Read the Source** — Full source and corresponding test file
2. **Annotate** — Explain which coding standards and patterns the file demonstrates
3. **Write** — Save to `.context-index/samples/<pattern-name>-<slug>.md`

### Step 5: Register

After creating sample:

1. Note the sample in relevant Feature Charter context (informational)
2. Print summary of created samples

## --from Mode

1. Skip Step 2 (Discovery)
2. Run Step 3 (Scoring) on single file
3. If score below 50, warn user
4. Proceed to Step 4 (Extract) if confirmed

## --score Mode

1. Skip Steps 2 and 4
2. Load all existing samples
3. Re-score source files
4. Present comparison report

## --refresh Mode

1. Run `--score` logic
2. Check staleness and pattern drift
3. Offer to re-extract or find replacements
4. Recommend removal for samples scoring below 50

## Report Format

```markdown
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

- Extract sample with score below 50 without user confirmation
- Include generated code, migrations, or test files as golden samples
- Modify source files (samples are read-only extractions)
- Skip annotation step
- Create samples without reading constitution first
