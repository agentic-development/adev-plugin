# Constitution: data-api

## Identity

REST API serving analytics metrics from dbt-produced tables to downstream consumers.

## Non-Negotiable Principles

1. **All endpoints have tests** — unit tests for route logic, integration tests for DB-backed responses.
2. **No direct DB writes** — API is read-only against analytics tables.
3. **Error responses follow a standard shape** — `{ error: { code, message } }`.
4. **Authentication on all routes** — no unauthenticated endpoints except `/health`.
5. **Input validation at the boundary** — all query params and path segments validated before hitting the DB.

## Coding Standards

### Language and Runtime
- JavaScript (ESM), Node.js, npm

### Conventions
- camelCase for functions/variables, kebab-case for files
- Route handlers in `src/routes/<resource>.js`
- Shared middleware in `src/middleware/`
- Database access through a thin query layer in `src/db/`

### Patterns
- Async/await over callbacks
- Thin route handlers — business logic in services
- No silent catches — errors either propagate or are explicitly handled

## Architecture Boundaries

### Requires Human Approval
- Adding new endpoints to public API surface
- Changing authentication flow
- Adding new external service dependencies
- Modifying response schemas for existing endpoints

### Autonomous
- Adding tests
- Refactoring within a module
- Fixing bugs in existing handlers
- Updating input validation
- Improving error messages

## Quality Gates

```bash
npm test
npm run lint
```
