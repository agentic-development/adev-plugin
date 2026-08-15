---
charter: heuristics
kind: behavioral
status: review-passed
risk_level: high
milestone: 3
revision: 8
charter-revision: 6
created: 2026-08-15
updated: 2026-08-15
source-manifest:
  sha: "44d0e40"
  files:
    - .context-index/memory/heuristics/_format.md
    - hooks/post-validate-extract-heuristics.mjs
    - lib/cli/heuristics.mjs
    - lib/heuristics.mjs
    - tests/cli/heuristics-migrate-keys.test.mjs
    - tests/cli/heuristics-signature.test.mjs
    - tests/hooks/post-validate-heuristic-id.test.mjs
    - tests/lib/heuristics-digest.test.mjs
    - tests/lib/heuristics-format-doc.test.mjs
    - tests/lib/heuristics-signature-field.test.mjs
    - tests/skills/recover-extract-heuristic-harness.mjs
    - tests/skills/recover-extract-heuristic.test.mjs
    - tests/skills/validate-success-heuristic-harness.mjs
    - tests/skills/validate-success-heuristic.test.mjs
  computed-at: "2026-08-15T13:21:44.564Z"
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

| | `signature` (derived mode) | `signature` (inherited mode) | `id` |
|---|---|---|---|
| Applies to | origins `recover`, `validate`, `implement` | origin `review-specs` only | all callers |
| Answers | "is this the same underlying failure, anywhere in the store" | same, for a reviewer finding | "is this the same entry within this scope file" |
| Prefix | the origin slug | the literal `review-specs` | caller-supplied (spec slug for validate, diagnosis category for recover) |
| Digest source | SHA-256 of the hashed input | **inherited** — the hash component of the supplied `blocker_id`; nothing is hashed | SHA-256 of the hashed input |
| Hashed input | normalized **failure text** | none | `<repo-relative-spec-path>\|<pattern>` |
| Normalizer | `normalizeFailureText` — lowercase, collapse whitespace, strip punctuation except `-` and `_` | none | `normalizeIdInput` — lowercase, path separators folded to `/`; **no punctuation stripping**, because `/`, `.`, and `\|` are the separators that carry the meaning |

The verb therefore has **two modes**, not one. Derived mode hashes text; inherited mode reuses an
identity that already exists, so that a reviewer finding resolves to the same key in the retry loop
and in the store. Behavior 1 covers derived mode and Behavior 3a covers inherited mode — 3a is a
distinct mode, not an exception to 1.

The two derived rules (`signature` and `id`) call one shared digest function (`normalize` → SHA-256 →
first 8 lowercase hex), but pass different normalizers and compose different prefixes. Inherited mode
calls neither. "Exactly one implementation" is asserted per-rule, not across them.

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

1. **When** `adev heuristics signature --origin <slug> --text <text>` is invoked in **derived mode** —
   that is, with origin `recover`, `validate`, or `implement` — **then** it prints
   `<origin-slug>-<digest>` on stdout and exits 0, where `<digest>` is the first 8 lowercase hex
   characters of the SHA-256 of the text after `normalizeFailureText`. Origin `review-specs` does not
   take this path; see Behavior 3a.

2. **When** the primitive applies `normalizeFailureText` **in derived mode** **then** it lowercases,
   collapses consecutive whitespace to a single space, strips leading and trailing whitespace, and
   strips punctuation except `-` and `_` — the rule currently documented in
   `skills/recover/SKILL.md:393`. Identical input text differing only in case, run-length whitespace,
   or stripped punctuation yields an identical digest. **This normalizer applies to derived-mode
   signature derivation only.** It is never applied to an `id` hash input, whose separators it would
   destroy, and never runs in inherited mode, which hashes nothing.

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
      serialization. **`signature` uses existing-wins semantics, deliberately unlike `antiPattern` and
      `tags`**, which are refinements and take the incoming value. A signature is an identity: the
      charter states unconditionally that it is never rewritten once assigned. First assignment sticks.

   c. `signature` is present in `FIELD_ORDER` (`lib/heuristics.mjs:185-199`) so `serializeHeuristic`
      emits it in a deterministic position.

