# Live Spec: API Eval Project

<!-- Live Spec within the eval-projects charter.
     TypeScript/Node.js bookstore REST API with Docker+Postgres.
     Parent Charter: .context-index/specs/features/eval-projects/charter.md -->

---
charter: eval-projects
status: validated
risk_level: low
milestone:
revision: 1
charter-revision: 1
created: 2026-05-06
updated: 2026-05-06
infra_requirements:
  systems:
    - name: "PostgreSQL (via Docker Compose)"
      env_vars: [DATABASE_URL]
      cli_tools:
        - name: docker
          version: ">=24"
      probe: "docker compose ps --format json"
      notes: "Docker Compose spins up Postgres. No external DB required."
  ci_tag: "integration"
source-manifest:
  sha: "af2d8a6"
  files:
    - tests/evals/adev-api-eval/.gitignore
    - tests/evals/adev-api-eval/LICENSE
    - tests/evals/adev-api-eval/README.md
    - tests/evals/adev-api-eval/docker-compose.yml
    - tests/evals/adev-api-eval/migrations/001_create_tables.sql
    - tests/evals/adev-api-eval/migrations/002_seed_data.sql
    - tests/evals/adev-api-eval/package.json
    - tests/evals/adev-api-eval/src/db.ts
    - tests/evals/adev-api-eval/src/index.ts
    - tests/evals/adev-api-eval/src/middleware/error-handler.ts
    - tests/evals/adev-api-eval/src/migrate.ts
    - tests/evals/adev-api-eval/src/routes/authors.ts
    - tests/evals/adev-api-eval/src/routes/books.ts
    - tests/evals/adev-api-eval/src/routes/reviews.ts
    - tests/evals/adev-api-eval/tests/authors.test.ts
    - tests/evals/adev-api-eval/tests/books.test.ts
    - tests/evals/adev-api-eval/tests/reviews.test.ts
    - tests/evals/adev-api-eval/tsconfig.json
    - tests/evals/web-api/rubrics/.gitkeep
    - tests/evals/web-api/scenarios/.gitkeep
  computed-at: "2026-05-11T16:09:58.783Z"
---

## Behavioral Contract

A self-contained TypeScript/Node.js project (`adev-api-eval`) implementing a bookstore REST API with Express and PostgreSQL. Supports CRUD for books, authors, and reviews, with a computed average rating endpoint. Docker Compose provides Postgres — the only infrastructure dependency.

### Preconditions

- Node.js 20+ is installed
- Docker and Docker Compose are available
- `npm install` has been run
- `docker compose up -d` has been run (starts Postgres)
- `npm run db:migrate` has been run (creates tables and seeds data)
- Shared conventions from `shared-conventions.spec.md` are satisfied

### Behaviors

1. **When** `docker compose up -d && npm run db:migrate && npm start` is executed **then** the API starts on port 3000 and responds to `GET /health` with `{ "status": "ok" }`.

2. **When** `GET /api/books` is called **then** it returns a JSON array of all books with fields: id, title, author_id, published_year, isbn.

3. **When** `GET /api/books/:id` is called with a valid book ID **then** it returns the book object with an additional `reviews` array and `average_rating` field.

4. **When** `POST /api/books` is called with valid body (title, author_id, published_year, isbn) **then** it creates and returns the book with status 201.

5. **When** `GET /api/authors` is called **then** it returns all authors with fields: id, name, bio, book_count.

6. **When** `POST /api/reviews` is called with valid body (book_id, reviewer_name, rating 1-5, comment) **then** it creates the review with status 201 and the book's average_rating updates on next fetch.

7. **When** `GET /api/books/:id` is called for a book with fewer than 5 reviews **then** the planted bug causes `average_rating` to be 0 instead of the correct average due to integer division truncation.

8. **When** `npm test` is run **then** all unit tests pass. Tests cover route handlers with mocked DB, not actual rating computation against Postgres.

### Planted Bug

The `GET /api/books/:id` endpoint computes `average_rating` using SQL `SUM(rating) / COUNT(*)` without casting to float. In Postgres, integer division truncates: for a book with ratings [4, 3] the sum is 7, count is 2, result is `3` (correct by coincidence). But for a book with ratings [4] the sum is 4, count is 1, result is `4` (correct). The bug manifests when ratings sum to less than count × minimum — e.g., a single rating of 3 with count 1 returns `3` (correct), but a book with [1, 2] returns `1` instead of `1.5` → displayed as `1`. The seed data is crafted so one book has ratings [2, 3] producing `2` instead of `2.5`.

**Symptom:** One book's average rating is lower than the minimum individual review rating for that book. Comparing the API response with manual calculation reveals the truncation.

**Root cause:** `src/routes/books.ts`, line ~45, SQL query uses `SUM(rating) / COUNT(*)` instead of `AVG(rating)` or `SUM(rating)::float / COUNT(*)`.

**Discovery path:** Fetch book details for all books, compare `average_rating` with manual computation from the `reviews` array. One book's average is truncated.

### Postconditions

