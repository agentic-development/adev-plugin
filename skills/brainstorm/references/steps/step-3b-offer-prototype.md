## Step 3b: Offer Prototype

After the user selects an approach, offer the option to prototype before proceeding to detailed design:

> Would you like to prototype the selected approach before proceeding to detailed design? This lets you see a working sketch before committing to charter sections. (yes / no)

If the user declines, proceed to Step 4.

If the user opts in, dispatch `/adev:prototype` with the following structured context:

```
BRAINSTORM_CONTEXT:
  module: <module-slug>
  approach_summary: <selected approach description from Step 3>
  platform_context: <parsed contents of platform-context.yaml>
  constitution_constraints: <relevant constitutional principles identified during brainstorm, or []>
```

Where:
- `module` (string, required) — the charter module slug (kebab-case, matches directory name under `specs/features/`)
- `approach_summary` (string, required) — the full description of the approach the user selected in Step 3
- `platform_context` (object, required) — the parsed contents of `platform-context.yaml` (the actual object, not a file path or raw YAML string)
- `constitution_constraints` (array of strings, optional, defaults to `[]`) — any constitutional principles that were flagged during the brainstorm clarification phase as relevant constraints for this feature

When brainstorm context is provided, prototype skips its own charter lookup and proceeds directly to tier selection.

**Handling the prototype return result:**

After `/adev:prototype` completes, it returns a `PROTOTYPE_RESULT` with:
- `status`: `"completed"` or `"discarded"`
- `tier`: the prototype tier used (`"wireframe"`, `"mockup"`, or `"functional"`)
- `visual_references`: array of `{ path, description }` for any captured images
- `heuristics_saved`: count of design decisions saved as heuristics
- `persistence`: `"project"` (files kept) or `"ephemeral"` (temp files removed)

Present a summary of the prototype session to the user:

> **Prototype session complete.**
> - Status: `<status>`
> - Tier: `<tier>`
> - Visual references: `<count>` captured
> - Heuristics saved: `<count>`
> - Persistence: `<persistence>`

Then continue to Step 4 (Present Design Sections) with the enriched context from prototyping. The prototype experience should inform the design sections — for example, visual references can guide Quality Attributes, and design decisions captured as heuristics can refine the Domain Model or Capability Map.
