# CLAUDE.md

## Identity

REST API serving analytics metrics from dbt-produced tables to downstream consumers.

## Non-Negotiable Principles

1. All endpoints have tests
2. No direct DB writes
3. Error responses follow standard shape
4. Authentication on all routes
5. Input validation at the boundary

## Quality Gates

```bash
npm test
npm run lint
```

See `.context-index/constitution.md` for the full constitution.
