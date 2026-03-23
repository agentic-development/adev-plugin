# PRD: `/adev-assess` — Codebase Readiness Assessment

**Date:** 2026-03-22
**Author:** dpavancini
**Status:** Draft
**Version:** v0.6.0 target (no dependency on tree-sitter repomap; can ship independently)

## Problem

Teams considering agentic development have no way to evaluate whether their codebase is ready. Common failure modes:

1. **Adopting adev on a codebase with no tests.** Agents cannot validate their work. `/adev-validate` check 1 (quality gates) fails immediately. The team blames the tooling.
2. **Adopting adev on a monolithic codebase with no module boundaries.** `/adev-route` cannot score blast radius because everything is coupled. Every task routes as human-only.
3. **Overestimating readiness.** A team with "good test coverage" discovers their tests are all integration tests that take 10 minutes to run. Agents timeout waiting for feedback.
4. **No baseline for improvement.** After 3 months of adev adoption, there is no way to measure whether the codebase has become more agent-friendly.

Factory AI published an "Agent Readiness Framework" but it is proprietary and inaccessible. No open, reusable assessment tool exists.

**Research reference:** `agentic-dev-content/research/agentic-codebase-orchestration.md`

## Goals

1. Create `/adev-assess`, a skill that evaluates codebase readiness for agentic development.
2. Produce a human-readable scorecard (markdown) and a machine-readable report (JSON).
3. Work on any codebase, with or without `.context-index/`. If adev is already configured, assess spec coverage and constitution quality as additional dimensions.
4. Provide a composite readiness level (1-5) that maps to what agents can realistically accomplish.
5. Include 3 concrete recommended next steps based on the lowest-scoring dimensions.

## Non-Goals

- Running build/test/lint commands. The skill assesses structure and configuration only. It does not execute quality gates (too slow, too noisy on unfamiliar codebases). It checks whether the commands are configured and trusts the user to confirm they pass.
- Prescribing a full adoption plan. The scorecard informs planning; a consulting engagement or `/adev-init` does the actual setup.
- Comparing against other projects or industry benchmarks. The score is relative to adev's own requirements, not to external standards.

## Design

### Two Modes

| Mode | Triggered When | What It Assesses |
|---|---|---|
| **Raw codebase** | `.context-index/` does not exist | 8 structural dimensions (tests, types, modularity, naming, docs, deps, build config, spec sources) |
| **adev-configured** | `.context-index/` exists | Same 8 dimensions + 3 adev dimensions (constitution quality, charter coverage, spec completeness) |

The skill auto-detects the mode. No flag needed.

### Assessment Dimensions

#### Structural Dimensions (always assessed)

**1. Test Infrastructure (0-12 points)**

| Check | Method | Points |
|---|---|---|
| Test runner configured | Read `package.json` scripts for `test` command; check for `jest.config`, `vitest.config`, `pytest.ini`, `go.test`, etc. | 3 |
| Test files exist | Glob for `**/*.test.*`, `**/*.spec.*`, `**/test_*.py`, `**/*_test.go` | 3 |
| Test-to-source ratio | Count test files vs. source files. Ratio > 0.3 = good | 3 |
| Test co-location or clear structure | Tests next to source files OR in a dedicated `tests/`/`__tests__` directory (not scattered randomly) | 3 |

**2. Type Safety (0-12 points)**

| Check | Method | Points |
|---|---|---|
| Type system present | Check for `tsconfig.json`, type annotations in Python (`py.typed`, mypy config), Go (inherent) | 4 |
| Strict mode | `tsconfig.json` strict: true, or mypy strict, or equivalent | 4 |
| Type escape hatch prevalence | Grep for `any` in TypeScript, `# type: ignore` in Python, `interface{}` in Go. Count vs. total lines. < 1% = full points | 4 |

**3. Modularity (0-12 points)**

