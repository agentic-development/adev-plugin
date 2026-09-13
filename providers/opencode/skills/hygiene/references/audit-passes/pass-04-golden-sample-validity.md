## Audit Pass 4: Golden Sample Validity

**Goal:** Verify that golden samples still compile, pass tests, and match current coding standards.

**Steps:**

1. List all sample files in `.context-index/samples/`.
2. If the directory is empty, flag as NO_SAMPLES and suggest creating reference implementations.
3. For each sample:
   - Check that the code syntax is valid for the project's language (run the type checker or compiler on the sample if possible).
   - Compare the sample's patterns against the constitution's Coding Standards section.
   - Flag samples that use deprecated patterns, old naming conventions, or outdated APIs.
   - Check the sample's last modification date. Flag samples older than 90 days as POTENTIALLY_STALE.

**Output format:**
```
## Golden Sample Validity

Total samples: 2
Valid: 1
Issues: 1

- [x] component-sample.md — patterns match constitution, last updated 15 days ago
- [ ] service-sample.md — STALE_PATTERN: uses callback style, constitution requires async/await

**Actions:**
- [ ] Update service-sample.md to use async/await pattern
```
