# Check 10: Platform Drift

Compare `.context-index/platform-context.yaml` tech stack declarations against `package.json` dependencies. Catches cases where the declared stack no longer matches what is actually installed.

**If `platform-context.yaml` does not exist:** SKIP (no platform context configured).
**If `package.json` does not exist:** SKIP (not a Node.js project; platform drift check is not applicable).

**Mapping rules:**

For each field in `platform-context.yaml`, check the corresponding package in `package.json` (dependencies + devDependencies):

| platform-context field | Expected package(s) | Example |
|----------------------|---------------------|---------|
| `framework` | Framework package present (`next`, `nuxt`, `astro`, `svelte`, etc.) | `framework: nextjs` → `next` in dependencies |
| `version` | Framework package version satisfies declared version | `version: "16"` → `next` version starts with `16.x` |
| `language` | If `typescript`, `typescript` in devDependencies | `language: typescript` → `typescript` present |
| `orm` | ORM package present (`prisma`, `drizzle-orm`, `typeorm`, `@mikro-orm/core`, etc.) | `orm: prisma` → `prisma` or `@prisma/client` present |
| `auth` | Auth package present (`@clerk/nextjs`, `next-auth`, `@auth0/nextjs-auth0`, etc.) | `auth: clerk` → `@clerk/nextjs` present |
| `database` | DB driver or client present if applicable | `database: postgresql` → pg-related package or ORM handles it |
| `testing` | Test framework present | `testing: vitest` → `vitest` in devDependencies |

**Unknown fields or values:** If a `platform-context.yaml` field has a value the mapping does not recognize, log it as INFO (not a failure). The mapping is best-effort.

**Version check:** Only performed for `framework` + `version`. Uses semver-compatible prefix matching (e.g., declared `"16"` matches installed `16.1.2`). If the major version does not match, flag as FAIL.

Record per field: PASS (matches), FAIL (mismatch with details), WARN (could not verify), or SKIP (field not declared).
