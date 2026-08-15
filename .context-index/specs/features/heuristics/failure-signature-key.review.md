---
kind: review
spec: .context-index/specs/features/heuristics/failure-signature-key.spec.md
charter: .context-index/specs/features/heuristics/charter.md
verdict: BLOCK
rigor-tier: full
reviewed: 2026-08-15
last-reviewed-revision: 1
file-sha: dfe1902f5f27b6745969f022cf08e46fe8f972553b1d342ee8cb5e226ff7ff68
---

# Architecture Review: failure-signature-key

> **Date:** 2026-08-15
> **Spec:** `.context-index/specs/features/heuristics/failure-signature-key.spec.md`
> **Charter:** `.context-index/specs/features/heuristics/charter.md` (revision 6, Phase 3)
> **Rigor tier:** full (explicit `--tier full`; risk_level `high` → `review_mode: full` also resolves to full)
> **Verdict:** BLOCK

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | `plugin:review-specs/structural-architect-prompt.md` |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | `plugin:review-specs/security-reviewer-prompt.md` |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | `plugin:review-specs/consistency-analyzer-prompt.md` |

Registry source: domain `software` (source level `default`), no `.context-index/governance/review.yaml` overrides (`reviewers: []`). No registry warnings. Severity cap `blocker` for all three — no findings were clamped.

Heuristics injected: 3 module-scoped entries at `summary` tier (`adev heuristics retrieve --module heuristics`).

Cross-repo `depends-on` validation: skipped — the spec declares no `depends-on` frontmatter and no workspace was detected.

## Structural Architect (structural-architect)

**Verdict:** BLOCK

**Claim verification performed by the reviewer:** `FIELD_ORDER` at `lib/heuristics.mjs:185-199` confirmed to omit `signature`, and `serializeHeuristic` iterates `FIELD_ORDER` so unknown fields are dropped (spec claim accurate). Path-dependent hash at `hooks/post-validate-extract-heuristics.mjs:123-127` confirmed. Dead twin at `lib/cli/heuristics.mjs:103-108` confirmed. Both test-harness copies confirmed. Behavior 6 already holds today — the parser applies `toCamel` generically (`lib/heuristics.mjs:336`), so an unknown `signature` key round-trips on read. No ADR conflict: ADR-0016 §1 names heuristics as `.context-index/` state and the migration stays in-repo; the charter's avoidance of check-ID keying keeps ADR-0019 / `check-id-enum.spec.md` out of scope.

### SA-1 — blocker

- **Location:** Behaviors 3 and 1 (`--origin` enum / output form)
- **blocker_id:** `structural-architect:api-shape-conflict:25796bde`
- **section_anchor:** `behaviors-3`
- **Finding:** The verb emits `<origin-slug>-<digest>` with `origin ∈ {recover, validate, review-specs, implement}`. But `/adev:recover`'s id is `<category-slug>-<hash>` where the prefix is the diagnosis category (`missing-context`, `tool-failure` — `skills/recover/SKILL.md:387-397`), and `tests/skills/recover-extract-heuristic-harness.mjs:119` takes `(category, normalizedText)`. Charter capability "Recover Migration" states recover's `id` derivation is *unchanged*, and `failure-capture.spec.md` Behavior 6 plus its acceptance criterion require recover's post-migration ids to be byte-identical to today's. The specified API cannot produce them: `recover-a1b2c3d4 ≠ missing-context-a1b2c3d4`. The Task Map nevertheless requires that harness to "call the shared function".
- **Recommendation:** Decide and state whether the prefix is a caller-supplied slug validated against a character class (with `origin` a separate concern), or whether the verb exposes the bare digest and callers compose the prefix. Reconcile with `failure-capture.spec.md` Behavior 6 either way.

### SA-2 — blocker

- **Location:** Behavior 2 vs Behavior 7 vs Postconditions ("Exactly one implementation")
- **blocker_id:** `structural-architect:ambiguous-behavior:6c240478`
- **section_anchor:** `behaviors-7`
- **Finding:** Two incompatible derivations are collapsed into one. Behavior 2 normalizes by stripping punctuation except `-`/`_`; Behavior 7 defines the id hash input as `<repo-relative-spec-path>|<pattern>`, which is *all* punctuation — `/`, `.`, `|` are exactly the separators that carry the meaning, and stripping them makes distinct spec paths collide. The Task Map lists a "single exported function" doing "Normalization + SHA-256 prefix", and the Postconditions assert one implementation, but the spec never says whether id derivation passes through the Behavior 2 normalizer or a different one. Every downstream artifact (migration recomputation, the two harnesses, the cross-worktree equality test) depends on which.
- **Recommendation:** State the id derivation contract explicitly and separately from the signature contract — including whether path normalization is limited to separator folding plus case, and whether the two share code at all. If they do not share a normalizer, the "exactly one implementation" postcondition needs to be worded per-rule.

