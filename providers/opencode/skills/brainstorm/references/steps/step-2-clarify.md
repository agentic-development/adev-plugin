## Step 2: Clarify

Ask questions one at a time. Prefer multiple-choice when possible. Do not ask more than one question per message.

**Assessment before questions:** If the idea spans multiple independent subsystems, flag immediately and help decompose into separate modules. Proceed with one at a time.

### Step 2.1: Resolve Charter Kind

Determine the charter `kind:` before approach selection. The kind shapes which subsequent clarifying questions get asked — for example, a `kind: cross-cutting` charter does not need Domain Model questions, and a `kind: module` charter cross-references `manifest.yaml`. The resolved kind is also passed to `resolveTemplate('charter', kind, domain)` in Step 5 to pick the correct charter template.

**If `--kind <value>` was supplied on invocation:**

```javascript
import { isValidKind } from '<ADEV_ROOT>/lib/kinds.mjs';

if (!isValidKind('charter', kind)) {
  // Reject with the closed-enumeration list and stop.
  // Message must list the 4 valid kinds so the user can correct their invocation:
  //   "Invalid --kind 'xxx'. Valid options: module, feature, cross-cutting, initiative."
}
```

If `isValidKind('charter', kind)` returns `false`, reject the invocation with a message naming the 4 valid options and halt. Do not proceed to charter authoring.

**If `--kind` was NOT supplied:** present the ask-first menu and have the user pick:

```
What kind of charter is this?

  1. feature (default) — discrete capability with full domain model
  2. module — lifecycle-slot module registered in manifest.yaml (skill registry shape)
  3. cross-cutting — concern affecting multiple modules (lives in specs/cross-cutting/)
  4. initiative — time-bounded effort (migration, theme, release-bound work)

→ Pick a number or name (default: feature)
```

**Strict-on-write semantics.** The kind axis is required at write time. If the user presses enter without picking a value, re-prompt with:

```
Kind is required for new charters. Pick a number or name.
```

Continue re-prompting until a valid kind is supplied. **No defaulting on write** — there is no silent defaulting at write time; the chosen value is written verbatim to frontmatter. (Read-time defaulting to `feature` applies only to legacy charters authored before this taxonomy landed; new charters must carry an explicit `kind:`.)

**Kind-aware question routing.** Once the kind is resolved, adapt the rest of Step 2's clarifying questions accordingly:

- `kind: feature` — full domain model: Business Intent, Scope, Domain Model, Capability Map, Interfaces, Quality Attributes
- `kind: module` — lifecycle-slot shape: Identity, Scope, Slots/Hooks, Configuration (no Domain Model). Validate the user-supplied module slug against `manifest.yaml:modules[]` — see Step 5 for the manifest cross-reference warning
- `kind: cross-cutting` — concern shape: Business Intent, Affected Modules, Cross-Cutting Behavior, Constraints (no Domain Model, no Capability Map — the charter template's H2 section list determines the actual section structure)
- `kind: initiative` — time-bounded effort: Objective, Phases/Milestones, Success Criteria, Exit Conditions

The exact section names always come from the resolved charter template (loaded in Step 5 via `resolveTemplate('charter', kind, domain)`). Use the template's H2 headings as the source of truth — do not invent section names.

After resolution, the `kind` variable is available for Step 5's `resolveTemplate('charter', kind, domain)` call and for the path-policy branch (cross-cutting save-path).

### Step 2.2: Other Clarifying Questions

**Questions to answer (adapt to the idea, not mechanical):**
Ask questions to fill each section defined in the loaded domain template. Map each question to the corresponding H2 section in the template. For the default software domain, this typically covers Business Intent, Scope and Boundaries, Domain Model, Capability Map, Interface Contracts, and Quality Attributes -- but always use the template's actual section names rather than hardcoded defaults.
- (Optional) Is there an external tracker reference for this feature? If so, record it as `tracker-ref` in the charter frontmatter (e.g., `tracker-ref: JIRA-1234`).

**Constitution check during clarification:**
As the user describes the feature, check each answer against:
- **Non-Negotiable Principles** in the constitution. If the idea conflicts, raise it immediately: "This conflicts with principle N in the constitution: [quote]. Should we adjust the approach or update the principle?"
- **Architecture Boundaries** in the constitution. If the idea crosses a boundary, raise it: "The constitution says [boundary]. This feature would require [violation]. Do you want to proceed with an exception, or adjust the design?"

**Cross-charter conflict check:**
Compare emerging scope against existing charters for:
- Capability overlap: does this module provide something another module already owns?
- Entity duplication: does this module define entities that belong to another module?
- Interface conflicts: does this module expose or consume APIs that contradict existing contracts?

If conflicts are found, present them clearly and ask the user to resolve.

**If `--from-blueprint`:** Skip answered questions, confirm blueprint answers with user.