5a. **When** an existing entry carrying a `signature` is updated **then** the stored `signature` is
   preserved in every case — whether the incoming entry omits one, carries the same one, or carries a
   *different* one. The last of these is reachable: `id` and `signature` key on different inputs, so
   one `id` can legitimately be reached by two different failure texts. The charter invariant resolves
   it — the first signature stands.

5b. **When** an incoming entry carries a `signature` that differs from the stored one **then** the
   write succeeds, the stored value is kept, and the divergence is logged at warning level. It is not
   an error: a second failure text mapping to an existing `id` is informative, not invalid. Silently
   discarding it would hide a real signal about id/signature granularity mismatch.

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

   The discriminator keys on **which rule composed the `id`**, read off the `id` itself. Evidence
   provenance is the wrong property: `/adev:retro` consolidation can merge entries, so a single entry
   may carry both `validation` and `recovery` evidence, and a provenance test would rekey such an entry
   and destroy a recover-produced `id` — breaking the byte-identity `failure-capture.spec.md`
   Behavior 6 depends on. The `id`'s own prefix does not have that problem: it records which rule
   composed the key at write time and is unaffected by evidence the entry accretes later.

   **Proof by recomputing the legacy `id` is not available, and is not needed.** An earlier revision
   specified confirming each candidate by reproducing its stored `id` under the pre-migration rule.
   That rule hashed the **absolute** spec path, and stored evidence paths are repo-relative (e.g.
   `.context-index/specs/features/validation/validate-config-single-source.validate.md`). The absolute
   path is not recoverable from the entry — it depends on which checkout or worktree wrote it — so the
   recomputation could never match and the migration would rekey nothing. The prefix test alone is
   sufficient, because prefix already answers the only question that matters.

   - **The test — the prefix is not a diagnosis category.** `/adev:recover` composes
     `<category-slug>-<digest>` from a closed six-value set: `missing-context`, `ambiguous-spec`,
     `constraint-conflict`, `novel-problem`, `tool-failure`, `budget-exhaustion`
     (`skills/recover/SKILL.md:130-185`). An `id` carrying one of these prefixes was composed by the
     recover rule and is never rekeyed, whatever evidence the entry accumulated later. Every other
     `id` was composed by the validate-side rule and is rekeyed.
   - **Ambiguity guard.** A spec slug could in principle collide with a category slug — a spec named
     `tool-failure.spec.md` would yield an `id` indistinguishable from a recover key. When an entry's
     prefix matches a category slug **and** the entry carries `validation`-sourced evidence, the
     migration cannot tell the two rules apart. It leaves the entry untouched and reports it as
     ambiguous. Skipping a rekey is recoverable; destroying a recover id is not.
   - **Alias normalization is read-time only and is never written back.** `EvidenceRef.source` is
     unenforced and the live store has drifted to four spellings — `validation` (24 entries), `learn`
     (4), `validate` (2), `recover` (2) — of which only `validation` appears in the charter's
     `EvidenceRef` enum. The migration folds `validate` → `validation`, `recover` → `recovery`, and
     `learn` → `manual` when *reading* an entry to classify it, and **reports** any spelling it does
     not recognize. It never rewrites a stored `source` value: doing so would violate the
     "left untouched" guarantee for skipped entries and would make Behavior 10's byte-identical
     second run impossible. Repairing the stored vocabulary is a separate concern from rekeying.
   - **Evidence path → spec path mapping.** The `id` hash input needs the spec path; the evidence
     element holds the validate **report** path. They are siblings by construction: replace the
     trailing `.validate.md` with `.spec.md` on the same stem. If an in-scope entry has no evidence
     path ending in `.validate.md`, the mapping is undefined — the entry is left untouched and counted
     as skipped rather than mapped by guesswork.
   - **Migration also normalizes the two legacy slug conventions.** The store holds ids from both:
     `specSlug` in `lib/cli/heuristics.mjs` retains the `.spec` stem (`deploy-core-spec-91c5a876`,
     `template-replacement-spec-4ea79ce7` and five more) while the hook strips it
     (`prototype-core-277ce212`, `template-resolution-6280563d`). Because rekeying recomputes rather
     than reproduces, both converge on Behavior 7's single canonical form — the stem is stripped. This
     is a consequence of the migration, not an extra step.
   - **Out of scope, never rekeyed:** entries whose prefix is a diagnosis category, entries flagged by
     the ambiguity guard, and entries whose evidence path cannot be mapped to a spec path. Anything the
     test cannot positively classify is left alone rather than rekeyed on a guess.
   - **New-key inputs, once an entry qualifies:** the repo-relative spec path mapped from the entry's
     validate-report evidence path, and the entry's stored `pattern` — the same two inputs Behavior 7 defines, so a
     migrated entry lands on the id a fresh extraction would produce.
   - **Unrecoverable input:** if the evidence `path` cannot be resolved to a repo-relative spec path,
     the entry is left untouched and counted as skipped. The migration never guesses a key.

   Rekeyed entries preserve `evidence[]`, `confidence`, `contradicted-by[]`, `created`, `tags`,
   `pattern`, `anti-pattern`, `title`, and `signature` unchanged. The verb reports counts of entries
   rekeyed, skipped-out-of-scope, skipped-unrecoverable, and merged on collision.

