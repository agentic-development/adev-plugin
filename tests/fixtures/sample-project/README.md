# Sample Project — Test Fixture

This fixture provides a known dependency graph for parser and repomap tests.

## File Count

10 source files (nodes in the dependency graph).

## Expected Symbols by File

### src/types.ts
| Symbol | Kind |
|--------|------|
| User | interface |
| Task | interface |
| TaskFilter | type |
| TaskStatus | enum |

### src/config.ts
| Symbol | Kind |
|--------|------|
| APP_NAME | constant |
| MAX_RETRIES | constant |
| DEFAULT_PAGE_SIZE | constant |
| DB_PATH | constant |

### src/db.ts
| Symbol | Kind |
|--------|------|
| Database | class |
| Database (default) | default export |

### src/utils.ts
| Symbol | Kind |
|--------|------|
| format | arrow function |
| toUpperCase | arrow function |
| parse | destructured constant |
| stringify | destructured constant |
| clamp | function |

### src/services/task-service.ts
| Symbol | Kind |
|--------|------|
| createTask | function |
| listTasks | function |

### src/services/user-service.ts
| Symbol | Kind |
|--------|------|
| getUser | function |
| getAssigneeName | function |
| getUserTasks | function |

### src/services/index.ts
Barrel re-export file. Re-exports:
- `createTask`, `listTasks` from `./task-service`
- `getUser`, `getAssigneeName`, `getUserTasks` from `./user-service`

### src/helpers/format.ts
| Symbol | Kind |
|--------|------|
| formatDate | arrow function |
| formatCurrency | arrow function |
| formatPercent | arrow function |

### src/helpers/validate.ts
| Symbol | Kind |
|--------|------|
| isArray | destructured constant |
| isNonEmpty | arrow function |
| validateUser | function |
| validateTask | function |

### src/index.ts
| Symbol | Kind |
|--------|------|
| main | function |

## Expected Edges (Internal Imports)

Total expected edges: 13

| # | From | To | Type | Symbols |
|---|------|----|------|---------|
| 1 | src/db.ts | src/config.ts | value | DB_PATH |
| 2 | src/services/task-service.ts | src/types.ts | type-only | Task, TaskFilter |
| 3 | src/services/task-service.ts | src/db.ts | value | Database |
| 4 | src/services/task-service.ts | src/utils.ts | value | format |
| 5 | src/services/task-service.ts | src/services/user-service.ts | value | getAssigneeName |
| 6 | src/services/user-service.ts | src/types.ts | type-only | User |
| 7 | src/services/user-service.ts | src/db.ts | value | Database |
| 8 | src/services/user-service.ts | src/services/task-service.ts | value | listTasks |
| 9 | src/services/index.ts | src/services/task-service.ts | re-export | createTask, listTasks |
| 10 | src/services/index.ts | src/services/user-service.ts | re-export | getUser, getAssigneeName, getUserTasks |
| 11 | src/helpers/validate.ts | src/types.ts | type-only | User, Task |
| 12 | src/index.ts | src/services/index.ts | value | createTask, listTasks, getUser |
| 13 | src/index.ts | src/config.ts | value | APP_NAME, DEFAULT_PAGE_SIZE |

## Circular Imports

One circular dependency exists:
- `src/services/task-service.ts` -> `src/services/user-service.ts` (imports `getAssigneeName`)
- `src/services/user-service.ts` -> `src/services/task-service.ts` (imports `listTasks`)

## Excluded Imports (External Packages)

The following imports should NOT appear as edges in the dependency graph:
- `src/db.ts` imports `readFileSync` from `'fs'` — external Node.js built-in, must be excluded

## Feature Coverage

| Feature | File(s) |
|---------|---------|
| Barrel re-export | src/services/index.ts |
| Arrow function export | src/utils.ts, src/helpers/format.ts |
| Destructured export | src/utils.ts (`parse`, `stringify`), src/helpers/validate.ts (`isArray`) |
| Circular import | src/services/task-service.ts <-> src/services/user-service.ts |
| Type-only import | src/services/task-service.ts, src/services/user-service.ts, src/helpers/validate.ts |
| External package import | src/db.ts (`fs`) |
| Default export | src/db.ts |
| Class | src/db.ts (Database) |
| Interface | src/types.ts (User, Task) |
| Type alias | src/types.ts (TaskFilter) |
| Enum | src/types.ts (TaskStatus) |
| Function | src/utils.ts, src/services/*.ts, src/helpers/validate.ts |
| Constant | src/config.ts |
