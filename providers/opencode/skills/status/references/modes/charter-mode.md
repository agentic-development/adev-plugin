### Mode: `--charter <name>`

1. Find the charter file by name under `.context-index/specs/features/` or `.context-index/specs/cross-cutting/`
2. Read charter frontmatter and extract:
   - `status` (draft, active, completed, archived)
   - `revision` (current revision number)
   - `updated` (last update date)
3. Read the Capability Map table from the charter body
4. Parse the Status column for each capability and compute progress:
   - Count capabilities by status: not-started, specified, implemented, validated
   - Report summary: "5/10 implemented, 2 validated, 3 not started"
5. Find all specs that belong to this charter (specs whose frontmatter references this charter)
6. For each spec, read its `status` and `revision`

**Output format:**

```
Charter: <name>
Status: <status>
Revision: <revision>
Updated: <date>

Capability Progress: <implemented>/<total> implemented, <validated> validated, <not-started> not started
  - <capability-name>: <status>
  - <capability-name>: <status>
  ...

Specs (<N total>):
  - <spec-path>: <status> (rev <revision>)
  - <spec-path>: <status> (rev <revision>)
  ...
```