- API serves all endpoints correctly (except the planted bug)
- Postgres contains seed data: 5 authors, 12 books, 20 reviews
- All unit tests pass on both branches
- Docker Compose starts and stops cleanly

### Error Cases

| Condition | Expected Behavior | HTTP Status |
|-----------|-------------------|-------------|
| `GET /api/books/:id` with non-existent ID | `{ "error": "Book not found" }` | 404 |
| `POST /api/books` with missing required field | `{ "error": "title is required" }` | 400 |
| `POST /api/reviews` with rating outside 1-5 | `{ "error": "rating must be between 1 and 5" }` | 400 |
| `POST /api/books` with duplicate ISBN | `{ "error": "ISBN already exists" }` | 409 |
| Database connection refused | `{ "error": "Service unavailable" }` | 503 |

## Project Structure

```
adev-api-eval/
├── src/
│   ├── index.ts              # Express app setup, port binding
│   ├── db.ts                 # Postgres connection pool (pg)
│   ├── routes/
│   │   ├── books.ts          # CRUD + average_rating (contains planted bug)
│   │   ├── authors.ts        # CRUD with book_count
│   │   └── reviews.ts        # Create review
│   └── middleware/
│       └── error-handler.ts  # Centralized error responses
├── migrations/
│   ├── 001_create_tables.sql
│   └── 002_seed_data.sql     # 5 authors, 12 books, 20 reviews
├── tests/
│   ├── books.test.ts
│   ├── authors.test.ts
│   └── reviews.test.ts
├── docker-compose.yml        # Postgres 16 only
├── package.json              # type: module, ESM
├── tsconfig.json
├── README.md
└── LICENSE
```

## System Constitution Reference

- **"Pure ESM"** — Project uses `"type": "module"` in package.json, all TypeScript compiles to ESM.
- **"Minimize external dependencies"** — Dependencies: `express`, `pg`, `typescript` (dev). Minimal for a real API project.
- **"Skills are primarily markdown"** — `with-context` branch is pure markdown/YAML.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Create repo and Docker Compose | Initialize `adev-api-eval`, set up `docker-compose.yml` with Postgres 16 | small |
| Implement database layer | Connection pool, migration runner | small |
| Write migrations and seed data | Tables for books, authors, reviews; seed 5 authors, 12 books, 20 reviews | medium |
| Implement books routes | CRUD + average_rating with planted bug | medium |
| Implement authors routes | CRUD with book_count | small |
| Implement reviews routes | Create review with validation | small |
| Implement error handler middleware | Centralized error responses | small |
| Write unit tests | Route handler tests with mocked DB | medium |
| Verify end-to-end | Inside `tests/evals/adev-api-eval/`: run `docker compose up -d && npm install && npm run db:migrate && npm start`, verify `GET /health` returns 200, verify CRUD endpoints, then `docker compose down` | medium |
| Verify planted bug | Fetch all books with reviews, compare `average_rating` with manual computation from `reviews` array — confirm at least one book has truncated average | small |
| Verify unit tests | Run `npm test` inside the project — all tests must pass despite the planted bug | small |
| Create `with-context` branch | Branch off main, populate `.context-index/` | medium |
| Write README | Follow shared conventions template with 5 TODO features | small |
| Register submodule | Add to adev-plugin at `tests/evals/adev-api-eval/` | small |

## TODO Features (for README)

1. **Pagination for book listing** (simple) — Add limit/offset query params to `GET /api/books`. Exercises: specify, implement.
2. **Author search by name** (simple) — Add `GET /api/authors/search?q=<name>` with ILIKE matching. Exercises: specify, implement, validate.
3. **Book categories/genres** (medium) — Add genres table, many-to-many with books, filter endpoint. Exercises: brainstorm, specify, plan, implement.
4. **Review moderation system** (complex) — Add status field (pending/approved/rejected), admin endpoint to moderate, only approved reviews count toward average. Exercises: brainstorm, specify, plan, implement, validate.
5. **Reading lists** (medium) — Users can create named lists of books, add/remove books, share via public URL. Exercises: brainstorm, specify, implement, validate.

## Acceptance Criteria

- [ ] Repo exists as `adev-api-eval` with `main` and `with-context` branches
- [ ] `docker compose up -d && npm run db:migrate && npm start` starts the API
- [ ] All CRUD endpoints work correctly (except planted bug on average_rating)
- [ ] Planted bug is present: integer division truncates average_rating for specific books
- [ ] All unit tests pass (`npm test`)
- [ ] Planted bug is NOT detectable by unit tests (they mock the DB)
- [ ] `with-context` branch has valid `.context-index/` with extracted spec
- [ ] README follows shared conventions (6 sections in order, 5 TODO features)
- [ ] Registered as submodule at `tests/evals/adev-api-eval/`
- [ ] Eval harness scaffold exists at `tests/evals/web-api/scenarios/` and `rubrics/`
- [ ] ESM throughout (`"type": "module"`)
- [ ] All quality gates pass
- [ ] No constitutional violations introduced
