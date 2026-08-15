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

## Tags Field

The optional `tags` field is an array of short classification labels used to
categorise heuristics and enable keyword-based retrieval boosting.

### Constraints

- Each tag must match `/^[a-z0-9][a-z0-9-]*$/` — lowercase ASCII letters,
  digits, and hyphens only. No underscores, no uppercase, no spaces.
- Maximum tag length: 64 characters.
- Maximum number of tags per entry: 20.
- An empty `tags` array is valid. The `tags` line is omitted from the
  serialized file when the array is empty or the field is absent.

### Serialization

Tags are serialized as a YAML flow sequence on a single line:

```yaml
tags: [auth, middleware, security]
```

An entry with no tags or an empty tags array omits the line entirely:

```yaml
# No tags line emitted when tags is [] or absent
```

### Tag pattern

Tags are placed between `anti-pattern` and `signature` in the serialized
field order.

---

## Signature Field

The optional `signature` field is the **cross-scope recurrence key**: it
answers "is this the same underlying failure, anywhere in the store", which
`id` cannot express because `id` is only unique within one scope file.

`id` and `signature` key on different inputs, so one `id` can legitimately be
reached by two different failure texts, and one `signature` can legitimately
appear on entries in different scopes.

### Constraints

- Must match `/^[a-z0-9][a-z0-9-]*$/` — lowercase ASCII letters, digits, and
  hyphens only. No underscores, no uppercase, no spaces. Narrower than the
  safe-slug pattern on purpose: a signature is always machine-composed.
- Maximum length: 64 characters.
- **Optional.** Entries written before this field existed, and entries derived
  from a success rather than a failure, carry no `signature` and are never
  rejected for lacking one.
- **Never rewritten once assigned.** On update the stored value wins — the
  opposite of the incoming-wins rule used for `anti-pattern` and `tags`, which
  are refinements. A signature is an identity, so first assignment sticks. An
  incoming signature that differs from the stored one is kept out and logged at
  warning level, not treated as an error.
- **Not unique within a scope.** A signature does not participate in `id`
  uniqueness — two entries in one scope file may share a signature.
- Serialized between `tags` and `confidence`. The line is omitted when the
  field is absent.

### The two signature modes

A signature is `<origin-slug>-<8 lowercase hex>`. How the digest is produced
depends on the origin, and the two modes are genuinely different rules — not
one rule with an exception.

| | Derived mode | Inherited mode |
|---|---|---|
| Origins | `recover`, `validate`, `implement` | `review-specs` only |
| Digest source | SHA-256 of the normalized failure text | **inherited** — the hash component of the supplied `blocker_id` |
| Normalizer | `normalizeFailureText` | none |

The operation order inside `normalizeFailureText` is load-bearing, not
cosmetic: **lowercase → strip punctuation except `-` and `_` → collapse
consecutive whitespace to a single space → trim**. Stripping before collapsing
is what makes `"a . b"` normalize to `"a b"` rather than `"a  b"`.

This order is byte-compatible with `normalizeRootCause` in
`tests/skills/recover-extract-heuristic-harness.mjs`, which is the
implementation that produced the `/adev:recover` ids already in the store.
Reordering the steps produces different digests for the same text and would
orphan those entries.

**Derived mode** hashes text, so the same failure reported with different
casing, run-length whitespace, or stripped punctuation collapses onto one key.

**Inherited mode hashes nothing.** A `/adev:review-specs` finding already
carries a canonical identity in its `blocker_id`
(`<reviewer>:<type>:<location-hash>`); the verb parses it and reuses that hash
component verbatim. Re-hashing the finding text would mint a second identity
for one finding, so a reviewer finding would stop resolving to the same key in
the retry loop and in the store.

Both modes are produced by `adev heuristics signature`:

```
adev heuristics signature --origin recover --text "Error: cache miss"
adev heuristics signature --origin review-specs --blocker-id <blocker_id>
```

Derivation reads no clock, no filesystem path, no environment variable, and no
run identifier, so a signature is byte-identical on any machine, in any
worktree, at any time.

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
| `tags`               | `tags`                | string[]     | no       | Classification labels. Each tag: `[a-z0-9][a-z0-9-]*`, max 64 chars, max 20 tags. Omitted from file when empty. |
| `signature`          | `signature`           | string       | no       | Cross-scope recurrence key. `[a-z0-9][a-z0-9-]*`, max 64 chars. Never rewritten once assigned. See Signature Field. |
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
uniqueness within the scope. Every id is `<prefix>-<8 lowercase hex>`, where
the **prefix is supplied by the calling extractor** and is never derived from
the origin. Every digest comes from the one shared digest function in
`lib/heuristics.mjs`.

