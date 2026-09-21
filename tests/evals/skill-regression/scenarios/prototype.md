# Scenario: prototype

Run this scenario against a disposable copy of the fixture project, never against the committed tree. It exercises `/adev:prototype` at the wireframe tier and is scored by `rubrics/prototype.yaml`.

## Setup

Build the run copy with `scripts/eval-scenario-setup.mjs`. The helper performs three steps and prints two roots, in this order: the copy root, then the outputs root.

1. `createTempGitRepo` builds a throwaway git repository on `main`.
2. A flat copy of fixture_root contents into <copy-root> places `tests/evals/skill-regression/project`'s files directly at the new repo's root — never nested under a `project/` subdirectory — so the copy root is simultaneously the git root and the project root.
3. The helper splices `tasks.db_path` into the copy's manifest, pointing the issue board at the copy itself rather than this checkout's real board.
4. The helper also creates `outputs/ from its own mkdtempSync, beside <copy-root>, outside every worktree root and outside the copy` — every artifact this scenario writes beyond the copy's own tree goes there.

Before typing any command, confirm the printed copy root matches ^[A-Za-z0-9._/-]+$ before any typed command — an unsanitized path is one shell metacharacter away from disaster.

## Working directory

Every step below runs with `cwd: realpath(<copy-root>)`. The committed `tests/evals/skill-regression/project` tree is read-only test data, never a workspace.

## Prerequisite

The copy already ships a charter at `.context-index/specs/features/orders/charter.md` (status: approved, not closed — no closed-charter warning applies) and `.context-index/constitution.md`. `.context-index/platform-context.yaml` is also present but irrelevant here: the wireframe tier never prompts for a framework.

## Scope

This scenario always runs at scored tier: non-functional — wireframe, never mockup or functional. A functional-tier prototype pulls CDN imports and initiates real network egress that a git-status-based scenario capture cannot observe or gate; functional is out of scope for this scenario, full stop.

## Run

From that working directory, invoke `/adev:prototype --module orders --tier wireframe`.

1. **Generation.** Step 3 writes wireframe files (semantic HTML only, no visual styling, no JavaScript) into a temp directory built by the skill's own `mkdtempSync`.
2. **Server start.** Step 4 runs `adev prototype start-server --dir <tmpDir> &`, backgrounded. Read the printed `{port}` JSON from its stdout and record the OS-level PID of the backgrounded process. Before issuing any further command, confirm the recorded PID and bound port each match ^[0-9]+$ before any typed command — a malformed capture is one shell metacharacter away from disaster. The server binds to loopback (127.0.0.1) only, per `skills/prototype/SKILL.md`'s Red Flags ("Never bind to 0.0.0.0") and `lib/prototype-server.mjs`'s `tryListen` — confirm the reported bind address is the loopback address, never `0.0.0.0`.
3. **Feedback loop.** Send "looks good" immediately — iteration 1 only, no change rounds, no visual reference capture.
4. **Persistence choice.** Choose "keep". The skill copies the temp directory's files to `.adev/prototype/orders/` inside `<copy-root>`, then runs `adev prototype ensure-gitignore`, which splices the managed `adev:gitignore` block (including a `.adev/` entry) into the copy's `.gitignore`. The temp directory is then removed.
5. **Teardown.** Stop the server by issuing kill <recorded-pid> against the PID recorded in step 2 — the mechanism Step 7 of `skills/prototype/SKILL.md` names ("Kill it with the recorded PID"). After the kill, attempt a real TCP connection to `127.0.0.1:<port>` (the recorded port) and confirm no listener on <port> after teardown — the connection attempt must be refused. If a listener is still present after the kill, the scenario FAILS AND IS REPORTED, not retried, not escalated silently: report the failure exactly as observed and stop — never re-issue the kill, never loop, never mark the run passing regardless.

## Gitignored escape capture

`.adev/` is gitignored by the managed block `ensure-gitignore` just installed, so a plain `git status` reports the working tree clean even though `.adev/prototype/orders/` now holds real, persisted files outside the throwaway temp directory. This scenario's containment capture must therefore use `git status --ignored=traditional --untracked-files=all` — never plain `git status` — to see the `.adev/prototype/orders/` tree at all.

## Containment

Every file this scenario reads or writes must be isContained under <copy-root> — the persisted `.adev/prototype/orders/` tree lives inside `<copy-root>` because Step 6 resolves it against the invoking `cwd`, which is `realpath(<copy-root>)`. After the run, confirm that every artifact: sources re-resolved under <copy-root> after the run — never against the committed fixture tree.

## Environment

Confirm no infra_requirements: in the copy and no .claude/ or .mcp.json anywhere under <copy-root> — this scenario needs no network, container runtime, installer, or live plugin wiring beyond the loopback-only prototype server itself, which never leaves the host.

## Manifest fidelity

Reparse the copy's manifest and confirm tasks.backend: json survives the splice, and the manifest's comments survive it, and that the spliced path is db_path read back as <copy-root>.

## Multi-worktree check

If more than one git worktree is in play, confirm git status and rev-parse HEAD equality at every worktree root before trusting any cross-worktree comparison.

## Teardown

`teardown deletes only the two mkdtempSync-returned roots` — the copy root and the outputs root printed above — and nothing else. The prototype's own temp directory and background server process are already gone by this point, per the Run section's steps 4 and 5.
