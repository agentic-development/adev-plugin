<!-- DO NOT EDIT statuses inline — see lifecycle log api-eval-project.jsonl -->
# Implementation Plan: API Eval Project

> **Methodology:** adev
> **Charter:** .context-index/specs/features/eval-projects/charter.md
> **Spec:** .context-index/specs/features/eval-projects/api-eval-project.spec.md
> **Review:** PASS (2026-05-06)
> **Platform:** Express + TypeScript, Node.js 20+, PostgreSQL 16 (Docker Compose)

**Goal:** Build a self-contained TypeScript/Node.js bookstore REST API eval project with Docker+Postgres, a planted integer-division bug, mocked unit tests, and adev context branches.

**Architecture:** The project is a standalone Git repo (`adev-api-eval`) registered as a submodule under `tests/evals/`. It uses Express for HTTP routing, `pg` for Postgres connectivity, and Docker Compose for infrastructure. The planted bug uses SQL integer division (`SUM/COUNT`) instead of float-safe averaging. Unit tests mock the DB layer so the bug is invisible to the test suite. A `with-context` branch adds `.context-index/` artifacts for eval runs.

---

## File Structure

**Create:**
- `tests/evals/adev-api-eval/` — project root (registered as submodule)
- `tests/evals/adev-api-eval/package.json` — ESM project config with scripts
- `tests/evals/adev-api-eval/tsconfig.json` — TypeScript configuration
- `tests/evals/adev-api-eval/docker-compose.yml` — Postgres 16 service
- `tests/evals/adev-api-eval/src/index.ts` — Express app setup, port binding, health endpoint
- `tests/evals/adev-api-eval/src/db.ts` — Postgres connection pool
- `tests/evals/adev-api-eval/src/routes/books.ts` — Books CRUD + planted bug
- `tests/evals/adev-api-eval/src/routes/authors.ts` — Authors CRUD with book_count
- `tests/evals/adev-api-eval/src/routes/reviews.ts` — Reviews create endpoint
- `tests/evals/adev-api-eval/src/middleware/error-handler.ts` — Centralized error handler
- `tests/evals/adev-api-eval/migrations/001_create_tables.sql` — Schema DDL
- `tests/evals/adev-api-eval/migrations/002_seed_data.sql` — 5 authors, 12 books, 20 reviews
- `tests/evals/adev-api-eval/tests/books.test.ts` — Book route tests (mocked DB)
- `tests/evals/adev-api-eval/tests/authors.test.ts` — Author route tests (mocked DB)
- `tests/evals/adev-api-eval/tests/reviews.test.ts` — Review route tests (mocked DB)
- `tests/evals/adev-api-eval/README.md` — Shared conventions template (6 sections, 5 TODO features)
- `tests/evals/adev-api-eval/LICENSE` — MIT license
- `tests/evals/web-api/scenarios/.gitkeep` — Eval harness scaffold
- `tests/evals/web-api/rubrics/.gitkeep` — Eval harness scaffold

**Modify:**
- `.gitmodules` — Register `tests/evals/adev-api-eval/` submodule

