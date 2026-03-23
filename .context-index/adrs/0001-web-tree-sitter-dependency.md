# ADR 0001: Add web-tree-sitter as Optional Dependency

## Status

Accepted

## Date

2026-03-23

## Context

`/adev-repomap` currently uses regex-based pattern matching (Grep) to extract exported symbols. This approach misses approximately 30% of export patterns: re-exports (`export { foo } from './bar'`), arrow function exports (`export const x = () => {}`), destructured exports, and default exports assigned after declaration.

More critically, regex cannot build a dependency graph from import statements, which means:
- Blast radius scoring in `/adev-route` relies on file-count heuristics instead of tracing actual import chains.
- Spec-to-code drift detection in `/adev-hygiene` compares names but cannot detect structural changes.
- Context packets in `/adev-implement` cannot include dependency-aware symbol rankings.

Industry research (Aider, Sourcegraph/Cody, Augment Code, Greptile) confirms convergence on AST-based structural indexing as the foundation for agentic codebase understanding.

## Decision

Add `web-tree-sitter` (WASM-based tree-sitter bindings) as an **optional** dependency:

- It is NOT added to `package.json` dependencies. Users install it on demand via a prompt in `/adev-repomap` or `/adev-init` ("Install tree-sitter parser? yes/no").
- Language grammar WASM files are downloaded per-language on first use.
- `web-tree-sitter` uses WASM, not native C bindings — no C compiler required.
- `lib/repomap/check-deps.mjs` detects availability at runtime.

The existing regex-based repomap remains the zero-dependency default. Tree-sitter is a progressive enhancement: better data when available, graceful degradation when not.

## Alternatives Considered

1. **Native tree-sitter (C bindings):** Faster but requires a C compiler (`xcode-select --install` on macOS, `build-essential` on Linux). Rejected because it breaks the zero-friction `npx adev-cli init` install experience.

2. **Bundled WASM in repo:** Ship grammar WASM files directly in the plugin. Zero install friction but bloats the repo by 2-5MB, creates licensing concerns per grammar, and requires plugin releases for grammar updates. Rejected as over-engineering.

3. **Keep regex only:** No new dependencies but permanently caps symbol extraction accuracy at ~70% and blocks dependency graph features. Rejected because the dependency graph is the primary value of this upgrade.

## Consequences

- First external dependency in the project (softened principle: "minimize", not "zero").
- Two code paths to maintain and test (regex + tree-sitter).
- Users who don't install tree-sitter get the same experience as before.
- Downstream skills (route, hygiene, implement, validate, recover) gain access to dependency graph and ranked symbols when tree-sitter is available, fall back to heuristics when not.
- All new code lives in `lib/repomap/` as companion modules — the `/adev-repomap` skill remains pure markdown.
