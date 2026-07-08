# Equivalence-eval fixture

A deterministic, task-covering fixture (`example.plan.md`) whose tests are
order-independent. Consumed by `run-ab-eval.mjs` for the serial-A / serial-B /
parallel arms. Its `## Parallelization` section has 2 `independent` groups + 1
`sequential` group so the harness can assert --parallel's group selection.