### SA-3 — blocker

- **Location:** Error Cases, row "Project root unresolvable when computing a repo-relative path"
- **blocker_id:** `structural-architect:missing-precondition:bee2251f`
- **section_anchor:** `error-cases`
- **Finding:** The stated degradation is "write the entry without a `signature`". But the repo-relative path is an input to `id` (Behavior 7), not to `signature` (Behavior 4 explicitly reads no filesystem path). Dropping the signature does not answer what `id` the entry gets when the root is unresolvable — and the third Precondition makes root resolution a hard precondition, so the error table contradicts it.
- **Recommendation:** Specify the id-side fallback (skip extraction, fall back to the bare spec basename, or fail closed) and align the Preconditions with whichever is chosen.

### SA-4 — blocker

- **Location:** Postconditions bullet 1 and the corresponding Acceptance Criterion
- **blocker_id:** `structural-architect:circular-ownership:39f99256`
- **section_anchor:** `postconditions`
- **Finding:** This spec asserts as its own postcondition that `skills/recover/SKILL.md` names the verb and that no duplicate rule remains — but the Task Map assigns both the SKILL.md migration and the dead-twin / `extract`-verb removal to `failure-capture.spec.md`, whose Preconditions require *this* spec to have shipped first. The postcondition and its acceptance criterion are therefore unverifiable at this spec's own validation point.
- **Recommendation:** Restate the postcondition as what this spec can satisfy alone (the shared function exists and every remaining caller uses it) and move the "no copy remains" assertion to the spec that performs the removals.

### SA-5 — warning

- **Location:** Behavior 8 ("every stored entry whose evidence permits recomputation")
- **Finding:** The discriminator is undefined against the live store. `.context-index/memory/heuristics/_global.md` holds human-authored ids (`eval-with-session-jsonl`, `source: learn`) that were never path-derived; `domain-extensions.md` holds hand-written placeholder digests (`-a1b2c3d4`, `-b2c3d4e5`) under `source: validation`. A recompute-everything reading rewrites human ids; a recompute-nothing-without-a-hash-suffix reading is unstated.
- **Recommendation:** Name the discriminator explicitly (e.g. `evidence[].source === 'validation'` plus an `-[0-9a-f]{8}` id suffix) and state that non-matching entries are reported as "left untouched".

### SA-6 — warning

- **Location:** Behaviors 8, 9, 10 vs the existing write path
- **Finding:** `writeHeuristic`'s update path (`lib/heuristics.mjs:724-742`) ignores the caller's confidence, runs `autoPromote(baseConfidence, mergedEvidence)`, and refreshes `updated: now`. Behavior 9's collision merge unions evidence, which can push distinct-path count to 2 and trigger promotion — colliding with both Behavior 8's "preserves `confidence` unchanged" and Behavior 9's "the higher confidence is kept". Behavior 8 also omits `updated` from its preservation list while Behavior 10 demands byte-identity.
- **Recommendation:** State whether the migration writes through `writeHeuristic` or bypasses it, and settle `updated` and post-merge promotion explicitly.

### SA-7 — warning

