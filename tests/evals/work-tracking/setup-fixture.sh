#!/usr/bin/env bash
# setup-fixture.sh — Create a deterministic fixture repo for work-tracking evals
#
# Creates a minimal git repo with crafted commits, specs, source manifests,
# issue board, and session JSONL in known lifecycle states.
#
# Usage:
#   bash tests/evals/work-tracking/setup-fixture.sh [target-dir]
#   Default target: tests/evals/work-tracking/fixture
#
# The fixture is fully self-contained and re-runnable (deletes and recreates).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-$SCRIPT_DIR/fixture}"

# --- Clean slate ---
rm -rf "$TARGET"
mkdir -p "$TARGET"
cd "$TARGET"

git init --initial-branch main
git config user.name "Fixture Bot"
git config user.email "fixture@test.local"
# Disable any hooks from interfering
git config core.hooksPath /dev/null

# Fixed timestamps for deterministic history
export GIT_AUTHOR_DATE="2026-04-01T10:00:00+00:00"
export GIT_COMMITTER_DATE="2026-04-01T10:00:00+00:00"

# ===========================================================================
# Context index structure
# ===========================================================================
mkdir -p .context-index/specs/features/auth
mkdir -p .context-index/specs/features/dashboard
mkdir -p .context-index/tasks
mkdir -p .context-index
mkdir -p lib
mkdir -p tests

# ===========================================================================
# Charter: auth (has deferred capabilities + out of scope)
# ===========================================================================
cat > .context-index/specs/features/auth/charter.md << 'CHARTER'
---
type: charter
title: Auth Feature
status: approved
---

# Auth Feature Charter

## Business Intent
User authentication and authorization.

## Scope and Boundaries

### In Scope
- Password login
- Session management

### Out of Scope
- SSO integration (v2)
- OAuth providers (future)
- Two-factor authentication (nice-to-have)

## Capability Map

| Capability | Description | Priority | Phase | Status |
|-----------|-------------|----------|-------|--------|
| Password Login | Email + password auth | must-have | v1 | implemented |
| Session Mgmt | Token-based sessions | must-have | v1 | implemented |
| SSO Integration | SAML/OIDC SSO | should-have | v2 | — |
| OAuth Providers | Google, GitHub login | nice-to-have | v2 | — |
CHARTER

# ===========================================================================
# Spec: login (fully traced — has source manifest, plan, issues)
# ===========================================================================
cat > .context-index/specs/features/auth/login.spec.md << 'SPEC'
---
type: live-spec
title: Password Login
status: validated
charter: auth
source-manifest:
  sha: "abc1234"
  files:
    - lib/login.mjs
    - tests/login.test.mjs
  computed-at: "2026-04-01T12:00:00Z"
---

# Password Login

## Behavior
- Accept email + password
- Return JWT on success
- Return 401 on failure

## Acceptance Criteria
- [ ] Validates email format
- [ ] Hashes password with bcrypt
- [ ] Returns JWT with 1h expiry
SPEC

cat > .context-index/specs/features/auth/login.plan.md << 'PLAN'
---
type: plan
spec: auth/login.spec.md
tasks: 3
---

# Implementation Plan: Password Login

## Task 1: Validation helpers
Files: lib/login.mjs (validateEmail, validatePassword)

## Task 2: Auth logic
Files: lib/login.mjs (authenticate)

## Task 3: Tests
Files: tests/login.test.mjs
PLAN

# ===========================================================================
# Spec: session-mgmt (review-passed, no plan — unplanned spec)
# ===========================================================================
cat > .context-index/specs/features/auth/session-mgmt.spec.md << 'SPEC'
---
type: live-spec
title: Session Management
status: review-passed
charter: auth
---

# Session Management

## Behavior
- Create session tokens
- Validate and refresh tokens
- Revoke sessions on logout

## Acceptance Criteria
- [ ] Token rotation on refresh
- [ ] Session expiry after 24h
- [ ] Concurrent session limit of 5
SPEC

# ===========================================================================
# Charter: dashboard (has out of scope items)
# ===========================================================================
cat > .context-index/specs/features/dashboard/charter.md << 'CHARTER'
---
type: charter
title: Dashboard Feature
status: approved
---

# Dashboard Feature Charter

## Business Intent
Analytics dashboard for business metrics.

## Scope and Boundaries

### In Scope
- Metrics overview page
- Chart widgets

### Out of Scope
- Real-time streaming (future)
- Custom dashboard builder (v2)

## Capability Map

| Capability | Description | Priority | Phase | Status |
|-----------|-------------|----------|-------|--------|
| Metrics Overview | Summary cards + KPIs | must-have | v1 | — |
| Chart Widgets | Bar, line, pie charts | should-have | v1 | — |
| Real-time Streaming | WebSocket live data | nice-to-have | v2 | — |
CHARTER

# ===========================================================================
# Spec: metrics (draft — no review, no plan)
# ===========================================================================
cat > .context-index/specs/features/dashboard/metrics.spec.md << 'SPEC'
---
type: live-spec
title: Metrics Overview
status: draft
charter: dashboard
---

