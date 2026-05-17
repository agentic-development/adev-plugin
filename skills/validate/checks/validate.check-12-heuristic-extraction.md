# Check 12: Success Heuristic Extraction

## Overview

On first-run PASS (all checks 1-12 passed with no FAIL results, and no prior validation report exists), extract a positive pattern heuristic at `medium` confidence via `lib/heuristics.mjs`. This check is observational — it never blocks the overall validation result.

## Spec-Slug Derivation Rule

1. Take the target spec's absolute path.
2. Compute `path.basename(path, '.md')` to get the filename stem.
3. Lowercase and replace any non-alphanumeric characters with `-`.
4. Collapse consecutive `-` characters; strip leading/trailing `-`.

This rule is used consistently in (a) First-Run Detection, (b) id generation, and (c) report output.

## First-Run Detection Rule

A validation is "first run" if and only if no file matching `<spec-slug>.validate.md` exists in the same directory as the target spec. Explicit deletion followed by re-validation IS treated as a first run (intentional: deletion signals the user wants to re-extract).

## Scope Derivation Rule

1. Read the `charter:` field from the target spec's YAML frontmatter.
2. Apply `path.basename()` to strip any traversal sequences.
3. Check the result against `manifest.yaml modules[].slug`.
4. If matched, use it as `scope`.
5. Otherwise, fall back to `_global`.

## Title Derivation Rule

Format: `"First-run PASS: <spec-title>"` where:

- `<spec-title>` is the first-level heading (`# ...`) from the target spec file, with any leading `Live Spec: ` prefix removed.
- If no heading exists, fall back to the spec-slug.
- Cap at 120 chars total; if longer, truncate the title to 117 chars + `"..."`.

## ID Derivation Rule

Format: `<spec-slug>-<hash>` where:

- `<spec-slug>` is per the Spec-Slug Derivation Rule.
- `<hash>` is 8 chars of lowercase hex SHA-256 of: `<lowercased-normalized-absolute-path>` + `"|"` + `<pattern-text>`.
- Absolute path separators are normalized to `/` before lowercasing.
- Including the path prevents id collisions between specs with identical titles.
- Worked example: spec at `/project/.context-index/specs/features/hooks/foo.md` with pattern `X` → hash input is `/project/.context-index/specs/features/hooks/foo.md|X`.
- For pathological filenames that would produce an empty spec-slug, Check 12 falls back to SKIP with note `"invalid spec slug"`.

## projectRoot Resolution

Walk up from `process.cwd()` to find the nearest `.context-index/` directory. Fallback to `process.env.CLAUDE_PROJECT_ROOT`. Matches the convention in `lib/execution-state.mjs` and `/adev:recover` Step 7.

## Success Factor Derivation

Priority order, first match wins:

1. A **golden sample** referenced in the implementation's context packet → pattern describes the sample's role.
2. An **ADR** referenced in the context packet → pattern describes the ADR's decision application.
3. A **cross-cutting spec** or context packet noted as a pre-condition → pattern describes the structural/behavioral lesson.
4. **Default**: `"First-run PASS for <spec-title>: implementation matched all acceptance criteria without revision"`.

> **Distillation rule:** the pattern must describe the structural or behavioral lesson, NOT verbatim-copy packet content. Avoid preserving environment-specific paths, file names, credentials, or embedded configuration.

`antiPattern` is ALWAYS empty for success heuristics (success describes what to do, not what to avoid).

## Confidence Rationale

Initial `confidence: medium` is used (a stronger signal than `/adev:recover`'s `low`) because first-run PASS validates all 12 checks at once. The helper's absolute-threshold auto-promotion will raise the entry to `high` at the 3rd distinct-path evidence entry — print whatever confidence the helper returns from the write call, not the caller-supplied input.

## Contradiction Scan (before write)

Before writing the new heuristic, scan for semantic contradictions with existing heuristics:

1. Read existing heuristics for the target scope: call `readHeuristics(projectRoot, { module: scope })` via inline Node.js (importing from `<ADEV_ROOT>/lib/heuristics.mjs`, where `<ADEV_ROOT>` is the resolved plugin root).
2. For each existing entry, compare semantically: does the new heuristic's `pattern` directly conflict with an existing entry's `antiPattern`, or does the new heuristic's `antiPattern` conflict with an existing entry's `pattern`?
3. If a semantic contradiction is detected, call `addContradiction(projectRoot, existingId, { path: '<validation-report-path>', date: '<today>', source: 'validation' })` before writing the new heuristic. Wrap in try/catch — if `addContradiction` throws (e.g., `HEURISTICS_NOT_FOUND` because the entry was archived between read and write), log a warning and proceed.
4. If no contradiction is detected, proceed directly to writeHeuristic.

This is a best-effort semantic comparison performed by you (the agent), not a programmatic string match. When in doubt, do not record a contradiction — `/adev:retro` consolidation is the backstop for missed contradictions.

## Inline Node Invocation

Run the extraction via an inline Node invocation that resolves `projectRoot`, imports `writeHeuristic` from the adev plugin's `lib/heuristics.mjs`, builds the entry using the derivation rules above, and wraps the call in `try`/`catch` so any failure degrades to a SKIP without affecting the overall PASS/FAIL. The process always exits with code 0. The `evidence[]` array must contain exactly one entry: `{ source: "validation", path: "<validation-report-path>", date: "<today>" }`. Initial `confidence: "medium"` is caller-supplied; the final confidence in the printed output must come from the `writeHeuristic` return value (which may auto-promote).

**Plugin root resolution:** The `lib/` directory lives at the adev plugin root, NOT the project root. Derive the plugin root from this skill file's base directory by stripping the `skills/<name>/` suffix. For example, if this skill's base directory is `/path/to/adev/0.10.0/skills/validate`, the plugin root is `/path/to/adev/0.10.0`. Use the absolute path in the import.

On import failure: SKIP with reason `"helper unavailable"`.
On `HEURISTICS_SCHEMA_ERROR` or any thrown error: SKIP with the error message.

## SKIP Semantics

Explicit list of SKIP reasons:

- `"not first-run PASS"` — prior `<spec-slug>.validate.md` exists.
- `"non-PASS result"` — any of checks 1-12 FAILed.
- `"helper unavailable"` — `lib/heuristics.mjs` import failed.
- `"no charter scope"` — target spec has no `charter:` frontmatter field.
- `"no report path"` — validation report path cannot be resolved.
- `"invalid spec slug"` — spec filename produced empty slug.
- `<HEURISTICS_SCHEMA_ERROR message>` — `writeHeuristic` validation failed.

**Check 12 never changes the overall validation result.** SKIP is informational.

## Final Confirmation

On success, Check 12 prints exactly: `Check 12: Success Heuristic Extracted — <id> (scope: <scope>, confidence: medium)` — or whatever confidence the helper returns after auto-promotion, since the confidence value must come from the `writeHeuristic` return value rather than the caller-supplied input.
