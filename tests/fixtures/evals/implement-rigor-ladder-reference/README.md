# EV-1 reference implementation

A spec-conforming implementation of
`tests/evals/implement-rigor-ladder/fixture/example.spec.md`. The test
`tests/lib/evals/implement-rigor-ladder-edge-probes.test.mjs` lays it over the
fixture seed to show that every held-out probe (`fixture/probes/` and
`fixture/edge-probes/`) passes on code that follows the spec. It is never
copied into an EV-1 sandbox, so the implementer under measurement never sees
it.