# Metrics Overview

## Behavior
- Display summary cards for key business metrics
- Refresh on page load

## Acceptance Criteria
- [ ] Shows revenue, orders, customers cards
- [ ] Loads in under 2 seconds
SPEC

# ===========================================================================
# Issue board — mixed states for testing
# ===========================================================================
cat > .context-index/tasks/tasks.md << 'BOARD'
---
type: issue-board
---

# Issue Board

## Epics

### epic-1
- title: Auth Implementation
- status: open
- planRef: .context-index/specs/features/auth/login.plan.md

### epic-2
- title: Dashboard MVP
- status: open

## Issues

### issue-1
- title: Validation helpers
- status: closed
- type: task
- priority: 2
- epicId: epic-1
- planRef: .context-index/specs/features/auth/login.plan.md
- planTask: 1

### issue-2
- title: Auth logic
- status: closed
- type: task
- priority: 2
- epicId: epic-1
- planRef: .context-index/specs/features/auth/login.plan.md
- planTask: 2
- dependencies: issue-1

### issue-3
- title: Login tests
- status: closed
- type: task
- priority: 2
- epicId: epic-1
- planRef: .context-index/specs/features/auth/login.plan.md
- planTask: 3
- dependencies: issue-2

### issue-4
- title: Metrics page layout
- status: open
- type: task
- priority: 2
- epicId: epic-2
- planRef: .context-index/specs/features/dashboard/nonexistent.plan.md
- planTask: 1

### issue-5
- title: Chart widget framework
- status: deferred
- type: feature
- priority: 3
- epicId: epic-2
- notes: "Deferred 2026-03-15: waiting for design mockups"
BOARD

# ===========================================================================
# Session JSONL — some entries with issue/epic, some without
# ===========================================================================
cat > .context-index/.session-tracking.jsonl << 'JSONL'
{"tool":"Edit","files":["lib/login.mjs"],"timestamp":"2026-04-01T11:00:00Z","session_id":"sess-001","issue":"issue-1","epic":"epic-1","operator":"dev-user/local"}
{"tool":"Edit","files":["lib/login.mjs"],"timestamp":"2026-04-01T11:30:00Z","session_id":"sess-001","issue":"issue-2","epic":"epic-1","operator":"dev-user/local"}
{"tool":"Edit","files":["tests/login.test.mjs"],"timestamp":"2026-04-01T12:00:00Z","session_id":"sess-001","issue":"issue-3","epic":"epic-1","operator":"dev-user/local"}
{"tool":"Edit","files":["lib/untraced.mjs"],"timestamp":"2026-04-05T09:00:00Z","session_id":"sess-002","operator":"dev-user/local"}
{"tool":"Edit","files":["lib/drifted.mjs"],"timestamp":"2026-04-08T14:00:00Z","session_id":"sess-003","operator":"ci-bot/remote"}
{"tool":"Edit","files":["lib/orphan.mjs"],"timestamp":"2026-04-09T10:00:00Z","operator":"dev-user/local"}
JSONL

# ===========================================================================
# Source files — each in a different lifecycle state
# ===========================================================================

# --- Fully traced: lib/login.mjs (in source manifest, all commits have trailers) ---
cat > lib/login.mjs << 'CODE'
export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validatePassword(password) {
  return typeof password === 'string' && password.length >= 8;
}

export async function authenticate(email, password) {
  if (!validateEmail(email)) throw new Error('Invalid email');
  if (!validatePassword(password)) throw new Error('Invalid password');
  return { token: 'jwt-placeholder', expiresIn: 3600 };
}
CODE

cat > tests/login.test.mjs << 'CODE'
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { validateEmail, validatePassword, authenticate } from '../lib/login.mjs';

describe('login', () => {
  it('validates email format', () => {
    assert.ok(validateEmail('user@example.com'));
    assert.ok(!validateEmail('not-an-email'));
  });

  it('validates password length', () => {
    assert.ok(validatePassword('longpassword'));
    assert.ok(!validatePassword('short'));
  });

  it('returns JWT on valid credentials', async () => {
    const result = await authenticate('user@example.com', 'longpassword');
    assert.ok(result.token);
    assert.strictEqual(result.expiresIn, 3600);
  });
});
CODE

# Commit 1: fully traced (all trailers)
git add lib/login.mjs tests/login.test.mjs
git add .context-index/specs/features/auth/login.spec.md
git add .context-index/specs/features/auth/login.plan.md
export GIT_AUTHOR_DATE="2026-04-01T11:00:00+00:00"
export GIT_COMMITTER_DATE="2026-04-01T11:00:00+00:00"
git commit -m "$(cat <<'EOF'
feat(auth): implement password login

Spec: .context-index/specs/features/auth/login.spec.md
Plan-task: 1
Session: sess-001
Issue: issue-1
Author-type: agent/claude-code
EOF
)"

