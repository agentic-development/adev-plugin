# Scenario: specify

Run this scenario against a disposable copy of the fixture project, never against the committed tree. It exercises `/adev:specify` against the `orders` charter and is scored by `rubrics/specify.yaml`.

## Setup

Build the run copy with `scripts/eval-scenario-setup.mjs`. The helper performs three steps and prints two roots, in this order: the copy root, then the outputs root.

1. `createTempGitRepo` builds a throwaway git repository on `main`, in its zero-argument form — no `branch` override. This is load-bearing here, not merely hygienic: Step 5's atomic `.partial`-then-rename write and Step 5's "Commit" note both assume a real git working tree. A copy built with `createTempDir()` performs no `git init` at all, so a step that inspects the copy's git state would silently resolve against whatever repository git finds walking up from `tmpdir()` — an environment property, not a bound — rather than against the disposable copy this scenario controls.
2. A flat copy of fixture_root contents into <copy-root> places `tests/evals/skill-regression/project`'s files directly at the new repo's root — never nested under a `project/` subdirectory — so the copy root is simultaneously the git root and the project root.
3. The helper splices `tasks.db_path` into the copy's manifest, pointing the issue board at the copy itself rather than this checkout's real board. `/adev:specify` Step 5.6 writes a Feature work item to this board when `tasks.backend` is configured.
4. The helper also creates `outputs/ from its own mkdtempSync, beside <copy-root>, outside every worktree root and outside the copy` — every artifact this scenario writes beyond the copy's own tree goes there.

Before typing any command, confirm the printed copy root matches ^[A-Za-z0-9._/-]+$ before any typed command — an unsanitized path is one shell metacharacter away from disaster.

## Working directory

Every step below runs with `cwd: realpath(<copy-root>)`. The committed `tests/evals/skill-regression/project` tree is read-only test data, never a workspace.

## Run

From that working directory, invoke `/adev:specify --charter orders --kind behavioral`. Standard Mode, no workflow flag.

At Step 3, the printed menu lists the orders charter's one Capability Map row ("Validate and price an order payload") alongside the module's existing specs — `create-order.spec.md` (status: validated) **and** `shipping-rates.spec.md` (status: review-pending; a planted near-duplicate, titled identically to the capability this scenario is about to describe) — neither carries any out-of-scope marker. When asked which capability this spec should cover, answer with free text describing **"calculate a shipping rate"** — a description matching no row in the printed Capability Map. Confirm Step 3's ⚠ warning fires verbatim, naming the capability as not listed in the `orders` charter, and choose **option 2 ("Proceed anyway")**.

Continue through Step 3.5 (kind already supplied) into Step 4 (author a minimal but complete Behavioral Contract, Preconditions/Postconditions, Error Cases, Constitution Reference, Actionable Task Map, and Acceptance Criteria for a shipping-rate capability). Before or during Step 4, Duplicate Detection (All Modes) reads every `.md` file in `orders/`, including `shipping-rates.spec.md` — whose title is a verbatim match. Confirm the ⚠ possible-duplicate prompt fires naming `shipping-rates.spec.md`, and choose **option 2 ("Create a new spec anyway (different scope)")**: this scenario is testing the charter-extension path with a fresh slug, not the extend-existing-spec path.

Continue through Step 4.5 (answer "no" — no external systems) and Step 5 (write the spec). Confirm the written spec lands at `.context-index/specs/features/orders/<slug>.spec.md` inside the copy, carries `charter-extension: true` in its frontmatter, and opens with a comment noting the charter divergence.

Confirm Step 5.5 flips the saved spec's `status:` from `draft` to `review-pending`, and Step 5.6 either creates/updates a Feature work item bound to the new spec's absolute path (if `tasks.backend` is configured in the copy's manifest) or prints the exact "Issue board not configured; skipping Feature work item creation." line otherwise.

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
