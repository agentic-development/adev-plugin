---
topic: Avoiding Conflicts on the File-Based Issue Board
date: 2026-08-13
relates-to: [lib/issues/json-adapter.mjs, lib/issues/beads-adapter.mjs, lib/issues/resolve-root.mjs, lib/cli/issues-claim.mjs, .context-index/tasks/tasks.json]
sources: [internal, web]
status: complete
---

<!-- Revision 3 (2026-08-13). Rev 2 added the market survey (beads/JSONL, orphan
     branches, git notes, git-bug/grite CRDT), the beads version-currency
     findings and two adapter defects, and the PGlite evaluation. Rev 3 adds
     "Option 4: a remote server" (self-hosted node:sqlite/Postgres, hosted
     trackers such as Jira, and the hybrid server+JSONL shape), and restructures
     "Revised recommendation" around which problem is actually being solved.
     "Revised recommendation" supersedes the rev-1 "Recommendation", which was
     removed. Governance note recorded in Option 4: a server or tracker backend
     contradicts task-management/charter.md:44 and needs human approval. -->


# Avoiding Conflicts on the File-Based Issue Board

## Status Since Publication (2026-08-14) — the storage-shape question is CLOSED

**Axis 1 was decided against this document's recommendation, deliberately. Do not re-propose it.**

The board migrated to the **beads backend** (`535c4a9a`, "switch the board to the beads
backend"). `manifest.yaml::tasks.backend` is now `beads`, and the git artifact is
`.beads/issues.jsonl` — **record-per-line JSONL**, not the file-per-issue shape the
"Revised recommendation" below argues for.

That means the tradeoff this document identifies was accepted with open eyes: under
JSONL + last-writer-wins, two branches editing the *same* issue can silently discard one
edit, where file-per-issue would have surfaced it as a git conflict. Beads was chosen
anyway, and it brings machinery this document itself praised as "more developed than
anything adev has" — the `br sync --flush-only` / `--import-only` / `--merge` (three-way,
with `.beads/beads.base.jsonl` as ancestor) / `--reconcile` / `--witness` surface. The
three-way merge in particular is a materially different answer to same-issue concurrency
than the plain LWW this document modelled.

**Also resolved since publication:**

- **br version currency** — the local install is now **0.2.22** (was 0.1.45), so the
  v0.2.19 merge-driven database-corruption fix is in. `MIN_BR_VERSION` and a
  `br --version` preflight now exist in `lib/issues/beads-adapter.mjs`.
- **Axis 2 (ID allocation)** — resolved by making IDs merge-safe (`mintFlatId`,
  `beads-adapter.mjs:360-369`), composed with br's uniqueness constraint on
  `external_ref`. issue-613 closed. This is option (a), which the document ranked below
  (b)+(c); file-per-issue's "keeps readable IDs" argument no longer applies.
- **epic-107 Phase 0a** — shipped across PRs #245–#256; the epic is closed.

**Still live, now tracked** (do not re-derive these from this document):

- `MIN_BR_VERSION` is `0.2.0`, but the corruption fix landed in **0.2.19** — the floor
  admits exposed versions. *Untracked as of this note.*
- `docs/configuration.md:216` still documents `backend: beads_rust`, which the code
  rejects, while the real default `json` is undocumented — **issue-0qtm6x**.

Everything below is preserved as written; it is a research record, not a living plan.
Read the "Revised recommendation" and "Options, by axis" sections as the reasoning that
*informed* the beads decision, not as outstanding work.

## Summary

The board's **in-process** conflict problem is solved and shipped. Its **cross-branch**
problem is not, is actively biting, and is tracked but unspecified.

The single most important framing: these are **two independent problems with two
independent fixes**, and conflating them is why "we already added CAS" reads as
reassurance when it shouldn't.

| Axis | Problem | Status | Fixed by |
|---|---|---|---|
| **Concurrent writers, one file** | Two processes read the same snapshot, one overwrites the other | **Solved** — CAS + `O_EXCL` lock + orphan recovery | `concurrent-write-protection.spec.md` |
| **Merge-conflict surface** | One 4400-line JSON file mutated by every session; git can't three-way-merge it | **Open** | Storage shape (file-per-issue / JSONL) |
| **ID allocation collision** | `max(existing)+1` computed per-branch; two branches mint the same `issue-N` | **Open** — issue-613 | Allocation change or merge-time detection |

Storage shape does **not** fix ID collision, and merge-safe IDs do **not** fix the
merge surface. Each axis needs its own decision.

**Headline from the market survey:** measured on concurrent coding agents, advisory
leases *alone* leave duplicate work in place — only **leases + shared state** drives it
to zero. adev has shipped the lease (issue-608) and not the shared state (issue-606),
which is the configuration measured as insufficient. See **The grite finding**.

