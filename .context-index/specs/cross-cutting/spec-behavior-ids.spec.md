---
mode: cross-cutting
affects: [lifecycle-artifacts, spec-lifecycle, review, validation, planning]
kind: behavioral
status: implemented
source-manifest:
  sha: 3539b26
  computed_at: 2026-08-16T00:39:28.791Z
  files:
    - skills/specify/SKILL.md
    - templates/domains/software/spec-template.md
    - templates/spec-template.behavioral.md
    - templates/spec-template.refactor.md
    - tests/behavior-id-convention.test.mjs
risk_level: medium
tracker-ref: adev-plugin-j7pq.2
revision: 2
created: 2026-08-15
updated: 2026-08-15
---

# Live Spec: Behavior IDs — stable referents for spec behaviors

<!-- Cross-cutting spec. Frontmatter precedes the H1 deliberately: `adev specify
     revise` cannot parse a spec whose frontmatter is not the first non-blank
     content (see epic-104 / issue-585). -->

## Problem

Spec behaviors are written as positional ordinals — `1.`, `2.`, `3.` — produced by a markdown ordered list. The ordinal is a **rendering artifact**, not an identifier: it is recomputed from list position on every write. Any insertion, deletion, or reordering silently retargets every citation that points at a behavior, and an in-place rewrite silently retargets the citation without even changing the number.

Every reviewer finding with `severity: blocker` carries a `section_anchor` (see `skills/review-specs/structural-architect-prompt.md`, `security-reviewer-prompt.md`, `consistency-analyzer-prompt.md`, `quick-synthesized-reviewer-prompt.md`), and the documented example anchor for a behavior is `behaviors-3` — a bare ordinal. `/adev:specify --revise` consumes that anchor to decide which sections to preserve byte-identically and which to patch. When the anchor's referent moves, the revise loop patches the wrong behavior and the reviewer's next round cannot tell whether its finding was addressed.

### Measured

Reconstructed by pairing every committed `.review.md` blob with the spec blob live at the same commit (all refs, rebase shadows excluded):

| | count | share |
|---|---|---|
| Specs with ≥2 distinct review blobs | 161 | |
| Round transitions citing a behavior ordinal | 218 | |
| Behavior-ordinal citations examined | 834 | |
| ordinal still denotes the same behavior text | 528 | 63.3% |
| **ordinal shifted to different text** | **117** | **14.0%** |
| **ordinal absent in one round (dangling)** | **189** | **22.7%** |

**36.7% of cross-round behavior citations do not survive the transition.**

Matching was exact-string, so this does not show that a stable ID would have matched the *text*. It shows a stable ID would have preserved the *reference*: `BEH-5` would still resolve, and the reader could ask whether the finding against it was addressed. Today the reference retargets silently and no one is told.

### Prior art in this repo

- `.context-index/specs/cross-cutting/check-id-enum.spec.md` documents the identical ordinal pathology for validate check IDs — decimal interpolation, gaps as tombstones, resurrection hazard.
- `.context-index/research/lean-review-validation.md` names the root cause independently: *"adev's specs have no stable requirement IDs, which is precisely what makes spec-kit's coverage analysis mechanical and adev's judgmental."*
- `failure-signature-key.spec.md` draws the distinction this spec applies: `id` = instance identity, `signature` = cross-scope recurrence identity. A behavior needs the former.

## The convention

A **behavior ID** has the form `BEH-<n>`, where `<n>` is a positive integer unique within the spec that carries it. IDs are spec-scoped, not global — `BEH-3` in two different specs are unrelated.

A Behaviors section is rendered as an **unordered** list, each item opening with its bolded ID:

```markdown
### Behaviors

<!-- retired-behavior-ids: (none) -->

- **BEH-1** — **When** ... **then** ...
- **BEH-2** — **When** ... **then** ...
- **BEH-3** — **When** ... **then** ...
```

The list is unordered deliberately. An ordered list re-renders `1. 2. 3.` alongside the IDs, leaving two competing referents for the same behavior and inviting a reviewer to cite the wrong one. Removing the rendered ordinal removes the ambiguity at the source.

**Allocation.** The next ID is one greater than the highest number ever used in that spec — counting live IDs *and* the IDs listed in the `retired-behavior-ids` comment. Numbers are never reused. Gaps in the sequence are expected and carry no meaning.

**Tombstones.** The comment immediately under the Behaviors heading records every ID that has been withdrawn:

```markdown
<!-- retired-behavior-ids: BEH-3, BEH-5 -->
```

It is the allocator's memory. Without it, deleting `BEH-5` and later inserting a behavior would resurrect `BEH-5` under new text — the exact retargeting this spec exists to stop.

## Behavioral Contract

### Preconditions