| Check | Method | Points |
|---|---|---|
| Directory structure depth | Source code organized into directories at least 2 levels deep (not everything in `src/`) | 3 |
| Module count | At least 3 distinct functional directories (not just `components/`, `utils/`, `lib/`) | 3 |
| Barrel exports or clear entry points | Modules have `index.ts`/`__init__.py`/`mod.rs` or equivalent public API surface | 3 |
| Separation of concerns | No single directory contains > 30% of all source files | 3 |

**4. Naming Consistency (0-12 points)**

| Check | Method | Points |
|---|---|---|
| File naming convention | All files follow one convention: kebab-case, camelCase, PascalCase, or snake_case (not mixed) | 4 |
| Directory naming convention | Consistent with file convention | 4 |
| No ambiguous names | No files named `utils.ts`, `helpers.ts`, `misc.ts`, `common.ts` at the top level (these are anti-patterns that attract unrelated code) | 4 |

**5. Documentation (0-13 points)**

| Check | Method | Points |
|---|---|---|
| README exists | Check for `README.md` at project root | 3 |
| README is non-trivial | README > 50 lines (not just a title and auto-generated template) | 3 |
| Architecture docs exist | Check for `docs/`, `ARCHITECTURE.md`, `docs/architecture.md`, or equivalent | 4 |
| Code comments on public APIs | Sample 5 exported functions/classes, check for JSDoc/docstring/comment | 3 |

**6. Dependency Hygiene (0-13 points)**

| Check | Method | Points |
|---|---|---|
| Lock file exists | Check for `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `poetry.lock`, `go.sum` | 3 |
| No circular imports (heuristic) | Sample 10 files, trace first-level imports, check for A→B→A patterns | 4 |
| Reasonable dependency count | `dependencies` count < 100 for a typical app (not bloated) | 3 |
| No deprecated/abandoned deps | Check for known deprecated packages (`@vercel/postgres`, `@vercel/kv`, `request`, `moment`) | 3 |

**7. Build Configuration (0-13 points)**

| Check | Method | Points |
|---|---|---|
| Build command configured | `package.json` has `build` script, or `Makefile`, or `Cargo.toml`, etc. | 4 |
| Lint command configured | `package.json` has `lint` script, or `.eslintrc`, `ruff.toml`, `golangci-lint` config | 4 |
| Type check command configured | `package.json` has `typecheck` script, or `tsc` is a dependency | 5 |

**8. Spec Sources (0-13 points)**

| Check | Method | Points |
|---|---|---|
| Existing specs or requirements | Check for `docs/`, `specs/`, `requirements/`, `.github/ISSUE_TEMPLATE/`, ADRs, RFCs | 4 |
| API contracts | Check for OpenAPI/Swagger files, GraphQL schemas, `.proto` files | 4 |
| Environment configuration | `.env.example` or `.env.template` exists (documents required env vars) | 2 |
| CI/CD configuration | `.github/workflows/`, `Jenkinsfile`, `Dockerfile`, `vercel.json` exists | 3 |

**Total structural: 100 points**

#### adev Dimensions (assessed only when `.context-index/` exists)

These are bonus dimensions that do not affect the 1-5 level but are reported separately.

**A. Constitution Quality (0-100%)**

| Check | Method |
|---|---|
| All 6 required sections present | Parse constitution.md headings |
| Under 200-line limit | Line count |
| Context Routing pointers resolve | Check that referenced paths exist |
| Non-Negotiable Principles are specific (not generic platitudes) | Heuristic: at least 3 principles, each under 2 sentences |

**B. Charter Coverage (0-100%)**

| Check | Method |
|---|---|
| Percentage of manifest modules with a charter.md | Count charters vs. modules |
| Charters have Business Intent section | Parse charter headings |
| Charters have Interface Contracts section | Parse charter headings |

**C. Spec Completeness (0-100%)**

| Check | Method |
|---|---|
| Percentage of charter capabilities with a live spec | Count specs vs. charter capability maps |
| Specs have acceptance criteria | Grep for "Acceptance Criteria" or "Given/When/Then" |
| Specs have been reviewed (`.review.md` exists) | Check for review files |

### Readiness Levels

| Level | Score | Label | What Agents Can Do |
|---|---|---|---|
| **1** | 0-20 | **Hostile** | Almost nothing. Manual preparation required before adopting adev. |
| **2** | 21-40 | **Fragile** | Simple, well-scoped bug fixes with heavy human supervision. |
| **3** | 41-60 | **Viable** | Assisted agent tasks. Most `/adev-route` scores land on "assisted-agent". |
| **4** | 61-80 | **Ready** | Full adev pipeline works. Mix of auto-agent and assisted-agent routing. |
| **5** | 81-100 | **Optimized** | Most tasks route as auto-agent. Agents operate with high autonomy. |

## Output

### Scorecard (`docs/assessment.md` or printed to console)

```markdown
# Codebase Readiness Assessment

