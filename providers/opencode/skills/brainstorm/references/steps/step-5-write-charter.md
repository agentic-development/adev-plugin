## Step 5: Write Charter

Generate the charter file using the kind-resolved template from `resolveTemplate('charter', kind, domain)`. **Do not hardcode a template filename.** Use the kind value resolved in Step 2.1 and the active domain from `resolveDomain(...)` (loaded in Step 1):

```javascript
import { resolveTemplate } from '<ADEV_ROOT>/lib/template-resolution.mjs';
import { readFileSync } from 'node:fs';

const templatePath = await resolveTemplate('charter', kind, domain.resolved_domain ?? null);
const templateBody = readFileSync(templatePath, 'utf8');
```

**Error handling:**
- If `resolveTemplate` throws `TEMPLATE_NOT_FOUND`: fail with a diagnostic listing the attempted paths (the error's `attempted` array). Suggest checking that the bundled `templates/charter-template.<kind>.md` exists or that the domain extension provides the matching override.
- If `resolveTemplate` throws `UNSAFE_TEMPLATE_PATH`: fail with the offending path (the error's `offendingPath` field). Report verbatim — do not silently fall back.
- If `resolveTemplate` throws `INVALID_KIND` or `INVALID_LAYER`: re-run Step 2.1 (kind resolution); this indicates the kind value was corrupted between resolution and write.

**File path policy (branch on kind):**

- `kind: feature`, `kind: module`, `kind: initiative` → save to `.context-index/specs/features/<module>/charter.md` (lowercase, hyphenated slug).
- `kind: cross-cutting` → save to `.context-index/specs/cross-cutting/<module>/charter.md`. This is a **different parent directory** by design — cross-cutting charters describe concerns that span multiple modules and live alongside other cross-cutting artifacts.

**Cross-cutting directory bootstrap.** When `kind: cross-cutting` and the parent `.context-index/specs/cross-cutting/` directory does not yet exist on disk, prompt the user before creating it:

> The directory `.context-index/specs/cross-cutting/` does not exist yet. This will establish the conventional location for cross-cutting charters in this project. Create it now? (yes / no)

If the user declines, halt and ask whether to abandon the charter or re-select the kind. Do not silently create the directory.

**Manifest cross-reference warning (kind: module).** When `kind: module`, cross-reference the user-supplied module slug against `manifest.yaml:modules[]`. If no entry matches the slug, emit a non-blocking warning and proceed:

> Module charters typically correspond to a manifest entry. Add to manifest.yaml after this charter lands.

The warning is informational; it does NOT block charter creation. Do not auto-update `manifest.yaml` — that is the user's decision.

**Before writing:** Create the destination directory if needed (subject to the cross-cutting prompt above). If charter exists (`--module`), read and merge rather than overwrite.

**Writing:** Fill all sections from Step 4 using the section structure of the resolved template, replace placeholders, remove HTML comments, no TODOs/TBDs.

**Lifecycle frontmatter:** Set the following fields in the charter's YAML frontmatter:
- `kind: <chosen value>` — **explicit, no defaulting on write.** Write the value resolved in Step 2.1 verbatim. Charters authored after Layer 1 of the lifecycle-artifacts taxonomy must carry an explicit `kind:` field; read-time defaulting to `feature` applies only to legacy charters.
- `status: draft`
- `revision: 1`
- `updated: <today's date YYYY-MM-DD>`

**Capability Map Status column:** The Capability Map table must include a `Status` column. Initialize every capability's Status to `—` (em dash). This column is updated by downstream skills as capabilities progress through the lifecycle.

**After writing:**
- Commit with message: `feat: add <module> feature charter`
- Suggest branch name: `feat/<module>/<short-description>`
- Then proceed to **Step 5b** below before starting the review loop.
