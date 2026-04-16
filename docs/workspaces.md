# Multi-Repo Workspaces

If your project spans multiple git repositories — for example, a data platform with separate repos for dbt models, API services, Airflow DAGs, and infrastructure — adev workspaces let you coordinate specs, planning, and context across all of them.

Single-repo projects don't need this. If your whole codebase is in one repo, keep doing what you're doing. Workspaces are purely additive.

## When to use a workspace

Use a workspace when:

- You have 2+ repos that share a domain (same product, same team, same deployment pipeline)
- You want to write feature specs that cut across repos (e.g., "add a new metric that flows from dbt → API → dashboard")
- You need to coordinate planning — "we have to change the dbt model before the API can expose it"
- You want a single place to see the status of work happening across all your repos

Skip workspaces when:

- You only have one repo
- Your repos are completely unrelated (different products, different teams)
- You're using a monorepo — workspaces are for multi-repo setups, not for subdividing a single repo

## How it works

A **workspace** is a directory containing an `adev-workspace.yaml` file that lists your repos and how they depend on each other. That's it.

```
data-platform/              ← workspace root
├── adev-workspace.yaml     ← declares your repos
├── .context-index/         ← optional: workspace-level specs and charters
├── repos/
│   ├── dbt-models/         ← each repo has its own .context-index/
│   ├── data-api/
│   └── airflow-dags/
```

The workspace is **optional** for each repo. A repo can exist inside a workspace or outside one — its own `.context-index/` works identically either way. The workspace just adds cross-repo visibility.

## Setting up a workspace

### 1. Initialize the workspace

From your workspace root directory:

```
/adev:init --workspace
```

This creates `adev-workspace.yaml` and a workspace `.context-index/` directory. If you already have repos with adev set up in child directories, the wizard auto-discovers them and offers to register them.

You'll see something like:

```
Found 3 repos with adev context:
  - dbt-models (./repos/dbt-models)
  - data-api (./repos/data-api)
  - airflow-dags (./repos/airflow-dags)

Register them? (yes / select / skip)
```

- **yes** — registers all
- **select** — pick which ones to register
- **skip** — scaffolds with empty repos list (add them manually later)

### 2. Describe your dependencies

Edit `adev-workspace.yaml` to declare how your repos depend on each other:

```yaml
workspace:
  name: data-platform

repos:
  - slug: dbt-models
    path: ./repos/dbt-models
    role: transformation
  - slug: data-api
    path: ./repos/data-api
    role: serving
  - slug: airflow-dags
    path: ./repos/airflow-dags
    role: orchestration

dependencies:
  - from: data-api
    to: dbt-models
    type: consumes
  - from: airflow-dags
    to: dbt-models
    type: orchestrates
```

The convention: **`from` depends on `to`**. Here, `data-api` depends on `dbt-models`, so dbt changes happen first.

The `type` field is free-form — use whatever labels help your team understand the relationship (`consumes`, `orchestrates`, `deploys`, `extends`, etc.). It's documentation only, it doesn't affect execution.

## Using a workspace

Once you have `adev-workspace.yaml`, skills pick up the workspace automatically when you run them inside any of the registered repos or at the workspace root.

### Writing a cross-repo feature

Start at the workspace root:

```
/adev:brainstorm
```

Because you're at the workspace root (not inside any registered repo), the charter is saved to the **workspace's** `.context-index/` — it's a platform-level feature, not a repo-level one.

From that charter, write repo-level specs:

```
/adev:specify
```

Each spec lives in the target repo's `.context-index/`. When a spec depends on another repo's spec, use the `@repo-slug/spec-slug` syntax:

```yaml
---
charter: my-feature
status: draft
depends-on: ["@dbt-models/customer-ltv"]
---
```

### Cross-repo reference validation

When you run `/adev:review-specs`, cross-repo references are automatically checked:

- If the referenced spec can't be found → warning
- If the referenced spec is still `draft` → warning ("may not be ready")
- If the referenced spec is `superseded` → warning ("check for replacement")

These are advisory. They help you catch broken references early without enforcing strict execution coupling.

### Dependency-aware planning

When you run `/adev:plan --phase <name>` in a workspace, specs are planned in **dependency order** — upstream repos first:

```
Phase v1 planning:
  1. dbt-models/customer-ltv.md    ← no dependencies, planned first
  2. data-api/ltv-endpoint.md      ← depends on dbt-models
  3. airflow-dags/ltv-schedule.md  ← depends on dbt-models
```

### Workspace status

Run `/adev:status` at the workspace root to see everything:

```
Workspace: data-platform

Workspace-level:
  customer-ltv charter — validated
  
dbt-models:
  customer-ltv.md — implemented
  
data-api:
  ltv-endpoint.md — review-passed
  
airflow-dags:
  ltv-schedule.md — draft
```

## Common patterns

### Pattern 1: One team, many repos

A data platform team with separate repos for transformations, serving, and orchestration. The workspace groups them for shared planning and cross-repo specs.

### Pattern 2: Shared library + consumers

A shared library repo and several consumer apps. Declare `consumer-app → shared-lib` dependencies so library changes get planned before consumer work.

### Pattern 3: Platform + services

A platform repo (infrastructure, CI, shared tooling) and several service repos. The platform is typically `to` (upstream) in most dependencies.

## What workspaces do NOT do

- **No automatic cross-repo implementation.** `/adev:implement` still runs in one repo at a time. When a cross-repo plan is ready, you move between repos yourself. (Auto-switching is planned for a future phase.)
- **No workspace-level constitution.** Each repo keeps its own constitution and coding standards. The workspace doesn't override them.
- **No shared issue tracking.** Each repo has its own issue board. Cross-repo issue linking is planned for a future phase.
- **No git magic.** adev doesn't manage your git topology — whether your repos are separate clones, submodules, or subdirs is entirely your choice.

## Frequently asked questions

**Q: Does my existing project break if I add a workspace?**
No. Single-repo projects are unaffected — if `adev-workspace.yaml` doesn't exist, workspace detection returns nothing and every skill runs exactly as before.

**Q: Can a repo belong to multiple workspaces?**
Technically yes — the workspace is detected by walking up from `cwd`, so whichever `adev-workspace.yaml` is closest wins. In practice, a repo has one natural home.

**Q: Does the workspace have to be a git repo?**
No. It's just a directory with `adev-workspace.yaml` at the root. Many teams make it a git repo so workspace-level specs and charters are version-controlled, but that's optional.

**Q: What if one of my repos moves or disappears?**
adev handles it gracefully — missing repos produce warnings, not errors. Edit `adev-workspace.yaml` to update paths or remove entries when things change.

**Q: Can I have a workspace without any repos listed?**
Yes. You can scaffold with `repos: []` and add them later. Useful for bootstrapping a new platform before any repos exist.

## Reference

See the [Multi-Repo Workspace charter](../.context-index/specs/features/multi-repo-workspace/charter.md) for the full specification of capabilities, domain model, and quality attributes.
