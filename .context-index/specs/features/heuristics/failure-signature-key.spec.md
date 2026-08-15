---
charter: heuristics
kind: behavioral
status: review-pending
risk_level: high
milestone: 3
revision: 3
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

### Two keys, two rules, one digest function

The review of revision 1 surfaced that this spec collapsed two distinct derivations into one. They are
separated here, and the separation governs every behavior below.

| | `signature` | `id` |
|---|---|---|
| Answers | "is this the same underlying failure, anywhere in the store" | "is this the same entry within this scope file" |
| Prefix | the origin slug | caller-supplied (spec slug for validate, diagnosis category for recover) |
| Hashed input | normalized **failure text** | `<repo-relative-spec-path>\|<pattern>` |
| Normalizer | `normalizeFailureText` — lowercase, collapse whitespace, strip punctuation except `-` and `_` | `normalizeIdInput` — lowercase, path separators folded to `/`; **no punctuation stripping**, because `/`, `.`, and `\|` are the separators that carry the meaning |

Both rules call one shared digest function (`normalize` → SHA-256 → first 8 lowercase hex), but they
pass different normalizers and compose different prefixes. "Exactly one implementation" is asserted
per-rule, not across the two.

This separation is what keeps `/adev:recover`'s ids byte-identical: recover composes
`<category-slug>-<digest>` exactly as it does today, while gaining a `signature` of
`recover-<digest>`. The two coexist on the same entry.

### Preconditions

- `.context-index/memory/heuristics/` exists, or the store is empty and will be created on first write.
- `lib/heuristics.mjs` exposes `writeHeuristic`, `readHeuristics`, and the serialization path used by both.
- Signature derivation has no filesystem precondition — it reads only the text it is given.
- `id` derivation requires a resolvable project root, so a repo-relative spec path can be computed. When
  the root cannot be resolved, `id` derivation fails closed and the caller skips extraction entirely
  (see Error Cases). Capture is non-blocking, so skipping is safe; guessing a key is not.

### Behaviors

1. **When** `adev heuristics signature --origin <slug> --text <text>` is invoked with a legal origin
   **then** it prints `<origin-slug>-<digest>` on stdout and exits 0, where `<digest>` is the first 8
   lowercase hex characters of the SHA-256 of the text after `normalizeFailureText`.

2. **When** the primitive applies `normalizeFailureText` **then** it lowercases, collapses consecutive
   whitespace to a single space, strips leading and trailing whitespace, and strips punctuation except
   `-` and `_` — the rule currently documented in `skills/recover/SKILL.md:393`. Identical input text
   differing only in case, run-length whitespace, or stripped punctuation yields an identical digest.
   **This normalizer applies to signature derivation only.** It is never applied to an `id` hash
   input, whose separators it would destroy.

3. **When** `--origin` is not one of `recover`, `validate`, `review-specs`, `implement` **then** the
   verb exits non-zero with `INVALID_SIGNATURE_ORIGIN`, prints the legal set, and prints nothing on
   stdout. The rejected value is stripped of control and ANSI characters and truncated before it is
   echoed. The origin determines only the signature's prefix — it never determines an `id` prefix.

3a. **When** `--origin review-specs` is used **then** `--blocker-id <id>` is required and `--text` is
   rejected with `CONFLICTING_SIGNATURE_INPUT`. The signature is derived from the supplied
   `blocker_id` rather than by re-hashing finding text: the verb parses it via
   `parseBlockerId` from `lib/blocker-id.mjs` and reuses its existing hash component as the digest,
   yielding `review-specs-<that-digest>`. This satisfies the charter invariant that a BLOCK-origin
   heuristic's signature derives from `blocker_id`, and guarantees one reviewer finding resolves to
   one identity across the retry loop and the store. A `--blocker-id` that fails to parse exits
   non-zero with `INVALID_BLOCKER_ID`.

3b. **When** `--blocker-id` is supplied with any origin other than `review-specs` **then** the verb
   exits non-zero with `CONFLICTING_SIGNATURE_INPUT`. Only the reviewer path has a pre-existing
   canonical identity to inherit.

4. **When** the same failure text is passed to the primitive on two different machines, in two
   different worktrees, or at two different times **then** the resulting signature is byte-identical.
   Derivation reads no clock, no filesystem path, no environment variable, and no run identifier.

5. **When** a heuristic carrying a `signature` field is written **then** the field survives the entire
   write path and appears in the entry's YAML frontmatter. Serialization is the *last* of three gates,
   and all three must pass — adding `signature` to `FIELD_ORDER` alone is insufficient:

   a. `validateEntry` (`lib/heuristics.mjs:101`) accepts `signature` as an optional field and rejects a
      malformed one — it must be a string matching `[a-z0-9][a-z0-9-]*`, max 64 characters. An entry
      with no `signature` remains valid.

   b. `writeHeuristic` carries `signature` into `finalEntry` on **both** paths. `finalEntry` is
      constructed as an explicit object literal — the update path at `lib/heuristics.mjs:733` and the
      new-entry path at `:767` — so any field not named there is silently discarded before
      serialization. `signature` follows the same incoming-wins-then-preserve-existing rule already
      used for `antiPattern` and `tags`.

   c. `signature` is present in `FIELD_ORDER` (`lib/heuristics.mjs:185-199`) so `serializeHeuristic`
      emits it in a deterministic position.