9. **When** the migration would produce an `id` that already exists in the same scope file **then**
   the two entries are merged: evidence arrays are unioned, `contradicted-by` arrays are unioned, and
   the higher confidence is kept — **then the charter's contradiction invariant is re-applied to the
   merged result**. Unioning two `contradicted-by` arrays can push the merged entry to two or more
   contradictions, and the charter states that such an entry cannot remain at `high`. Taking the
   higher confidence without re-checking would mint an entry the invariant forbids. Where the union
   reaches two contradictions, the merged entry is archived per the same invariant. The merge is
   reported, not silent — a collision is the duplicate-entry bug this spec exists to fix, and the
   operator should see how many it had.

10. **When** the migration runs a second time **then** it is a no-op: every id is already in
    corrected form, zero entries are rekeyed, and the store is byte-identical afterward.

### Postconditions

- One shared digest function exists in `lib/heuristics.mjs`, and every caller that this spec touches
  invokes it rather than holding a private copy. (The assertion that *no* copy remains anywhere is
  owned by `failure-capture.spec.md`, which performs the removals — it is not verifiable at this
  spec's own validation point.)
- Signature derivation and id derivation each have exactly one implementation, with distinct
  normalizers, both reusing the shared digest function.
- Every entry that was in migration scope has a location-independent `id`. Entries the migration
  deliberately skipped — diagnosis-category prefixes, ambiguity-guard hits, and entries with no
  mappable `.validate.md` evidence path — retain their prior `id` and are reported in the skip
  counts. The postcondition is
  scoped this way on purpose: asserting it over *every* entry would contradict Behavior 8, which
  requires the migration to skip rather than guess.
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
| Thread `signature` through the write path | Three gates, all required: `validateEntry` (`lib/heuristics.mjs:101`) accepts and validates it; `writeHeuristic` names it in both `finalEntry` literals (`:733` update, `:767` new) with **existing-wins** semantics per Behavior 5(b) — the first assigned signature stands, unlike the incoming-wins rule used for the `antiPattern` and `tags` refinement fields; `FIELD_ORDER` (`:185-199`) includes it for serialization | medium |
| Shared digest function | `lib/heuristics.mjs`: `normalize → SHA-256 → first 8 hex`, taking the normalizer as a parameter | small |
| Two normalizers | `normalizeFailureText` (strips punctuation) and `normalizeIdInput` (folds separators, strips nothing); both exported and separately tested | small |
| Add `adev heuristics signature` verb | Wire to `lib/cli/heuristics.mjs` dispatch; origin enum validation; `--blocker-id` path for `review-specs` origin via `parseBlockerId` | medium |
| Correct id hash input | Replace absolute path with repo-relative in `hooks/post-validate-extract-heuristics.mjs:123-127`; caller composes the `<spec-slug>` prefix | small |
| Update test harnesses | `tests/skills/validate-success-heuristic-harness.mjs:145` and `tests/skills/recover-extract-heuristic-harness.mjs:119` call the shared digest function with their own normalizer and prefix, instead of holding private copies. Recover's harness must keep producing category-prefixed ids | medium |
| Implement `adev heuristics migrate-keys` | Prefix-based discriminator per Behavior 8 — reject the closed six diagnosis-category prefixes, apply the ambiguity guard, rekey everything else; map the evidence `.validate.md` path to its `.spec.md` sibling; fold `evidence[].source` aliases at read time only, never writing them back; recompute the new key from mapped spec path + stored pattern; skip anything unclassifiable; merge-on-collision with the contradiction invariant re-applied; report counts plus ambiguous entries and unrecognized source spellings; idempotent | large |
| Revise `_format.md` | Charter row 152 makes `.context-index/memory/heuristics/_format.md` the public schema contract. Add `signature`, document the two signature modes, correct the ID Namespace Convention section that Behavior 7 makes wrong on landing, **and replace the stale recover category slugs** — `_format.md:211-217` documents `spec-violation`, `context-gap`, `tool-failure` with example `spec-violation-a1b2c3`, of which only `tool-failure` is real. Behavior 8's whole discriminator is that six-value prefix set, so an implementer building it from this file rather than `skills/recover/SKILL.md` would get three wrong slugs and rekey recover entries the migration must never touch | medium |
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
- [ ] Updating an entry that has a `signature` preserves the stored value in all three cases: the
      incoming entry omits one, carries the same one, or carries a different one. The differing case
      succeeds and logs a warning rather than erroring or overwriting
- [ ] An induced collision whose merged `contradicted-by` union reaches two entries does not remain at
      `high` confidence — the contradiction invariant is re-applied after the merge
- [ ] `validateEntry` rejects a malformed `signature` and accepts an entry with none
- [ ] A heuristic written without a `signature` reads back successfully with `signature` undefined
- [ ] A test extracts the same spec and pattern from two temp directories with different absolute
      paths and asserts the derived `id` is identical
- [ ] `adev heuristics migrate-keys` preserves evidence, confidence, contradiction history, and
      `signature` for every entry, verified field-by-field against a pre-migration snapshot
- [ ] A store fixture containing both a legacy validate-produced entry and a recover-produced entry
      migrates the first and leaves the second's `id` byte-identical
- [ ] An entry carrying **both** `validation` and `recovery` evidence — reachable via `/adev:retro`
      consolidation — is not rekeyed when its prefix is a diagnosis category
- [ ] An entry whose prefix matches a category slug **and** which carries `validation` evidence is
      reported as ambiguous and left untouched, not rekeyed
- [ ] Entries in both legacy slug conventions migrate and converge on the single canonical stripped
      form — asserted against real store ids, one retaining the `.spec` stem
      (`deploy-core-spec-91c5a876`) and one stripping it (`prototype-core-277ce212`)
- [ ] The migration never rewrites a stored `evidence[].source` value; a skipped entry is byte-identical
      afterward, including its original source spelling
- [ ] `_format.md`'s recover category slugs match the six in `skills/recover/SKILL.md`, with no
      `spec-violation` or `context-gap` remaining
- [ ] `_format.md` documents `signature` and both signature modes, and its ID Namespace Convention
      section matches Behavior 7
- [ ] An in-scope entry with no `.validate.md` evidence path is left untouched and counted as skipped,
      since the report-path → spec-path mapping is undefined for it
- [ ] The `.validate.md` → `.spec.md` sibling mapping is asserted directly against a real store entry
      (`.context-index/specs/features/validation/validate-config-single-source.validate.md`)
- [ ] An entry spelled `source: validate` is considered identically to one spelled `source: validation`,
      asserted against the live store's actual drift (24 `validation` / 4 `learn` / 2 `validate` /
      2 `recover`)
- [ ] An unrecognized `source` spelling is reported in the summary rather than silently skipped
- [ ] The verb has two modes and the two-keys table, Behavior 1, Behavior 2, and Behavior 3a all
      describe the same two — derived mode hashes text, inherited mode hashes nothing
- [ ] Running `migrate-keys` twice leaves the store byte-identical after the first run
- [ ] An induced id collision merges rather than overwrites, and the merge is reported
- [ ] `/adev:recover` produces byte-identical ids before and after this change for the same
      normalized root cause, asserted against a fixture captured pre-change
- [ ] Every caller this spec touches invokes the shared digest function rather than a private copy
      (the repo-wide "no copy remains" assertion belongs to `failure-capture.spec.md`)
- [ ] When the project root is unresolvable, extraction is skipped and no entry is written
- [ ] `npm test` passes
- [ ] No constitutional violations
