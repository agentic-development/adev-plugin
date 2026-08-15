---
charter: heuristics
kind: behavioral
status: review-pending
risk_level: high
milestone: 3
revision: 1
charter-revision: 6
created: 2026-08-15
updated: 2026-08-15
---

# Live Spec: Failure Signature Key — one content-addressed identity for recurring failures

<!-- Live Spec within the heuristics charter.
     Parent Charter: .context-index/specs/features/heuristics/charter.md (revision 6, Phase 3)
     Covers capabilities: Failure Signature Primitive, Signature Schema Field, Location-Independent id.
     Frontmatter precedes the H1 deliberately: `adev specify revise` cannot parse a spec
     whose frontmatter is not the first non-blank content. -->

## Behavioral Contract

This spec defines the shared key that Phase 3 is built on. Today the repository contains four
copies of "derive a stable id by hashing something", with three different hash inputs: a live
path-dependent hash in the validate Stop hook, a dead twin behind an unreachable CLI verb, and two
more in test harnesses. One of those inputs is an **absolute filesystem path**, so the same spec and
pattern produce different ids in different worktrees — which makes `writeHeuristic`'s
append-or-update-by-id write a duplicate entry instead of appending a second evidence reference, and
leaves `autoPromote` unable to observe the two distinct evidence paths it needs to promote.

This spec collapses those copies into one CLI primitive, adds a `signature` field carrying
cross-scope recurrence identity that `id` cannot express, corrects `id` derivation to be
location-independent, and migrates the existing store to the corrected keys.

### Preconditions

- `.context-index/memory/heuristics/` exists, or the store is empty and will be created on first write.
- `lib/heuristics.mjs` exposes `writeHeuristic`, `readHeuristics`, and the serialization path used by both.
- The invoking process can resolve the project root, so a repo-relative spec path can be computed.

### Behaviors

1. **When** `adev heuristics signature --origin <slug> --text <text>` is invoked with a legal origin
   **then** it prints `<origin-slug>-<digest>` on stdout and exits 0, where `<digest>` is the first 8
   lowercase hex characters of the SHA-256 of the normalized text.

2. **When** the primitive normalizes text **then** it lowercases, collapses consecutive whitespace to
   a single space, strips leading and trailing whitespace, and strips punctuation except `-` and `_`
   — the rule currently documented in `skills/recover/SKILL.md:392`. Identical input text differing
   only in case, run-length whitespace, or stripped punctuation yields an identical digest.

3. **When** `--origin` is not one of `recover`, `validate`, `review-specs`, `implement` **then** the
   verb exits non-zero with `INVALID_SIGNATURE_ORIGIN`, prints the legal set, and prints nothing on
   stdout. The rejected value is stripped of control and ANSI characters and truncated before it is
   echoed.

4. **When** the same failure text is passed to the primitive on two different machines, in two
   different worktrees, or at two different times **then** the resulting signature is byte-identical.
   Derivation reads no clock, no filesystem path, no environment variable, and no run identifier.

5. **When** a heuristic carrying a `signature` field is serialized **then** the field is written to
   the entry's YAML frontmatter and survives a read-write round trip. `signature` is added to
   `FIELD_ORDER` in `lib/heuristics.mjs`; without that addition `serializeHeuristic` drops unknown
   fields silently, including on the update path that rewrites existing entries.

6. **When** a heuristic without a `signature` field is read **then** it parses successfully and
   `signature` is `undefined`. Entries written before this spec remain readable and are never
   rejected for lacking the field.

7. **When** the validate-side extractor derives an `id` **then** the hash input is
   `<repo-relative-spec-path>|<pattern>` with forward-slash separators, not the absolute path. The
   same spec and pattern extracted from two different worktrees of the same repository yield an
   identical `id`.

8. **When** `adev heuristics migrate-keys` is invoked **then** it recomputes `id` for every stored
   entry whose evidence permits recomputation, rewrites each entry under its corrected `id`, and
   preserves `evidence[]`, `confidence`, `contradicted-by[]`, `created`, `tags`, `pattern`,
   `anti-pattern`, and `title` unchanged. It reports counts of entries rekeyed, entries left
   untouched, and any collisions detected.

9. **When** the migration would produce an `id` that already exists in the same scope file **then**
   the two entries are merged: evidence arrays are unioned, the higher confidence is kept, and
   `contradicted-by` arrays are unioned. The merge is reported, not silent — a collision is the
   duplicate-entry bug this spec exists to fix, and the operator should see how many it had.

10. **When** the migration runs a second time **then** it is a no-op: every id is already in
    corrected form, zero entries are rekeyed, and the store is byte-identical afterward.

### Postconditions

- Exactly one implementation of the derivation rule exists in shipped code. `skills/recover/SKILL.md`
  names the verb rather than restating the rule.
