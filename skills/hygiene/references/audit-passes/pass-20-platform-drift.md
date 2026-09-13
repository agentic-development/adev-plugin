## Audit Pass 20: Platform Drift

**Goal:** Compare `.context-index/platform-context.yaml` tech stack declarations against `package.json` dependencies. Catches cases where the declared stack no longer matches what is actually installed. Migrated from `/adev:validate` Check 10 (removed in `check-set-restructure.spec.md`), where the same data is identical for every spec in a run — so it belongs at repo level (here) rather than per spec.

**Pre-condition guards (skip cases):**
- If `.context-index/platform-context.yaml` does not exist: SKIP with INFO "No platform-context.yaml found — platform drift check not applicable."
- If `package.json` does not exist: SKIP with INFO "No package.json found — not a Node.js project, platform drift check not applicable."

**Mapping rules** (same as former Check 10):

For each field in `platform-context.yaml`, check the corresponding package in `package.json` (dependencies + devDependencies):

| platform-context field | Expected package(s) | Example |
|----------------------|---------------------|---------|
| `framework` | Framework package present (`next`, `nuxt`, `astro`, `svelte`, etc.) | `framework: nextjs` → `next` in dependencies |
| `version` | Framework package version satisfies declared version | `version: "16"` → `next` version starts with `16.x` |
| `language` | If `typescript`, `typescript` in devDependencies | `language: typescript` → `typescript` present |
| `orm` | ORM package present (`prisma`, `drizzle-orm`, `typeorm`, etc.) | `orm: prisma` → `prisma` or `@prisma/client` present |
| `auth` | Auth package present (`@clerk/nextjs`, `next-auth`, etc.) | `auth: clerk` → `@clerk/nextjs` present |
| `database` | DB driver or client present if applicable | `database: postgresql` → pg-related package or ORM handles it |
| `testing` | Test framework present | `testing: vitest` → `vitest` in devDependencies |

**Unknown fields or values:** Log as INFO (not a failure) — mapping is best-effort.

**Version check:** Only performed for `framework` + `version`. Uses semver-compatible prefix matching (e.g., declared `"16"` matches installed `16.1.2`). Major version mismatch → WARN.

Record per field: PASS (matches), WARN (mismatch), INFO (could not verify), or SKIP (field not declared).

**Output format:**
```
## Platform Drift

- PASS: All declared platform-context fields confirmed in package.json

— or —

- WARN: N field mismatches detected

| Field | Declared | Installed | Status |
|-------|----------|-----------|--------|
| framework | nextjs | (not found) | WARN |
| version   | 16     | 15.3.1    | WARN |

**Actions:**
- [ ] Update platform-context.yaml to match the installed stack
- [ ] Or install the declared package(s) if the platform-context.yaml is authoritative
```

**Integration with summary table:**
```
| Platform Drift | WARN | 2 field mismatches |
```
