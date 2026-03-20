---
name: adev-sample
description: Scan the codebase for high-quality implementations, score them against constitution and patterns, and curate annotated golden samples in .context-index/samples/. Golden samples serve as reference implementations that guide subagents during /adev-implement.
---

# Golden Sample Curation

Scan the codebase for exemplary implementations, score candidates against the constitution and declared patterns, and extract annotated golden samples into `.context-index/samples/`. Golden samples are the "show, do not tell" layer of the context index: they give subagents a concrete reference for how to write code in this project.

## Arguments

- `--pattern <name>`: extract a golden sample for a specific specialist pattern (e.g., `--pattern api-route`)
- `--from <file>`: promote a specific file directly to golden sample (skips discovery, goes to scoring)
- `--score`: re-score all existing samples against the current constitution and patterns
- `--refresh`: re-score, flag stale samples, and update or remove invalid ones

## Prerequisites

The project must have `.context-index/` initialized with `constitution.md` and `manifest.yaml`. If either is missing, stop and suggest running `/adev-init` first.

## Process

**Announce at start:**
```
Starting golden sample curation.
Mode: [discovery | promote <file> | score | refresh]
```

### Step 1: Load Context

Read these files once at the start. They define what "good" looks like for this project.

1. **`.context-index/constitution.md`** — Extract the Coding Standards section. This is the primary quality rubric.
2. **`.context-index/manifest.yaml`** — Extract the `specialists` registry. Each specialist's `trigger_patterns` and `trigger_keywords` define domain-specific quality expectations.
3. **`.context-index/platform-context.yaml`** — If it exists, read framework conventions, file structure expectations, and naming patterns. If it does not exist, skip.
4. **Existing samples.** List all files in `.context-index/samples/`. Read their frontmatter to understand what patterns are already covered and their current scores.

If `--pattern` was provided, filter the specialist registry to only the matching specialist. If the pattern name does not match any specialist, report the available patterns and stop.

### Step 2: Discovery

**Skip this step if `--from`, `--score`, or `--refresh` was provided.**

Scan the codebase to identify candidate files that demonstrate good patterns.

#### 2a. Pattern-Based Scanning

For each specialist in the manifest (or the single specialist if `--pattern` was provided):

1. Expand each `trigger_patterns` glob against the codebase.
2. For each matching file, add it to the candidate list tagged with the specialist name.

If no specialists are configured, fall back to scanning common source directories (`src/`, `lib/`, `app/`, `components/`, `pages/`).

#### 2b. Candidate Filtering

Remove candidates that are unlikely to be golden samples:

- Files shorter than 20 lines (too trivial to be instructive)
- Generated files (check for `@generated`, `auto-generated`, or common codegen markers)
- Test files (they are checked separately in Step 3 for coverage, but are not samples themselves)
- Files in `node_modules/`, `.next/`, `dist/`, `build/`, or other build output directories
- Migration files (timestamped SQL, Prisma migrations)

#### 2c. Change Frequency Bonus

For remaining candidates, check recent git activity:

```bash
git log --oneline --since="60 days ago" -- <file> | wc -l
```

Files with recent activity (modified in the last 60 days) get a recency bonus in scoring. Files untouched for 6+ months are deprioritized (they may use outdated patterns).

### Step 3: Scoring

Score each candidate on five dimensions. Each dimension is 0 to 20 points, for a maximum total of 100.

#### Dimension 1: Test Coverage (0-20)

