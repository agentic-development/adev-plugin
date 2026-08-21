---
charter: output-personas
kind: behavioral
status: validated
risk_level: medium
milestone: v2
revision: 16
charter-revision: 5
created: 2026-08-20
updated: 2026-08-21
source-manifest:
  sha: "73f2517"
  files:
    - .context-index/specs/features/output-personas/charter.md
    - providers/codex/skills/learn/SKILL.md
    - providers/codex/skills/route/SKILL.md
    - providers/codex/skills/sample/SKILL.md
    - providers/codex/skills/status/SKILL.md
    - providers/opencode/skills/learn/SKILL.md
    - providers/opencode/skills/route/SKILL.md
    - providers/opencode/skills/sample/SKILL.md
    - providers/opencode/skills/status/SKILL.md
    - skills/learn/SKILL.md
    - skills/route/SKILL.md
    - skills/sample/SKILL.md
    - skills/status/SKILL.md
    - tests/skills/terse-form-markers.test.mjs
  computed-at: "2026-08-21T04:34:15.540Z"
---

# Live Spec: Skill Output Rules Wiring

<!-- Live Spec within the output-personas charter.
     Parent Charter: .context-index/specs/features/output-personas/charter.md
     Governing decision: .context-index/adrs/0020-output-discipline-is-content-rules-not-length-budgets.md (Accepted)

     REVISION 13 IS A DELIBERATE SCOPE REDUCTION, taken on the operator's decision
     after revisions 1-12 drew eleven BLOCK verdicts. Nothing recurred across those
     rounds — every fix held — but the spec touched 19 skill files, three rule layers,
     two sibling specs' source manifests, the persona machinery and a new validate
     check, and each fix reached a new integration point with its own constraint
     document. This revision proves the pattern on four skills instead. -->

## Behavioral Contract

The verbosity axis `{terse, normal, deep}` is resolved by `lib/persona.mjs` and injected by `hooks/session-start.sh`, but no skill consults it when deciding what to render. This spec wires it into **four skills**, chosen because their user-facing output is unambiguous: every governed section is chat-only, none defines a disk-artifact format, and none of them touches `templates/personas/*` or `templates/verbosity/*`.

Per **ADR 0020**, every rule here is a content or structure constraint, never a sentence or paragraph count.

### This is an increment, and says so

**This spec delivers a migration, not a standing rule.** It adds a terse rendering to nineteen named sections in four files. It does **not** change how `/adev:implement` behaves for sections written later — a section authored after this lands will have no terse form, and that is expected, not a defect.

Making the duty durable — so every future chat section acquires a terse rendering as it is written — is a change to `/adev:implement`'s standing behavior and is deliberately **out of scope**. It is the widening spec's first question, to be answered with evidence from this increment rather than predicted in advance. Revision 12 blocked precisely because it claimed a durable rule while specifying only a migration; this revision claims only what it delivers.

### The governed sections

The set is fixed, small, and verified. Every heading below was confirmed on 2026-08-20 to exist **as a real heading, outside any fenced code block**, in the file named. One wrinkle task 1 must handle: `status` carries two sections whose heading text is identical — `` ### Mode: `--milestone <name>` `` appears at both L126 and L378 — so the test must key on line position, not heading text, or it will conflate them.

| Skill | Governed sections | Count |
|---|---|---|
| `status` | every section matching `^### Mode: ` — **10 today**; the pattern is normative, the count is a snapshot | 10 |
| `route` | `## Step 5: Report to User`, `## Dry-Run Mode` | 2 |
| `sample` | `#### Present Results`, `### Step 5: Register`, `## --score Mode`, `## --refresh Mode` | 4 |
| `learn` | `## Step 4: Present for Confirmation`, `## Step 6: Confirm`, `` ## List Mode (`--list`) `` | 3 |

**19 sections across 4 files as of 2026-08-20.** The nine named headings are a fixed list; `status`'s ten are pattern-matched, so the *pattern* is normative and 19 is a snapshot. Task 1's test derives the expected set by scanning, and asserts every match carries a marker — it does not hardcode 19, so adding an eleventh `### Mode:` section fails only if that new section lacks a marker, which is the correct outcome. All are CHAT — they prescribe text printed to the user. None prescribes a file body or a subagent report, so BEH-6's exemption is not engaged anywhere in this scope. `status` is declared read-only in its own prose and writes no artifact; this matters for BEH-3.