**Which normalizer that function is given depends on what is being hashed, and
the two extractors differ.** A path-keyed extractor such as `/adev:validate`
hashes a path and passes `normalizeIdInput`; `/adev:recover` hashes free text
and passes `normalizeFailureText`, the same normalizer signatures use. Each
section below names its own.

`normalizeIdInput` lowercases and folds `\` path separators to `/`, and
performs **no punctuation stripping** — `/`, `.` and `|` are the separators
that carry a path-keyed hash input's meaning, and removing them would collide
distinct specs onto one id.

### `/adev:recover`

Format: `<category-slug>-<hash>`

- `<category-slug>` — one of the six diagnosis categories defined in
  `skills/recover/SKILL.md`: `missing-context`, `ambiguous-spec`,
  `constraint-conflict`, `novel-problem`, `tool-failure`, `budget-exhaustion`.
  This is a **closed set**, and it is load-bearing: the store migration keys on
  exactly these six prefixes to decide which ids it must never rekey.
- `<hash>` — the digest of the root-cause text under **`normalizeFailureText`**,
  not `normalizeIdInput`. This extractor hashes free text, not a path, so it
  wants punctuation stripped.

Example: `tool-failure-a1b2c3d4`

### `/adev:validate`

Format: `<spec-slug>-<hash>`

- `<spec-slug>` — the slug of the spec under validation, with the `.spec` stem
  **stripped** (`foo.spec.md` yields `foo`, not `foo-spec`). This stripped form
  is canonical; ids in the older unstripped convention are normalized by the
  store migration.
- `<hash>` — the digest of `<repo-relative-spec-path>|<pattern>` under
  `normalizeIdInput`.

Example: `charter-evolution-a1b2c3d4`

The path in the hash input is **repo-relative**, never absolute. This makes the
id **location-independent**: the same spec and pattern extracted from two
worktrees of one repository produce a byte-identical id. Hashing the absolute
path instead produced a different id per checkout, so `writeHeuristic`'s
append-or-update-by-id wrote a duplicate entry rather than appending a second
evidence reference, and `autoPromote` could not see the two distinct evidence
paths it needed.

When the project root cannot be resolved — so no repo-relative path exists —
extraction is **skipped entirely** rather than keyed on a guess. Capture is
non-blocking, so skipping is safe; a guessed key is not.

### Rules for all extractors

- Ids must match the safe-slug pattern `/^[_a-z0-9][_a-z0-9-]{0,63}$/`.
- Ids must be unique within their scope. If a collision is detected, the
  extractor should update the existing entry (adding evidence) rather than
  inventing a suffix.
- Ids must be derivable from stable, location-independent inputs so re-running
  the extractor on the same evidence — in any checkout — produces the same id.

---

## Tiered Retrieval and Rendering

`retrieveHeuristics` and `renderHeuristic` support tiered output to fit
different context budgets.

### Render tiers

Pass a `tier` argument to `renderHeuristic(heuristic, tier)`:

| Tier      | Format                                                           | Use case                   |
|-----------|------------------------------------------------------------------|----------------------------|
| `index`   | `- <title> (<scope>) — <pattern truncated to 80 chars>`         | Compact list / table of contents |
| `summary` | Multi-line markdown block: title, pattern, anti-pattern, evidence count | Default — balanced detail |
| `full`    | Summary + scope and tags lines                                   | Deep inspection / debug    |

If an invalid tier is provided, the function falls back to `summary` and
writes a single-line warning to stderr.

### Keyword boosting in `retrieveHeuristics`

`retrieveHeuristics(projectRoot, module, { keywords, injectionLimit })` accepts
an optional `keywords` array. Keyword matching is applied before sorting:

- Each keyword is matched case-insensitively against the concatenation of
  `tags`, `title`, and `pattern`.
- Entries that match at least one keyword are sorted before non-matching
  entries at the same confidence level (after confidence, before scope priority).
- `keywords` is capped at **10 items**; the total combined character length of
  all keywords is capped at **200 chars** (keywords beyond the cap are dropped).
- The internal `_keywordMatch` flag is stripped from returned results.

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
tags: [config, hooks, validation]
signature: recover-a1b2c3d4
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

The `signature` line is optional — see the Signature Field section for when it
is absent and why.