**Reference (read, do not modify):**
- `.context-index/specs/features/eval-projects/shared-conventions.spec.md` — Structural contract for all eval projects
- `.context-index/specs/features/eval-projects/charter.md` — Capability map and domain model
- `.context-index/samples/general-test-helpers.md` — Test helper patterns (for mocking approach)

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/eval-projects/api-eval-project.spec.md` (Project Structure, Preconditions)
- Charter: `.context-index/specs/features/eval-projects/charter.md` (capability: API Eval Project)
- Shared conventions: `.context-index/specs/features/eval-projects/shared-conventions.spec.md` (Behavior 7-8: README template, Behavior 9: submodule registration)

### Task 2 Context
- Spec: `.context-index/specs/features/eval-projects/api-eval-project.spec.md` (Preconditions: Docker Compose, Postgres)
- Reference: `tests/evals/adev-data-eval/` (existing eval project for directory structure patterns)

### Task 3 Context
- Spec: `.context-index/specs/features/eval-projects/api-eval-project.spec.md` (Behavior 1: health endpoint, Behavior 2-6: CRUD endpoints, Error Cases: 503 DB connection)

### Task 4 Context
- Spec: `.context-index/specs/features/eval-projects/api-eval-project.spec.md` (Postconditions: seed data counts, Planted Bug: ratings [2,3] producing 2)
- Charter: `.context-index/specs/features/eval-projects/charter.md` (invariant: seed data is static)

### Task 5 Context
- Spec: `.context-index/specs/features/eval-projects/api-eval-project.spec.md` (Behaviors 2-4, Error Cases: 404, 400, 409, Planted Bug: SUM/COUNT integer division)

### Task 6 Context
- Spec: `.context-index/specs/features/eval-projects/api-eval-project.spec.md` (Behavior 5: authors with book_count)

### Task 7 Context
- Spec: `.context-index/specs/features/eval-projects/api-eval-project.spec.md` (Behavior 6: create review with validation, Error Cases: rating 1-5)

### Task 8 Context
- Spec: `.context-index/specs/features/eval-projects/api-eval-project.spec.md` (Error Cases: all 5 error conditions)

### Task 9 Context
- Spec: `.context-index/specs/features/eval-projects/api-eval-project.spec.md` (Behavior 8: all unit tests pass, Planted Bug: tests mock DB so bug is invisible)
- Sample: `.context-index/samples/general-test-helpers.md` (mocking patterns)

### Task 10 Context
- Spec: `.context-index/specs/features/eval-projects/api-eval-project.spec.md` (TODO Features section, Acceptance Criteria: README)
- Shared conventions: `.context-index/specs/features/eval-projects/shared-conventions.spec.md` (Behavior 7: README sections, Behavior 8: TODO feature format)

### Task 11 Context
- Spec: `.context-index/specs/features/eval-projects/api-eval-project.spec.md` (Acceptance Criteria: eval harness scaffold, submodule registration)
- Shared conventions: `.context-index/specs/features/eval-projects/shared-conventions.spec.md` (Behavior 9-10: submodule and harness)

### Task 12 Context
- Shared conventions: `.context-index/specs/features/eval-projects/shared-conventions.spec.md` (Behavior 3-4: with-context branch)
- Reference: `tests/evals/adev-data-eval/` (existing eval project for context-index patterns on with-context branch)

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7 → Task 8 → Task 9 → Task 10 (core project build, each step depends on prior structure)
- Group B (after Task 10): Task 11 (submodule registration and eval harness scaffold)
- Group C (after Task 10): Task 12 (with-context branch — requires all source code finalized)

Groups B and C can run in parallel after Group A completes.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Initialize project and package.json | small | unit | — | 3 create |
| 2 | Docker Compose and database layer | small | unit | Task 1 | 3 create |
| 3 | Express app setup and health endpoint | small | unit | Task 2 | 1 create |
| 4 | Migrations and seed data | medium | unit | Task 2 | 2 create |
| 5 | Books routes with planted bug | medium | unit | Task 3, Task 4 | 1 create |
| 6 | Authors routes with book_count | small | unit | Task 3 | 1 create |
| 7 | Reviews routes with validation | small | unit | Task 3 | 1 create |
| 8 | Error handler middleware | small | unit | Task 3 | 1 create, 1 modify |
| 9 | Unit tests with mocked DB | medium | unit | Task 5, Task 6, Task 7, Task 8 | 3 create |
| 10 | README and LICENSE | small | unit | Task 1 | 2 create |
| 11 | Submodule registration and eval harness scaffold | small | unit | Task 10 | 3 create, 1 modify |
| 12 | Create with-context branch | medium | unit | Task 9 | 4 create |

## Test Infrastructure Requirements

> These requirements must be satisfied before integration/infrastructure tests can run.
> Tasks without these prerequisites will produce setup errors, not test failures.
> **Never record actual credential values in plan output or spec files — env var names only.**

### External Systems

| System | Required By | Strategy |
|--------|-------------|----------|
| PostgreSQL (via Docker Compose) | End-to-end verification, seed data verification | integration |

### Credentials / Environment Variables

| Variable | Required For | Where to Get It |
|----------|-------------|-----------------|
| `DATABASE_URL` | Postgres connection | Auto-configured by docker-compose.yml (localhost:5432) |

### Pre-Provisioned State

- [ ] Docker and Docker Compose available on the machine
- [ ] Port 5432 available for Postgres container
- [ ] Port 3000 available for Express API

### CI Configuration

Integration tests (end-to-end verification) require Docker. Unit tests (`npm test`) run with mocked DB and need no infrastructure.

---

### Task 1: Initialize project and package.json [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=4 pattern=4 blast=5 novelty=5
**Rationale:** Well-specified project scaffold with clear structure requirements and strong pattern precedent from adev-data-eval.

**Charter capability:** API Eval Project
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/evals/adev-api-eval/package.json`
- Create: `tests/evals/adev-api-eval/tsconfig.json`
- Create: `tests/evals/adev-api-eval/.gitignore`

