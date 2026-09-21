# Scenario: using-adev

Run this scenario against a disposable copy of the fixture project, never against the committed tree. It exercises `/adev:using-adev` (the "How does X work?" Q&A mode) and is scored by `rubrics/using-adev.yaml`.

## Setup

Build the run copy with `scripts/eval-scenario-setup.mjs`. The helper performs three steps and prints two roots, in this order: the copy root, then the outputs root.

1. `createTempGitRepo` builds a throwaway git repository on `main`.
2. A flat copy of fixture_root contents into <copy-root> places `tests/evals/skill-regression/project`'s files directly at the new repo's root — never nested under a `project/` subdirectory — so the copy root is simultaneously the git root and the project root.
3. The helper splices `tasks.db_path` into the copy's manifest, pointing the issue board at the copy itself rather than this checkout's real board.
4. The helper also creates `outputs/ from its own mkdtempSync, beside <copy-root>, outside every worktree root and outside the copy` — every artifact this scenario writes beyond the copy's own tree would go there. Unused by this scenario specifically (see Writer mechanism below), but created for parity with every other scenario's setup, and its absence of use is itself part of what gets confirmed.

Before typing any command, confirm the printed copy root matches ^[A-Za-z0-9._/-]+$ before any typed command — an unsanitized path is one shell metacharacter away from disaster.

## Working directory

Every step below runs with `cwd: realpath(<copy-root>)`. The committed `tests/evals/skill-regression/project` tree is read-only test data, never a workspace.

## Responder mechanism

`/adev:using-adev` is a chat-only responder in its Q&A modes: unlike every writer this tier's other scenarios exercise, it produces no `.context-index/` artifact and advances no lifecycle event. Confirm cwd as the realpathed copy root before asking anything, so any relative path the question or the answer touches resolves against the same root every other scenario uses — even though this scenario's own contract is that nothing gets written under it.

## Run

From that working directory, invoke `/adev:using-adev` mid-session (not session-start injection) with the question: "How does `/adev:plan` work?" A specific skill name is named in the question, so per skills/using-adev/SKILL.md's Ambiguous question rule this resolves to "How does X work?" mode, not "What should I do?" mode. Confirm the skill checks `docs/skill-reference.md` first, falling back to `skills/plan/SKILL.md` only if the docs are insufficient, per the "How does X work?" Q&A Mode section.

## Containment

Every file this scenario reads must be isContained under <copy-root> — `docs/skill-reference.md` and `skills/plan/SKILL.md` are read-only lookups against the copy's own committed tree, never written to. After the run, confirm that every artifact: sources re-resolved under <copy-root> after the run — in this scenario's case that set is empty by construction: `rubrics/using-adev.yaml` names no `artifact:` source, because this responder never writes one.

## Environment

Confirm no infra_requirements: in the copy and no .claude/ or .mcp.json anywhere under <copy-root> — this scenario needs no network, container runtime, installer, or live plugin wiring.

## Manifest fidelity

Reparse the copy's manifest and confirm tasks.backend: json survives the splice, and the manifest's comments survive it, and that the spliced path is db_path read back as <copy-root> — even though this scenario's own run never touches the manifest, the copy must still carry a valid one for the setup helper's postcondition to hold.

## Multi-worktree check

If more than one git worktree is in play, confirm git status and rev-parse HEAD equality at every worktree root before trusting any cross-worktree comparison.

## Response validation

Score the presented chat answer text alone (the `output:` span `rubrics/using-adev.yaml`'s required_elements and quality_dimensions both read). Confirm the response is genuinely chat-only: no file was created or modified under <copy-root>, and no lifecycle event was logged, matching the "chat-only response: no file writes, no lifecycle events" rule skills/using-adev/SKILL.md's Q&A Mode sections state.

## Teardown

`teardown deletes only the two mkdtempSync-returned roots` — the copy root and the outputs root printed above — and nothing else.
