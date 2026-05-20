---
spec: .context-index/specs/features/session-awareness/hook-driven-capture.spec.md
last-reviewed-revision: 1
file-sha: 9713d653ef4f69617b2ddd9c5c463e6c0d7d52e833023afa914b9a71a3f9aeb6
verdict: BLOCK
date: 2026-05-20
---

# Architecture Review: hook-driven-capture

> **Spec:** `.context-index/specs/features/session-awareness/hook-driven-capture.spec.md`
> **Charter:** `.context-index/specs/features/session-awareness/charter.md` (rev 6, approved)
> **Verdict:** **BLOCK**

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reasoning (claude-opus-4-7) | plugin:review-specs/prompts/structural.md |
| security-reviewer | Security Reviewer | subagent | capable (claude-sonnet-4-6) | plugin:review-specs/prompts/security.md |
| consistency-analyzer | Consistency Analyzer | subagent | fast (claude-haiku-4-5) | plugin:review-specs/prompts/consistency.md |

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES
**Summary:** Spec is well-structured and largely decomposable. Main gaps: PreCompact-after-SessionEnd ordering, legacy-block removal sentinel strategy, init-wizard CLI-driver-surface tightening, and consumer/supersession bookkeeping.

- **SA-1** (warning, Module Impact Map / Dependencies) — Spec relies on Claude Code's SessionEnd and PreCompact payload contracts (session_id, transcript_path, cwd, reason) but does not cite a source-of-truth reference, vendored schema, or fallback for harness version skew. Silent failure on upstream changes.
  - *Suggestion:* Add an "External Contracts" subsection citing Claude Code docs (or pin a payload schema fixture under `tests/fixtures/`) and require `fromTranscript()` to emit a stderr diagnostic when expected payload fields are absent.

- **SA-2** (warning, Invariants / Behaviors 7-8) — Last-write-wins on `<date>-<sid_short>.md` is correct for the SessionEnd-overwrites-PreCompact path, but does not address (a) sid_short collisions across concurrent sessions on the same date, or (b) PreCompact firing **after** SessionEnd (delayed delivery) clobbering the canonical final summary with a stale snapshot.
  - *Suggestion:* Lengthen sid_short to 12 chars and add an invariant: PreCompact MUST NOT overwrite a file whose header indicates SessionEnd already wrote (e.g., a `kind: session-end` frontmatter key + skip-if-present check).

- **SA-3** (warning, Module Impact Map / Behaviors 4-6) — Installer is described as removing "the legacy session-capture block" from `.githooks/post-commit`, but the existing hook is a monolithic script with no block delimiters. Idempotent removal is brittle.
  - *Suggestion:* Wrap the legacy capture block in sentinel comments (one-time migration), then specify removal as "delete content strictly between sentinels." If sentinels are absent, surface a manual-migration instruction.

- **SA-4** (warning, Behaviors 1-3 / AC) — `detectExistingCapture()` is invoked by the init wizard, but the spec does not specify the precedence rule when the existing manifest has `integrations.session_capture` AND detection signals contradict it.
  - *Suggestion:* Add a behavior covering manifest-vs-detection conflict: prefer the stored config silently (with stderr diagnostic), or surface a one-line warning during init prompt. Spec which one explicitly.

- **SA-5** (warning, Module Impact Map / Init wizard prompt step) — The init wizard prompt step has runtime semantics (detection + I/O). Per CLAUDE.md, this MUST route through an `adev <verb>`, not inline-Node in `skills/init/SKILL.md`. Current wording "invoking the adev CLI (or a documented prompt mechanism)" is ambiguous.
  - *Suggestion:* Name a concrete CLI verb (e.g., `adev init prompt session-capture`) that wraps `detectExistingCapture` + prompt I/O. Bind it explicitly in the spec.

- **SA-6** (warning, Module Impact Map) — Missing impact rows: `/adev:retro`, `/adev:status`, `/adev:work`, `/adev:hygiene` (regression-test only); `tests/hooks/post-commit-self-skip.test.mjs` (existing test); `post-commit-self-skip.spec.md` (frontmatter supersession update).
  - *Suggestion:* Add rows for the four consumer skills (Low impact), the existing test file (gate on `capture: post-commit` or move to legacy), and the superseded spec's status update.

- **SA-7** (suggestion, Postconditions / Error Cases) — Postcondition for `capture: off` says "additions removed only if previously written by adev," but the installer behaviors (10/11) only describe adding. No symmetric REMOVE behavior specified.
  - *Suggestion:* Add an explicit behavior: "When the installer runs with `capture: off` AND the annotated adev-session-capture gitignore block is present THEN remove that block; leave all other gitignore content untouched."