Enumerating here is safe at this size in a way it was not at 19 files: the list is short enough to verify exhaustively, and it was.

### Preconditions

- `lib/persona.mjs` resolves persona and verbosity; `hooks/session-start.sh` injects both. Neither is modified.
- The four skills carry a persona-adaptation footnote today. `status`'s footnote scopes the whole file rather than one section, which is why its governed set is pattern-matched.
- No file in `templates/personas/*` or `templates/verbosity/*` is edited, so no sibling spec's `source-manifest.files[]` is disturbed and no restamping is required. (ADR-0011, which would have authorised restamping, is **Rejected** — avoiding the need is the only supported path.)

### Behaviors

<!-- retired-behavior-ids: BEH-9 (rev 13 — persona-template budgets, out of scope after the increment reduction);
     BEH-10, BEH-11 (rev 13 — security-finding visibility, moved to issue-uvarlt);
     BEH-12 (rev 10 — bound at a layer the session overlay overrides);
     BEH-13 (rev 13 — terse.md exemption, moved to issue-uvarlt);
     BEH-14 (rev 16 — user-decision material; same layer defect as BEH-12, moved to issue-uvarlt).
     None are reassigned. -->

- **BEH-1** — **When** a skill renders one of the 19 sections named above and the resolved verbosity is `terse`, **then** it renders the terse form declared beneath that section's `**Terse form:**` marker rather than the section's default form. **Composed views:** `route` `## Dry-Run Mode` and `sample` `## --refresh Mode` each render another governed section's output inside their own. The *outer* section's terse form governs the composed view — an inner section's terse form applies only when that section renders on its own. Each composed section states this in its own terse form so the rule is local to where it is needed.
- **BEH-2** — **When** a skill's chat output would reproduce content from an artifact it has written to disk, **then** the anti-redundancy rule already established in all three `templates/personas/*`, all three `templates/verbosity/*`, and `persona-resolution-and-injection.spec.md:68` applies unchanged. *(Revisions 2-14 also cited `skills/using-adev/SKILL.md:141`; that line states artifacts written to disk keep their full format, which is BEH-6's source, not this rule's. The citation is dropped rather than corrected — `using-adev` carries no anti-redundancy clause.)* This spec adds nothing to that rule's artifact set; its only added obligation is the path *form* — the path named is **repo-relative**, never absolute. **This is stated as this spec's own rule, not inherited.** `lib/session-summary.mjs:23-37` was cited for it through revision 14 and says the opposite: in-repo absolute paths are *"preserved verbatim… they contain nothing the repo does not already publish"*, and only out-of-repo paths with high-risk prefixes are redacted. That policy governs committed session summaries; this rule governs chat, which is relayed to orchestrators and pasted into issues where the surrounding repo context is absent. Repo-relative is required here because the reader may not know which checkout the path belongs to — a different reason than the redactor's, so it needs its own statement rather than a borrowed precedent.
- **BEH-3** — **When** a governed section would emit tabular results at `terse`, **then** that section's terse form emits at most one table of its own and substitutes for every further table according to whether a durable target exists: an artifact holds the data → a count plus its repo-relative path; no artifact holds it (`status` is read-only and writes nothing) → a count plus **the narrower invocation of the same skill that renders detail for one item**. This is deliberately not "the invocation that shows the full table": no skill parses `--verbosity` or `--persona`, so no invocation re-renders the same view at greater depth, and naming one would be unsatisfiable. `status` has real narrowing modes to point at — `--spec <path>`, `--charter <name>`, `--issue <id>`, `--epic <id>`, `--file <path>` — each documented in the same file. Where a section has no narrower invocation either, it emits the count alone and names nothing.
- **BEH-7** — **When** a persona/verbosity footnote appears in one of the four files, **then** it names the three overlays by literal filename (`templates/verbosity/terse.md`, `normal.md`, `deep.md`) and states a decidable rule. It MUST NOT instruct interpolating a resolved value into a path.
- **BEH-8** — **When** a governed section constrains output length, **then** it does so with at most one soft default expressed **per response**, framed as a default rather than a mandate, and never as that section's sole constraint.

