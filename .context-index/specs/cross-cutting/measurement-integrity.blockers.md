---
spec: .context-index/specs/cross-cutting/measurement-integrity.spec.md
spec-revision: 1
date: 2026-08-12
blocker-count: 4
---

# Blockers: measurement-integrity (revision 1)

## structural-architect:adr-conflict:7c3f19ab

blocker_id: structural-architect:adr-conflict:7c3f19ab

reviewer: structural-architect
severity: blocker
section_anchor: behaviors-2

Rotated report filenames `<spec-stem>.review.<rev>.md` / `<spec-stem>.validate.<rev>.md` conflict with ADR-0012 (Accepted), §"Permitted peers": the sidecar peer set is closed by ADR, and skills MUST NOT write arbitrary `<stem>.<x>.md` files outside the enumeration. The four-segment rotated shape also breaks the `<artifact-stem>.<purpose>.<ext>` naming convention and invalidates the peer table's declared "rewritten on each review run" lifecycle for `.review.md` / `.validate.md`. The spec contains no ADR citation, no amendment task, and no ADR row in the Module Impact Map.

**Resolution:** Cite ADR-0012 and add an explicit ADR-amendment obligation — enumerating the rotated peers, their naming shape, and the revised lifecycle of the two canonical peers — as a precondition of the rotation work.

## security-reviewer:command-injection:7c3a91d4

blocker_id: security-reviewer:command-injection:7c3a91d4

reviewer: security-reviewer
severity: blocker
section_anchor: behaviors-6

Behavior 6 promotes the `Spec:` commit trailer to load-bearing machine input without specifying an escaping contract, while the existing hook interpolates that value raw into an inline Node script. Verified at HEAD: `.githooks/post-commit` line 17 captures `SPECS_TOUCHED` from `%(trailers:key=Spec,valueonly)`; line 60 embeds it as `specsTouched: '${SPECS_TOUCHED}'.split(',')` inside the `node --input-type=module -e` block opened at line 51. `COMMIT_SUBJECT` and `COMMIT_BODY` are JSON-escaped via a round-trip; `SPECS_TOUCHED` is not. A crafted trailer executes attacker-controlled code when a developer merges or pulls a fetched branch. The value is additionally emitted into YAML frontmatter as an unquoted flow sequence, so `]`, `,`, or a newline corrupts frontmatter parsed by hygiene and status.

**Resolution:** State in Behavior 6 that trailer-derived and path-derived values cross a trust boundary and must never be shell- or source-interpolated — pass raw git output via stdin or `process.env`, never `"${VAR}"` inside `node -e`. Require `specs-touched` entries to be emitted as double-quoted YAML scalars with `"`, `\`, and control characters escaped. Add an acceptance criterion covering a fixture commit whose trailer contains `'`, `"`, `]`, and a newline.

## consistency-analyzer:diagnostic-rename:59671228

blocker_id: consistency-analyzer:diagnostic-rename:59671228

reviewer: consistency-analyzer
severity: blocker
section_anchor: behaviors-4

The premise of Behavior 4 is factually incorrect. `lib/diagnostics/tier1/frontmatter-present.mjs` already returns `{ fired: false }` for well-formed frontmatter; it fires only when frontmatter is absent or unparseable, at severity `error`. The 52% event-volume figure inherited from `harness-simplification-study.md` therefore counts genuine violations, not zero-information noise — `tasks.json` issue #3448 records 130 of 201 `.spec.md` files violating the first-non-blank-line `---` rule and designates a reconciliation spec as the fix, explicitly scoping out changes to the diagnostic itself. The proposed rename is also an unpaired registry-key break across `.context-index/governance/diagnostics.yaml:39-40`, `lib/lifecycle-state.mjs:409`, `lib/diagnostics/tier1/status-enum-legal.mjs:30,55,58`, and `diagnostic-registry.spec.md` Behavior 9 plus its acceptance criteria.

**Resolution:** Drop Behavior 4 and its acceptance criterion, or re-scope it to the actual defect (frontmatter placement in 130 spec files) and delegate the diagnostic to the reconciliation spec. If the rename is retained, add a Task Map row and acceptance criterion for the paired amendment to `diagnostic-registry.spec.md` plus a `diagnostics.yaml` ID-migration path.

## consistency-analyzer:check-id-enum:c1329112

blocker_id: consistency-analyzer:check-id-enum:c1329112

reviewer: consistency-analyzer
severity: blocker
section_anchor: behaviors-3

The canonical form of a check ID is unresolved. `.context-index/governance/validate.yaml` uses namespace-qualified IDs (`validate.check-2-spec-compliance`), while `lib/cli/report.mjs:459` documents the `--validator` flag with the unqualified example `check-2-spec-compliance`. Enum enforcement as specified would reject every invocation shown in the CLI's own help text. The spec also does not say whether historically-emitted, since-removed IDs (`check-3`, `check-7`, `check-10`, `check-12-*`) remain admissible, and introduces `UNKNOWN_CHECK_ID` alongside three existing codes in the same domain (`INVALID_CHECK_ID`, `RESURRECTED_CHECK_ID`, `REMOVED_CHECK_ID` — `lib/governance/validate-config.mjs:58-165`).

**Resolution:** Pin the canonical ID form (qualified recommended, with the loader normalizing legacy unqualified IDs), state the admission policy for removed IDs so event replay and backfill do not hard-fail, and justify `UNKNOWN_CHECK_ID` as distinct from the three registry-loading codes.
