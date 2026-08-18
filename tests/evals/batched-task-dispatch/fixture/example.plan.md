# Fixture Plan: batched-dispatch-eval-fixture

> A minimal, deterministic plan for the batched-dispatch equivalence eval. One
> `sequential` (file-overlapping) group eligible for batching, plus one
> `independent` solo task, so the eval exercises both the batch path and the
> always-solo path from a single fixture.

## Parallelization

- Group A (sequential): Task 1 → Task 2 (shared file)
- Group B (independent): Task 3

## Task Summary