### Preserved invariants (not new obligations)

These already ship and are asserted elsewhere. They are recorded so this work cannot weaken them, and no acceptance criterion claims them as new.

- **BEH-4** — the completion-token contract of `.context-index/specs/cross-cutting/completion-tokens/completion-tokens.spec.md` (B6-B8) applies unchanged, including B8's rule that only the top-level terminal skill emits. No rule here may trim, reword, fence, reorder or duplicate a token. *(None of the four skills emits one, so this scope cannot violate it.)*
- **BEH-5** — Next Actions renders at every verbosity, immediately above any completion token.
- **BEH-6** — artifacts written to disk keep their full technical format. *(No governed section here defines one.)*

### Layer precedence

`skills/using-adev/SKILL.md:137` establishes the persona/verbosity directive as a **session-level overlay** that overrides SKILL.md formatting. The general rule, learned by violating it three times across revisions 9-11: **a guarantee must be authored at the layer that would otherwise defeat it.**

All five behaviors here bind at the SKILL.md layer, which is correct for them: they define what a section *offers* to show, and the overlay decides how much of it to show. No behavior in this scope attempts to override the overlay. **Two tried and both were withdrawn for the same defect:** BEH-12 (revision 10) and BEH-14 (revision 16), each authored in the SKILL.md files while promising something must still appear in chat — which is the overlay's decision, not the skill's. Both moved to `issue-uvarlt`, together with the security guarantee that needed overlay-level authorship. The principle is easy to state and was still violated twice after stating it, so it is worth naming the tell: **any rule of the form "X renders even when the overlay would trim it" belongs in the overlay.** A rule of the form "this section offers X" belongs in the skill.

### Postconditions

- All 19 named sections carry a `**Terse form:**` marker and a terse rendering.
- The only files modified are: the four `skills/{status,route,sample,learn}/SKILL.md`, their `providers/*` mirrors, the new test file added by task 1, and the parent charter's capability row updated by task 8. Nothing else.
- `providers/*/skills/**` mirrors are regenerated and `tests/sync/provider-skill-parity.test.mjs` passes.

### Error Cases

| Condition | Expected Behavior | Code |
|---|---|---|
| A governed section carries no `**Terse form:**` marker | The task-1 test fails: a named heading, or a `### Mode: ` heading in `status`, has no marker beneath it | `MISSING_TERSE_FORM` |
| A marker appears outside the 19 named sections | Same test fails on placement | `MARKER_OUT_OF_SCOPE` |
| A SKILL.md is edited without regenerating provider mirrors | `tests/sync/provider-skill-parity.test.mjs` fails | `MIRROR_DRIFT` |

All three correspond to executing assertions. This scope registers no `subagent-review` check: classification requires judgement, but this spec does not classify — its 19 sections are named, so a script can verify placement exactly.

## System Constitution Reference

- **Principle 2 — Skills are primarily markdown.** Markdown plus one test file. No `lib/` or `hooks/` change.
- **Principle 1 — Minimize external dependencies.** No third config axis; ADR 0020 forecloses one until verbosity is wired and shown insufficient. This increment is the evidence that judgement will rest on.
- **Anti-pattern: no executable logic inside SKILL.md.** All rules are prose. No fenced JavaScript, no inline-Node directive.
- **Autonomy boundary: "Editing skill markdown content" and "Adding tests."** Both inside the agent-decidable boundary.

## Actionable Task Map