**Tests:** `tests/evals/adev-api-eval/tests/books.test.ts` — test file created in Task 9; this foundational task sets up the project structure.

**Context to load:**
- `.context-index/specs/features/eval-projects/api-eval-project.spec.md` (Project Structure)
- `.context-index/specs/features/eval-projects/shared-conventions.spec.md` (branch conventions)

- [x] **Write failing test**

No test for this task — it creates the project scaffold. Verification is structural: `package.json` exists with `"type": "module"`, correct dependencies, and scripts.

- [x] **Implement**

Create `tests/evals/adev-api-eval/` directory. Write `package.json` with:
- `"type": "module"` (ESM)
- Dependencies: `express`, `pg`
- Dev dependencies: `typescript`, `@types/express`, `@types/pg`, `@types/node`
- Scripts: `start`, `build`, `test`, `db:migrate`

Write `tsconfig.json` targeting ES2022, module NodeNext, outDir `dist/`.

Write `.gitignore` with `node_modules/`, `dist/`, `.env`.

- [x] **Verify structure**

Confirm `package.json` has `"type": "module"` and all required scripts.

- [x] **Commit**

Branch: `feat/eval-projects/api-eval-project`

```bash
git add tests/evals/adev-api-eval/package.json tests/evals/adev-api-eval/tsconfig.json tests/evals/adev-api-eval/.gitignore
git commit -m "feat(eval-projects): initialize adev-api-eval project scaffold

Spec: .context-index/specs/features/eval-projects/api-eval-project.spec.md
Plan-task: 1"
```

---

### Task 2: Docker Compose and database layer [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=4 pattern=4 blast=5 novelty=4
**Rationale:** Standard Docker Compose + pg pool setup with explicit spec requirements and existing eval project precedent.

**Charter capability:** API Eval Project
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Create: `tests/evals/adev-api-eval/docker-compose.yml`
- Create: `tests/evals/adev-api-eval/src/db.ts`
- Create: `tests/evals/adev-api-eval/src/migrate.ts`

**Tests:** `tests/evals/adev-api-eval/tests/books.test.ts` — DB layer is tested via mocked pool in Task 9.

**Context to load:**
- `.context-index/specs/features/eval-projects/api-eval-project.spec.md` (Preconditions, Project Structure)

- [x] **Write failing test**

No isolated test — DB layer is verified through route tests in Task 9 and end-to-end verification.

- [x] **Implement**

Write `docker-compose.yml`:
- Postgres 16 image
- Port 5432:5432
- Environment: `POSTGRES_DB=bookstore`, `POSTGRES_USER=postgres`, `POSTGRES_PASSWORD=postgres`
- Volume for data persistence

Write `src/db.ts`:
- Import `pg` Pool
- Create pool from `DATABASE_URL` env var (default: `postgresql://postgres:postgres@localhost:5432/bookstore`)
- Export pool and a `query()` helper

Write `src/migrate.ts`:
- Read SQL files from `migrations/` directory in order
- Execute each against the pool
- Log progress

- [x] **Commit**

```bash
git add tests/evals/adev-api-eval/docker-compose.yml tests/evals/adev-api-eval/src/db.ts tests/evals/adev-api-eval/src/migrate.ts
git commit -m "feat(eval-projects): add Docker Compose and database layer for api-eval

Spec: .context-index/specs/features/eval-projects/api-eval-project.spec.md
Plan-task: 2"
```

---

### Task 3: Express app setup and health endpoint [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=4 pattern=3 blast=5 novelty=5
**Rationale:** Standard Express boilerplate with explicit health endpoint contract; no golden sample but well-known pattern.

