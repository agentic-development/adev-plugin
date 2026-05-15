---
id: template-resolution-6280563d
scope: lifecycle-artifacts
title: First-run PASS: Template Resolution
pattern: First-run PASS for Template Resolution: implementation matched all acceptance criteria without revision. Path-containment via fs.realpathSync + trailing-slash safety in startsWith comparison defeats symlink-escape and sibling-prefix overlap attacks (tplres-templates-evil vs templates).
confidence: medium
evidence:
  - path: .context-index/specs/features/lifecycle-artifacts/template-resolution.validate.md
    date: 2026-05-14
    source: validation
contradicted-by: []
created: 2026-05-15
updated: 2026-05-15
---

---
id: smoke-validation-366ef92a
scope: lifecycle-artifacts
title: First-run PASS: Smoke Validation
pattern: First-run PASS for Smoke Validation: action-kind procedure spec verified all postconditions end-to-end (kind coverage, template usability, hygiene cleanliness, skill routing) without revision — pattern: postcondition-first action specs are reliably validated by reading actual artifacts (specs/charters/ADRs/manifest) rather than relying on plan-checkbox metadata.
confidence: medium
evidence:
  - path: .context-index/specs/features/lifecycle-artifacts/smoke-validation.validate.md
    date: 2026-05-14
    source: validation
contradicted-by: []
created: 2026-05-15
updated: 2026-05-15
---
