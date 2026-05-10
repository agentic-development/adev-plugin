[adev docs](../README.md) > [Project Types](../project-types.md) > CI/CD Pipeline

# CI/CD Pipeline

**Repository:** [agentic-development/adev-pipeline-eval](https://github.com/agentic-development/adev-pipeline-eval)
**Fixture path:** `tests/evals/adev-pipeline-eval/`

This example represents a CI/CD pipeline project — infrastructure-as-code for build, test, and deployment automation. Pipeline projects show how adev handles projects where the "product" is the development workflow itself.

## How `/adev:init` Detects This Project Type

For a CI/CD pipeline project, `/adev:init` looks for:

- `.github/workflows/` — GitHub Actions workflow files
- `Dockerfile` or `docker-compose.yml` — container definitions
- `Makefile` or `Taskfile` — build orchestration
- Infrastructure-as-code files (Terraform, Pulumi, CloudFormation)
- Deployment configuration (Kubernetes manifests, Helm charts)

## Constitution

A pipeline project constitution focuses on reliability and reproducibility:

```markdown
## Identity

CI/CD pipeline automating build, test, and deployment for a
microservices architecture using GitHub Actions and Docker.

## Non-Negotiable Principles

1. **Reproducible builds** — every build produces identical output given
   the same input. Pin all dependency versions. No floating tags.
2. **Fail fast, fail loud** — pipeline stages exit non-zero on any error.
   No silent failures, no swallowed exit codes.
3. **Secrets never in code** — all credentials come from secret managers
   or environment variables. No hardcoded tokens, keys, or passwords.
4. **Rollback-ready** — every deployment can be rolled back to the
   previous version with a single command or pipeline trigger.
```

## Manifest

```yaml
project:
  name: "deploy-pipeline"
  type: ci-cd

gates:
  lint: "actionlint"
  test: "make test-pipeline"

modules:
  - slug: build
    name: Build Stage
    paths:
      - .github/workflows/build.yml
      - Dockerfile
  - slug: deploy
    name: Deploy Stage
    paths:
      - .github/workflows/deploy.yml
      - k8s/
  - slug: monitoring
    name: Monitoring
    paths:
      - .github/workflows/monitor.yml
```

## Charter Example

```markdown
# Feature Charter: Canary Deployments

## Business Intent
Add canary deployment support that routes a percentage of traffic
to the new version before full rollout.

## Capability Map
| Capability                 | Priority  | Status  |
|---------------------------|-----------|---------|
| Canary workflow definition | must-have | pending |
| Traffic splitting config   | must-have | pending |
| Automated rollback trigger | must-have | pending |
| Metrics-based promotion    | should-have | pending |
```

## Spec Example

Pipeline specs focus on workflow behavior and failure modes:

```markdown
## Behavioral Contract

### Behaviors
1. **When** a push to main triggers the canary workflow **then** it
   deploys to the canary target with 10% traffic weight.
2. **When** canary error rate exceeds 5% for 5 minutes **then** the
   pipeline automatically rolls back and notifies the team.
3. **When** canary runs for 30 minutes with error rate below 1%
   **then** it promotes to full deployment.

### Error Cases
| Condition          | Expected Behavior         |
|-------------------|--------------------------|
| Canary pod crashes | Immediate rollback        |
| Metrics unavailable| Block promotion, alert    |
```

## How Skills Adapt

For pipeline projects, adev skills adjust:

- **Specs** focus on workflow triggers, stages, and failure recovery
- **Test strategies** use pipeline linting and dry-run execution
- **Validation** checks workflow syntax and secret references
- **Debug** traces pipeline execution logs and stage dependencies

---

[Back to Project Types](../project-types.md)
