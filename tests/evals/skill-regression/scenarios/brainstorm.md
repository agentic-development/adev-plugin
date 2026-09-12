# Scenario: brainstorm

Run this scenario against a disposable copy of the fixture project, never against the committed tree. It exercises `/adev:brainstorm --module orders` and is scored by `rubrics/brainstorm.yaml`.

## Setup

Build the run copy with `scripts/eval-scenario-setup.mjs`. The helper performs three steps and prints two roots, in this order: the copy root, then the outputs root.

1. `createTempGitRepo` builds a throwaway git repository on `main`, in its zero-argument form — no `branch` override. This is load-bearing here, not merely hygienic: Step 5's "Commit with message" note assumes a real git working tree. A copy built with `createTempDir()` performs no `git init` at all, so a step that inspects the copy's git state would silently resolve against whatever repository git finds walking up from `tmpdir()` — an environment property, not a bound — rather than against the disposable copy this scenario controls.
2. A flat copy of fixture_root contents into <copy-root> places `tests/evals/skill-regression/project`'s files directly at the new repo's root — never nested under a `project/` subdirectory — so the copy root is simultaneously the git root and the project root.
3. The helper splices `tasks.db_path` into the copy's manifest, pointing the issue board at the copy itself rather than this checkout's real board. This scenario never touches the board — `/adev:brainstorm` writes no Issue — but the splice is unconditional per `scripts/eval-scenario-setup.mjs`, so it is confirmed below alongside every other scenario in this tier.
4. The helper also creates `outputs/ from its own mkdtempSync, beside <copy-root>, outside every worktree root and outside the copy` — every artifact this scenario writes beyond the copy's own tree goes there.

Before typing any command, confirm the printed copy root matches ^[A-Za-z0-9._/-]+$ before any typed command — an unsanitized path is one shell metacharacter away from disaster.

## Working directory

Every step below runs with `cwd: realpath(<copy-root>)`. The committed `tests/evals/skill-regression/project` tree is read-only test data, never a workspace.

## Run

From that working directory, invoke `/adev:brainstorm --module orders`. Revision mode — extending the existing, `status: approved` orders charter.

At Step 1, confirm the constitution, platform context, manifest.yaml (module registry — including the registered `shipping` module, which has no charter of its own), and the existing orders charter are all loaded. At Step 2.2's Clarify phase, propose extending the orders charter with a new capability: **"calculate a shipping rate"**. Confirm the Cross-charter conflict check reports the collision with the orders charter's own Out of Scope table ("Shipping rate calculation — owned by the `shipping` module") before any design section is presented, and that the finding is surfaced for the user to resolve.

Withdraw that proposal and instead propose a second capability that stays within the orders charter's own In Scope table — **"apply a secondary, capped promotional discount on top of the existing discount"** — and confirm the Cross-charter conflict check raises no conflict for this one.

Proceed through Step 3 (propose 2-3 approaches for the promotional-discount capability, each with a stated constitution-compliance assessment), Step 3b (decline the prototype offer), Step 4 (walk each charter section), and Step 5 (write the updated charter, revision incremented, `kind: feature` preserved). Confirm Step 5b-4 appends or updates the copy's `product.md` Module Map idempotently (the copy's `product.md` already carries an `orders` row from the fixture's own prior brainstorm history). Confirm Step 6 dispatches the charter-reviewer subagent and resolves to Approved (or a user-guided resolution) within 2 iterations. Complete Step 7 (user approves) and Step 8 (render the Spec Organization Plan; do not invoke `/adev:specify` — Step 8 is chat-only).

## Containment

Every file this scenario reads or writes must be isContained under <copy-root>. After the run, confirm that every artifact: sources re-resolved under <copy-root> after the run — never against the committed fixture tree.

## Environment

Confirm no infra_requirements: in the copy and no .claude/ or .mcp.json anywhere under <copy-root> — this scenario needs no network, container runtime, installer, or live plugin wiring.

## Manifest fidelity

Reparse the copy's manifest and confirm tasks.backend: json survives the splice, and the manifest's comments survive it, and that the spliced path is db_path read back as <copy-root>.

## Multi-worktree check

If more than one git worktree is in play, confirm git status and rev-parse HEAD equality at every worktree root before trusting any cross-worktree comparison.

## Teardown

`teardown deletes only the two mkdtempSync-returned roots` — the copy root and the outputs root printed above — and nothing else.