**Also in this document:** **Market survey** (beads/JSONL, orphan branches, git notes,
git-bug/grite CRDT) · **Beads: version currency** — local `br` is 0.1.45 against 0.2.22,
and the gap includes a merge-corruption fix · **PGlite as embedded board storage** —
rejected, with reasons · **Option 4: a remote server** (self-hosted DB, Jira/Linear, or a
hybrid) — the only option that deletes the conflict surface rather than shrinking it, at
the cost of offline answerability.

Note on scope: the beads section answers a **separate question** and has no bearing on
the conflict problem above — this project runs `tasks.backend: json`, so that adapter is
dormant here.

## Live reproduction — the working tree is the bug

Measured 2026-08-13 in `/Users/dpavancini/Development/adev-plugin`:

| Board copy | issues | `seq` |
|---|---|---|
| local working tree (uncommitted) | 270 | 192 |
| local `HEAD` (`1f805962`) | 270 | 187 |
| `origin/main` | 295 | 266 |

Local `HEAD` is 2 commits behind `origin/main`, and the adapter has written
uncommitted board mutations **against that stale baseline**. Against `origin/main`
the working copy is 25 issues and −395 lines short.

**Actionable now: do not commit this `tasks.json`, and expect `git pull` to conflict
on it.** The uncommitted delta (`+16/−8`) is a status change that should be re-applied
to the post-pull board rather than merged.

This is not a hypothetical — the commit log carries the scar tissue:

```
8591b078 chore(issues): file issue-588 ... + concurrent board sync
689d17af chore(issues): sync board entries from concurrent test-strategies session
```

Plus six merge commits touching `tasks.json`, and **eight active worktrees** on this
machine, each a potential board writer.

## The mechanism gap nobody has written down

`seq` is **branch-local**.

CAS protects concurrent writers of *one file* and provides exactly zero cross-branch
protection. Worse: the counter itself diverges (192 local vs 266 on origin). A git
merge resolves `seq` to whatever one side happened to carry, which can be **lower**
than writes already committed elsewhere. Post-merge, CAS compares against a
meaningless baseline — the mechanism is still running, still reporting success, and
no longer means anything.

This is why "concurrent writes are handled" is false comfort here. It is stated in
neither `concurrent-write-protection.spec.md` nor issue-613.

## Do not reach for `merge=union`

`.gitattributes` already sets `merge=union` for `.context-index/lifecycle-state/*.jsonl`,
and it is the tempting cheap fix. **It would corrupt the board.**

Union merge is safe for the lifecycle JSONL only because every line is a discrete,
self-contained record with no shared structural lines. `tasks.json` is one
pretty-printed object: union-merging overlapping hunks yields duplicate `"seq"` keys,
unbalanced brackets, and invalid JSON.

What the precedent actually argues for is the **storage shape** that makes union merge
safe — record-per-line or file-per-issue — not a merge attribute bolted onto the
current shape.

## What is already built

Genuinely solved, all shipped:

- **CAS over atomic rename** (`json-adapter.mjs`) — monotonic `seq`, bounded retry
  (`cas_max_retries`, default 3), `STALE_BOARD_WRITE` on exhaustion. Spec:
  `concurrent-write-protection.spec.md` (validated). Issue-459, closed.
- **Exclusive `O_EXCL` lock** on `tasks.json.lock`, closing the TOCTOU window between
  the CAS re-read and the rename.
- **Orphan-lock recovery** — stale locks past `cas_lock_stale_seconds` (default 30,
  floor 5) are unlinked and retried exactly once. Spec: `orphan-lock-cleanup.spec.md`.
  Issues 505 and 519, closed.
- **Shared storage across worktrees** — `resolveStorageRoot()` resolves via
  `git rev-parse --git-common-dir`, so all worktrees write the *same* board file.
  This is why worktrees dodge git conflicts entirely and hit the (handled) process
  contention path instead.
- **Shadow-board detection** (`detectShadowBoard`, issue-615) — because the board is
  git-tracked, every linked worktree checks out its own frozen copy that the adapter
  then bypasses. Detection is advisory only.
- **Claim / release** (`lib/cli/issues-claim.mjs`, `adev issues claim|release`) —
  shipped on main. Writes `owner`, `claimed_at`, `branch`, `pr` onto the issue.

## What is not built

**epic-107 — "coordination-gate: prevent two agents doing the same work at once"** —
6 open issues, **no charter and no spec**. Under this repo's own lifecycle that is a
gap worth naming.

| Issue | Title | Status |
|---|---|---|
| issue-613 | Issue-board ID allocation is not safe across git branches | open, p1, bug |
| issue-610 | Claim leases need a TTL and a release path | open |
| issue-606 | Pre-flight scan: read open PRs, remote branches, other-owner in_progress | open |
| issue-607 | Resolve execution state across worktrees like the board already does | open |
| issue-608 | `adev issues claim <id>`: atomic check-and-set ownership | open |
| issue-609 | Bind issues to branch and PR | open |

