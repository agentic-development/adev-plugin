---
name: adev-repomap
description: Generate an AST-based symbol index of the repository. Produces a compact map of exports, classes, functions, and types for use by other skills during context routing and drift detection.
---

# Generate Repository Map

Produce a symbol-level index of the codebase for context routing and drift detection.

Full implementation pending. See design doc Part 3, Phase 3.

## Process

1. **Scan source files:** Walk the repository tree, respecting `.gitignore` and any excludes in `manifest.yaml`.
2. **Extract symbols:** For each source file, extract top-level exports:
   - Functions and their signatures
   - Classes and their public methods
   - Type/interface definitions
   - Constants and enums
   - Module re-exports
3. **Build index:** Organize symbols by directory and file, producing a compact tree:
   ```
   src/
     auth/
       middleware.ts: authenticateRequest(), validateToken(), AuthConfig (type)
       providers/
         oauth.ts: OAuthProvider (class), createOAuthClient()
         api-key.ts: validateApiKey(), ApiKeyConfig (type)
     api/
       routes.ts: registerRoutes(), RouteDefinition (type)
   ```
4. **Output:** Write to `.context-kit/hygiene/repomap.md`.
5. **Staleness marker:** Record the generation timestamp and HEAD commit hash so `/adev-hygiene` can detect when the map is outdated.

## Supported Languages

TypeScript, JavaScript, Python, Go, Rust, Java, Ruby (extensible via manifest configuration).

## Arguments

- No arguments: map the entire repository
- `--path <dir>`: map a specific directory
- `--depth <n>`: limit tree depth (default: unlimited)
- `--format <fmt>`: output format, `tree` (default) or `json`