- **SA-8** (suggestion, Relationship to superseded spec) — The header notes this "supersedes the design direction of `post-commit-self-skip.spec.md`" but the superseded spec still has `status: validated` and no frontmatter pointer back to this spec.
  - *Suggestion:* Add an explicit task to update `post-commit-self-skip.spec.md` frontmatter (`status: superseded`, `superseded-by: hook-driven-capture.spec.md`).

## Security Reviewer (security-reviewer)

**Verdict:** **FAIL**
**Summary:** Three blockers — no transcript redaction policy, no `session_id` sanitization, no `transcript_path` containment — all enable secret/data exposure. Fix before plan.

- **SEC-1** (**BLOCKER**, Behaviors 7-8 / Invariants) — Spec does not require redaction of secrets from captured transcripts. Raw transcript JSONL is persisted verbatim. In `gitignored: true` (default) the file is local-only, but the `gitignored: false` opt-out path persists API keys, tokens, file paths, and prompt content into committed history.
  - *Suggestion:* Add an invariant: `fromTranscript()` MUST apply a documented redaction pass (regex on common secret formats: AWS keys, GitHub tokens, OpenAI/Anthropic keys, `sk-*`, JWTs, `Authorization:` headers, `KEY=value` from `.env`). Redaction protects against accidental `git add` even on `gitignored: true`. State explicitly what is redacted vs preserved.

- **SEC-2** (**BLOCKER**, Behavior 7 / Error Cases) — `session_id` from the hook payload is interpolated into the output filename with no validation. A harness or test fixture supplying `session_id` containing `../` or `/` may yield path-injection characters that escape `.context-index/sessions/`.
  - *Suggestion:* Add invariant: `session_id` must match `^[A-Za-z0-9_-]+$` (Claude session IDs are UUID-like). Reject (exit 0, stderr) any session_id outside this charset. Apply the same rule to `cwd` validation — reject if not absolute or contains traversal sequences.

- **SEC-3** (**BLOCKER**, Behavior 7 / Module Impact Map — fromTranscript) — `fromTranscript(transcriptPath)` opens an arbitrary path from a hook payload. A compromised or misconfigured harness could supply `transcript_path: /etc/passwd` or `~/.ssh/id_rsa`, and the hook would read it and (possibly partially redacted) write its contents under `.context-index/sessions/`.
  - *Suggestion:* Require containment check: `transcript_path` must be under the documented Claude Code transcripts root (`~/.claude/projects/<encoded-cwd>/`) and must end in `.jsonl`. Reject (placeholder write + stderr diagnostic) otherwise. Document in Error Cases.

- **SEC-4** (warning, Invariants — Atomic writes / Behavior 8) — Temp-rename `<path>.tmp-<pid>` is not race-safe across worktrees or concurrent fires. PIDs collide; two writers can rename onto the same target.
  - *Suggestion:* Use `<path>.tmp-<pid>-<8-hex-random>` (still atomic rename). Document last-write-wins as intentional. Add explicit worktree note.

- **SEC-5** (warning, Behavior 10 / AC — gitignore append) — Single-marker append cannot reliably delete only adev-managed lines on `capture: off`. A user editing between the marker and the next blank line could lose edits, or an attacker could insert content above the entry.
  - *Suggestion:* Use paired begin/end markers (`# >>> adev session_capture >>>` / `# <<< adev session_capture <<<`) and specify removal operates only between matched markers. Forbid removing user-authored entries (already implied; make it an explicit invariant).

- **SEC-6** (warning, Invariants — Capture is observational / Behavior 9) — Spec says hooks read manifest on every fire and `capture: off` skips writes, but does not pin the gate-check to the bash wrapper. If the Node helper does the check, it still spawns (process cost) and may briefly touch the FS (e.g., `mkdir -p`).
  - *Suggestion:* Pin the gate-check in the bash wrapper (grep/awk on manifest, no Node). Only spawn the Node helper on the active-capture path. State this in invariants.

- **SEC-7** (warning, Behavior 13 / Error Cases — stderr diagnostics) — Mandates "single diagnostic line to stderr" but does not constrain content. A naive `console.error(err.message)` may include transcript path, session_id, or snippet content.
  - *Suggestion:* Specify the stderr format: stable tag (`[adev:session-capture]`), reason code (`parse-error`, `path-error`, `permission-error`, `payload-error`), and NO interpolated user content or absolute paths beyond the project-relative output path.