- A spec is being authored or revised through `/adev:specify` under any workflow flag that resolves a template and runs an authoring block: standard, `--extract`, `--refactor`, `--from-diff`, `--cross-cutting`, `--revise`. **`--amend` is excluded** — see Out of Scope.
- The template resolved for the spec's `kind:` carries a Behaviors section. Templates that have no Behaviors section by design (`artifact`, `skill`, `integration`, `action`) are out of this contract's reach.

### Behaviors

<!-- retired-behavior-ids: BEH-6 -->

<!-- BEH-6 was retired at revision 2. It asserted that reviewer findings cite the
     behavior ID in `section_anchor`. Landing that requires editing four files this
     spec does not own (see Out of Scope), so it is now a follow-up obligation, not a
     behavior of this deliverable. Per BEH-4 the number is never reassigned — this
     comment and the tombstone above are the whole mechanism, and this revision is
     the spec's own first exercise of it. -->

- **BEH-1** — **When** `/adev:specify` writes a Behaviors section **then** every behavior statement is an unordered-list item whose first token is a bolded ID of the form `BEH-<n>`, and no rendered ordinal appears against any behavior.
- **BEH-2** — **When** a behavior is inserted at any position in an existing Behaviors list **then** it takes the next unused ID (highest ever used in that spec, live or retired, plus one) and **no other behavior's ID changes**.
- **BEH-3** — **When** a behavior's wording is rewritten in place without changing which condition it governs **then** it keeps its existing ID, so a finding filed against that ID still resolves.
- **BEH-4** — **When** a behavior is deleted **then** its ID is appended to the spec's `retired-behavior-ids` comment and is never reassigned to a different behavior.
- **BEH-5** — **When** a rewrite changes *which* condition a behavior governs (different trigger, different subject) **then** the author retires the old ID and mints a new one, so a citation against the old ID resolves to a tombstone rather than to unrelated text.
- **BEH-7** — **When** a spec authored before this convention landed is read **then** its ordinal-form behaviors and any `behaviors-<n>` anchors citing them remain readable and no reader hard-fails. Existing specs are not retro-migrated.

### Postconditions

- Every behavior in a spec authored or revised after this lands **through a workflow named in Precondition 1** carries exactly one `BEH-<n>`, unique within that spec. Amendment artifacts are outside this claim.
- No live ID in a spec collides with an ID listed in that spec's `retired-behavior-ids` comment.
- A diff that inserts a behavior touches exactly one behavior line plus, when a deletion occurred, the tombstone comment. It never renumbers untouched behaviors.

### Error Cases

These are **authoring-time obligations of the `/adev:specify` agent**, not programmatically emitted error codes. No runtime validator is introduced by this spec, and no identifier below is emitted by any code path — the contract is enforced by the skill's own instructions and by the template shape the agent copies. The conditions are named in prose deliberately: a code-shaped name with no emitter invites a later reader to grep for a mechanism that does not exist.

| Condition | Expected Behavior |
|---|---|
| Two behaviors in one spec carry the same ID | Correct before the write completes: renumber the later one to the next unused ID. The agent reports the correction to the operator in plain text |
| A new behavior would take an ID listed in `retired-behavior-ids` | Correct before the write completes: allocate above the retired maximum instead. The agent reports the correction to the operator in plain text |
| A behavior line in a post-convention spec has no ID | Assign the next unused ID before the write completes |
| A reviewer cites `behaviors-3` against a spec whose behaviors carry IDs | Accept the anchor as-is and carry it through — `/adev:specify --revise` treats anchors as opaque text. The agent resolving it prefers the ID form and notes the legacy anchor in its report. Advisory only; never blocking |
| A legacy spec has no IDs at all | Read normally. Do not mint IDs as a side effect of an unrelated revision (BEH-7 governs) |

## System Constitution Reference

- **Principle 2 — "Skills are primarily markdown"** — Applies because the entire change is authoring guidance plus template shape. No companion code is required for the convention to function; the agent reading `skills/specify/SKILL.md` and copying the resolved template produces conforming output on its own.
- **Principle 1 — "Minimize external dependencies"** — Applies because the convention is deliberately plain markdown (a bolded token and an HTML comment). It introduces no parser, no schema library, and no dependency.
- **Anti-pattern — "No executable logic inside SKILL.md files" / no inline Node** — Applies because the Step 4 guidance states the convention declaratively. It contains no `node -e`, no heredoc, and names no helper that must run for a spec to be authored.
- **Pattern — "Templates are consumed verbatim by `cpSync()` — changes only affect new scaffolds"** — Applies directly and is the reason no retro-migration is needed: editing the templates changes what new scaffolds look like and leaves the ~247 existing specs untouched, which is exactly the intended blast radius.

