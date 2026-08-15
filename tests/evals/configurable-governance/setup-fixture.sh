#!/usr/bin/env bash
# setup-fixture.sh — Create an isolated consumer project for the
# configurable-governance eval.
#
# The fixture simulates a project that has installed the adev-plugin and is
# using the configurable reviewer + validate registries. It exercises:
#   - Bundled defaults with no project overrides
#   - A project governance/review.yaml disabling one reviewer and adding
#     a project-triggered one
#   - A project governance/validate.yaml disabling one check, adding a
#     quality-gate check (valid argv form), adding a project subagent-review
#   - A project-defined execution profile at .context-index/profiles.yaml
#   - A .env file with env the quality-gate consumes (with one short secret
#     to exercise the 8-char min-length WARN)
#   - A SPEC file under test (for review/validate to target)
#
# Usage:
#   bash tests/evals/configurable-governance/setup-fixture.sh [target-dir]
#   Default target: tests/evals/configurable-governance/fixture
#
# Re-runnable (deletes + recreates).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-$SCRIPT_DIR/fixture}"

rm -rf "$TARGET"
mkdir -p "$TARGET"
cd "$TARGET"

git init --initial-branch main >/dev/null
git config user.name "Eval Bot"
git config user.email "eval@test.local"
git config core.hooksPath /dev/null
git config commit.gpgsign false

mkdir -p .context-index/specs/features/billing
mkdir -p .context-index/specs/cross-cutting
mkdir -p .context-index/governance
mkdir -p lib
mkdir -p tests

# ---------------------------------------------------------------------------
# Core context-index
# ---------------------------------------------------------------------------
cat > .context-index/constitution.md << 'EOF'
# Constitution: Eval Fixture Project

## Non-Negotiable Principles
1. Minimize external dependencies.
2. Pure ESM.
3. No secrets in source.
EOF

cat > .context-index/manifest.yaml << 'EOF'
project: eval-fixture
EOF

cat > .context-index/platform-context.yaml << 'EOF'
framework: none
language: javascript
runtime: nodejs
package_manager: npm

model_tiers:
  fast:      claude-haiku-4-5-20251001
  capable:   claude-sonnet-4-6
  reasoning: claude-opus-4-6
EOF

cat > .context-index/specs/features/billing/charter.md << 'EOF'
---
status: approved
revision: 1
---
# Billing Feature Charter
## Purpose
Handle invoicing and payment flows.
EOF

cat > .context-index/specs/features/billing/invoice-generation.md << 'EOF'
---
charter: billing
status: review-pending
risk_level: medium
revision: 1
---

# Live Spec: Invoice Generation

## Behavioral Contract

### Preconditions
- Customer exists.

### Behaviors
1. Generate a PDF invoice for a given order.
2. Store the invoice at a deterministic path.

### Postconditions
- Invoice is retrievable by order id.

## Acceptance Criteria
- [ ] Generates PDF with correct total.
- [ ] Idempotent on repeated calls.
EOF

# ---------------------------------------------------------------------------
# Project profile overlay — extends a bundled default + adds a custom profile
# for the quality-gate check.
# ---------------------------------------------------------------------------
cat > .context-index/profiles.yaml << 'EOF'
profiles:
  project-gate-profile:
    description: "Subprocess posture for the project's npm-test quality gate."
    permissions:
      tools:
        allow:
          - { category: filesystem-read }
          - { category: search }
      filesystem: { write: deny, execute: deny }
      network: deny
    env:
      files: [".env", "optional:.env.local"]
      allow:
        required: ["API_TOKEN"]
        optional: ["DEBUG_FLAG"]
EOF

# ---------------------------------------------------------------------------
# .env — real secret (>=8 chars) + short value to trigger the min-length WARN
# ---------------------------------------------------------------------------
cat > .env << 'EOF'
API_TOKEN=this-is-a-long-api-token-value-abc123
DEBUG_FLAG=on
EOF
chmod 600 .env