- **20 points:** A corresponding test file exists AND the test file contains assertions that reference the candidate's exports or key functions.
- **10 points:** A corresponding test file exists but coverage is unclear (test file exists at the expected path but does not clearly test this file's behavior).
- **0 points:** No corresponding test file found.

Test file detection: look for `<filename>.test.<ext>`, `<filename>.spec.<ext>`, or `__tests__/<filename>.<ext>`.

#### Dimension 2: Naming Conventions (0-20)

- **20 points:** File name, exported symbols, and internal variables follow the constitution's Coding Standards naming rules (e.g., PascalCase components, camelCase functions, kebab-case files).
- **10 points:** Mostly follows conventions with minor deviations.
- **0 points:** Significant naming convention violations.

#### Dimension 3: Pattern Adherence (0-20)

- **20 points:** The file demonstrates the specialist's declared patterns cleanly. For example, an API route follows the project's error handling convention, uses the declared ORM correctly, and follows the response shape contract.
- **10 points:** Follows most patterns but has minor deviations.
- **0 points:** Does not follow declared patterns or uses anti-patterns.

If no specialist is associated with the file, score based on general constitution adherence.

#### Dimension 4: Complexity (0-20)

- **20 points:** Reasonable file size (under 200 lines), clear interfaces (well-defined exports), single responsibility.
- **10 points:** Moderate size (200-400 lines) or slightly mixed responsibilities.
- **0 points:** Over 400 lines, unclear interfaces, or multiple unrelated responsibilities.

#### Dimension 5: Recency (0-20)

- **20 points:** Modified within the last 30 days.
- **15 points:** Modified within the last 60 days.
- **10 points:** Modified within the last 90 days.
- **5 points:** Modified within the last 180 days.
- **0 points:** Not modified in 180+ days.

#### Present Results

Rank candidates by total score. Present the top 10 (or fewer if less exist) to the user:

```
## Sample Candidates

| Rank | File | Pattern | Score | Test | Naming | Pattern | Complexity | Recency |
|------|------|---------|-------|------|--------|---------|------------|---------|
| 1 | src/lib/auth/session.ts | security | 85 | 20 | 20 | 20 | 15 | 10 |
| 2 | src/components/DataTable.tsx | frontend | 80 | 20 | 15 | 20 | 15 | 10 |
| ... | | | | | | | | |

Select files to extract as golden samples (e.g., "1, 3" or "all").
```

Wait for user selection before proceeding.

### Step 4: Extract

For each selected candidate, create an annotated golden sample.

#### 4a. Read the Source

Read the full source file. Read its corresponding test file if one exists.

#### 4b. Annotate

Create the sample file using the template at `templates/sample-template.md`. Fill in every section:

1. **Why This Is a Golden Sample.** Explain which coding standards and patterns the file demonstrates. Reference specific constitution principles by name. Explain why the implementation choices are good, not just what they are.
2. **The Code.** Include the full source code with inline comments that explain pattern decisions. Do not just describe what each line does. Explain WHY each pattern was chosen and what principle it serves. Mark sections with the constitution principle they demonstrate.
3. **Test Coverage.** Include relevant test code. Explain what each test verifies about the behavior (not the implementation). Note the TDD approach if visible.
4. **Usage Guide.** Describe when a subagent should reference this sample. Which types of tasks should follow this pattern. What to adapt versus what to keep exactly.

#### 4c. Write the Sample

Save the annotated sample to `.context-index/samples/<pattern-name>-<descriptive-slug>.md`.

File naming convention: `<specialist-pattern>-<short-description>.md`. Examples:
- `api-route-crud-endpoint.md`
- `frontend-data-table-component.md`
- `security-auth-middleware.md`

If no specialist pattern applies, use `general-<description>.md`.

### Step 5: Register

After creating the sample:

1. If any Feature Charter mentions the pattern demonstrated by the sample, note the sample in the charter's related context (informational; do not modify the charter file).
2. Print a summary of what was created and where it was saved.

```
Golden sample created:
- .context-index/samples/api-route-crud-endpoint.md (score: 85/100)
  Source: src/app/api/users/route.ts
  Pattern: api-route
  Principles: error-handling, response-shape, input-validation
```

## --from Mode

When `--from <file>` is provided:

1. Skip Step 2 (Discovery). The user has already chosen the file.
2. Run Step 3 (Scoring) on the single file. Present the score breakdown.
3. If the score is below 50, warn the user that this file may not be a strong golden sample. Ask if they want to proceed anyway.
4. If the user confirms (or score is 50+), proceed to Step 4 (Extract).
5. Run Step 5 (Register).

## --score Mode

When `--score` is provided:

1. Skip Steps 2 and 4.
2. Load all existing samples from `.context-index/samples/`.
3. For each sample, extract the source file path from the frontmatter.
4. Re-score the source file using the five dimensions from Step 3.
5. Compare the new score against the recorded score.
6. Present a report:

```
## Sample Score Audit

| Sample | Old Score | New Score | Delta | Status |
|--------|-----------|-----------|-------|--------|
| api-route-crud-endpoint.md | 85 | 80 | -5 | OK |
| frontend-data-table.md | 75 | 45 | -30 | DEGRADED |
| security-auth-middleware.md | 90 | 90 | 0 | OK |

Degraded samples need attention: source code has changed or standards have evolved.
```

## --refresh Mode

When `--refresh` is provided:

1. Run `--score` logic first.
2. For each sample, additionally check:
   - **Staleness:** Has the source file changed since the sample was extracted? Compare the file's current content against the code block in the sample. If they differ, flag as STALE.
   - **Pattern drift:** Does the source file still match current coding standards? If the constitution has changed since the sample was created, the sample may demonstrate outdated patterns. Flag as DRIFT.
3. For STALE samples, offer to re-extract (run Step 4 again on the current version of the source file).
4. For DRIFT samples, offer to find a better candidate (run Step 2 for the same pattern).
5. For samples scoring below 50 after re-scoring, recommend removal.

```
## Sample Refresh

| Sample | Score | Stale? | Drift? | Action |
|--------|-------|--------|--------|--------|
| api-route-crud-endpoint.md | 80 | Yes | No | Re-extract recommended |
| frontend-data-table.md | 45 | No | Yes | Find replacement |
| security-auth-middleware.md | 90 | No | No | No action needed |

Proceed with recommended actions? (y/n)
```

## Red Flags

**Never:**
- Extract a sample with a score below 50 without explicit user confirmation
- Include generated code, migration files, or test files as golden samples
- Modify the original source file (samples are read-only extractions)
- Skip the annotation step (unannotated code is not a golden sample)
- Create samples without reading the constitution first (the constitution defines "good")
- Overwrite an existing sample without confirmation