# Commit 2: second traced commit
echo "// additional auth checks" >> lib/login.mjs
git add lib/login.mjs
export GIT_AUTHOR_DATE="2026-04-01T11:30:00+00:00"
export GIT_COMMITTER_DATE="2026-04-01T11:30:00+00:00"
git commit -m "$(cat <<'EOF'
feat(auth): add auth logic

Spec: .context-index/specs/features/auth/login.spec.md
Plan-task: 2
Session: sess-001
Issue: issue-2
Author-type: agent/claude-code
EOF
)"

# --- Drifted: lib/drifted.mjs (in a source manifest, but modified after without trailers) ---
cat > lib/drifted.mjs << 'CODE'
export function computeMetrics(data) {
  return { total: data.length, avg: data.reduce((a, b) => a + b, 0) / data.length };
}
CODE

# Add a spec that claims drifted.mjs via source manifest
cat > .context-index/specs/features/dashboard/widgets.spec.md << 'SPEC'
---
type: live-spec
title: Chart Widgets
status: validated
charter: dashboard
source-manifest:
  sha: "def5678"
  files:
    - lib/drifted.mjs
  computed-at: "2026-04-02T10:00:00Z"
---

# Chart Widgets

## Behavior
- Render bar, line, and pie charts from metric data
SPEC

git add lib/drifted.mjs .context-index/specs/features/dashboard/widgets.spec.md
export GIT_AUTHOR_DATE="2026-04-02T10:00:00+00:00"
export GIT_COMMITTER_DATE="2026-04-02T10:00:00+00:00"
git commit -m "$(cat <<'EOF'
feat(dashboard): implement chart widgets

Spec: .context-index/specs/features/dashboard/widgets.spec.md
Plan-task: 1
Session: sess-002
Author-type: agent/claude-code
EOF
)"

# Now drift it — modify without trailers (post-implementation drift)
echo "// quick fix added without lifecycle" >> lib/drifted.mjs
git add lib/drifted.mjs
export GIT_AUTHOR_DATE="2026-04-08T14:00:00+00:00"
export GIT_COMMITTER_DATE="2026-04-08T14:00:00+00:00"
git commit -m "fix: patch metrics edge case"

# --- Untraced: lib/untraced.mjs (no spec, no manifest, no trailers) ---
cat > lib/untraced.mjs << 'CODE'
export function helperUtil() {
  return 'this file was written outside the lifecycle';
}
CODE

git add lib/untraced.mjs
export GIT_AUTHOR_DATE="2026-04-05T09:00:00+00:00"
export GIT_COMMITTER_DATE="2026-04-05T09:00:00+00:00"
git commit -m "add utility helper"

# --- Orphan: lib/orphan.mjs (matches v2 charter capability keyword "sso") ---
cat > lib/orphan.mjs << 'CODE'
export function initSSO(config) {
  // Stub SSO integration — not in any spec
  return { provider: config.provider, redirectUrl: config.redirectUrl };
}
CODE

git add lib/orphan.mjs
export GIT_AUTHOR_DATE="2026-04-09T10:00:00+00:00"
export GIT_COMMITTER_DATE="2026-04-09T10:00:00+00:00"
git commit -m "wip: sso integration stub

Author-type: human
Lifecycle: untracked"

# --- Add remaining context files ---
git add .context-index/specs/features/auth/charter.md
git add .context-index/specs/features/auth/session-mgmt.spec.md
git add .context-index/specs/features/dashboard/charter.md
git add .context-index/specs/features/dashboard/metrics.spec.md
git add .context-index/tasks/tasks.md
git add .context-index/.session-tracking.jsonl
export GIT_AUTHOR_DATE="2026-04-10T10:00:00+00:00"
export GIT_COMMITTER_DATE="2026-04-10T10:00:00+00:00"
git commit -m "chore: add context index artifacts

Session: sess-004
Author-type: agent/claude-code"

echo ""
echo "=== Fixture created at $TARGET ==="
echo ""
echo "Files:"
find . -not -path './.git/*' -type f | sort
echo ""
echo "Commits:"
git log --oneline --reverse
echo ""
echo "Lifecycle states:"
echo "  lib/login.mjs         — FULLY TRACED (all commits have Spec: + Plan-task: + Issue:)"
echo "  tests/login.test.mjs  — FULLY TRACED (committed with login.mjs)"
echo "  lib/drifted.mjs       — PARTIALLY TRACED (initial commit traced, later commit untracked)"
echo "  lib/untraced.mjs      — UNTRACED (no lifecycle trailers at all)"
echo "  lib/orphan.mjs        — UNTRACED + matches v2 capability keyword 'sso'"
echo ""
echo "Issue board states:"
echo "  epic-1 (Auth)      — open, all 3 issues closed (stale epic)"
echo "  epic-2 (Dashboard) — open, issue-4 open (orphaned planRef), issue-5 deferred"
echo "  session-mgmt spec  — review-passed with no plan (unplanned spec)"
echo "  metrics spec       — draft (no review, no plan)"
echo "  issue-4            — planRef points to nonexistent file (orphaned)"
echo "  issue-5            — deferred since 2026-03-15 (26 days, stale)"