# ---------------------------------------------------------------------------
# governance/review.yaml — disables one default, overrides another's severity,
# and adds a project-triggered reviewer
# ---------------------------------------------------------------------------
cat > .context-index/governance/review.yaml << 'EOF'
reviewers:
  - id: consistency-analyzer
    enabled: false

  - id: security-reviewer
    severity_cap: warning

  - id: project.billing-domain
    name: "Billing Domain Reviewer"
    dispatch:
      triggered:
        patterns: ["specs/features/billing/**/*.md"]
        keywords: ["invoice", "payment"]
        min_score: 1
    prompt: "prompts/billing-reviewer.md"
    profile: reviewer-capable
    context_pack: base
    severity_cap: blocker

context_packs:
  base:
    include:
      - ".context-index/specs/features/billing/charter.md"

# Fixture maintenance (Task 10): review.yaml is a MARKED governance registry,
# so every loader fails closed without this top-level marker. Written in the
# same shape `adev governance materialize` produces.
materialized_at: 2026-08-15T00:00:00Z
EOF

mkdir -p .context-index/prompts
cat > .context-index/prompts/billing-reviewer.md << 'EOF'
# Billing Domain Reviewer

You are a billing-domain specialist. Verify that the target spec:
- Matches accounting conventions (double-entry, monetary precision).
- Idempotently handles repeated invoice generation.
- Does not introduce PCI data handling without explicit acknowledgement.

Output findings in BIL-N format.
EOF

# ---------------------------------------------------------------------------
# governance/validate.yaml — single-source registry per
# validate-config-single-source.spec.md. Contains the full 12-entry bundled set
# (mirroring the software-domain starter that `/adev:init` would scaffold) with
# in-place project customizations: platform-drift disabled (enabled: false on
# the existing entry), plus three appended project entries.
# ---------------------------------------------------------------------------
cat > .context-index/governance/validate.yaml << 'EOF'
checks:
  - id: validate.check-1.5-source-manifest
    name: "Source Manifest Verification"
    kind: deterministic-check
    severity: warning
    prompt: plugin:validate/checks/validate.check-1.5-source-manifest.md
    description: "Verify spec source-manifest SHAs match current files."

  - id: validate.check-2-spec-compliance
    name: "Spec Compliance"
    kind: subagent-review
    profile: reviewer-capable
    context_pack: base
    severity: error
    prompt: plugin:validate/checks/validate.check-2-spec-compliance.md
    after: [validate.check-1.5-source-manifest]

  - id: validate.check-3-charter-consistency
    name: "Charter Consistency"
    kind: subagent-review
    profile: reviewer-capable
    context_pack: base
    severity: error
    prompt: plugin:validate/checks/validate.check-3-charter-consistency.md
    after: [validate.check-2-spec-compliance]

  - id: validate.check-4-constitution
    name: "Constitutional Compliance"
    kind: subagent-review
    profile: reviewer-capable
    context_pack: base
    severity: error
    prompt: plugin:validate/checks/validate.check-4-constitution.md
    after: [validate.check-2-spec-compliance]

  - id: validate.check-5-adrs
    name: "ADR Compliance"
    kind: subagent-review
    profile: reviewer-capable
    context_pack: base
    severity: warning
    prompt: plugin:validate/checks/validate.check-5-adrs.md
    after: [validate.check-2-spec-compliance]

  - id: validate.check-6-cross-cutting
    name: "Cross-Cutting Spec Compliance"
    kind: subagent-review
    profile: reviewer-capable
    context_pack: base
    severity: warning
    prompt: plugin:validate/checks/validate.check-6-cross-cutting.md
    after: [validate.check-2-spec-compliance]

  - id: validate.check-7-specialist-review
    name: "Specialist Review"
    kind: subagent-review
    profile: reviewer-capable
    context_pack: base
    severity: warning
    prompt: plugin:validate/checks/validate.check-7-specialist-review.md
    after: [validate.check-2-spec-compliance]

  - id: validate.check-8-boundaries
    name: "Governance Boundaries"
    kind: subagent-review
    profile: reviewer-capable
    context_pack: base
    severity: error
    prompt: plugin:validate/checks/validate.check-8-boundaries.md
    after: [validate.check-2-spec-compliance]

  - id: validate.check-9-transition-gates
    name: "Transition Gate Compliance"
    kind: subagent-review
    profile: reviewer-capable
    context_pack: base
    severity: warning
    prompt: plugin:validate/checks/validate.check-9-transition-gates.md
    after: [validate.check-2-spec-compliance]

  # Project customization: disabled for this project (was kind: subagent-review).
  - id: validate.check-10-platform-drift
    enabled: false

  - id: validate.check-11-visual-verification
    name: "Visual Verification"
    kind: subagent-review
    profile: browser-review
    context_pack: base
    severity: warning
    prompt: plugin:validate/checks/validate.check-11-visual-verification.md

  - id: validate.check-12-heuristic-extraction
    name: "Heuristic Extraction"
    kind: observational
    severity: info
    prompt: plugin:validate/checks/validate.check-12-heuristic-extraction.md

  # ── Project additions ──────────────────────────────────────────────────

  - id: project.npm-test
    name: "Project npm test gate"
    kind: quality-gate
    profile: project-gate-profile
    command: [echo, "npm-test-stub", "--silent"]
    severity: error
    fail_fast: true

  - id: project.billing-domain-rules
    name: "Billing Domain Rules"
    kind: subagent-review
    profile: reviewer-capable
    prompt: "prompts/billing-checker.md"
    after: [validate.check-2-spec-compliance]
    severity: warning

  - id: project.adoption-metric
    name: "Adoption Metric (advisory)"
    kind: observational
    severity: info
