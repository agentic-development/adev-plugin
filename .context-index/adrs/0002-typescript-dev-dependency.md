# ADR 0002: Add TypeScript as Dev Dependency

## Status

Accepted

## Date

2026-03-23

## Context

The repomap eval harness needs an unbiased ground truth for measuring parser accuracy. The TypeScript compiler API can extract all exported symbols and import relationships from a TypeScript project with 100% accuracy — it is the language's own parser.

Without compiler-derived ground truth, we would rely on manually curated expected values or snapshot the parser's own output (which bakes in the parser's mistakes as baseline).

## Decision

Add `typescript` as a devDependency. It is used only by the eval harness in `tests/evals/repomap/generate-ground-truth.mjs`. It is never imported by runtime code, skills, hooks, or the CLI.

## Alternatives Considered

1. **Manual curation:** Someone reviews a repo's exports by hand and creates expected JSON. Most accurate but labor-intensive and doesn't scale to multiple repos. Rejected.

2. **Snapshot-and-verify:** Run the parser once, manually verify, freeze as baseline. Less work but biased — the parser's mistakes become the expected values. Rejected for accuracy concerns.

3. **No ground truth:** Just test for regressions (output didn't change). Catches breakages but provides no accuracy metrics. Rejected — we need precision/recall numbers.

## Consequences

- Second dependency in the project (first: web-tree-sitter, optional runtime).
- Only affects developers running evals, not end users running `npx adev-cli init`.
- ~50MB package, but only in node_modules during development.
- Enables quantitative precision/recall benchmarking against any TypeScript repo.
- Ground truth is deterministic and reproducible (same compiler version, same repo, same output).