**Charter capability:** API Eval Project
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Files:**
- Create: `tests/evals/adev-api-eval/src/index.ts`

**Tests:** `tests/evals/adev-api-eval/tests/books.test.ts` — app is tested through route handler tests in Task 9.

**Context to load:**
- `.context-index/specs/features/eval-projects/api-eval-project.spec.md` (Behavior 1: health endpoint, Error Cases: 503)

- [x] **Write failing test**

No isolated test — health endpoint is verified through end-to-end verification and route tests.

- [x] **Implement**

Write `src/index.ts`:
- Create Express app
- Add JSON body parser middleware
- Mount `GET /health` returning `{ "status": "ok" }`
- Import and mount route modules (books, authors, reviews) at `/api/`
- Import and mount error handler middleware
- Listen on port 3000 (from `PORT` env var)
- Handle DB connection errors → 503

- [x] **Commit**

```bash
git add tests/evals/adev-api-eval/src/index.ts
git commit -m "feat(eval-projects): add Express app setup with health endpoint

Spec: .context-index/specs/features/eval-projects/api-eval-project.spec.md
Plan-task: 3"
```

---

### Task 4: Migrations and seed data [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=4
**Rationale:** Seed data requirements are precisely specified including planted bug trigger data; standard SQL DDL with careful data crafting.

**Charter capability:** API Eval Project
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Files:**
- Create: `tests/evals/adev-api-eval/migrations/001_create_tables.sql`
- Create: `tests/evals/adev-api-eval/migrations/002_seed_data.sql`

**Tests:** `tests/evals/adev-api-eval/tests/books.test.ts` — seed data is only used in integration; unit tests mock the DB.

**Context to load:**
- `.context-index/specs/features/eval-projects/api-eval-project.spec.md` (Postconditions: 5 authors, 12 books, 20 reviews; Planted Bug: ratings [2,3])

- [x] **Write failing test**

No isolated test — migrations are verified through end-to-end verification.

- [x] **Implement**

Write `001_create_tables.sql`:
- `authors` table: id SERIAL PRIMARY KEY, name VARCHAR NOT NULL, bio TEXT
- `books` table: id SERIAL PRIMARY KEY, title VARCHAR NOT NULL, author_id INTEGER REFERENCES authors(id), published_year INTEGER, isbn VARCHAR UNIQUE
- `reviews` table: id SERIAL PRIMARY KEY, book_id INTEGER REFERENCES books(id), reviewer_name VARCHAR NOT NULL, rating INTEGER CHECK (rating >= 1 AND rating <= 5), comment TEXT

Write `002_seed_data.sql`:
- Insert 5 authors
- Insert 12 books (distributed across authors)
- Insert 20 reviews. **Critical:** Craft seed data so at least one book has ratings where `SUM(rating) / COUNT(*)` (integer division) produces a different result from `AVG(rating)`. Example: one book gets ratings [2, 3] → `SUM=5, COUNT=2, 5/2=2` (integer) vs `2.5` (float). The planted bug manifests here.

- [x] **Commit**

```bash
git add tests/evals/adev-api-eval/migrations/
git commit -m "feat(eval-projects): add schema migrations and seed data with planted bug trigger

Spec: .context-index/specs/features/eval-projects/api-eval-project.spec.md
Plan-task: 4"
```

---

### Task 5: Books routes with planted bug [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=4
**Rationale:** Behavioral contract and planted bug SQL are precisely specified; standard CRUD route with intentional bug insertion.

**Charter capability:** API Eval Project
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3, Task 4
**Files:**
- Create: `tests/evals/adev-api-eval/src/routes/books.ts`

**Tests:** `tests/evals/adev-api-eval/tests/books.test.ts`

**Context to load:**
- `.context-index/specs/features/eval-projects/api-eval-project.spec.md` (Behaviors 2-4, Error Cases: 404, 400, 409, Planted Bug)

- [x] **Write failing test**

Test written in Task 9 (tests mock DB, so the planted bug is invisible to tests).

- [x] **Implement**