Note issue-610 is a gap in **shipped** code, not unmerged work — `issues-claim.mjs`
help text states plainly: *"Claims do not expire."* A crashed session locks an issue
forever, and a gate people bypass is worse than no gate because it trains bypassing.

The epic exists because the failure recurred three times: two agents independently
fixed the same p0 (PR #214 and duplicate PR #215, both for issue-582), and a whole
concurrent epic stayed invisible to a study chasing the same goal.

## The ID collision, concretely

`_nextIssueId(issues)` returns `max(existing) + 1` against the **current file**. From
issue-613, reproduced 2026-08-13:

> A session on `chore/board-sync-epic-106` minted `issue-589` (infra-gated suites
> decision, epic-105) while a session on `main` minted `issue-589` (regression
> rubrics, epic-108) from the same 588 baseline. Both were valid locally; the
> collision only surfaced at merge time.

Same hazard for epics — the branch took 105–107 while main referenced an `epic-108`
that existed on no board. Resolved that instance by hand-renumbering during the merge.

issue-613 already enumerated the options and recommended **(b) + (c)**:

| Option | Mechanism | Cost |
|---|---|---|
| (a) Merge-safe IDs | Clock/random suffix or per-session prefix | Loses the readable `issue-N` the framework quotes in prose, commits, specs |
| (b) Detect at merge | `adev issues renumber --against <ref>` + CI check failing a PR whose board adds IDs present on the base | Reactive; needs CI wiring |
| (c) Policy | Board writes land on main via short-lived PRs only | Already the practice that failed — the offending branch carried 26 entries |

**One thing to add to that analysis:** file-per-issue (`tasks/issues/issue-589.json`)
*keeps* readable IDs — the ID becomes the filename — which removes option (a)'s stated
cost. It also turns a same-ID collision into a git add/add conflict on one small file,
which is loud and trivially resolvable, instead of a silent semantic collision inside a
4400-line diff. It still does not *prevent* two branches choosing 589; it makes the
collision impossible to merge past unnoticed.

## Coupling worth flagging

Claim metadata (`owner`, `claimed_at`, `branch`, `pr`) is **high-churn per-issue
state** — it changes on every claim, release, and re-claim. No issue on `origin/main`
carries these fields yet, so the cost has not landed.

Under one-big-JSON, every claim is another write to the shared file and another line
in everyone's merge diff. Coordination work (epic-107) and storage-shape work are
therefore coupled: shipping claim gates broadly *before* changing storage shape
multiplies exactly the conflict surface epic-107 exists to reduce.

## Options, by axis

**Axis 1 — merge surface.** Ordered by cost:

1. **File-per-issue** — `tasks/issues/issue-N.json`, epics alongside. Concurrent
   branches touching different issues merge cleanly with zero conflict. Keeps readable
   IDs. Costs: a directory read per board load (cacheable), a migration, and rework of
   `_read`/`_write`/CAS to be per-file or index-based.
2. **JSONL append-log** — mirrors the lifecycle-state precedent exactly, and `merge=union`
   becomes genuinely safe. Costs: board state becomes a fold over the log, needs
   compaction, and CAS semantics change shape.
3. **Untrack the board + sync via a remote** — sidesteps git merge entirely. Costs the
   offline-answerable property issue-609 explicitly wants, and adds a dependency the
   constitution's first principle resists. **Expanded in "Option 4: a remote server"**,
   which also covers the CRDT op-log and hybrid shapes this rev-1 list predates.

**Axis 2 — ID allocation.** issue-613's (b) + (c) stands. The CI check is the
load-bearing half: it converts a silent merge-time collision into a red PR. Note that
option 4 dissolves this axis outright — a database sequence cannot mint the same ID
twice.

## Market survey — how others solve this

Four families, ordered by how far they move state away from the working tree.

### 1. Record-per-line in the working tree (JSONL) — beads

[beads_rust](https://github.com/Dicklesworthstone/beads_rust) is the closest analogue
to adev's board: local-first, git-native, agent-oriented. Its architecture is **hybrid
— SQLite for queries, JSONL (`.beads/issues.jsonl`) for git collaboration.** The
project is explicit that *"JSONL is line-based, so conflicts are usually easy to
resolve."*

What is worth stealing is the **sync surface**, which is more developed than anything
adev has:

| Command | Purpose |
|---|---|
| `br sync --flush-only` | Export DB → JSONL; idempotent pre-commit check |
| `br sync --import-only` | Merge JSONL → DB |
| `br sync --merge` | **Three-way merge** using `.beads/beads.base.jsonl` as ancestor, with `--force-db` / `--force-jsonl` / `--force` (newer timestamp) policies |
| `br sync --reconcile` | Lossless recovery when JSONL has rows missing from the DB |
| `br sync --witness` | Read-only deterministic snapshot for verification |

Note also the *non-invasive* stance: *"`br` never commits, pushes, pulls, installs
hooks, or runs as a background service."* Users stage `.beads/` themselves.

**Caution — do not let this contradict the `merge=union` finding above.** Union merge
is safe for beads because its git artifact is record-per-line. It remains unsafe for
adev's single pretty-printed object. The shape qualifier must stay attached.

### 2. Separate git ref / orphan branch

The [orphan-branch pattern for AI agent state](https://www.tamirdresher.com/blog/2026/03/23/scaling-ai-part7b-git-notes)
stores agent state on a branch with no shared history, so code PRs stay pure — the
author reports PRs dropping to *"only 57 changed files, zero decision logs."* Agents
write to the state branch directly, with no PR review and no rebasing against feature
branches.

It genuinely dissolves the *PR-pollution* half of the problem. Its acknowledged costs
land squarely on adev's requirements:

- **Onboarding friction** — *"every new developer who clones the repo needs to learn
  about the existence of this hidden branch."*
- **Knowledge fragmentation** — answering "what did we decide about auth" now requires
  knowing which ref holds it.
- **Operational invisibility** — state is not discoverable in the working tree.

That last point is disqualifying on its own for adev: skills, hooks, and `/adev:status`
all read the board as a plain file path, and `detectShadowBoard` exists precisely
because path-based readers are a first-class access pattern here.

The same source finds **git notes a thinner solution** for commit-scoped metadata
(`git notes --ref=squad/decisions add …`), but flags two traps that rule notes out as
board storage: each `refs/notes/<name>` namespace holds **at most one note per commit**
— so a second agent annotating the same commit **overwrites the first** — and notes
require explicit fetching, so they do not arrive on a fresh clone.

### 3. Operation log in git refs, rebuilt by CRDT — git-bug, grite

[git-bug](https://github.com/git-bug/git-bug) embeds issues as git objects under custom
refs. It orders operations by **git DAG topology first, then Lamport clocks, then hash**
as a tiebreak — deliberately *not* wall-clock timestamps.

More directly relevant: [**grite**](https://arxiv.org/html/2606.19616v1) is a
server-less coordination substrate built **specifically for concurrent coding agents** —
adev's exact case. It stores the issue tracker as an append-only log of typed,
content-addressed, signed events in `refs/grite/wal`. State is rebuilt by CRDT merge:
scalar fields last-writer-wins ordered by (timestamp, actor, eventID); set fields
(labels, assignees) commutative. The guarantee is that *"two replicas that have seen
the same events compute identical state regardless of delivery order."*

**This paper contains the single most important external finding for epic-107** — see
below.

### 4. Embedded database — PGlite

Evaluated separately in **PGlite as embedded board storage** below. Short version:
category mismatch. (Not to be confused with **Option 4: a remote server**, which is a
different question — PGlite *behind a server* is treated there, in 4a.)

## The grite finding — external validation of epic-107, and a warning

The grite paper measured concurrent coding agents with and without coordination:

- Without coordination, **78% of completions are redundant.**
- With **leases + shared state**, duplicate work drops to **zero** and throughput
  **more than triples.**
- Critically: *"advisory leases alone do not prevent redundant rediscovery."*

Map that onto board state:

| Mechanism | epic-107 issue | Status |
|---|---|---|
| Advisory lease | issue-608 (`adev issues claim`) | **Shipped** |
| Shared state pre-flight | issue-606 (read open PRs, remote branches, other-owner `in_progress`) | **Open** |
| Lease TTL | issue-610 | **Open** |

**adev is currently in exactly the configuration the paper measured as insufficient** —
leases without the shared-state pre-flight. This is independent external evidence that
**issue-606 is the load-bearing half of epic-107, not issue-608**, and that shipping
claim first (as happened) buys less than it appears to.

It also sharpens issue-610: the paper notes leases are voluntary and compliance is
itself observable. A lease that never expires is the failure mode that trains bypass —
which is worse than no lease, because it teaches agents and humans to route around the
gate.

## Beads: version currency

**Finding: the local install is badly out of date, and one of the gaps is a data-corruption fix.**

| | Version | Date |
|---|---|---|
| Local install (`~/.local/bin/br`) | **0.1.45** | — |
| Latest upstream | **0.2.22** | 2026-08-06 |

Selected changes across that gap ([releases](https://github.com/Dicklesworthstone/beads_rust/releases)):

- **v0.2.19 — engine upgrade fixing "deterministic database corruption" from merge
  operations.** This is the headline.
- v0.2.20 — schema migration upgrade path; sync data-loss guards; additive JSONL
  reconciliation via `br sync --reconcile`.
- v0.2.21 — emergency fix for a macOS/Windows "database is busy" regression.
- v0.2.16 — git export validation; JSONL auto-flush bounds.
- v0.2.12 — governance fields; strict status enforcement; **close-policy now requires
  `br close` rather than `br update --status closed`.**

### Does the adapter need updating?

Two separate questions, with different urgency.

**(a) Adapter compatibility — likely fine, but NOT verified against a real binary.**
The local `br` is 0.1.45, so every 0.2.x claim here derives from upstream docs, not from
a tested surface. The adapter's entire call surface is five invocations:
`br create <title> --type --priority --json`, `br list --json`, `br update`,
`br close --reason`, `br dep add`. All five are documented as present with those flags
in the current
[CLI reference](https://github.com/Dicklesworthstone/beads_rust/blob/main/docs/CLI_REFERENCE.md),
and `br list --json` has *gained* fields (`owner`, `assignee`, `close_reason`,
`closed_by_session`, …) rather than losing any. That is evidence of presence, not proof
of absence of breaking changes — a reference page need not carry a regression notice.

One point is verified by direct code read rather than docs: the adapter already calls
`br close --reason`, so it **survives v0.2.12's close-policy enforcement**. An adapter
built on `br update --status closed` would have broken.

To close the gap cheaply: install 0.2.22 in a scratch repo and exercise those five
calls. Do not assume — v0.2.20's schema migration is the most likely place for a
surprise.

**(b) Should adev adopt/require newer br — lower urgency, but there is a user-facing
advisory.** This project runs `tasks.backend: json`, so the beads adapter is dormant
here and **has no bearing on the conflict problem this study is about**. But it ships to
users, and `registry.mjs` points them at the upstream repo with no version floor. Given
v0.2.19, **any user on `backend: beads` with br 0.1.x is exposed to merge-driven
database corruption.** A documented minimum version (≥ 0.2.19, preferably ≥ 0.2.21) plus
a version check in the adapter's existing `which br` preflight is the proportionate fix.

Also worth noting for direction-setting: the beads_rust README describes itself as a
*stable snapshot* of the "classic" SQLite + JSONL architecture, while the original Go
implementation *"has evolved toward different approaches."* If adev wants to track
beads long-term, that fork in the road needs a decision.

### Two defects found while checking

**1. `lib/issues/beads-adapter.mjs:108` — internal IDs minted as `count+1`, and the map
is worktree-local.**

```js
const nextId = `issue-${Object.keys(map).filter(k => k.startsWith("issue-")).length + 1}`;
```

`count+1` is strictly weaker than the JSON adapter's `max+1`: it collides whenever any
map key goes missing. There is **no delete path in the adapter**, so the triggers are a
hand-edit or a lost entry, not routine use.

The larger problem is *where the map lives*. `mapPath` is built from `projectRoot`, not
`resolveStorageRoot()` — and `.beads-map.json` is **gitignored** (`.gitignore:23`,
confirmed). So while the JSON board is deliberately shared across worktrees, the beads
`issue-N → beadsId` mapping is **per-worktree and never shared**. Consequences: the
same `issue-N` can point at different beads issues in two worktrees, and the `issue-N`
IDs adev quotes in specs, commits, and prose are meaningless on any other clone. This
is an inconsistency between the two adapters, not just a numbering bug.

Being gitignored does at least mean this is *not* a cross-branch merge hazard — the
severity is "IDs are locally scoped and silently non-portable," not "IDs collide at
merge time."

**2. `docs/configuration.md:215` contradicts `lib/issues/registry.mjs:23`.** Docs
document `backend` as `file` | `beads_rust`. Code declares
`SUPPORTED_BACKENDS = ["json", "file", "beads"]` with `DEFAULT_BACKEND = "json"`. A user
following the docs writes `backend: beads_rust`, which is not accepted — and `json`, the
actual default and the backend this project runs, is undocumented.

## PGlite as embedded board storage: not a fit

<!-- Scope note (rev 2): this section evaluates PGlite as a drop-in replacement for
     tasks.json — embedded, in-repo, git-native. The separate question of PGlite
     behind a central server is answered in "Option 4a", which also records that
     PGlite v0.4 added connection multiplexing, softening the single-connection
     premise below. The verdict differs in reasoning, not in outcome. -->

[PGlite](https://pglite.dev/) is Postgres compiled to WASM, ~3MB gzipped, persisting to
a filesystem directory in Node. It is genuinely impressive and genuinely wrong for *this*
role.

| Requirement | PGlite |
|---|---|
| Git-mergeable artifact | **No** — directory-based binary `pgdata`. Not diffable, not mergeable, not reviewable. |
| Concurrent access from 8 worktrees | **No** — docs state plainly: *"PGlite is single user/connection."* |
| Human-readable board in the working tree | **No** |
| Offline answerability (issue-609) | Only via a layer PGlite does not provide |
| Constitution principle #1 (minimize deps) | **No** — a 3MB WASM runtime |
| Production maturity | **No** — carries an *Alpha* badge |

The structural point, not just the checklist: **PGlite assumes a sync service
(ElectricSQL) as its coordination layer.** Its design centers local-first apps that
reconcile through a server. adev's board needs git-native durability, human-readable
diffs, and offline answerability — PGlite provides none of the three, because it was
never trying to.

Adopting it would make things *worse than today*: current conflicts are at least
visible in a diff and resolvable by hand. A conflicted binary `pgdata` is neither.

The one honest place it could fit is as a **derived, disposable query cache** rebuilt
from the git-native source of truth — the role SQLite plays in beads. At 295 issues,
that is solving a performance problem the board does not have. Revisit only if the
board reaches a scale where full-scan reads actually hurt.

## Option 4: a remote server (self-hosted DB, or a hosted tracker like Jira)

Every option above keeps the board *in the repo* and argues about its shape. This one
moves the source of truth out of git entirely. It deserves separate treatment because
it does not merely reduce the conflict surface — it **deletes** it. There is no git
artifact to merge.

### What a server actually buys — and it is not conflict avoidance

The strongest argument for a server is not merge hygiene. It is that a server provides
**real coordination primitives** that the file board can only approximate:

| epic-107 need | File board today | Server |
|---|---|---|
| Atomic claim (issue-608) | `O_EXCL` lockfile + CAS retry | `SELECT … FOR UPDATE` inside a transaction |
| Lease TTL (issue-610) | Not implemented; *"Claims do not expire"* | `claimed_at` + indexed expiry query, or a native advisory lock |
| Shared-state pre-flight (issue-606) | Scan open PRs, remote branches, other-owner `in_progress` | **One query** |
| Cross-branch ID allocation (issue-613) | `max+1` per branch — collides | A sequence. Solved by definition. |

Note what that last column does to the grite finding: **a server *is* shared state.**
The paper's result was that leases alone are insufficient and leases + shared state
drive duplicate work to zero. A server supplies the second half structurally rather
than by convention. It is the single most direct answer to epic-107 in this document.

It also dissolves axis 2 outright — a database sequence cannot mint `issue-589` twice.

### What it costs

| Property | Cost |
|---|---|
| **Offline answerability** | Lost. issue-609 wants "is someone doing this?" answerable offline — a server makes it a network call. |
| **Board travels with the clone** | Lost. `git clone` no longer gets you the issues. |
| **Zero-install** | Lost. Someone must run and back up the thing. |
| **Constitution principle #1** | Strained — a DB driver, or an HTTP client plus credentials. |
| **Availability** | The board becomes a dependency that can be down. Today it cannot be. |

### 4a. Self-hosted database server

**If you go this route, the answer is `node:sqlite`, not PGlite and probably not Postgres.**

`node:sqlite` is a **Node built-in** — zero dependencies, satisfying principle #1 in a
way nothing else here does. Per the
[official docs](https://nodejs.org/api/sqlite.html): added in v22.5.0, unflagged since
v22.13.0, and **Stability 1.2 — Release candidate** as of v25.7.0. So: no longer
experimental, not yet 1.0-stable. Minor API changes remain possible, which is the one
real caveat against it. In WAL mode it gives real
multi-process concurrency: many concurrent readers plus one writer, across processes —
which is exactly the eight-worktree shape. beads independently validates SQLite for
this precise workload.

**Postgres** is the right answer only if the board needs to outgrow one machine, serve
a web UI, or support many non-agent clients. At 295 issues that is speculative.

**PGlite is the wrong tool for the server case**, though not for the reason given in the
section above — that argument was scoped to the embedded case and needs updating.
[PGlite v0.4](https://electric.ax/blog/2026/03/25/announcing-pglite-v04) (March 2026)
added **connection multiplexing**, and the project is at ~13M weekly downloads with
Prisma bundling it. So "single-connection" is no longer a flat blocker.

The real objection is that multiplexing is **serialization over one single-user-mode
connection** (no SSL; upstream notes "not all cases might be covered"), and PGlite's own
[multi-tab documentation](https://pglite.dev/docs/multi-tab-worker) states:

> For applications requiring true concurrent connections, a traditional PostgreSQL
> server would be more appropriate.

The decisive framing: **PGlite's value proposition is "Postgres where you cannot run
Postgres." A server is definitionally where you can.** You would accept single-user
mode and no SSL in exchange for a smaller install — the one benefit that does not matter
on a server.

To be precise about what is *not* the objection: at 295 issues and ~10 writers,
serialization is irrelevant. Throughput is not the disqualifier, and arguing it that way
would be unsupportable.

### 4b. Hosted tracker (Jira, Linear, GitHub Issues)

Different tradeoff: you stop operating anything, and you gain a UI plus stakeholder
visibility that no file board will ever match. Humans already live in these tools.

The agent-specific frictions are real:

- **Rate limits.** [Jira Cloud's new limits](https://developer.atlassian.com/cloud/jira/platform/rate-limiting/)
  began phased enforcement **March 2, 2026**: a points-based model where each call costs
  according to weight, against a **65,000-point hourly budget shared across the entire
  site** for Tier-1 apps. Atlassian's own guidance flags AI agents as a concern
  precisely because they consume many REST calls. adev's skills read the board
  constantly — `/adev:work` Step 1, every gate, every status check. A board read that is
  free today becomes metered, and **your agents compete with every other integration on
  the same site budget.**
- **Latency.** Per-operation network round-trips inside skill execution, where today a
  board read is a file read.
- **Credentials.** Every agent and worktree needs a token, with the blast radius that
  implies.
- **Offline.** Gone entirely, not merely degraded.
- **Impedance mismatch.** adev's model — tiered dotted IDs, `next_action`, dependency
  edges, `planRef`/`spec_ref` — must map onto the tracker's schema. Jira custom fields
  can carry it, but the mapping is now a maintained artifact.

**GitHub Issues** deserves a note as the lowest-friction member of this family: the repo
already lives there, `gh` is already authenticated, and it inherits the code's access
control. It remains a network dependency, and you have deliberately kept project work on
the local board.

### 4c. Hybrid — server authority, git-tracked snapshot

The option that dissolves the tradeoff rather than picking a side: **server as the write
path and source of truth, plus a periodic export to a git-tracked JSONL snapshot** for
offline answers, history, and grep-ability.

This is beads' architecture with the authority inverted — beads treats the local DB as
primary and JSONL as the shared artifact; here the server is primary and the JSONL is a
read-only replica committed to the repo. You get transactional claims and zero merge
surface on the hot path while keeping issue-609 satisfiable. The snapshot is
**append-mostly and record-per-line, so `merge=union` is genuinely safe on it** — the
one place in this document where that attribute applies.

Cost: two systems, and a staleness window on the snapshot.

### The cheap option that already exists — reference, don't sync

Worth stating before anyone builds an integration: **adev already ships a validated
lightweight path.** `tracker-reference-field.spec.md` (status: validated) puts a
`tracker-ref:` field in charter and spec frontmatter and teaches `/adev:status` to render
it, with formatting for GitHub (`#123`), Linear (`LINEAR-1234`), and similar.

That buys traceability to Jira with **zero sync, zero credentials, zero rate limits, and
zero new failure modes**. If the actual goal is "our Jira should point at our specs,"
this is already done. Only pursue 4b if the goal is genuinely to make the tracker the
system of record.

### Two things that gate this option

**1. It is a charter amendment, not just a new adapter.** `task-management/charter.md:44`
lists **"External tracker sync (Jira, Linear, GitHub Issues)"** under *Out of Scope*, and
the charter's Business Intent commits to "a zero-setup file backend and the beads_rust
CLI." Adding a server or tracker backend contradicts a validated charter and needs human
approval before implementation — not a decision to make inside a spec.

**2. The adapter contract is, happily, already shaped for it.** All thirteen
`IssueManagerInterface` methods (`create`, `update`, `close`, `claim`, `release`, `list`,
`get`, `listEpics`, `createEpic`, `updateEpic`, `addDependency`, `walkTree`, `init`) are
**already `async`**, and `SUPPORTED_BACKENDS` is a registry. A network-backed adapter
therefore requires **no interface change** — it is a new module plus a manifest value.
The architectural cost is low; the governance and operational costs are where this
option is actually decided.

## Revised recommendation

*Supersedes the rev-1 "Recommendation" section, which was written before the market
survey and has been removed. The conclusion on axis 1 is unchanged; the reasoning is
different and stronger.*

The market evidence strengthened two options this study had ranked second and third, so
the choice needs a stated discriminator rather than a restatement.

**The discriminator: do you want true semantic conflicts surfaced, or silently
resolved?**

Two branches editing *different* issues must merge cleanly — all candidate shapes
achieve this. The real question is two branches editing the *same* issue:

| Shape | Same-issue concurrent edit | Verdict |
|---|---|---|
| **JSONL + last-writer-wins** | One edit **silently discarded** | This is precisely the failure grite measured in file-based LWW trackers — they *"silently discard"* one agent's contribution |
| **File-per-issue** | Visible git conflict on one small file | Loud, trivially resolvable, correct |
| **CRDT op-log** | Both preserved, commutative merge | Most correct; highest cost |

For an issue board where a lost status update *directly causes duplicate work* — the
exact failure epic-107 exists to prevent — silent resolution is the wrong default. That
rules out plain JSONL despite its internal precedent and external validation.

**Recommended: file-per-issue** (`tasks/issues/issue-N.json`), now for a principled
reason rather than a cost one. It:

- dissolves the merge surface for the common case (different issues);
- **surfaces** same-issue conflicts instead of hiding them;
- keeps readable `issue-N` IDs — the ID becomes the filename, removing issue-613 option
  (a)'s stated cost;
- keeps the board human-readable and path-readable in the working tree, which orphan
  branches and git-refs storage both forfeit;
- adds no dependency, satisfying principle #1.

**CRDT op-log (grite/git-bug) is the correct long-term answer** and the only option with
measured results, but it is a rewrite that moves state out of the working tree and
breaks every path-based reader in the codebase. Note it as the direction; do not take it
now.

### But first decide which problem you are solving

The server option (4) does not compete with file-per-issue on the same axis, and the
recommendation above is only correct for one reading of the goal:

| If the real goal is… | Then the answer is… |
|---|---|
| **Board merges cleanly across branches** | **File-per-issue.** Cheap, no dependency, keeps offline and git-native properties. |
| **Agents stop duplicating each other's work** (epic-107) | **A server.** It supplies shared state structurally, makes claims transactional, gives leases a real TTL, and deletes ID collision via a sequence. |

These are not the same problem, and the second is the more expensive one adev actually
has — three recorded instances of duplicate work, and a paper measuring 78% redundancy
without shared state.

**The decision is not technical, it is about what adev is.** A server costs offline
answerability (issue-609), zero-install, and the board travelling with the clone. Those
are load-bearing product properties, not incidental ones.

The path that avoids forcing the choice: `SUPPORTED_BACKENDS` is a registry and every
interface method is already `async`, so **a server backend can exist for this repo's own
eight-worktree fleet while the shipped default stays file-based.** That is a new adapter
plus a manifest value — no interface change. It does still require a charter amendment
(`task-management/charter.md:44` puts external tracker sync out of scope), and that is a
human decision.

If a server is adopted, prefer **4c (hybrid)**: server authority plus a git-tracked JSONL
snapshot, which keeps issue-609 answerable and history in git.

Sequenced (assuming the file-based reading; steps 1–4 and 6–7 hold either way):

1. **Immediately:** do not commit the current `tasks.json`; re-apply the local status
   change after pulling.
2. **Write the epic-107 charter + spec.** Six open issues and no spec is how this
   happened.
3. **Re-prioritize issue-606 above further claim work** — the grite result says leases
   without shared state do not reduce duplicate work.
4. **Give claims a TTL** (issue-610) before enforcing the claim gate anywhere.
5. **Adopt file-per-issue** for axis 1; borrow beads' `--flush-only` / `--reconcile`
   sync verbs as the model for `adev issues` tooling.
6. **Add issue-613's CI collision check** for axis 2 — cheap, useful under any shape.
7. **Beads, independently:** document a minimum `br` version (≥ 0.2.19) and add a
   version check to the adapter preflight; verify the five call sites against a real
   0.2.22 binary; fix the two defects above.

<!-- The revision-1 "Recommendation" section was removed here; it is fully
     subsumed by "Revised recommendation" above, which reaches the same
     conclusion on axis 1 via the surfaced-vs-silent discriminator. -->

## Open questions

- Does file-per-issue keep a single `seq`, or move to per-file CAS? Per-file is more
  correct and removes the divergent-counter problem entirely, but `walkTree` and
  `list` then have no single consistency point.
- Should the board be git-tracked at all? Shadow-board detection exists only because
  it is. Untracking removes that class of bug and the merge surface at once, but
  forfeits board history and offline answers — and issue-609 wants offline answers
  explicitly.
- Is a coordination server worth building for this repo's own fleet, even if the shipped
  default stays file-based? Eight active worktrees is already past the scale the file
  board was designed for, and the charter amendment is the gating decision.
- If a server is adopted, does `tracker-ref:` remain the Jira story (reference, no sync),
  or does the tracker become the system of record? These are very different commitments
  and the cheap one is already shipped and validated.
- Is the CRDT op-log (grite/git-bug) worth the rewrite later? It is the only surveyed
  option with measured results on concurrent coding agents, but it moves state out of
  the working tree and breaks every path-based reader. Revisit if file-per-issue plus
  the epic-107 gates prove insufficient.
- Should the beads `issue-N → beadsId` map move from `projectRoot` to
  `resolveStorageRoot()` and stop being gitignored? That would make beads-backend IDs
  worktree-consistent and portable, matching the JSON board — but it puts a
  high-churn mapping file back into git, reintroducing the merge surface for that
  backend.
- Does adev track beads_rust (frozen "classic" SQLite + JSONL) or the original Go
  beads (*"evolved toward different approaches"*)? The adapter currently targets `br`.
