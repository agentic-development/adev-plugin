---
charter: cursor-provider
kind: artifact
status: validated
risk_level: low
milestone:
revision: 1
charter-revision: 3
created: 2026-05-18
updated: 2026-05-18
source-manifest:
  sha: "2aed756"
  files:
    - .cursor-plugin/plugin.json
    - release-please-config.json
    - tests/version-parity.test.mjs
  computed-at: "2026-05-18T13:32:29.548Z"
---

# Artifact Spec: Cursor Plugin Manifest and Three-Way Version Parity

<!-- Spec A from the cursor-provider charter's 5-spec grouping.
     Covers three tightly-coupled capabilities sharing one invariant:
     the version field across three manifest files must be equal.
     Parent Charter: .context-index/specs/features/cursor-provider/charter.md -->

## Structural Shape

This spec ships two static deliverables plus one enforcement test:

### 1. `.cursor-plugin/plugin.json` (new file)

Cursor 2.5 plugin manifest. Mirrors the field shape of `.claude-plugin/plugin.json` (the existing Claude Code manifest). All fields except `name` are optional per Cursor docs; the manifest carries the same identity values adev publishes to other providers.

Required structural shape (JSON object at root):

```json
{
  "name": "adev",
  "version": "<must equal package.json:version>",
  "description": "<copied from .claude-plugin/plugin.json>",
  "author": { "name": "<copied>" },
  "homepage": "<copied>",
  "repository": "<copied>",
  "license": "<copied>",
  "category": "<copied if present>",
  "keywords": ["<copied if present>"]
}
```

- `name` MUST be `"adev"` (kebab-case, lowercase) — matches the canonical plugin identity used by `.claude-plugin/plugin.json`.
- `version` MUST be a valid semver string AND MUST equal `package.json:version` AND `.claude-plugin/plugin.json:version`.
- All other fields SHOULD be copied verbatim from `.claude-plugin/plugin.json` so the three manifests stay shape-equivalent for users who inspect them.

### 2. `release-please-config.json` (modified)

Add `.cursor-plugin/plugin.json` to the `extra-files` array under `packages["."]` so release-please's automated Release PR bumps all three manifests in lockstep with `package.json` per ADR-0008.

Required diff shape:

```json
"extra-files": [
  ".claude-plugin/plugin.json",
  ".cursor-plugin/plugin.json"
]
```

Array order is not load-bearing, but alphabetical ordering keeps diffs stable across future provider additions.

### 3. `tests/version-parity.test.mjs` (new file)

Node:test contract that asserts the three-way invariant. The test reads `package.json`, `.claude-plugin/plugin.json`, and `.cursor-plugin/plugin.json` and fails if any pair has unequal `version` fields. The test also asserts that all three files exist and are parseable JSON.

Required assertions:

1. `package.json` exists, parses as JSON, has a `version` field
2. `.claude-plugin/plugin.json` exists, parses as JSON, has a `version` field
3. `.cursor-plugin/plugin.json` exists, parses as JSON, has a `version` field
4. All three `version` values are strictly `===` equal
5. `release-please-config.json:packages["."].extra-files` includes both `.claude-plugin/plugin.json` AND `.cursor-plugin/plugin.json`

The test runs under the existing `npm test` quality gate. Drift is detected at CI time on every PR.

## Required Files

| Path | Layer | Created by |
|---|---|---|
| `.cursor-plugin/plugin.json` | bundled (plugin root) | Spec A implementation |
| `release-please-config.json` | bundled (plugin root) | Spec A implementation (modify, not create) |
| `tests/version-parity.test.mjs` | bundled (plugin root) | Spec A implementation |

## Consumers

- **Cursor 2.5+** — reads `.cursor-plugin/plugin.json` from the plugin root when adev is installed via `~/.cursor/plugins/local/adev`. Required by Cursor for plugin recognition.
- **`release-please` GitHub Action** — reads `release-please-config.json:extra-files` on every push to `main` (or `release/0.x`); bumps the `version` field in every listed file when computing a Release PR. Per ADR-0008.
- **`npm test`** — runs `tests/version-parity.test.mjs` under the existing `node:test` runner. Fails CI when any pair of manifests drifts.
- **Future CursorAdapter (Spec B)** — reads `.cursor-plugin/plugin.json` from the plugin root when installing into `~/.cursor/plugins/local/adev`. Out of scope for Spec A; called out so Spec B does not duplicate the manifest contents.

## System Constitution Reference

- **Principle 5: Version parity** — "package.json and .claude-plugin/plugin.json versions must always match." Spec A extends this informal principle to a three-file invariant and adds the first programmatic enforcement (`tests/version-parity.test.mjs`). The principle today is *stated* but unenforced; this spec closes that gap as a side effect.
- **Principle 1: Minimize external dependencies** — The version-parity test uses only Node built-ins (`node:fs`, `node:test`, `node:assert`). No new dependencies.
- **Principle 3: Pure ESM** — `tests/version-parity.test.mjs` is `.mjs` and uses ESM `import` syntax, matching every other file in `tests/`.
- **Architecture Boundary: Autonomous lane** — Spec A does NOT change the plugin registration format (`.claude-plugin/plugin.json` shape is unchanged), does NOT change the hook protocol, does NOT change the CLI installation path structure, and does NOT add external dependencies. It creates a peer manifest at `.cursor-plugin/plugin.json` (different file, not a modification of `.claude-plugin/plugin.json`). This sits in the Autonomous lane per the constitution.

## Acceptance Criteria

- [ ] `.cursor-plugin/plugin.json` exists at the plugin root
- [ ] `.cursor-plugin/plugin.json` is valid JSON parseable by `JSON.parse`
- [ ] `.cursor-plugin/plugin.json:name === "adev"`
- [ ] `.cursor-plugin/plugin.json:version === package.json:version === .claude-plugin/plugin.json:version` (strict string equality)
- [ ] `.cursor-plugin/plugin.json` contains `description`, `author`, `homepage`, `repository`, `license` fields copied verbatim from `.claude-plugin/plugin.json`
- [ ] `release-please-config.json:packages["."].extra-files` contains both `.claude-plugin/plugin.json` AND `.cursor-plugin/plugin.json`
- [ ] `tests/version-parity.test.mjs` exists and uses only Node built-ins (`node:test`, `node:assert`, `node:fs`)
- [ ] `tests/version-parity.test.mjs` asserts strict `===` equality across all three `version` fields
- [ ] `tests/version-parity.test.mjs` asserts both manifest paths are present in `release-please-config.json:extra-files`
- [ ] `npm test` passes with the new test in place
- [ ] No constitutional violations introduced; sits in the Autonomous lane (no protocol/install-path/registration-format changes; no external dependencies)