Write `src/routes/books.ts`:
- Express Router
- `GET /` — query all books, return JSON array with id, title, author_id, published_year, isbn
- `GET /:id` — query book by id with JOIN to reviews. **PLANTED BUG:** compute average_rating using `SELECT SUM(rating) / COUNT(*) FROM reviews WHERE book_id = $1` instead of `AVG(rating)` or `SUM(rating)::float / COUNT(*)`. This integer division truncates the result.
- `POST /` — validate required fields (title, author_id, published_year, isbn), insert book, return 201. Handle duplicate ISBN → 409.
- Error handling: 404 for not found, 400 for missing fields

- [x] **Commit**

```bash
git add tests/evals/adev-api-eval/src/routes/books.ts
git commit -m "feat(eval-projects): implement books routes with planted integer-division bug

Spec: .context-index/specs/features/eval-projects/api-eval-project.spec.md
Plan-task: 5"
```

---

### Task 6: Authors routes with book_count [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=4 pattern=3 blast=5 novelty=5
**Rationale:** Simple CRUD endpoint with subquery; follows same Express route pattern as other tasks in this plan.

**Charter capability:** API Eval Project
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3
**Files:**
- Create: `tests/evals/adev-api-eval/src/routes/authors.ts`

**Tests:** `tests/evals/adev-api-eval/tests/authors.test.ts`

**Context to load:**
- `.context-index/specs/features/eval-projects/api-eval-project.spec.md` (Behavior 5: authors with book_count)

- [x] **Write failing test**

Test written in Task 9.

- [x] **Implement**

Write `src/routes/authors.ts`:
- Express Router
- `GET /` — query all authors with a subquery or JOIN to count books per author. Return JSON array with id, name, bio, book_count.

- [x] **Commit**

```bash
git add tests/evals/adev-api-eval/src/routes/authors.ts
git commit -m "feat(eval-projects): implement authors routes with book_count

Spec: .context-index/specs/features/eval-projects/api-eval-project.spec.md
Plan-task: 6"
```

---

### Task 7: Reviews routes with validation [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=5
**Rationale:** Explicit behavioral contract and error case for rating validation; mechanical CRUD + validation implementation.

**Charter capability:** API Eval Project
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3
**Files:**
- Create: `tests/evals/adev-api-eval/src/routes/reviews.ts`

**Tests:** `tests/evals/adev-api-eval/tests/reviews.test.ts`

**Context to load:**
- `.context-index/specs/features/eval-projects/api-eval-project.spec.md` (Behavior 6, Error Cases: rating 1-5)

- [x] **Write failing test**

Test written in Task 9.

- [x] **Implement**

Write `src/routes/reviews.ts`:
- Express Router
- `POST /` — validate required fields (book_id, reviewer_name, rating, comment). Validate rating is integer between 1 and 5 → 400 if not. Insert review, return 201.

- [x] **Commit**

```bash
git add tests/evals/adev-api-eval/src/routes/reviews.ts
git commit -m "feat(eval-projects): implement reviews routes with rating validation

Spec: .context-index/specs/features/eval-projects/api-eval-project.spec.md
Plan-task: 7"
```

---

### Task 8: Error handler middleware [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=4 pattern=3 blast=5 novelty=5
**Rationale:** Error cases table provides explicit status codes and messages; standard Express error middleware pattern.

**Charter capability:** API Eval Project
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3
**Files:**
- Create: `tests/evals/adev-api-eval/src/middleware/error-handler.ts`
- Modify: `tests/evals/adev-api-eval/src/index.ts` (mount error handler after routes)

**Tests:** `tests/evals/adev-api-eval/tests/books.test.ts` — error handling tested through route tests.

**Context to load:**
- `.context-index/specs/features/eval-projects/api-eval-project.spec.md` (Error Cases table)

- [x] **Write failing test**

Error handler tested through route-level error case tests in Task 9.

- [x] **Implement**

Write `src/middleware/error-handler.ts`:
- Express error middleware (4-arg signature)
- Catch known error types and return structured JSON: `{ "error": "<message>" }` with appropriate HTTP status
- Handle DB connection errors → `{ "error": "Service unavailable" }` with 503
- Default to 500 for unhandled errors

- [x] **Commit**

```bash
git add tests/evals/adev-api-eval/src/middleware/error-handler.ts
git commit -m "feat(eval-projects): implement centralized error handler middleware

Spec: .context-index/specs/features/eval-projects/api-eval-project.spec.md
Plan-task: 8"
```

