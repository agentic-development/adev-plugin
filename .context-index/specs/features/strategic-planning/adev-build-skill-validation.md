# Validation Report: adev:build Orchestrator (revision 3)

> **Date:** 2026-04-21
> **Spec:** .context-index/specs/features/strategic-planning/adev-build-skill.md
> **Plan:** (none — markdown-only skill, no plan file)
> **Overall Status:** PASS

---

## Check 1: Quality Gates — PASS (advisory)

No `governance/gates.yaml` configured. Ran `npm test` directly: 1365 pass, 1 pre-existing fail (context-pack.test.mjs:58 — unrelated). No source code modified — changes are markdown-only.

## Check 1.5: Source Manifest Verification — PASS

Manifest `sha: "2d82a17"` matches current computed hash. Files: `skills/build/SKILL.md`, `templates/manifest-template.yaml`.

## Check 2: Spec Compliance — PASS

Per-criterion traceability against `skills/build/SKILL.md`:

| # | Acceptance Criterion | Status | SKILL.md Evidence |
|---|---------------------|--------|-------------------|
| 1 | `--spec <path>` builds end-to-end | PASS | Lines 651-675: Single Spec Mode section |
| 2 | `--phase <name>` discovers matching specs | PASS | Lines 457-514: Phase Mode with spec discovery, frontmatter parsing, dependency ordering |
| 3 | Stops on review BLOCK | PASS | Lines 192-194: Step 1 "If verdict is BLOCK: save build state... stop" |
| 4 | Stops on quality gate failure | PASS | Lines 245-247: Step 4 "If verdict indicates quality gate... stop" |
| 5 | Skips review if .review.md current | PASS | Lines 181: Step 1 skip condition |
| 6 | Skips plan if .plan.md exists | PASS | Line 198: Step 2 skip condition |
| 7 | `--resume` resumes correctly | PASS | Lines 422-453: Resume Mode with per-spec, per-phase, and --from override |
| 8 | `--dry-run` shows pipeline | PASS | Lines 584-647: Dry Run Mode with spec/phase/workspace variants |
| 9 | Build state written at each step | PASS | Lines 407-418: Incremental Persistence |
| 10 | Phase mode independent failures | PASS | Lines 479-484: Independent Execution |
| 11 | Summary printed | PASS | Lines 663-675: Summary Output |
| 12 | Quality gates pass | PASS | Check 1 above |
| 13 | No constitutional violations | PASS | Check 4 below |
| 14 | Steps dispatched as subagents | PASS | Lines 55-60: Subagent Dispatch Model; 5 Agent() blocks at lines 186-258 |
| 15 | Context packets include pipeline + step context | PASS | Lines 62-114: Context Packet Assembly with PIPELINE_CONTEXT and STEP_CONTEXT |
| 16 | Step context from disk artifacts | PASS | Lines 105-114: "Reading Step Context from Disk" with explicit file sources |
| 17 | Subagents return STEP_RESULT | PASS | Lines 146-154: Prompt template with STEP_RESULT format |
| 18 | Child skills execute full protocol | PASS | Lines 240-243, 262: Explicit notes that child skills handle all internal steps |
| 19 | `context: fork` in frontmatter | PASS | Line 4: `context: fork` |
| 20 | Orchestrator only reads STEP_RESULT | PASS | Lines 156-171: "What the Orchestrator Does Directly" allowlist |
| 21 | Resumed builds use disk state | PASS | Lines 95, 107, 114: "read from disk" rule |
| 22 | `build.max_retries` from user-config | PASS | Lines 30, 166, 272-277: parseUserConfig hierarchy, example user-config entry |
| 23 | Retry extracts specific failures | PASS | Lines 281-305: "Extract Failure Context" with RETRY_CONTEXT block |
| 24 | Retry stops on no-progress/regression/budget | PASS | Lines 337-342: "Evaluate and Loop or Stop" with 4 outcomes |
| 25 | Build state records retry history | PASS | Lines 344-360: retry_cycles, retry_history in build state JSON |
| 26 | Dry-run shows retry policy | PASS | Line 640: `Retry policy: max_retries=<N> (from user-config)` — note: AC says "from manifest" but spec Behavior 19 and SKILL.md both say user-config. AC text is a known typo (CON-2 from review). Implementation is correct. |

