[adev docs](../README.md) > [Project Types](../project-types.md) > API Service

# API Service

**Repository:** [agentic-development/adev-api-eval](https://github.com/agentic-development/adev-api-eval)
**Fixture path:** `tests/evals/adev-api-eval/`

This example represents a REST API service project. API projects demonstrate how adev handles endpoint-driven development where specs map to routes, request/response contracts, and integration tests.

## How `/adev:init` Detects This Project Type

For an API service, `/adev:init` typically finds:

- `package.json` with server framework dependencies (Express, Fastify, Hono)
- Route handler files under `src/routes/` or `src/api/`
- Middleware files for authentication, validation, error handling
- OpenAPI or schema definition files

## Constitution

An API service constitution focuses on HTTP contract discipline and security:

```markdown
## Identity

RESTful API service providing e-commerce backend functionality
with authentication, order management, and payment processing.

## Non-Negotiable Principles

1. **Contract-first development** — API endpoints match OpenAPI schemas.
   Schema changes require spec updates before implementation.
2. **Authentication on every route** — no public endpoints except health
   checks and documentation. Middleware enforces auth by default.
3. **Consistent error responses** — all errors return structured JSON with
   `code`, `message`, and `details`. No raw stack traces in production.
4. **Idempotent mutations** — PUT and DELETE operations produce the same
   result regardless of how many times they are called.
```

## Manifest

```yaml
project:
  name: "ecommerce-api"
  type: api-service

gates:
  test: "npm test"
  lint: "npm run lint"

modules:
  - slug: auth
    name: Authentication
    paths:
      - src/routes/auth/
      - src/middleware/auth/
  - slug: orders
    name: Order Management
    paths:
      - src/routes/orders/
  - slug: payments
    name: Payments
    paths:
      - src/routes/payments/
```

## Charter Example

```markdown
# Feature Charter: Order Search API

## Business Intent
Add search and filtering to the orders endpoint, supporting
date ranges, status filters, and customer lookups.

## Capability Map
| Capability              | Priority  | Status  |
|------------------------|-----------|---------|
| GET /orders with filters| must-have | pending |
| Pagination support      | must-have | pending |
| Full-text search        | should-have | pending |
```

## Spec Example

API specs focus on HTTP contracts — methods, status codes, and response shapes:

```markdown
## Behavioral Contract

### Behaviors
1. **When** GET /orders?status=pending is called with valid auth
   **then** it returns 200 with an array of orders filtered to
   pending status.
2. **When** GET /orders is called without auth **then** it returns
   401 with error code `UNAUTHORIZED`.
3. **When** GET /orders?page=2&limit=10 is called **then** it
   returns the second page of 10 results with pagination metadata.

### Postconditions
- Response Content-Type is application/json
- Pagination metadata includes `total`, `page`, `limit`, `pages`
```

## How Skills Adapt

For API projects, adev skills adjust their behavior:

- **Test strategies** use HTTP request testing (supertest, fetch) instead of unit tests
- **Specs** focus on request/response contracts and status codes
- **Validation** checks endpoint accessibility and response schemas
- **Debug** examines middleware chains and request lifecycles

---

[Back to Project Types](../project-types.md)
