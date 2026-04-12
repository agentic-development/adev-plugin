# Heuristics Store — Public Schema

This document is the authoritative specification for the heuristics memory
store managed by `lib/heuristics.mjs` and consumed by extractor skills
(`/adev:recover`, `/adev:validate`, and future skills).

A heuristic is a durable, generalized rule distilled from project history
("do this / do not do this") that is safe to inject back into future agent
prompts. Heuristics are stored as YAML frontmatter inside per-scope markdown
files under `.context-index/memory/heuristics/`.

This file is consumed by tests and humans. If you change anything here you
must also update `lib/heuristics.mjs` and the tests in
`tests/lib/heuristics.test.mjs`.

---

## File Layout

```
.context-index/memory/heuristics/
├── _format.md            # this file — public schema doc
├── <scope>.md            # one file per module/scope slug
├── _global.md            # reserved fallback scope
└── archive/
    └── <scope>-<id>.md   # archived entries, one entry per file
```

- Each live `<scope>.md` file holds zero or more heuristic entries for that
  scope, one frontmatter block per entry.
- `_global.md` is the reserved fallback scope for heuristics that do not
  belong to any specific module.
- The `archive/` directory holds demoted or contradicted entries, one entry
  per file, named `<scope>-<id>.md`.

---

## Safe-Slug Pattern

Both `id` and `scope` must match the safe-slug pattern:

```
/^[_a-z0-9][_a-z0-9-]{0,63}$/
```

- Lowercase ASCII, digits, underscore, and hyphen only.
- First character must be `[_a-z0-9]` — no leading hyphen.
- Maximum total length: 64 characters.
- The pattern is explicitly path-traversal safe: no `.`, no `/`, no `\`, no
  whitespace, no uppercase. A slug can never be interpreted as a relative
  path fragment, so concatenating it into a filesystem path (for example
  `.context-index/memory/heuristics/${scope}.md`) is safe by construction.

The scope value `_global` is reserved for the fallback scope and must not
be used for module-specific heuristics.

---

## Field-Length Caps

| Field         | Max length |
|---------------|------------|
| `title`       | 120 chars  |
| `pattern`     | 500 chars  |
| `anti-pattern`| 500 chars  |

These caps are enforced on write. Over-long fields must be rejected rather
than truncated — the caller should rewrite the content or split the
heuristic into multiple entries.

---

## Frontmatter Schema

Each heuristic entry is a YAML frontmatter block. Field names on disk use
kebab-case; the in-memory JavaScript representation uses camelCase. The
store translates between the two: `antiPattern` <-> `anti-pattern`,
`contradictedBy` <-> `contradicted-by`, `archivedReason` <-> `archived-reason`.

| On disk (kebab-case) | In memory (camelCase) | Type         | Required | Notes |
|----------------------|-----------------------|--------------|----------|-------|
| `id`                 | `id`                  | string       | yes      | Safe-slug, unique within the scope. |
| `scope`              | `scope`               | string       | yes      | Safe-slug. `_global` is reserved. |
| `title`              | `title`               | string       | yes      | Human-readable label, <= 120 chars. |
| `pattern`            | `pattern`             | string       | yes      | The "do this" rule, <= 500 chars. |
| `anti-pattern`       | `antiPattern`         | string       | no       | Counter-rule ("don't do this"), <= 500 chars. |
| `confidence`         | `confidence`          | enum         | yes      | One of `low`, `medium`, `high`. |
| `evidence`           | `evidence`            | array        | yes      | Array of `{path, date, source}` objects. May be empty. |
| `contradicted-by`    | `contradictedBy`      | array        | yes      | Array of `{path, date, source}` objects. May be empty. |
| `created`            | `created`             | string       | yes      | ISO date, `YYYY-MM-DD`. |
| `updated`            | `updated`             | string       | yes      | ISO date, `YYYY-MM-DD`. |
| `archived`           | `archived`            | string       | no       | Only on archived entries. ISO date, `YYYY-MM-DD`. |
| `archived-reason`    | `archivedReason`      | string       | no       | Only on archived entries. Short reason. |

### Evidence objects

Both `evidence` and `contradicted-by` are arrays of objects with the same
shape:

```yaml
- path: sessions/2026-04-01-abc.md
  date: 2026-04-01
  source: recover