## Check 3: Charter Consistency — PASS

- **Scope:** Build orchestrator is in-scope per charter capability map (line 82)
- **Domain model:** No persistent entities owned (charter line 67) — SKILL.md only writes build state JSON
- **Interface contracts:** All exposed APIs match (--spec, --phase, --resume, --dry-run). New features (subagent dispatch, context packets, retry) are implementation details within the existing interface
- **Dependencies:** All consumed APIs referenced in SKILL.md match charter dependencies table
- **Note:** Charter pipeline ordering is stale (says "review → route → plan", should be "review → plan → route") — flagged as SA-1/CON-1 in review, not a spec defect

## Check 4: Constitution Compliance — PASS

- **Principle 2 "Skills are primarily markdown":** SKILL.md is pure markdown. Build state is JSON supporting data. PASS.
- **Principle 1 "Minimize external dependencies":** No new dependencies. `parseUserConfig()` is existing code. PASS.
- **Architecture boundary "Adding new skills to lifecycle order":** Build orchestrates existing skills without changing order. PASS.
- **Anti-pattern "No executable logic in SKILL.md":** No executable code in SKILL.md. PASS.
- **Anti-pattern "No hardcoded paths to ~/.claude/":** Uses plugin root resolution via parseUserConfig paths. PASS.

## Check 5: ADR Compliance — PASS (no applicable ADRs)

## Check 6: Cross-Cutting Specs — PASS (no applicable specs)

## Check 7: Specialist Review — SKIPPED (no specialists configured)

## Check 8: Boundary Compliance — SKIP (no governance/boundaries.yaml)

## Check 9: Transition Gates — SKIP (no governance/gates.yaml)

## Check 10: Platform Drift — PASS

## Check 11: Visual Verification — N/A (no UI files)

## Check 12: Lifecycle Reconciliation — PASS

- **Issue alignment:** issue-124 is closed. PASS.
- **Epic completion:** N/A
- **Spec status:** `review-passed` — correct for post-review state. Will be updated to `implemented` if validation passes. PASS.
- **Charter sync:** `/adev:build` capability status is `implementing`. PASS.

## Check 13: Success Heuristic Extraction — SKIP

SKIP: prior validation report exists (not first-run PASS).

---

**Summary:** 10 passed, 0 failed, 3 skipped, 0 WARN.

## Implementation Completeness Assessment

**Can this spec be considered implemented?**

This is a **markdown-only skill** — per constitution principle 2 ("Skills are primarily markdown"), the SKILL.md file IS the implementation. There is no companion code required for the skill to function. The build orchestrator works by providing structured instructions that Claude follows at runtime.

**What exists:**
- `skills/build/SKILL.md` — 730 lines covering all 19 behaviors, all 26 acceptance criteria, delegation protocol, context packet assembly, retry loop, build state persistence, resume mode, phase mode, workspace mode, dry-run mode, error cases, key principles, and red flags
- `context: fork` frontmatter for context isolation
- `templates/manifest-template.yaml` — updated (build section was added then correctly removed when config moved to user-config)

**What does NOT need to exist (per constitution):**
- No companion `.mjs` code required — the skill is agent instructions, not executable code
- No test file for the skill itself — markdown skills are validated by `/adev:validate`, not unit tests
- The `parseUserConfig()` function already exists in `lib/persona.mjs`
- The `detectWorkspace()` function already exists in `lib/workspace.mjs`
- Build state directory is created on first use per SKILL.md instructions

**Verdict: YES — the spec can be considered implemented.**

All 19 behaviors are fully specified in the SKILL.md. All 26 acceptance criteria have traceable evidence in the SKILL.md. The implementation follows the constitution's principle that skills are primarily markdown.
