# Fixture Plan: eval-fixture

> A minimal, deterministic plan for the equivalence eval. Two file-disjoint
> `independent` groups plus one `sequential` (file-overlapping) group, so the
> eval can verify --parallel worktrees only the independent groups.

## Parallelization

- Group A (independent): Task 1
- Group B (independent): Task 2
- Group C (sequential): Task 3 → Task 4 (shared file)

Groups A and B run in parallel; Group C runs in the serial lane.

## Task Summary