- Every entry in the store has a location-independent `id`.
- `signature` round-trips through serialization for entries that carry it.
- No entry has lost evidence, confidence, or contradiction history.

### Error Cases

| Condition | Expected behavior | Exit code |
|---|---|---|
| `--origin` outside the legal set | `INVALID_SIGNATURE_ORIGIN`, legal set printed, stdout empty | 1 |
| `--text` missing or empty after normalization | `EMPTY_SIGNATURE_TEXT`, stdout empty | 1 |
| Store file unreadable during migration | `MIGRATION_READ_FAILED` naming the file; no file is written; prior state intact | 1 |
| Migration interrupted mid-write | Store left in its prior state; writes are atomic per file (temp-then-rename) | — |
| Project root unresolvable when computing a repo-relative path | Extraction degrades to writing the entry without a `signature`, logs a warning, does not fail the caller | 0 |
| Migration detects an id collision | Entries merged per Behavior 9, reported in the summary | 0 |

## System Constitution Reference

- **Principle:** "Minimize external dependencies — prefer Node.js built-ins" — Applies because all
  hashing uses `node:crypto`'s `createHash`, already imported by every existing copy of the rule. No
  new dependency is introduced.
- **Principle:** "Pure ESM — all `.mjs` files" — Applies because the new primitive lives in
  `lib/cli/heuristics.mjs` and `lib/heuristics.mjs`, both already ESM.
- **Anti-pattern:** "Fenced JavaScript in SKILL.md must be descriptive-reference only… If a fenced
  JavaScript block contains control-flow logic, that logic belongs inside the CLI verb's
  implementation, not in skill prose." — Applies directly. The derivation rule currently lives as
  executable prose in `skills/recover/SKILL.md:387-397`. Moving it into `adev heuristics signature`
  is what brings the repository into compliance, and is the reason this capability is scoped as a
  CLI verb rather than a documented convention.
- **Principle:** "Skills are primarily markdown — companion code is allowed but must not be required
  for the skill to function." — Applies as a constraint on the primitive: when
  `adev heuristics signature` is unavailable, extraction degrades to writing an entry without a
  `signature` rather than failing, consistent with the charter's Degradation attribute.

## Actionable Task Map

| Task | Description | Complexity |
|---|---|---|
| Add `signature` to `FIELD_ORDER` | `lib/heuristics.mjs:185-199`; verify round-trip through `serializeHeuristic` | small |
| Implement derivation in `lib/heuristics.mjs` | Normalization + SHA-256 prefix; single exported function | small |
| Add `adev heuristics signature` verb | Wire to `lib/cli/heuristics.mjs` subcommand dispatch; origin enum validation | small |
| Correct id hash input | Replace absolute path with repo-relative in `hooks/post-validate-extract-heuristics.mjs:123-127` | small |
| Retire the dead twin | Remove `deriveId` at `lib/cli/heuristics.mjs:103-108` alongside the `extract` verb (owned by the `failure-capture` spec; this spec only stops depending on it) | small |
| Update test harnesses | `tests/skills/validate-success-heuristic-harness.mjs:145` and `tests/skills/recover-extract-heuristic-harness.mjs:119` call the shared function instead of holding copies | medium |
| Implement `adev heuristics migrate-keys` | Recompute, merge-on-collision, report counts; idempotent | medium |
| Migrate `skills/recover/SKILL.md` | Replace the prose ID Derivation Rule with a verb invocation (coordinated with the `failure-capture` spec) | small |
| Tests | Round-trip, cross-worktree id equality, origin rejection, migration idempotency, collision merge | medium |

## Acceptance Criteria

- [ ] `adev heuristics signature --origin recover --text "Error: cache miss"` prints a stable
      `recover-<8hex>` and exits 0
- [ ] The same text with different casing, run-length whitespace, and stripped punctuation yields an
      identical digest
- [ ] An illegal `--origin` exits non-zero with `INVALID_SIGNATURE_ORIGIN` and prints nothing on stdout
- [ ] A heuristic written with a `signature` reads back with that `signature` intact
- [ ] A heuristic written without a `signature` reads back successfully with `signature` undefined
- [ ] A test extracts the same spec and pattern from two temp directories with different absolute
      paths and asserts the derived `id` is identical
- [ ] `adev heuristics migrate-keys` preserves evidence, confidence, and contradiction history for
      every entry, verified field-by-field against a pre-migration snapshot
- [ ] Running `migrate-keys` twice leaves the store byte-identical after the first run
- [ ] An induced id collision merges rather than overwrites, and the merge is reported
- [ ] No copy of the derivation rule remains in shipped code outside the single exported function
      (test harnesses call it; `skills/recover/SKILL.md` names the verb)
- [ ] `npm test` passes
- [ ] No constitutional violations
