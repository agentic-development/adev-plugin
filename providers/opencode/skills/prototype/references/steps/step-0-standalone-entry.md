### Step 0: Standalone Entry

This step runs only when `/adev:prototype` is invoked directly (not dispatched from `/adev:brainstorm`). When brainstorm context is provided, skip to Step 1.

#### 0a. Module Resolution

**When `--module` is provided:**

Validate the module name via the CLI:

```bash
adev prototype validate-module-name --module <module>
```

Stdout is the literal string `true` (valid kebab-case, ≤ 64 chars) or `false`. Exit 0 always.

If stdout is `false`: error and stop.

> Invalid module name: `<value>`. Must be kebab-case (lowercase letters, numbers, hyphens). Error code: `INVALID_MODULE_NAME`.

If stdout is `true`: locate the charter at `.context-index/specs/features/<module>/charter.md`. If the charter file does not exist:

> No charter found at `.context-index/specs/features/<module>/charter.md`. Error code: `CHARTER_NOT_FOUND`.

**When `--module` is NOT provided:**

Discover available charters via the CLI:

```bash
adev prototype discover-charters
```

Stdout is a single JSON array of `{module, title, path}` objects — one per charter found under `.context-index/specs/features/`. Handle the result based on the number of charters found:

- **Zero charters:** Error and stop. Error code: `NO_CHARTERS`.
  > No charters found under `.context-index/specs/features/`. Run `/adev:brainstorm` first to create a charter.

- **One charter:** Auto-select with confirmation:
  > Using charter: `<module>` — `<charter title>`. Proceed? (yes / pick a different one)
  
  If the user confirms, use that charter. If they decline, stop (no other charters to pick from).

- **Multiple charters:** List and prompt:
  > Available charters:
  >   1. `<module>` — `<charter title>`
  >   2. `<module>` — `<charter title>`
  > → Which module should this prototype target? (number or name)

#### 0b. Context Construction

Once a module is resolved:

1. Load the charter at `.context-index/specs/features/<module>/charter.md`. Extract approach context from the **Business Intent** and **Capability Map** sections.
2. Load `.context-index/constitution.md` for constraint validation. If missing: error and stop. Error code: `NO_CONSTITUTION`.
   > Constitution not found. Run `/adev:init` to set up the context index.
3. Load `.context-index/platform-context.yaml` for framework defaults. If missing: warn and proceed. Error code: `NO_PLATFORM_CONTEXT`.
   > No platform context found. Framework defaults will not be pre-selected.

#### 0c. Closed Charter Warning

Check the charter's YAML frontmatter for `status: closed`. If closed, warn but do not block:

> Note: The `<module>` charter is closed. You can still prototype against it, but consider whether a new charter is needed.

Proceed to Step 1.
