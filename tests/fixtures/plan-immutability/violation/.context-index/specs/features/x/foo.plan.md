# Implementation Plan: foo (fixture — mutated after pending event)

This plan file has been "mutated" after the lifecycle log recorded its first
`plan_task pending` event. The detector in `lib/plan-immutability.mjs` is
expected to flag this as a violation when run against this fixture.

## Tasks

- Task t1 — fixture-only

Mutation marker: bumped to verify mtime > pending-event ts.