EOF

cat > .context-index/prompts/billing-checker.md << 'EOF'
# Billing Rules Checker

Verify the implementation files under `lib/billing/` follow the project's
billing conventions. Flag any of:
- Floating-point arithmetic on monetary values.
- Missing retry/idempotency guards on PDF generation.
Report findings; blocker severity cap is warning.
EOF

# ---------------------------------------------------------------------------
# Malicious config fixtures — kept in a subdirectory for negative tests.
# The deterministic test suite points loadReviewConfig at these individually.
# ---------------------------------------------------------------------------
mkdir -p .context-index/negative

# 1) path traversal attempt
cat > .context-index/negative/traversal.yaml << 'EOF'
reviewers:
  - id: project.evil
    dispatch: always
    prompt: "../../../../etc/passwd"
EOF

# 2) implementer profile on reviewer (posture violation)
cat > .context-index/negative/implementer-reviewer.yaml << 'EOF'
reviewers:
  - id: security-reviewer
    profile: implementer
EOF

# 3) cross-plugin reference
cat > .context-index/negative/cross-plugin.yaml << 'EOF'
reviewers:
  - id: project.cross
    dispatch: always
    prompt: "plugin:other-plugin:review/prompt.md"
EOF

# 4) quality-gate with string-form command (shell-injection posture)
cat > .context-index/negative/shell-gate.yaml << 'EOF'
checks:
  - id: project.bad-gate
    kind: quality-gate
    profile: project-gate-profile
    command: "npm test"
EOF

# 5) quality-gate with argv interpolation
cat > .context-index/negative/interpolation-gate.yaml << 'EOF'
checks:
  - id: project.interpolated-gate
    kind: quality-gate
    profile: project-gate-profile
    command: [npm, test, "{{ spec.slug }}"]
EOF

# 6) context-pack include on denylist (.env*)
cat > .context-index/negative/secret-pack.yaml << 'EOF'
reviewers:
  - id: project.leaky
    dispatch: always
    prompt: "prompts/billing-reviewer.md"
    context_pack: leaky

context_packs:
  leaky:
    include:
      - ".env*"
EOF

# 7) project tries to register a deterministic-check
cat > .context-index/negative/project-deterministic.yaml << 'EOF'
checks:
  - id: project.invented-deterministic
    kind: deterministic-check
EOF

# 8) malformed YAML (Tier 1 AC #6: line-citation in parse error)
# Odd-indent (3 spaces) on the last key triggers the parser's indent guard
# and forces a cited line number.
cat > .context-index/negative/malformed.yaml << 'EOF'
checks:
  - id: project.broken
    kind: quality-gate
    profile: project-gate-profile
     command: [echo, "hi"]
EOF

# 9) quality-gate profile declares a required env key that the .env file
#    does not supply (Tier 1 AC #11)
cat > .context-index/negative/quality-gate-missing-env.yaml << 'EOF'
checks:
  - id: project.missing-env-gate
    kind: quality-gate
    profile: strict-env-profile
    command: [echo, "needs secret"]
EOF

