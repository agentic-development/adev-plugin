# Release Highlights

Human-friendly notes for adev users. For the complete, commit-level list see
[CHANGELOG.md](../CHANGELOG.md) or the [GitHub releases](https://github.com/agentic-development/adev-plugin/releases).

Upgrade any time with:

```bash
npx @adev-org/adev-cli upgrade
```

---

## 0.28.0 — Set how much rigor your project needs

adev now lets you tune *how strictly* the lifecycle runs, per project, instead of one-size-fits-all.

### Implementation modes

Choose how `/adev:implement` treats tests. `/adev:init` now asks, and the answer is stored as
`implementation_mode` in `manifest.yaml`:

| Mode | What it does |
|---|---|
| `tdd` (default) | Tests are written first — a RED phase runs before any code |
| `test-required` | Tests are required, but not necessarily written first |
| `agent-default` | The agent decides when and how to test |

```bash
adev implementation-mode resolve --mode test-required
```

### Risk tiers

`/adev:init` now offers a project-wide risk tier that decides how much review and validation you get:

| Tier | Best for | Effect |
|---|---|---|
| `prototype` | Spikes and experiments | Fast review, minimal test depth, no human-approval gates (review is never skipped) |
| `standard` (default) | Most projects | The framework defaults, unchanged |
| `strict` | Sensitive or production-critical code | Human approval required, full review and validation, thorough tests, stricter checks |

See [Governance → Project risk tier](governance.md#project-risk-tier--which-risk-policiesyaml-you-start-from).

### You choose your reviewers and checks

`/adev:init` now has you pick each reviewer and validation check explicitly, and your choices are
respected when a risk tier is applied. If you end up with **no** reviewers or checks enabled, adev
now warns you instead of silently passing.

### Also new

- **Bugfix loop:** scope a run to one epic with `--epic`.
- **Issues:** `adev issues create --affected-modules`, and a heads-up when you close a bug with no commit evidence.
- **Partial artifacts:** `adev partial commit` for non-frontmatter `.partial` files.
- **Install:** target a specific Claude Code config directory.
- **Test strategies:** a new entry-point boundary rule in the unit profile.

### Fixes

- Install/uninstall scope, cache pruning, and multi-profile handling are now correct; no more cache collisions between Claude config directories.
- Prompts no longer hang on a second question over piped input.
- Epics are no longer mistaken for issues in `adev issues update`, and parent-child links no longer count as blockers.
- `/adev:implement` commits a task before reporting it done.
- `/adev:brainstorm --module` now appends to the module map when `product.md` exists.

### Heads-up for maintainers

The skill-compression eval harness was retired, and the specify, plan, and brainstorm rubrics were rewritten.
This only affects people running adev's own eval harness — see [eval-harness.md](eval-harness.md).

---

## 0.27.9 — Let adev fix bugs while you're away

### `/adev:bugfix-loop`

Point it at your issue board and it works through eligible bugs unattended, one per turn, using
`/adev:debug --auto`. It checks branch freshness, claims a bug, attempts a fix, records the outcome in a
running summary table, and moves on.

```
/adev:bugfix-loop --max-bugs 5
/adev:bugfix-loop --worktree-per-bug --auto-commit --max-priority P1
/adev:bugfix-loop --max-turns 10 --github-sync
```

- **Safe by default:** limited to P2/P3 bugs in a single module, never touches risky areas (review gate, retry loop, the loop itself), and gives up on a bug after a capped number of attempts.
- **One PR per fix:** `--worktree-per-bug` isolates each bug; `--auto-commit` commits, pushes, and opens a PR.
- **GitHub sync:** `--github-sync` pulls issues in and posts results back, falling back gracefully if GitHub is unreachable.

### Also new

- **Graduated review depth** in `/adev:implement`: small tasks get a lighter review, large or sensitive ones a full one.
- **Beads board on its own branch:** `adev issues board migrate` moves your issue board to a dedicated git branch so it stops cluttering feature branches.
- **Output verbosity:** a verbosity setting alongside personas, to trim output.
- **More spec reviewers:** referent-integrity, wiring, boundary, and termination checks in `/adev:review-specs`.
- **Eval scoring:** `adev eval score` for rubric-based scoring.

---

## 0.27.8 — Amend specs without starting over

- **Spec amendments:** `/adev:specify --amend` records a change to an approved spec as an overlay, and `/adev:status` and `/adev:hygiene` follow the chain.
- **Completion tokens:** skills end with a terminal token like `ADEV-DEBUG: FIXED`, so `/goal` and scripts can tell when a run is finished.
- **Extensions everywhere:** all 30 skills now load user and project extensions.

---

## 0.27.0 – 0.27.7 — Two new editors, and adev remembers your sessions

- **Cursor** (0.27.0) and **GitHub Copilot** (0.27.2) are now supported as install targets.
- **Session capture:** adev records what happened in a session when it ends or compacts, and `/adev:retro` uses it.
- **Cost ticker:** see per-spec cost between `/adev:build` steps (`adev cost`).
- **Revise specs:** `adev specify revise`, with per-revision history in `/adev:status`.
- **Crash-safe artifacts:** long outputs are written as resumable `.partial` files (`adev partial resume|discard`).
- **Drift tracking:** spec drift now lives in an event log, which ends the merge conflicts it used to cause.
- **Backend migration:** `adev issues migrate` moves your board between task backends.

---

## 0.26.0 — A more reliable foundation

- Lifecycle state moved from markdown to **append-only JSON event logs**, and the issue board to a concurrency-safe **JSON store** — fewer corrupted or conflicting state files.
- Skills now call **`adev` CLI verbs** instead of inline scripts, making runs more predictable.
- **Spec kinds** with new charter and spec templates, selectable via `--kind` in `/adev:brainstorm` and `/adev:specify`.

---

## 0.25.0 — The big feature drop

- **`/adev:deploy`:** run a structured deployment pipeline from `deploy.yaml`.
- **`/adev:prototype`:** generate tiered prototypes with a local preview server.
- **Domain profiles and extensions:** data-engineering and process-automation packs.
- **Infrastructure preflight:** check env vars, CLI tools, and connectivity before skills run.
- **Spec drift detection** and **reality check:** warnings when code diverges from specs, and confidence-scored verification before issues are closed.
- **Debug playbooks**, **`/adev:build --auto`** for unattended runs, and `--charter` / `--module` build entry points.
- **`install` and `upgrade`** replace the old `init` CLI command.

---

## 0.16 – 0.24 — Personas, governance, and smarter builds

- **0.24:** Reality check and infrastructure preflight.
- **0.22:** Heuristics ("learned lessons") with tiered retrieval, injected into more skills.
- **0.21:** `/adev:build` runs each step in a fresh subagent, with an optional validate-to-implement retry loop.
- **0.20:** Role-based **personas** (product, developer, and more) adapt output to who is reading.
- **0.19:** **Domain-specific TDD** with eight test strategies, chosen automatically per task.
- **0.18:** **Configurable governance:** project-defined reviewers, validation checks, and quality gates.
- **0.16:** **Workspace-aware planning** across multiple repos.

---

## 0.1 – 0.11 — The foundation

- **0.1–0.7:** Core lifecycle skills — brainstorm, specify, plan, implement, validate, debug.
- **0.8:** Persistent **issue tracking** and `/adev:issues`.
- **0.9:** `/adev:codehealth` and issue boards shared across git worktrees.
- **0.10:** Strategic planning and the `adev:` skill namespace.
- **0.11:** **Session awareness:** resume where you left off, plus issue reminders.
