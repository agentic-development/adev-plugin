# ADR 0001: Add web-tree-sitter as Direct Dependency

## Status

Accepted

## Date

2026-03-23

## Context

`/adev:repomap` currently uses regex-based pattern matching (Grep) to extract exported symbols. This approach misses approximately 30% of export patterns: re-exports (`export { foo } from './bar'`), arrow function exports (`export const x = () => {}`), destructured exports, and default exports assigned after declaration.

More critically, regex cannot build a dependency graph from import statements, which means:
- Blast radius scoring in `/adev:route` relies on file-count heuristics instead of tracing actual import chains.
- Spec-to-code drift detection in `/adev:hygiene` compares names but cannot detect structural changes.
- Context packets in `/adev:implement` cannot include dependency-aware symbol rankings.

Industry research (Aider, Sourcegraph/Cody, Augment Code, Greptile) confirms convergence on AST-based structural indexing as the foundation for agentic codebase understanding.

## Decision

Add `web-tree-sitter` (WASM-based tree-sitter bindings) and `tree-sitter-typescript` as **direct** dependencies in `package.json`.

**Original decision (2026-03-23):** Both packages were initially scoped as optional — users would install on demand via a prompt in `/adev:repomap` or `/adev:init`. Language grammar WASM files would be downloaded per-language on first use, and `lib/repomap/check-deps.mjs` would detect availability at runtime.

**Updated decision:** Both packages are now listed in `package.json` `dependencies` (shipped with every install). The on-demand installation path has been removed. `web-tree-sitter` uses WASM, not native C bindings — no C compiler required, keeping the install frictionless.

- `web-tree-sitter`: `^0.26.7` (WASM runtime)
- `tree-sitter-typescript`: `^0.23.2` (TypeScript/JavaScript grammar)

The existing regex-based repomap remains as a fallback for environments where WASM cannot load.

## Alternatives Considered

1. **Native tree-sitter (C bindings):** Faster but requires a C compiler (`xcode-select --install` on macOS, `build-essential` on Linux). Rejected because it breaks the zero-friction `npx @adev-org/adev-cli install` install experience.

2. **Bundled WASM in repo:** Ship grammar WASM files directly in the plugin. Zero install friction but bloats the repo by 2-5MB, creates licensing concerns per grammar, and requires plugin releases for grammar updates. Rejected as over-engineering.

3. **Keep regex only:** No new dependencies but permanently caps symbol extraction accuracy at ~70% and blocks dependency graph features. Rejected because the dependency graph is the primary value of this upgrade.

## Consequences

- First external dependency in the project (softened principle: "minimize", not "zero").
- Two code paths to maintain and test (regex + tree-sitter).
- Users who don't install tree-sitter get the same experience as before.
- Downstream skills (route, hygiene, implement, validate, recover) gain access to dependency graph and ranked symbols when tree-sitter is available, fall back to heuristics when not.
- All new code lives in `lib/repomap/` as companion modules — the `/adev:repomap` skill remains pure markdown.