| # | Task | Description | Complexity |
|---|---|---|---|
| 1 | Author the marker test first | A `node:test` file that **derives** its expected set by scanning, fence-aware — the nine named headings plus every `^### Mode: ` heading in `status` — and asserts each derived section carries a `**Terse form:**` marker beneath it, that no marker appears elsewhere, and that provider mirrors match. It MUST NOT hardcode a count: an eleventh `### Mode:` section should fail only for lacking a marker, never for existing. `status` has two sections with identical heading text (L126, L378), so the scan keys on line position. Written **before** the wiring so it starts red — a passing test is not evidence until the defect has been observed failing. | small |
| 2 | Define the canonical footnote and marker | The replacement footnote (BEH-7) and the `**Terse form:**` convention. Hard predecessor of tasks 3-6. | small |
| 3 | Wire `status` | 10 `### Mode:` sections. Read-only skill, so BEH-3's no-artifact branch applies throughout. | medium |
| 4 | Wire `route` | 2 sections. | small |
| 5 | Wire `sample` | 4 sections. | small |
| 6 | Wire `learn` | 3 sections. | small |
| 7 | Regenerate provider mirrors | `node scripts/sync-provider-skills.mjs`; confirm the parity test. | small |
| 8 | Correct the charter row and record what the increment taught | The capability row still reads "Connect the verbosity axis to the 17 `SKILL.md` mandated-output sections", naming a broader connection and a different count than this increment delivers — rewrite it to describe the four-skill increment with widening as a follow-on. Then append what the increment taught: which terse forms read well, which rules were ambiguous in practice, and whether the marker convention survived contact. This is the input to the widening spec's durability question. | small |

## Acceptance Criteria

- [ ] The task-1 test exists, was observed failing before the wiring landed, and passes after (task 1)
- [ ] All 19 named sections carry a `**Terse form:**` marker with a terse rendering (BEH-1)
- [ ] No marker appears outside the 19 named sections (BEH-1)
- [ ] No governed section reproduces disk-artifact content; each names a repo-relative path (BEH-2)
- [ ] No governed section emits an absolute filesystem path (BEH-2)
- [ ] Each section's terse form emits at most one table of its own; `status`'s further tables render as a count plus the invocation that shows them (BEH-3)
- [ ] Every footnote names the three overlays by literal filename and instructs no path interpolation (BEH-7)
- [ ] No governed section relies on a sentence or paragraph count as its sole constraint (BEH-8)
- [ ] The modified-file set is exactly: the four SKILL.md files, their provider mirrors, the task-1 test file, and the charter capability row — nothing under `lib/`, `hooks/`, `templates/`, or any other spec's artifacts
- [ ] `providers/*/skills/**` regenerated; `tests/sync/provider-skill-parity.test.mjs` passes
- [ ] The charter capability row describes the four-skill increment rather than a 17-section connection, and records what the increment taught (task 8)
- [ ] All quality gates pass (`npm test`)
- [ ] No constitutional violations introduced

## Out of Scope

- **The other 15 skills.** Widened by a follow-on spec informed by this increment.
- **Durability — making `/adev:implement` apply the rule to sections written later.** The widening spec's first question. Revision 12 blocked for claiming this while specifying only a migration.
- **`templates/personas/*` and `templates/verbosity/*`.** Untouched, which is what keeps both sibling specs' source manifests accurate — necessary because ADR-0011 (restamping authority) is **Rejected**.
- **Protection for user-decision material.** Three governed sections are decision gates whose content is the evidence the user needs to answer a question the skill is about to ask (`sample` `#### Present Results`, `learn` `## Step 4: Present for Confirmation`, `sample` `## --refresh Mode`). A terse rendering can delete that evidence while still asking the user to decide. Drafted as BEH-14 in revision 15 and withdrawn in revision 16: authored in the SKILL.md files it sat at the layer `skills/using-adev/SKILL.md:137` declares the session overlay overrides, so it could not bind — the same defect that withdrew BEH-12. Moved to **`issue-uvarlt`**, which already edits `templates/verbosity/terse.md` for the security guarantee and is the correct layer for this one too.
- **The security-finding visibility gap.** A product-persona user gets `terse` by default (`lib/persona.mjs:12`) and `terse.md:8` skips review verdicts, so blocker findings can be hidden. Split to **`issue-uvarlt`** so it ships independently; the fix must be authored in the overlay and persona template, never in SKILL.md files.
- **A registered `subagent-review` classification check.** Unneeded here: the 19 sections are named, so placement is verifiable by script.
- **The terse-first baseline inversion** and **a third config axis.** Both deferred as before.