## Module Impact Map

| Module | Impact | Changes Required |
|---|---|---|
| `lifecycle-artifacts` | High | Three spec templates carry the new Behaviors shape: `templates/spec-template.behavioral.md`, `templates/spec-template.refactor.md`, `templates/domains/software/spec-template.md` |
| `spec-lifecycle` | High | `skills/specify/SKILL.md` Step 4 states the ID form, allocation rule, and tombstone comment; the revise workflow preserves IDs rather than renumbering |
| `review` | Medium | Reviewer `section_anchor` guidance cites `BEH-<n>` for behavior findings — **deferred, see Out of Scope** |
| `validation` | Low | Read-only benefit: spec-compliance checks gain a stable handle per behavior. No change required now |
| `planning` | Low | Read-only benefit: plan tasks can cite a behavior ID that survives spec revision. No change required now |

### Template survey — a correction to the filed issue

The issue states *"the 7 spec templates under `templates/` carry the field."* That is not accurate. Only **three** of the seven spec templates have a Behaviors section at all:

| Template | Behaviors section | Disposition |
|---|---|---|
| `templates/spec-template.behavioral.md` | `### Behaviors` | **in scope** |
| `templates/spec-template.refactor.md` | `### Behaviors` | **in scope** |
| `templates/domains/software/spec-template.md` | `## Behaviors` | **in scope** |
| `templates/spec-template.artifact.md` | none — *explicitly omits* Preconditions/Behaviors/Postconditions by design | no change |
| `templates/spec-template.skill.md` | none — has Invocation Modes / Output Contract / Failure Modes | no change |
| `templates/spec-template.integration.md` | none — has Interaction Contract / State Machine | no change |
| `templates/spec-template.action.md` | none — postcondition-first; has Postconditions / Procedure | no change |

Adding a Behaviors section to the four templates that deliberately lack one would be a taxonomy change, not an ID change, and is not attempted here.

## Integration Points

1. **`/adev:specify` → spec file.** `skills/specify/SKILL.md` has **five mode-scoped `Step 4` sections**, and they do not all delegate to the standard-mode block. Three author Behaviors independently:

   | Site | Mode | Delegates to standard Step 4? |
   |---|---|---|
   | `### Step 4: Interactive Spec Authoring` | standard | — (it *is* the canonical block) |
   | `### Step 4: Generate Snapshot Spec` | `--extract` | **No** — "Behaviors are derived from code paths" |
   | `### Step 4: Generate Retroactive Spec` | `--from-diff` | **No** — "Behaviors map to changes in the diff" |
   | `### Step 4: Interactive Spec Authoring` (cross-cutting) | `--cross-cutting` | Yes — "Same process as standard mode" |
   | `### Step 7: Write Behavioral Contract and Spec` | `--refactor` | **No** — Step 7 references standard-mode Step 3.5 and Step 5 only, never Step 4. Its coverage comes from the *refactor template's* placeholder shape, not from delegation |

   The canonical convention is stated once in the standard-mode block. The two non-delegating sites that author Behaviors in skill prose (`--extract`, `--from-diff`) each get a one-line cross-reference back to it, so no in-contract workflow can author ID-less behaviors. Refactor mode is covered by a different mechanism — `templates/spec-template.refactor.md` carries the reshaped placeholder (Task 4) and Step 7 copies the template verbatim. Recording the distinction matters because a future edit to the refactor template would silently drop refactor coverage, and nothing in the skill prose would reveal it.
2. **`/adev:specify --revise` → spec file.** The revise workflow preserves untouched sections byte-identically. Behavior IDs are inside those sections, so preservation is automatic — the obligation is only that a *patched* behavior keeps its ID (BEH-3) or retires it (BEH-5).
3. **`/adev:review-specs` → `.blockers.md` → `/adev:specify --revise`.** `section_anchor` is opaque free text to `lib/specify-revise.mjs::parseBlockersSidecar` — it is parsed and carried, never resolved against the spec body. Switching the anchor vocabulary from `behaviors-3` to `BEH-3` therefore needs **no library change**; it is a prose-convention change in the reviewer prompts.
4. **Templates → `resolveTemplate('spec', kind, domain)`.** The template is copied verbatim into new specs, so template shape is the mechanism by which the convention propagates to authored artifacts.

## Out of Scope