5a. **When** an existing entry carrying a `signature` is updated with an incoming entry that omits one
   **then** the stored `signature` is preserved, not cleared. A signature is an identity, and an update
   that happens not to carry it is not an assertion that the entry has none.

6. **When** a heuristic without a `signature` field is read **then** it parses successfully and
   `signature` is `undefined`. Entries written before this spec remain readable and are never
   rejected for lacking the field.

7. **When** the validate-side extractor derives an `id` **then** the hash input is
   `<repo-relative-spec-path>|<pattern>` passed through `normalizeIdInput` — lowercase, path
   separators folded to `/`, **no punctuation stripping** — and the result is composed as
   `<spec-slug>-<digest>`. The same spec and pattern extracted from two different worktrees of the
   same repository yield an identical `id`.

7a. **When** any caller derives an `id` **then** the prefix is supplied by that caller, not by the
   origin. `/adev:recover` composes `<category-slug>-<digest>` over its normalized root cause, exactly
   as it does today, so its post-migration ids are byte-identical to its pre-migration ids — the
   property `failure-capture.spec.md` Behavior 6 depends on. The shared code these callers reuse is the
   digest function, not the prefix.

8. **When** `adev heuristics migrate-keys` is invoked **then** it rekeys exactly the entries whose `id`
   was produced by the path-dependent validate-side rule, and no others. The discriminator and the
   recomputation inputs are both explicit:

   - **In scope:** an entry with at least one `evidence[]` element whose `source` is `validation`. Its
     `id` came from the absolute-path hash and is therefore machine-dependent.
   - **Out of scope, never rekeyed:** entries whose evidence sources are all `recovery`, `debug`,
     `retro`, or `manual`. `/adev:recover`'s ids are already content-only and must stay byte-identical
     — this is the property `failure-capture.spec.md` Behavior 6 depends on, and rekeying them would
     break it. Manual entries have no derivable input at all.
   - **Recomputation inputs:** the repo-relative spec path recovered from the in-scope evidence
     element's `path`, and the entry's stored `pattern` — the same two inputs Behavior 7 defines, so a
     migrated entry lands on the id a fresh extraction would produce.
   - **Unrecoverable input:** if the evidence `path` cannot be resolved to a repo-relative spec path,
     the entry is left untouched and counted as skipped. The migration never guesses a key.

   Rekeyed entries preserve `evidence[]`, `confidence`, `contradicted-by[]`, `created`, `tags`,
   `pattern`, `anti-pattern`, `title`, and `signature` unchanged. The verb reports counts of entries
   rekeyed, skipped-out-of-scope, skipped-unrecoverable, and merged on collision.

9. **When** the migration would produce an `id` that already exists in the same scope file **then**
   the two entries are merged: evidence arrays are unioned, the higher confidence is kept, and
   `contradicted-by` arrays are unioned. The merge is reported, not silent — a collision is the
   duplicate-entry bug this spec exists to fix, and the operator should see how many it had.

10. **When** the migration runs a second time **then** it is a no-op: every id is already in
    corrected form, zero entries are rekeyed, and the store is byte-identical afterward.

### Postconditions

