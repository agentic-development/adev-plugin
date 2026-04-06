<!-- Research artifact template for /adev:research skill.
     Slug convention: lowercase, hyphenated, max 50 characters derived from topic.
     Example: "Dependency Injection in ESM" -> dependency-injection-in-esm -->
---
topic: "<topic>"
date: "<YYYY-MM-DD>"
relates-to: "<issue-id or leave empty>"
sources:
  - internal
  - web
  - "github:<owner/repo>"
status: draft
---

## Summary

<!-- 2-3 sentence overview of what was researched and the key takeaway. -->

## Findings

### Internal

<!-- Findings from local codebase search (Glob/Grep/Read).
     Include file paths and line references for attribution. -->

### Web

<!-- Findings from web search.
     Include source URLs for attribution. -->

### GitHub

<!-- Findings from GitHub code search.
     Include repository, file path, and permalink for attribution. -->

## Code Examples

<!-- Concrete code snippets discovered during research.
     Each example must include:
     - Source attribution (file path, URL, or repo/path)
     - Brief explanation of what the example demonstrates
     - Any caveats or modifications needed for this project -->

```
// Example: <description>
// Source: <attribution>
```

## Recommendations

<!-- Actionable next steps grounded in the project's constitution and constraints.
     If a recommendation conflicts with a constitutional principle, note the tradeoff.
     Rank recommendations by relevance and feasibility. -->

1. **Recommendation** -- rationale

## References

<!-- Full list of all sources consulted, organized by type. -->

### Internal Files
- `<file-path>` -- <brief description>

### Web Sources
- [<title>](<url>) -- <brief description>

### GitHub Sources
- `<owner/repo>/<file-path>` ([link](<permalink>)) -- <brief description>