---

### Task 9: Unit tests with mocked DB [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=3
**Rationale:** Test expectations are explicit and golden sample for test helpers exists; requires careful mocking to keep planted bug invisible.

**Charter capability:** API Eval Project
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 5, Task 6, Task 7, Task 8
**Files:**
- Create: `tests/evals/adev-api-eval/tests/books.test.ts`
- Create: `tests/evals/adev-api-eval/tests/authors.test.ts`
- Create: `tests/evals/adev-api-eval/tests/reviews.test.ts`

**Tests:** `tests/evals/adev-api-eval/tests/books.test.ts`, `tests/evals/adev-api-eval/tests/authors.test.ts`, `tests/evals/adev-api-eval/tests/reviews.test.ts`

**Context to load:**
- `.context-index/specs/features/eval-projects/api-eval-project.spec.md` (Behavior 8: all tests pass, Planted Bug: tests mock DB)
- `.context-index/samples/general-test-helpers.md` (mocking patterns)

- [x] **Write failing test**

Write test files that import route handlers and mock the `db.query()` function. Tests should cover:

`books.test.ts`:
- GET /api/books returns array of books
- GET /api/books/:id returns book with reviews and average_rating
- POST /api/books with valid body returns 201
- POST /api/books with missing title returns 400
- POST /api/books with duplicate ISBN returns 409
- GET /api/books/:id with non-existent ID returns 404

`authors.test.ts`:
- GET /api/authors returns array with book_count

`reviews.test.ts`:
- POST /api/reviews with valid body returns 201
- POST /api/reviews with rating > 5 returns 400
- POST /api/reviews with rating < 1 returns 400

**Critical:** Tests mock DB responses, returning pre-computed values. The average_rating in mock responses is a pre-set value (correct), so the integer division bug in the SQL query is never exercised by unit tests.

- [x] **Verify test fails**

Run: `cd tests/evals/adev-api-eval && npm test`
Expected: FAIL — route modules not yet importable in test context (or compilation errors)

- [x] **Implement**

Mock the `db` module's `query` function in each test file. Return hardcoded result sets. Ensure all test assertions pass with the mocked data.

- [x] **Verify test passes**

Run: `cd tests/evals/adev-api-eval && npm test`
Expected: PASS — all unit tests pass with mocked DB

- [x] **Commit**

```bash
git add tests/evals/adev-api-eval/tests/
git commit -m "feat(eval-projects): add unit tests with mocked DB for all routes

Spec: .context-index/specs/features/eval-projects/api-eval-project.spec.md
Plan-task: 9"
```

---

### Task 10: README and LICENSE [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=5
**Rationale:** TODO features listed verbatim in spec; shared conventions define exact 6-section format; pure template-following.

**Charter capability:** API Eval Project
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Create: `tests/evals/adev-api-eval/README.md`
- Create: `tests/evals/adev-api-eval/LICENSE`

**Tests:** No automated test — structural validation per shared conventions.

**Context to load:**
- `.context-index/specs/features/eval-projects/shared-conventions.spec.md` (Behavior 7-8)
- `.context-index/specs/features/eval-projects/api-eval-project.spec.md` (TODO Features section)

- [x] **Write failing test**

No automated test for README structure. Validated during end-to-end verification.

- [x] **Implement**

Write `README.md` with exactly 6 sections in order per shared conventions:
1. **Project Title:** `adev-api-eval`
2. **Overview:** Bookstore REST API with Express, TypeScript, PostgreSQL
3. **Quick Start:** `docker compose up -d`, `npm install`, `npm run db:migrate`, `npm start`, verify `GET http://localhost:3000/health`
4. **Architecture:** Express routes, pg connection pool, Docker Compose for Postgres, ESM throughout
5. **TODO Features:** (5 features from spec)
   - Pagination for book listing (simple) — exercises: specify, implement
   - Author search by name (simple) — exercises: specify, implement, validate
   - Book categories/genres (medium) — exercises: brainstorm, specify, plan, implement
   - Review moderation system (complex) — exercises: brainstorm, specify, plan, implement, validate
   - Reading lists (medium) — exercises: brainstorm, specify, implement, validate
6. **License:** MIT

Write `LICENSE` with MIT license text.