# ---------------------------------------------------------------------------
# Additional project profile with a required env key the fixture .env lacks
# (used with quality-gate-missing-env.yaml).
# ---------------------------------------------------------------------------
cat >> .context-index/profiles.yaml << 'EOF'

  strict-env-profile:
    description: "Subprocess posture that needs a missing required key."
    permissions:
      tools:
        allow:
          - { category: filesystem-read }
      filesystem: { write: deny, execute: deny }
      network: deny
    env:
      files: [".env"]
      allow:
        required: ["STRICT_ONLY_KEY"]
        optional: []
EOF

# ---------------------------------------------------------------------------
# Cross-registry context-pack fixture (Tier 1 AC #9):
# Pack defined in review.yaml and consumed by validate.yaml check.
# Lives under .context-index/cross-pack/ and is loaded by the tier-1 tests,
# not by the default happy-path tests.
# ---------------------------------------------------------------------------
mkdir -p .context-index/cross-pack
cat > .context-index/cross-pack/review.yaml << 'EOF'
reviewers: []
context_packs:
  shared-rules:
    include:
      - ".context-index/specs/features/billing/charter.md"

# Fixture maintenance (Task 10): review.yaml is a MARKED governance registry,
# so every loader fails closed without this top-level marker. Written in the
# same shape `adev governance materialize` produces.
materialized_at: 2026-08-15T00:00:00Z
EOF

cat > .context-index/cross-pack/validate.yaml << 'EOF'
checks:
  - id: project.cross-pack-check
    kind: subagent-review
    profile: reviewer-capable
    prompt: "prompts/billing-checker.md"
    context_pack: shared-rules
EOF

# ---------------------------------------------------------------------------
# Workspace fixture (Tier 1 AC #12 / #13 / #10): two sibling repos under
# a workspace root. Placed adjacent to the target fixture so each test
# file can own its own pair without racing.
# ---------------------------------------------------------------------------
WS_TARGET="${WS_TARGET:-$(dirname "$TARGET")/ws-$(basename "$TARGET")}"
mkdir -p "$WS_TARGET"
(
  cd "$WS_TARGET"
  rm -rf ./*
  cat > adev-workspace.yaml << 'WS'
workspace:
  name: eval-workspace
repos:
  - slug: repo-a
    path: ./repo-a
  - slug: repo-b
    path: ./repo-b
WS
  cat > .env.shared << 'WS'
SHARED_TOKEN=workspace-shared-value-12345
WS

  for repo in repo-a repo-b; do
    mkdir -p $repo/.context-index/specs/features/demo
    cat > $repo/.context-index/manifest.yaml << EOF
project: $repo
EOF
    cat > $repo/.context-index/constitution.md << 'EOF'
# Stub
EOF
    cat > $repo/.env << EOF
REPO_TOKEN=repo-local-value-for-${repo}-1234
EOF
    cat > $repo/.context-index/profiles.yaml << 'EOF'
profiles:
  ws-consumer:
    extends: read-only
    env:
      files: [".env", "$workspace/.env.shared"]
      allow:
        required: ["REPO_TOKEN", "SHARED_TOKEN"]
        optional: []
EOF
    cat > $repo/.context-index/specs/features/demo/item.md << EOF
---
charter: demo
status: review-pending
risk_level: medium
revision: 1
---
# Spec for $repo
EOF
  done
)

# ---------------------------------------------------------------------------
# Initial commit
# ---------------------------------------------------------------------------
git add -A
export GIT_AUTHOR_DATE="2026-04-19T12:00:00+00:00"
export GIT_COMMITTER_DATE="2026-04-19T12:00:00+00:00"
git commit -m "chore(eval-fixture): initial fixture for configurable-governance" >/dev/null

echo "=== Fixture created at $TARGET ==="
echo ""
echo "Happy-path configs:"
echo "  .context-index/profiles.yaml           \u2014 project execution profile"
echo "  .context-index/governance/review.yaml  \u2014 custom reviewer set"
echo "  .context-index/governance/validate.yaml \u2014 custom checks incl. quality-gate"
echo "  .env                                    \u2014 API_TOKEN (long) + DEBUG_FLAG (short)"
echo ""
echo "Negative-test configs (loaded individually):"
echo "  .context-index/negative/{traversal,implementer-reviewer,cross-plugin,shell-gate,interpolation-gate,secret-pack,project-deterministic}.yaml"