- **SEC-8** (suggestion, Charter Invariants — PreCompact recovery semantics) — A PreCompact snapshot persists if the session is killed between PreCompact and a `capture: off` flip. Mode transitions don't scrub prior state.
  - *Suggestion:* Add a non-blocking note: switching to `capture: off` does not delete pre-existing session files (user-data preservation). Installer prints a one-line hint when `capture` flips to `off`.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES
**Summary:** Spec aligns well with charter rev 6 on manifest keys and constitution principles. Notable gaps: missing `supersedes:` frontmatter, `session_id_short` narrows the charter filename contract, `/adev:retro` missing from behavior 12, `provider` key tested in AC without behavior coverage.

- **CON-1** (suggestion, Frontmatter) — Frontmatter lacks a `supersedes:` key even though the spec explicitly supersedes `post-commit-self-skip.spec.md`. Sibling pattern in `unified-gates/unified-gate-system.spec.md` uses a top-level `supersedes:` list.
  - *Suggestion:* Add `supersedes:\n  - .context-index/specs/features/session-awareness/post-commit-self-skip.spec.md` to frontmatter.

- **CON-2** (suggestion, Frontmatter — cross-spec consistency) — Sibling charter-extension specs carry `charter-extension: true`. This spec was authored after rev 6 incorporated the capabilities, so omission is correct — but worth confirming.
  - *Suggestion:* Either keep omission (`charter-revision: 6` signals alignment) or add a brief HTML-comment rationale.

- **CON-3** (warning, Behaviors / Invariants — session_id_short) — Charter rev 6 line 120 specifies `<date>-<session_id>.md` (full session_id) but the spec narrows to `<YYYY-MM-DD>-<session_id_short>.md` (first 8 chars). The truncation is a charter-level filename contract change introduced silently.
  - *Suggestion:* Propagate `session_id_short` back to the charter Interface Contracts row, OR call this out in the spec as a refinement requiring charter rev 7.

- **CON-4** (suggestion, Acceptance Criteria — consumer regression) — AC item lists four consumers (`work`, `status`, `hygiene`, `retro baseline`). Charter Quality Attribute matches. Behavior 12 lists only three — `/adev:retro` omitted.
  - *Suggestion:* Add `/adev:retro` to Behavior 12's consumer enumeration.

- **CON-5** (suggestion, System Constitution Reference — ADR 0014 alignment) — Spec's stderr policy is consistent with ADR 0014's verbatim-passthrough decision, but doesn't cite it.
  - *Suggestion:* Optional: add a one-line note in Constitution Reference pointing out the stderr policy aligns with ADR 0014.

- **CON-6** (suggestion, Manifest schema key — AC line 145) — First AC lists three keys: `provider`, `capture`, `gitignored`. The spec body only contracts `capture` and `gitignored`. `provider` is never specified.
  - *Suggestion:* Either add a Behavior covering `provider` interaction with `capture`, or drop `provider` from the first AC item.

- **CON-7** (suggestion, Frontmatter — kind cross-check) — `kind: behavioral` correctly aligns with the most recent sibling. Older module specs omit `kind:` (legacy). No fix needed; flagging as confirmation.

---

## Summary

**Total findings:** 22 (3 blockers, 8 warnings, 11 suggestions)
**Action required:** Revise the spec to address all three security blockers (SEC-1, SEC-2, SEC-3), then re-run `/adev:review-specs --spec hook-driven-capture.spec.md`. Warnings should be addressed before planning; suggestions are nice-to-haves.

### Notes for the reviser

- **SEC blockers** are the gating items. They are all real exploit / data-exposure paths and must be addressed via additional invariants + behaviors in the spec body (containment for `transcript_path`, charset validation for `session_id`, redaction policy for `fromTranscript()`).
- **CON-3** (session_id_short vs. session_id filename) — pick a direction: either tighten the spec to use the full session_id (cleaner alignment with charter rev 6), or bump the charter to rev 7 documenting the 8-char convention. Resolves with SEC-2 (charset validation applies to whatever string length is used).
- **SA-6** (Module Impact Map gaps) + **SA-8** (supersession bookkeeping) — these touch the post-commit-self-skip spec, which `/adev:plan` will need to know about. Address before planning.
- **SA-3** (legacy block sentinels) — pair with SEC-5 (gitignore paired markers) since both are install-time idempotency concerns with the same shape.

The remaining warnings and suggestions can be folded into a single revision pass. After spec revision, status will flip from `review-blocked` back to `review-pending`, and `/adev:review-specs` re-runs the gate.
