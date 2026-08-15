---
id: data-engineering-extension-53c77d9c
scope: domain-extensions
title: First-run PASS: Data Engineering Extension
pattern: When restructuring bundled content into installable extensions, preserve domain config files by copying into extensions/<name>/domain/ before removing the templates/domains/<name>/ source; integration tests must exercise installExtension end-to-end and call loadDomainConfig to confirm resolution returns the domain-specific reviewer (not the software default).
confidence: medium
evidence:
  - path: .context-index/specs/features/domain-extensions/data-engineering-extension.validate.md
    date: 2026-05-11
    source: validation
contradicted-by: []
created: 2026-05-11
updated: 2026-05-11
---

---
id: process-automation-extension-9acaf0eb
scope: domain-extensions
title: First-run PASS: Process Automation Extension
pattern: A second domain-extension package (process-automation) validated cleanly using the same structural pattern as data-engineering: extensions/<name>/{adev-extension.yaml, domain/, README.md}, install via local path, verify loadDomainConfig returns the domain-specific reviewer.
confidence: medium
evidence:
  - path: .context-index/specs/features/domain-extensions/process-automation-extension.validate.md
    date: 2026-05-11
    source: validation
contradicted-by: []
created: 2026-05-11
updated: 2026-05-11
---