```

- `path` — repo-relative path to the document that supports (or contradicts)
  the heuristic.
- `date` — ISO date the evidence was recorded.
- `source` — short identifier of the extractor skill, e.g. `recover`,
  `validate`.

Distinct-path evidence counts are computed from `path` after deduplication.

---

## Confidence Lifecycle

Confidence is one of `low`, `medium`, `high`. It is auto-managed by the
store based on distinct-path evidence counts, with a narrow caller-supplied
role limited to new-entry creation.

### Initial confidence

- On **create**, the caller must supply an initial confidence (`low`,
  `medium`, or `high`). There is no default — entries missing a
  `confidence` field are rejected with `HEURISTICS_SCHEMA_ERROR`.
- Auto-promotion also runs on **create** against the caller-supplied
  value. A new entry with `confidence: low` and 3 distinct evidence
  paths is stored at `high`.

### Auto-promotion on update

On **update**, the store ignores any caller-supplied confidence and
recomputes the level from the absolute number of distinct paths in
`evidence`:

- `>= 2 distinct` paths -> at least `medium`.
- `>= 3 distinct` paths -> at least `high`.
- `< 2 distinct` paths  -> no promotion from the current level.

Auto-promotion is monotonic: it may raise confidence but never lowers it.
If the evidence count drops (e.g. an entry is de-duplicated), confidence
stays where it was until an explicit `demote` is requested.

### Explicit demote and promote

- `promote(id, scope)` moves confidence one step up: `low -> medium ->
  high`. Calling `promote` on a `high` entry is a no-op.
- `demote(id, scope)` moves confidence one step down: `high -> medium ->
  low`. Demoting a `low` entry archives it with reason
  `demoted-below-low`.

### Summary table

| Action                   | Effect on confidence |
|--------------------------|----------------------|
| create (caller supplied) | required; auto-promoted on create if evidence thresholds already met |
| update (>= 3 distinct)   | auto-promote to `high` (never lower) |
| update (>= 2 distinct)   | auto-promote to `medium` (never lower) |
| update (< 2 distinct)    | unchanged |
| promote                  | `low -> medium -> high`, no-op at `high` |
| demote                   | `high -> medium -> low -> archive('demoted-below-low')` |

---

## ID Namespace Convention

Ids live inside a scope, so global uniqueness is not required — only
uniqueness within the scope. Extractors should follow these conventions so
ids are stable, reproducible, and collision-resistant.

### `/adev:recover`

Format: `<category-slug>-<hash>`

- `<category-slug>` — one of the six recovery root-cause categories, e.g.
  `spec-violation`, `context-gap`, `tool-failure`.
- `<hash>` — short deterministic hash (6-8 hex chars) derived from the
  generalized pattern text, used to make the id stable across sessions.

Example: `spec-violation-a1b2c3`

### `/adev:validate`

Format: `<spec-slug>-<hash>`

- `<spec-slug>` — the slug of the spec under validation.
- `<hash>` — short deterministic hash (6-8 hex chars) derived from the
  generalized pattern text.

Example: `charter-evolution-a1b2c3`

### Rules for all extractors

- Ids must match the safe-slug pattern `/^[_a-z0-9][_a-z0-9-]{0,63}$/`.
- Ids must be unique within their scope. If a collision is detected, the
  extractor should update the existing entry (adding evidence) rather than
  inventing a suffix.
- Ids must be derivable from stable inputs so re-running the extractor on
  the same evidence produces the same id.

---

## Redaction Advisory

**Heuristic fields must not contain raw credentials, tokens, or PII.**

**Extractors must distill generalizations, not copy literal values from
source documents.** A heuristic is a durable rule, not an evidence dump.
If a piece of information is too specific to generalize, it probably does
not belong in a heuristic — link to the source in `evidence[].path`
instead.

### Examples

Good — a generalized, redacted pattern:

```yaml
pattern: >
  When connecting to a vendor API, read the bearer token from the
  environment variable documented in the module README; never commit
  token values to any file under .context-index/.
```

Bad — copies a literal secret:

```yaml
pattern: >
  Use the bearer token sk-live-9f3a... when calling vendor-x
```

Good — a generalized error pattern:

```yaml
pattern: >
  After editing hook configuration, run the hook validator skill to
  confirm the JSON contract before committing.
anti-pattern: >
  Assume a hook edit is correct based on a successful dry-run alone.
```

Bad — copies raw user data:

```yaml
pattern: >
  The user jdoe@example.com reported that X broke on 2026-04-01 at
  14:32 UTC from IP 10.0.0.17
```

Redaction is a mandatory part of extractor output. Callers must scrub
evidence before handing content to `lib/heuristics.mjs`.

---

## Atomic Write Guarantee

All writes performed by `lib/heuristics.mjs` are atomic: the store writes
to a temporary file in the same directory as the target and then uses
`fs.rename` to swap it into place. Readers either see the previous
complete file or the new complete file — never a partial write.

This guarantee holds for live scope files and archived entry files alike.
Because the temp file lives in the same directory as the target, the
rename stays within a single filesystem and is safe to use across all
POSIX and Windows file systems.

---

## Import Safety

`lib/heuristics.mjs` must never throw on import. Specifically:

- The module does not touch the filesystem at import time.
- Directory creation under `.context-index/memory/heuristics/` is lazy —
  it happens on the first write, not on module load.
- Read APIs return an empty result when the store directory does not
  exist yet, rather than throwing.

This keeps the helper safe to pull in from CLI entry points, hooks, and
tests without forcing every caller to pre-create directories.

---

## Example Entry

A well-formed heuristic frontmatter block:

```yaml
---
id: always-verify-config
scope: hooks
title: Always verify config after edit
pattern: After editing settings.json, run /config validate
anti-pattern: Assume edit is valid without verification
confidence: high
evidence:
  - path: sessions/2026-04-01-abc.md
    date: 2026-04-01
    source: recover
  - path: sessions/2026-04-05-def.md
    date: 2026-04-05
    source: validate
  - path: sessions/2026-04-07-ghi.md
    date: 2026-04-07
    source: validate
contradicted-by: []
created: 2026-04-01
updated: 2026-04-07
---
```

This entry has three distinct evidence paths, so the store would keep it
at `high` confidence on the next update.
