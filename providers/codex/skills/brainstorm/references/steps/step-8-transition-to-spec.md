## Step 8: Transition to Specification

Once approved, transition to Live Spec authoring. Before listing capabilities,
render a **Spec Organization Plan** so the downstream `/adev:specify` calls have
a deterministic starting grouping. The plan is advisory — the user may always
override it.

### 8.1 Charter-size routing

Count the **must-have** capabilities from the approved charter and route:

- **0 must-have capabilities** — skip the grouping plan entirely. Render only:
  > No must-have capabilities yet — extend the charter or proceed to `/adev:specify` directly.
- **exactly 1 must-have capability** — skip the grouping table. Render the
  single-capability prompt below (preserved from the prior Step 8 wording).
- **≥2 and ≤12 must-have capabilities** — render the full Spec Organization
  Plan (grouping table + optional ASCII dependency graph).
- **>12 must-have capabilities** — render the table for the top 12 by
  Priority/Milestone and append the note:
  > Charter has N capabilities; grouping shown for top 12. Consider splitting the charter.

### 8.2 Grouping heuristics (inline definitions)

Each row of the grouping table cites exactly **one** of these three named
heuristics. Their definitions are pinned here verbatim so the rendering stays
reproducible across model runs:

- **cohesion** — capabilities sharing an invariant (e.g., a multi-file
  version-parity rule) belong together.
- **dependency-chain** — capability X consumes capability Y → both in one spec
  unless Y is reused by other specs.
- **blast-radius** — capabilities that touch the same module/file cluster
  belong together; capabilities that touch independent surfaces should split.

**Heuristic conflict rule.** When two heuristics disagree on the same
capability pair, prefer the more conservative grouping (separate specs) and
emit a note such as:

> ambiguous: `<cap-1>` and `<cap-2>` — cohesion suggests together, blast-radius suggests apart.

### 8.3 Capability grouping table

Render the table:

```
| Spec | Capabilities | Rationale |
|---|---|---|
| <spec-slug> | <cap-1>, <cap-2> | <one of: cohesion / dependency-chain / blast-radius> reason |
```

Every rationale cell MUST cite exactly one of the three heuristic names above.
If a row touches multiple heuristics, pick the dominant one and note the
runner-up in prose ("also: <name>") rather than listing two names.

### 8.4 ASCII dependency graph (conditional)

When two or more grouped specs have ordering dependencies, render an inline
ASCII diagram immediately after the table:

```
spec-A  ┐
        ├─→ spec-B ─→ spec-C
spec-D ─┘
```

When all grouped specs are independent, **omit the graph entirely** — do not
render an empty diagram or a placeholder.

### 8.5 Retained capability list and dual-path handoff

After the Spec Organization Plan, retain the existing top-priority capability
list and offer the user two paths:

> The charter for **<module>** is complete. The next step is to create Live Specs.
>
> Top-priority capabilities from the charter:
> 1. [capability-1] (must-have)
> 2. [capability-2] (must-have)
> 3. [capability-3] (should-have)
>
> Two paths:
>
> - **Specify one group** — invoke `/adev:specify` to write one spec covering N
>   capabilities, using the proposed grouping.
> - **Specify one capability** — invoke `/adev:specify` for a single capability,
>   overriding the grouping for that one spec.

### 8.6 Override stickiness

When the user picks **Specify one capability** (overriding the group), do not re-render the grouping table on subsequent turns of the same session. The override is a per-session decision; treat the remaining capabilities as a flat backlog from that point on.

### 8.7 No new files

Step 8 is a chat-only enrichment. **No new files are written by Step 8.**
Output is durable only via the user's subsequent `/adev:specify` calls; the
charter is not edited here.

**The terminal state is invoking `/adev:specify`.** Do NOT invoke `/adev:plan`, `/adev:implement`, or any other implementation skill.

---