- One shared digest function exists in `lib/heuristics.mjs`, and every caller that this spec touches
  invokes it rather than holding a private copy. (The assertion that *no* copy remains anywhere is
  owned by `failure-capture.spec.md`, which performs the removals — it is not verifiable at this
  spec's own validation point.)
- Signature derivation and id derivation each have exactly one implementation, with distinct
  normalizers, both reusing the shared digest function.
- Every entry in the store has a location-independent `id`.
- `signature` round-trips through serialization for entries that carry it.
- No entry has lost evidence, confidence, or contradiction history.

### Error Cases

| Condition | Expected behavior | Exit code |
|---|---|---|
| `--origin` outside the legal set | `INVALID_SIGNATURE_ORIGIN`, legal set printed, stdout empty | 1 |
| `--text` missing or empty after normalization | `EMPTY_SIGNATURE_TEXT`, stdout empty | 1 |
| `--origin review-specs` without `--blocker-id`, or `--blocker-id` with any other origin, or both `--text` and `--blocker-id` | `CONFLICTING_SIGNATURE_INPUT`, stdout empty | 1 |
| `--blocker-id` fails `parseBlockerId` | `INVALID_BLOCKER_ID`, stdout empty | 1 |
| Store file unreadable during migration | `MIGRATION_READ_FAILED` naming the file; no file is written; prior state intact | 1 |
| Migration interrupted mid-write | Store left in its prior state; writes are atomic per file (temp-then-rename) | — |
| Project root unresolvable when deriving an `id` | **Fail closed** — the caller skips extraction entirely, writes no entry, logs a warning, and does not fail the lifecycle step. Signature derivation is unaffected, since it reads no path | 0 |
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
  CLI verb rather than a documented convention. (The prose removal itself is performed by
  `failure-capture.spec.md`; this spec provides the verb that makes the removal possible.)
- **Principle:** "Skills are primarily markdown — companion code is allowed but must not be required
  for the skill to function." — Applies as a constraint on the primitive: when
  `adev heuristics signature` is unavailable, extraction still writes the entry, just without a
  `signature`, consistent with the charter's Degradation attribute. This is distinct from an
  unresolvable project root, which blocks `id` derivation and therefore fails closed.

## Actionable Task Map

| Task | Description | Complexity |
|---|---|---|
| Thread `signature` through the write path | Three gates, all required: `validateEntry` (`lib/heuristics.mjs:101`) accepts and validates it; `writeHeuristic` names it in both `finalEntry` literals (`:733` update, `:767` new) with incoming-wins-then-preserve semantics; `FIELD_ORDER` (`:185-199`) includes it for serialization | medium |
| Shared digest function | `lib/heuristics.mjs`: `normalize → SHA-256 → first 8 hex`, taking the normalizer as a parameter | small |
| Two normalizers | `normalizeFailureText` (strips punctuation) and `normalizeIdInput` (folds separators, strips nothing); both exported and separately tested | small |
| Add `adev heuristics signature` verb | Wire to `lib/cli/heuristics.mjs` dispatch; origin enum validation; `--blocker-id` path for `review-specs` origin via `parseBlockerId` | medium |
| Correct id hash input | Replace absolute path with repo-relative in `hooks/post-validate-extract-heuristics.mjs:123-127`; caller composes the `<spec-slug>` prefix | small |
| Update test harnesses | `tests/skills/validate-success-heuristic-harness.mjs:145` and `tests/skills/recover-extract-heuristic-harness.mjs:119` call the shared digest function with their own normalizer and prefix, instead of holding private copies. Recover's harness must keep producing category-prefixed ids | medium |
| Implement `adev heuristics migrate-keys` | Discriminate on `evidence[].source === "validation"`; recompute from evidence path + stored pattern; skip out-of-scope and unrecoverable entries; merge-on-collision; report four counts; idempotent | medium |
| Tests | Round-trip, cross-worktree id equality, recover id byte-equality across the change, normalizer separation, origin rejection, `--blocker-id` derivation, migration idempotency, collision merge | medium |

Removal of the dead `deriveId` twin, the `extract` verb, and the `skills/recover/SKILL.md` prose rule
are **not** tasks of this spec — they belong to `failure-capture.spec.md`, which runs after this one.
This spec only stops depending on them.

## Acceptance Criteria

- [ ] `adev heuristics signature --origin recover --text "Error: cache miss"` prints a stable
      `recover-<8hex>` and exits 0
- [ ] The same text with different casing, run-length whitespace, and stripped punctuation yields an
      identical digest
- [ ] An illegal `--origin` exits non-zero with `INVALID_SIGNATURE_ORIGIN` and prints nothing on stdout
- [ ] `--origin review-specs --blocker-id <id>` derives the signature from the parsed `blocker_id`'s
      hash component and never re-hashes finding text
- [ ] `--origin review-specs` without `--blocker-id`, `--blocker-id` with another origin, and
      `--text` plus `--blocker-id` together each exit non-zero with `CONFLICTING_SIGNATURE_INPUT`
- [ ] `normalizeIdInput` preserves `/`, `.`, and `|`; `normalizeFailureText` strips them. A test
      asserts two distinct spec paths do not collide under `normalizeIdInput`
- [ ] A heuristic written with a `signature` reads back with that `signature` intact — asserted on the
      **new-entry** path and again on the **update** path, since `finalEntry` is built separately in each
- [ ] Updating an entry that has a `signature` with an incoming entry that omits one preserves the
      stored `signature` rather than clearing it
- [ ] `validateEntry` rejects a malformed `signature` and accepts an entry with none
- [ ] A heuristic written without a `signature` reads back successfully with `signature` undefined
- [ ] A test extracts the same spec and pattern from two temp directories with different absolute
      paths and asserts the derived `id` is identical
- [ ] `adev heuristics migrate-keys` preserves evidence, confidence, contradiction history, and
      `signature` for every entry, verified field-by-field against a pre-migration snapshot
- [ ] A store fixture containing both a `validation`-evidenced entry and a `recovery`-evidenced entry
      migrates the first and leaves the second's `id` byte-identical
- [ ] An entry whose evidence path cannot be resolved is left untouched and counted as skipped, not
      rekeyed to a guessed value
- [ ] Running `migrate-keys` twice leaves the store byte-identical after the first run
- [ ] An induced id collision merges rather than overwrites, and the merge is reported
- [ ] `/adev:recover` produces byte-identical ids before and after this change for the same
      normalized root cause, asserted against a fixture captured pre-change
- [ ] Every caller this spec touches invokes the shared digest function rather than a private copy
      (the repo-wide "no copy remains" assertion belongs to `failure-capture.spec.md`)
- [ ] When the project root is unresolvable, extraction is skipped and no entry is written
- [ ] `npm test` passes
- [ ] No constitutional violations