**Project:** my-app
**Date:** 2026-03-22
**Assessed by:** /adev-assess v0.6.0

## Readiness Level: 3 — Viable (Score: 58/100)

Agents can handle assisted tasks with human supervision. Key areas to
improve before full autonomous operation: test coverage and type safety.

## Dimension Scores

| Dimension | Score | Max | Status |
|-----------|-------|-----|--------|
| Test Infrastructure | 6 | 12 | Tests exist but low test-to-source ratio (0.15) |
| Type Safety | 4 | 12 | TypeScript present but strict mode off, 3.2% `any` usage |
| Modularity | 10 | 12 | Good module structure, clear boundaries |
| Naming Consistency | 12 | 12 | Consistent kebab-case throughout |
| Documentation | 7 | 13 | README exists but no architecture docs |
| Dependency Hygiene | 9 | 13 | Clean, no circular imports detected |
| Build Configuration | 8 | 13 | Build and lint configured, no typecheck script |
| Spec Sources | 2 | 13 | Only CI config exists, no API contracts or specs |

## Top 3 Improvements

1. **Enable TypeScript strict mode** (+4 points → score 62, Level 4).
   Add `"strict": true` to tsconfig.json and fix the resulting errors.
   This gives agents reliable type information for every function signature.

2. **Add a typecheck script** (+5 points → score 67, Level 4).
   Add `"typecheck": "tsc --noEmit"` to package.json scripts.
   This enables `/adev-validate` quality gate for type checking.

3. **Write more tests** (up to +6 points).
   Current test-to-source ratio is 0.15 (target: 0.3+).
   Focus on the 3 highest-traffic modules first.

## Detail

[Per-dimension details with specific files checked and findings]
```

### Machine-Readable Report (`docs/assessment.json`)

```json
{
  "version": "0.6.0",
  "project": "my-app",
  "date": "2026-03-22",
  "commit": "abc1234",
  "score": 58,
  "level": 3,
  "level_label": "Viable",
  "dimensions": {
    "test_infrastructure": {
      "score": 6,
      "max": 12,
      "checks": {
        "test_runner_configured": { "pass": true, "points": 3, "detail": "vitest in package.json scripts" },
        "test_files_exist": { "pass": true, "points": 3, "detail": "24 test files found" },
        "test_to_source_ratio": { "pass": false, "points": 0, "detail": "0.15 (target: 0.3)" },
        "test_structure": { "pass": false, "points": 0, "detail": "tests scattered across 8 directories" }
      }
    }
  },
  "adev": null,
  "improvements": [
    {
      "action": "Enable TypeScript strict mode",
      "dimension": "type_safety",
      "points_gain": 4,
      "projected_score": 62,
      "projected_level": 4
    }
  ]
}
```

When `.context-index/` exists, the `"adev"` field contains:

```json
{
  "adev": {
    "constitution_quality": 85,
    "charter_coverage": 60,
    "spec_completeness": 33
  }
}
```

### Output Location

| Context | Scorecard Location | JSON Location |
|---|---|---|
| adev not configured | Printed to console only (no `docs/` to write to) | `assessment.json` in project root (gitignored) |
| adev configured | `docs/assessment.md` (committed) | `docs/assessment.json` (committed) |

Rationale: Before adev is set up, we should not create files in the project without asking. After adev is set up, the assessment is part of the project documentation.

Actually, even before adev setup, we should ask: "Save assessment to docs/assessment.md? [Y/n]". If yes, create `docs/` if needed.

## Skill Flow

```
1. Detect project type
   - Read package.json, Cargo.toml, pyproject.toml, go.mod, etc.
   - Identify language(s) and framework(s)