- **Location:** Behaviors 1/3 (signature form) vs charter Domain Model invariant on BLOCK-origin signatures
- **Finding:** The charter requires a `review-specs`-origin signature to derive from `buildBlockerId` (`lib/blocker-id.mjs`, owned by `review-block-auto-retry.spec.md`), whose output is `<reviewer>:<type>:<8hex>` — colons, three segments. This spec admits `review-specs` into the origin enum but defines no mapping from a `blocker_id` into `<origin-slug>-<digest>`, and neither sibling Phase-3 spec claims it. The consumed contract is declared in the charter with no owning behavior.
- **Recommendation:** Either define the mapping here (this spec owns the key's shape) or explicitly defer it and note that `review-specs` is not yet a legal origin.

### SA-8 — suggestion

- **Location:** Behavior 2 citation
- **Finding:** The normalization rule is at `skills/recover/SKILL.md:393`, not `:392` (393 is the `**Normalization:**` bullet; 387 is the heading).

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES

**Threat model applied:** local dev CLI plus a git-tracked, team-shared markdown store. No auth/authz boundaries apply — all operators already have full repo write access. Evaluated for injection surfaces, secret exposure, and downstream consumption by the sibling capture/retrieval specs.

### SEC-1 — warning (input-validation)

- **Finding:** The `signature` field is added to `FIELD_ORDER` for serialization (Behavior 5) but the spec never requires format validation on write or read — unlike `id`, `scope`, and `tags`, which are all validated against `SAFE_SLUG_PATTERN` / `TAG_PATTERN` in `validateEntry()`. Since the derivation is public and deterministic (SHA-256 of normalized text, no secret salt), anyone with git write access to `.context-index/memory/heuristics/` can precompute the exact signature for a common failure string and hand-author an entry carrying it with attacker-chosen `pattern` / `anti-pattern`. Per the sibling `signature-retrieval.spec.md` Behavior 2, an exact signature match bypasses the low-confidence exclusion and is auto-injected into an agent's context at the precise moment that failure recurs — a more surgical and less visible injection path than the always-on `## Learned Lessons` sync index, which is at least passively reviewed.
- **Recommendation:** Add format validation in `validateEntry()` (`lib/heuristics.mjs`) requiring `signature` to match `^(recover|validate|review-specs|implement)-[0-9a-f]{8}$` when present, rejecting writes with malformed or hand-crafted values at the point this spec already extends the schema.

### SEC-2 — suggestion (secrets)

- **Finding:** `adev heuristics signature --origin <slug> --text <text>` takes failure text as a CLI argument. Automatically captured failure text can contain secrets pulled from logs/stderr. Passing it via `argv` is transiently visible to other local users via process listings and may land in shell history.
- **Recommendation:** Support reading `--text` from stdin (`--text -`, or omit `--text` to read stdin) for hook/skill callers that pipe captured failure output, and prefer that path in the extractor implementations. Keep `--text <value>` for interactive and test use.

### SEC-3 — suggestion (input-validation)

- **Finding:** `INVALID_SIGNATURE_ORIGIN`'s echoed rejected value is specified to be "stripped of control and ANSI characters and truncated" — correctly defending against terminal-escape injection — but no explicit truncation length is pinned.
- **Recommendation:** Specify a concrete cap (e.g. 64 chars) in the Error Cases table so the bound is unambiguous and testable.

**Explicitly not flagged:** origin allowlist enforcement and ANSI/control-char stripping (already correctly specified); atomic temp-then-rename writes, migration rollback-on-read-failure, and idempotent re-runs (well specified); no shell execution and no path-traversal surface (origin is enum-constrained, the `id` hash input is not used as a filesystem path); raw `--text` is never persisted — only its 8-hex digest survives into `signature`.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** BLOCK

### CON-1 — blocker (contract)

- **blocker_id:** `consistency-analyzer:contract:ee7e74a8`
- **section_anchor:** `behavioral-contract` *(reviewer emitted `Behavioral_Contract`; normalized to the anchor form — see Advisories)*
- **This spec:** Behavior 1 defines uniform text-hashing derivation — `adev heuristics signature --origin <slug> --text <text>` hashes the text to produce `<origin-slug>-<digest>` for all origin values including `review-specs` (lines 43-45).
- **Conflicts with:** `charter.md` § Domain Model § Invariants (line 124): "A heuristic whose origin is a `/adev:review-specs` BLOCK carries a `signature` derived from that finding's `blocker_id`"; and `charter.md` § Phase 3 (line 51): "For heuristics originating from a `/adev:review-specs` BLOCK, the signature derives from the existing `blocker_id` (`lib/blocker-id.mjs`) rather than re-hashing the finding text."
- **Recommendation:** Clarify how `review-specs`-origin inputs differ from other origins: (a) document that with `--origin review-specs` the `--text` parameter is expected to be a `blocker_id` string and is not re-hashed, (b) add a separate `--blocker-id` flag, or (c) move `review-specs` handling out of this spec's scope. The current text implies all four origins follow identical text-hashing, contradicting the charter invariant.

### CON-2 — blocker (domain-model)

- **blocker_id:** `consistency-analyzer:domain-model:8c5333d5`
- **section_anchor:** `behavioral-contract` *(reviewer emitted `Behavioral_Contract`; normalized — see Advisories)*
- **This spec:** The origin enum includes `recover`, `validate`, `review-specs`, `implement` (Behavior 3, lines 53-55). No behavior differentiates between origins.
- **Conflicts with:** `charter.md` § Domain Model § Invariants (line 124). This invariant is mandatory — it sits in the Invariants section, not in Deferred Capabilities — but the target spec never mentions `blocker_id` handling.
- **Recommendation:** Add a behavior that explicitly documents the `review-specs` case, stating whether `blocker_id` is a valid input format to `--text`, a separate input parameter, or handled outside this primitive.

### CON-3 — warning (pattern)

- **This spec:** Behavior 1 uses a uniform pattern for all origins: text normalization → SHA-256 → prefix.
- **Conflicts with:** `charter.md` § Interface Contracts § Exposed APIs (line 183) describes the verb as "the single implementation of the derivation rule". If `review-specs` requires special `blocker_id` handling, this verb cannot be that single implementation without an additional parameter or explicit clarification.
- **Recommendation:** Clarify whether the verb is "the single implementation for all origins" or "the single implementation for the standard text-hashing origins". If the latter, `review-specs` extraction needs its own logic, which weakens the single-implementation contract.

### CON-4 — suggestion (terminology)

- **This spec:** Behavior 2 traces the normalization rule to existing prose at `skills/recover/SKILL.md:392` rather than defining it in the spec.
- **Recommendation:** Add a sentence clarifying that the primitive *consumes* the rule rather than defining it, to prevent future copy-paste of the rule into other specs.

---

## Advisories

- **SECTION_ANCHOR_NORMALIZED** (informational, 2 occurrences): `consistency-analyzer` emitted `section_anchor: Behavioral_Contract` for CON-1 and CON-2. The value was normalized to `behavioral-contract` (lowercase, underscores folded to hyphens) so `/adev:specify --revise` can resolve it against the spec body. No `MISSING_SECTION_ANCHOR` advisory was raised — the anchor was present, only its casing differed.
- No `LEGACY_REVIEWER_OUTPUT` advisories: every `blocker` finding carried a well-formed `blocker_id`.
- No `INVALID_BLOCKER_ID` advisories: all six blocker ids parse cleanly via `lib/blocker-id.mjs::parseBlockerId`.
- No `BLOCKER_ID_COLLISION` advisories: all six ids are distinct.
- Severity cap (`blocker` for all three reviewers) demoted nothing.

## Governance Footer

`.context-index/governance/gates.yaml` defines no `approver_role` on a `spec-to-plan` transition, so no human approver is named for this transition. Note that `risk-policies.yaml` sets `require_hitl_approval: true` for `risk_level: high` — this spec is `high`, so a human sign-off is expected before implementation regardless of the review verdict.

---

## Summary

**Total findings:** 15 (6 blockers, 5 warnings, 4 suggestions)

**Blockers:**

| ID | blocker_id | Section | Theme |
|----|-----------|---------|-------|
| SA-1 | `structural-architect:api-shape-conflict:25796bde` | `behaviors-3` | Origin enum cannot reproduce `/adev:recover`'s existing category-prefixed ids, contradicting `failure-capture.spec.md` Behavior 6 |
| SA-2 | `structural-architect:ambiguous-behavior:6c240478` | `behaviors-7` | `id` and `signature` derivations conflated; the Behavior 2 normalizer would destroy the path separators Behavior 7 depends on |
| SA-3 | `structural-architect:missing-precondition:bee2251f` | `error-cases` | Unresolvable-project-root row degrades the wrong key and contradicts Precondition 3 |
| SA-4 | `structural-architect:circular-ownership:39f99256` | `postconditions` | Postcondition depends on work this spec's Task Map assigns to `failure-capture.spec.md`, which in turn depends on this spec |
| CON-1 | `consistency-analyzer:contract:ee7e74a8` | `behavioral-contract` | `review-specs` origin hashes text, but the charter mandates deriving from `blocker_id` |
| CON-2 | `consistency-analyzer:domain-model:8c5333d5` | `behavioral-contract` | The charter's mandatory BLOCK-origin invariant has no owning behavior in the spec |

SA-7 (warning) is the structural reviewer's independent restatement of the same gap CON-1 and CON-2 raise as blockers; addressing the blockers resolves it.

**Action required:** BLOCK. Run `/adev:specify --revise --spec .context-index/specs/features/heuristics/failure-signature-key.spec.md` to address the six blockers listed in `failure-signature-key.blockers.md`, then re-run `/adev:review-specs` on revision 2. Planning cannot begin until the verdict is PASS or PASS_WITH_NOTES.

Both sibling Phase-3 specs (`failure-capture.spec.md`, `signature-retrieval.spec.md`) declare a precondition that this spec ships first, so they are transitively blocked.