- [x] **Commit**

```bash
git add tests/evals/adev-api-eval/README.md tests/evals/adev-api-eval/LICENSE
git commit -m "feat(eval-projects): add README with TODO features and LICENSE

Spec: .context-index/specs/features/eval-projects/api-eval-project.spec.md
Plan-task: 10"
```

---

### Task 11: Submodule registration and eval harness scaffold [specialist: none]

**Routing:** auto-agent (score: 16/20)
**Scores:** spec=4 pattern=4 blast=4 novelty=4
**Rationale:** Submodule registration follows adev-data-eval precedent; touches .gitmodules in parent repo but pattern is established.

**Charter capability:** API Eval Project, Eval Harness Scaffolds
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 10
**Files:**
- Create: `tests/evals/web-api/scenarios/.gitkeep`
- Create: `tests/evals/web-api/rubrics/.gitkeep`
- Modify: `.gitmodules` (add submodule entry)

**Tests:** No automated test — verified by `git submodule status`.

**Context to load:**
- `.context-index/specs/features/eval-projects/shared-conventions.spec.md` (Behavior 9-10)

- [x] **Write failing test**

No automated test — submodule registration is verified structurally.

- [x] **Implement**

Register `adev-api-eval` as a git submodule at `tests/evals/adev-api-eval/`.

Create eval harness scaffold:
- `tests/evals/web-api/scenarios/.gitkeep`
- `tests/evals/web-api/rubrics/.gitkeep`

- [x] **Commit**

```bash
git add .gitmodules tests/evals/web-api/
git commit -m "feat(eval-projects): register adev-api-eval submodule and scaffold web-api eval harness

Spec: .context-index/specs/features/eval-projects/api-eval-project.spec.md
Plan-task: 11"
```

---

### Task 12: Create with-context branch [specialist: none]

**Routing:** assisted-agent (score: 14/20)
**Scores:** spec=4 pattern=3 blast=5 novelty=2
**Rationale:** Requires designing project-specific constitution, manifest, and extracted spec for the eval project -- design decisions not fully prescribed by the spec.

**Charter capability:** With-Context Branches
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 9
**Files:**
- Create (on `with-context` branch): `tests/evals/adev-api-eval/.context-index/constitution.md`
- Create (on `with-context` branch): `tests/evals/adev-api-eval/.context-index/manifest.yaml`
- Create (on `with-context` branch): `tests/evals/adev-api-eval/.context-index/platform-context.yaml`
- Create (on `with-context` branch): `tests/evals/adev-api-eval/.context-index/specs/features/bookstore/` (one extracted spec)

**Tests:** No automated test — verified by diffing branches (only `.context-index/` additions).

**Context to load:**
- `.context-index/specs/features/eval-projects/shared-conventions.spec.md` (Behavior 3-4)

- [x] **Write failing test**

No automated test — branch structure validated during end-to-end verification.

- [x] **Implement**

Inside the `adev-api-eval` repo:
1. Create and switch to `with-context` branch from `main`
2. Create `.context-index/` directory with:
   - `constitution.md` — project-specific constitution for the bookstore API
   - `manifest.yaml` — declaring modules (routes, db, middleware), quality gates (`npm test`), platform (TypeScript, Node.js, Express)
   - `platform-context.yaml` — TypeScript, ESM, Express, Postgres, node:test
   - `specs/features/bookstore/charter.md` — feature charter for the bookstore domain
   - One extracted spec (e.g., for the "Pagination for book listing" TODO feature) as an example for eval runs
3. Verify: `git diff main..with-context` shows only `.context-index/` additions

- [x] **Commit**

```bash
git add .context-index/
git commit -m "feat(eval-projects): add .context-index for with-context branch

Spec: .context-index/specs/features/eval-projects/api-eval-project.spec.md
Plan-task: 12"
```

---

## Quality Gates

After all tasks are complete, run the full quality gate suite:

- [x] Tests pass: `cd tests/evals/adev-api-eval && npm test`
- [x] TypeScript compiles: `cd tests/evals/adev-api-eval && npx tsc --noEmit`
- [x] ESM throughout: `"type": "module"` in package.json
- [x] All acceptance criteria from spec satisfied
- [x] Parent project quality gates: `npm test` (from adev-plugin root)