2. Check for .context-index/
   - If exists: set mode = "adev-configured"
   - If not: set mode = "raw-codebase"

3. Run structural checks (all 8 dimensions)
   - Each check uses Glob, Grep, or Read (no Bash commands)
   - No builds, no test runs, no installs
   - Record findings per check

4. If mode = "adev-configured":
   - Run adev dimension checks (constitution, charters, specs)

5. Compute scores
   - Sum points per dimension
   - Compute total score and level

6. Generate improvements
   - Sort dimensions by score ascending (worst first)
   - For top 3 lowest dimensions, identify the specific check that failed
     and compute the points gain if fixed
   - Project the new total score and level after each fix

7. Generate output
   - Render scorecard markdown
   - Render JSON report
   - Present to user

8. Ask: "Save assessment to docs/? [Y/n]"
   - If yes: write docs/assessment.md and docs/assessment.json
   - If no: print to console only
```

## No External Commands

The skill does NOT run:
- `npm test`, `npx jest`, `pytest`, `go test`
- `npx tsc --noEmit`, `npm run build`
- `npm run lint`, `eslint`, `ruff`
- `npm audit`, `npm outdated`

All checks are **static analysis via file inspection**. This means:
- Fast (seconds, not minutes)
- Safe (no side effects, no installs, no builds)
- Works on codebases with broken builds
- Works without project dependencies installed

The tradeoff: we check that `"test": "vitest"` exists in `package.json`, not that `vitest` actually runs. The user confirms operational status. The skill assesses structure and configuration readiness.

## Testing

### Unit Tests

| Test | Validates |
|------|-----------|
| `assess-typescript.test.mjs` | Correct scores for a TypeScript fixture project |
| `assess-python.test.mjs` | Correct scores for a Python fixture project |
| `assess-go.test.mjs` | Correct scores for a Go fixture project |
| `assess-level-boundaries.test.mjs` | Score 20 = Level 1, score 21 = Level 2, etc. |
| `assess-adev-mode.test.mjs` | adev dimensions assessed when .context-index/ exists |
| `assess-improvements.test.mjs` | Top 3 improvements correctly sorted and projected |
| `assess-json-schema.test.mjs` | JSON output matches expected schema |

### Fixture Projects

Create minimal fixture projects:

| Fixture | Expected Level | Purpose |
|---|---|---|
| `fixtures/assess-hostile/` | Level 1 (score ~15) | No tests, no types, flat structure, no docs |
| `fixtures/assess-viable/` | Level 3 (score ~55) | Tests exist, TS non-strict, some modularity |
| `fixtures/assess-optimized/` | Level 5 (score ~90) | Full coverage, strict TS, clear modules, docs, specs |
| `fixtures/assess-with-adev/` | Level 4 + adev scores | Has .context-index/ with partial charter coverage |

## Rollout

Single phase (v0.6.0). No dependencies on tree-sitter repomap. Can ship in parallel with `/adev-document`.

## Success Metrics

1. **Score accuracy:** Fixture projects produce expected levels (within 5 points of target).
2. **Improvement actionability:** Each recommended improvement includes the specific file to change, the expected points gain, and the projected new level.
3. **Zero side effects:** The skill never runs external commands. All checks are file-based.
4. **Consulting utility:** JSON report enables tracking scores across multiple client projects over time.
