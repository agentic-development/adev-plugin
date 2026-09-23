// tests/lib/bugfix-loop-freshness.test.mjs
//
// Spec: .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-execution-hardening.spec.md
// Plan-task: 1
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { computeFreshness, resolveDefaultRemoteBranch } from '../../lib/bugfix-loop-freshness.mjs';

function initRepo(dir) {
  execSync('git init -b main', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'ignore' });
  execSync('git config commit.gpgsign false', { cwd: dir, stdio: 'ignore' });
}

function commit(dir, filename, message) {
  writeFileSync(join(dir, filename), `${message}\n`);
  execSync(`git add ${filename} && git commit -m "${message}"`, { cwd: dir, stdio: 'ignore' });
}

test('computeFreshness returns ahead/behind counts against a fixture repo with a known-behind branch', () => {
  const bareDir = mkdtempSync(join(tmpdir(), 'bfl-fresh-bare-'));
  const seedDir = mkdtempSync(join(tmpdir(), 'bfl-fresh-seed-'));
  const cloneDir = mkdtempSync(join(tmpdir(), 'bfl-fresh-clone-'));
  const pusherDir = mkdtempSync(join(tmpdir(), 'bfl-fresh-pusher-'));

  try {
    execSync('git init --bare -b main', { cwd: bareDir, stdio: 'ignore' });

    initRepo(seedDir);
    commit(seedDir, 'README.md', 'init');
    execSync(`git remote add origin ${bareDir}`, { cwd: seedDir, stdio: 'ignore' });
    execSync('git push origin main', { cwd: seedDir, stdio: 'ignore' });

    // Clone at this point: this is the repo under test, N commits behind
    // once the pusher below pushes further commits to origin.
    execSync(`git clone ${bareDir} ${cloneDir}`, { stdio: 'ignore' });

    // Direct unit coverage of resolveDefaultRemoteBranch against a real
    // clone whose refs/remotes/origin/HEAD was set by `git clone`. The
    // result is remote-qualified (matches coordination.mjs's own
    // resolveDefaultRemoteBranch behavior), not a bare branch name.
    assert.equal(resolveDefaultRemoteBranch(cloneDir), 'origin/main');

    execSync(`git clone ${bareDir} ${pusherDir}`, { stdio: 'ignore' });
    execSync('git config user.email "test@test.com"', { cwd: pusherDir, stdio: 'ignore' });
    execSync('git config user.name "Test"', { cwd: pusherDir, stdio: 'ignore' });
    execSync('git config commit.gpgsign false', { cwd: pusherDir, stdio: 'ignore' });
    commit(pusherDir, 'a.txt', 'commit-a');
    commit(pusherDir, 'b.txt', 'commit-b');
    commit(pusherDir, 'c.txt', 'commit-c');
    execSync('git push origin main', { cwd: pusherDir, stdio: 'ignore' });

    const result = computeFreshness({ cwd: cloneDir, defaultBranch: 'main' });
    assert.deepEqual(result, { degraded: false, ahead: 0, behind: 3 });

    // Same assertion, but auto-resolving the default branch (exercises the
    // "origin/main" -> "main" stripping path fed by resolveDefaultRemoteBranch).
    const autoResolved = computeFreshness({ cwd: cloneDir });
    assert.deepEqual(autoResolved, { degraded: false, ahead: 0, behind: 3 });
  } finally {
    rmSync(bareDir, { recursive: true, force: true });
    rmSync(seedDir, { recursive: true, force: true });
    rmSync(cloneDir, { recursive: true, force: true });
    rmSync(pusherDir, { recursive: true, force: true });
  }
});

test('computeFreshness degrades gracefully when origin is unreachable', () => {
  const repoDir = mkdtempSync(join(tmpdir(), 'bfl-fresh-unreach-'));
  try {
    initRepo(repoDir);
    commit(repoDir, 'README.md', 'init');
    execSync('git remote add origin /nonexistent/path/that/does/not/exist', { cwd: repoDir, stdio: 'ignore' });

    const result = computeFreshness({ cwd: repoDir, defaultBranch: 'main' });
    assert.equal(result.degraded, true);
    assert.equal(typeof result.reason, 'string');
    assert.ok(result.reason.length > 0);
  } finally {
    rmSync(repoDir, { recursive: true, force: true });
  }
});

test('computeFreshness degrades gracefully when defaultBranch has no corresponding origin ref (rev-list parse failure path)', () => {
  const bareDir = mkdtempSync(join(tmpdir(), 'bfl-fresh-norev-bare-'));
  const repoDir = mkdtempSync(join(tmpdir(), 'bfl-fresh-norev-repo-'));
  try {
    execSync('git init --bare -b main', { cwd: bareDir, stdio: 'ignore' });

    initRepo(repoDir);
    commit(repoDir, 'README.md', 'init');
    execSync(`git remote add origin ${bareDir}`, { cwd: repoDir, stdio: 'ignore' });
    execSync('git push origin main', { cwd: repoDir, stdio: 'ignore' });

    // "no-such-branch" doesn't exist on origin, so `git fetch origin
    // no-such-branch` (or the subsequent rev-list against
    // origin/no-such-branch) fails non-zero — exercising the same
    // total-degrade catch that guards the malformed/non-numeric rev-list
    // output branches.
    const result = computeFreshness({ cwd: repoDir, defaultBranch: 'no-such-branch' });
    assert.equal(result.degraded, true);
    assert.equal(typeof result.reason, 'string');
    assert.ok(result.reason.length > 0);
  } finally {
    rmSync(bareDir, { recursive: true, force: true });
    rmSync(repoDir, { recursive: true, force: true });
  }
});

test('computeFreshness degrades when no default branch is passed and none can be resolved', () => {
  const repoDir = mkdtempSync(join(tmpdir(), 'bfl-fresh-noremote-'));
  try {
    initRepo(repoDir);
    commit(repoDir, 'README.md', 'init');

    assert.equal(resolveDefaultRemoteBranch(repoDir), null);

    const result = computeFreshness({ cwd: repoDir });
    assert.deepEqual(result, { degraded: true, reason: 'could not resolve default remote branch' });
  } finally {
    rmSync(repoDir, { recursive: true, force: true });
  }
});