- **Retro-migrating the ~247 existing specs.** New and revised specs only. BEH-7 is the compatibility guarantee that makes this safe.
- **Reviewer-prompt anchor guidance (deferred — follow-up obligation, not a behavior of this spec).** The intended end state is that a reviewer finding implicating a behavior carries the behavior ID verbatim in `section_anchor` (`BEH-7`) rather than an ordinal anchor (`behaviors-7`). Landing it touches four reviewer prompts under `skills/review-specs/`, in two different ways: `structural-architect-prompt.md` and `security-reviewer-prompt.md` carry `behaviors-3` as the example anchor and need it **edited**; `consistency-analyzer-prompt.md` and `quick-synthesized-reviewer-prompt.md` define `section_anchor` with no example at all and need one **added**. None of the four is named in the filed issue's "Files in scope" list.

  This was originally written as BEH-6 with a matching postcondition. Review found that self-contradictory: a normative behavior asserting a deliverable the same spec declines to ship would read as a spec-compliance failure at `/adev:validate`. BEH-6 is therefore **retired** (see the tombstone under Behaviors) and the obligation is recorded here as prose.

  **Consequence, stated plainly:** until the follow-up ships, the authoring half of this change is live and the citing half is not. The measured 36.7% dangling+shifted rate will not improve from this spec alone — IDs will exist in new specs but reviewers will still cite ordinals. What this spec buys is the precondition that makes the follow-up two edits plus two additions.

- **`--amend` artifacts.** `adev specify amend` renders its amendment body **in code** — the hardcoded `## Behavioral Delta` section in `lib/specify-amend.mjs`. It resolves no template and runs no `Step 4` block, so neither the SKILL.md edits nor the template edits reach it. Bringing amendments under the convention means changing that hardcoded renderer, which is a code change in a file this spec does not own. `--amend` is therefore excluded from Precondition 1, and Postcondition 1 does not range over amendment artifacts.
- **A runtime validator for ID uniqueness or resurrection.** The Error Cases table describes authoring-time obligations. Mechanical enforcement (a `adev/behavior-id-*` diagnostic) is a reasonable follow-up but is not required for the convention to function, per constitution principle 2.
- **Global behavior IDs across specs.** IDs are spec-scoped. Cross-spec recurrence identity is `failure-signature-key.spec.md`'s `signature` concept, not this spec's `id`.

## Actionable Task Map

| Task | Description | Complexity |
|---|---|---|
| 1 | State the behavior-ID convention in the **standard-mode** `Step 4: Interactive Spec Authoring` block of `skills/specify/SKILL.md` (form, unordered rendering, allocation, tombstone) | Low |
| 2 | Add revision-time obligations (keep on rewrite, retire on redefinition, never resurrect) to the same standard-mode block | Low |
| 3 | Add a one-line cross-reference to the convention in the two non-delegating authoring sites: `Step 4: Generate Snapshot Spec` (`--extract`) and `Step 4: Generate Retroactive Spec` (`--from-diff`) | Low |
| 4 | Convert the Behaviors placeholder in `spec-template.behavioral.md` and `spec-template.refactor.md`; **add** one to `domains/software/spec-template.md`, which today has a bare `## Behaviors` heading with an HTML comment and no list placeholder at all | Low |
| 5 | Add a test asserting every Behaviors-bearing template renders IDs and no bare behavior ordinals | Low |

## Acceptance Criteria

- [ ] The standard-mode `Step 4: Interactive Spec Authoring` block of `skills/specify/SKILL.md` states the `BEH-<n>` form, the unordered-list rendering, the allocate-above-the-maximum rule, and the `retired-behavior-ids` tombstone comment
- [ ] The same guidance states the revision obligations: keep the ID on an in-place rewrite (BEH-3), retire and mint on redefinition (BEH-5), never reuse a retired number (BEH-4)
- [ ] The guidance states that legacy specs are not retro-migrated (BEH-7)
- [ ] `Step 4: Generate Snapshot Spec` (`--extract`) and `Step 4: Generate Retroactive Spec` (`--from-diff`) each cross-reference the convention, so neither authors ID-less behaviors (closes the BEH-1 enforcement gap for the two non-delegating workflows)
- [ ] `templates/spec-template.behavioral.md`, `templates/spec-template.refactor.md`, and `templates/domains/software/spec-template.md` each render their Behaviors placeholder as `- **BEH-<n>** — **When** ... **then** ...` and carry a `retired-behavior-ids` comment — noting that the software template needs a placeholder **added**, not converted
- [ ] No Behaviors-bearing spec template renders a behavior as a bare `N.` ordered-list item
- [ ] A test under `tests/` asserts both of the two criteria above across every Behaviors-bearing template, so a future template edit cannot silently reintroduce ordinals
- [ ] Inserting a behavior into a conforming spec's Behaviors list changes exactly one line and leaves every other ID unchanged (BEH-2, witnessed by this spec's own Behaviors section)
- [ ] `skills/specify/SKILL.md` still contains no inline Node and no executable directive in the edited section
- [ ] All quality gates pass (`npm test`)
- [ ] No constitutional violations introduced
