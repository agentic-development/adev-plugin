// tests/integration/bugfix-loop-commit-pr-live.test.mjs
//
// Real (non-mocked) happy-path coverage for `commitAndOpenPr()` against a
// genuine `git`/`gh` CLI and a disposable scratch GitHub repo — the one
// test the spec's Migration Path Step 3 Verification requires to be
// non-mocked ("a real (non-mocked) integration test behind the existing
// `ci_tag: integration` gate for the happy path"). Every other test in
// this feature mocks execFileImpl; this file intentionally does not.
//
// Named with "integration" so `node --test --test-name-pattern "integration"`
// selects it; excluded from the default `npm test` run (docs/test-strategies.md's
// documented pattern). Per this project's no-silent-skip convention
// (feedback_falsify_guards): when this suite IS invoked and its
// infrastructure is unavailable, it fails hard (throws, naming the missing
// precondition) — it never skips silently.
//
// Requires (see .context-index/specs/features/autonomous-bugfix-loop/
// bugfix-loop-execution-hardening.plan.md's "Test Infrastructure
// Requirements" section):
//   - `gh` CLI installed and authenticated (GH_TOKEN or `gh auth login`),
//     with the `repo` scope (create/delete a repo, push, open a PR).
//   - Network reachability to GitHub.
// The test self-provisions its own disposable scratch repo via
// `gh repo create` and tears it down via `gh repo delete` — it never
// touches a pre-provisioned repo or this repo itself.
//
// Spec: .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-execution-hardening.spec.md
// Plan-task: 9

import { test, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { commitAndOpenPr } from '../../lib/bugfix-loop-commit.mjs';

// --- Credential/infra guard — must run before any test registers, per
// docs/test-strategies.md Step 2. Missing infra is a setup error, not RED,
// and must fail hard (throw), never `process.exit`-skip silently, per this
// project's no-silent-skip convention. ---
function checkInfra() {
  const problems = [];
  try {
    execFileSync('gh', ['auth', 'status'], { stdio: 'ignore' });
  } catch {
    problems.push('gh CLI is not installed or not authenticated (run `gh auth login`, or set GH_TOKEN)');
  }
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
  } catch {
    problems.push('git CLI is not installed');
  }
  if (problems.length > 0) {
    throw new Error(
      `INTEGRATION_NO_CREDENTIALS: bugfix-loop-commit-pr-live requires real gh/git infrastructure.\n` +
      `Problems:\n  - ${problems.join('\n  - ')}\n` +
      `This test intentionally fails hard rather than skipping — see docs/test-strategies.md.`,
    );
  }
}

let scratchRepoName;
let scratchRepoFullName;
let localDir;

before(() => {
  checkInfra();

  scratchRepoName = `adev-bfl-scratch-${randomUUID().slice(0, 8)}`;
  const out = execFileSync(
    'gh',
    ['repo', 'create', scratchRepoName, '--private', '--clone=false'],
    { encoding: 'utf8' },
  );
  // `gh repo create` prints the repo URL; derive owner/name from it for
  // `gh repo delete` at teardown (works regardless of the URL's exact form).
  const urlMatch = (out || '').trim().match(/([^/\s]+\/[^/\s]+?)(?:\.git)?$/);
  scratchRepoFullName = urlMatch ? urlMatch[1] : scratchRepoName;

  localDir = mkdtempSync(join(tmpdir(), 'adev-bfl-commit-live-'));
  execFileSync('git', ['clone', `https://github.com/${scratchRepoFullName}.git`, localDir], { stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'adev-integration-test@example.com'], { cwd: localDir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'adev integration test'], { cwd: localDir, stdio: 'ignore' });
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: localDir, stdio: 'ignore' });
  writeFileSync(join(localDir, 'README.md'), 'init\n');
  execFileSync('git', ['add', '-A'], { cwd: localDir, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: localDir, stdio: 'ignore' });
  execFileSync('git', ['push', 'origin', 'HEAD:main'], { cwd: localDir, stdio: 'ignore' });
});

after(() => {
  if (localDir) rmSync(localDir, { recursive: true, force: true });
  if (scratchRepoFullName) {
    try {
      execFileSync('gh', ['repo', 'delete', scratchRepoFullName, '--yes'], { stdio: 'ignore' });
    } catch {
      // Best-effort teardown — a leaked scratch repo is a minor cleanup
      // issue, not a reason to fail an otherwise-passing test run.
    }
  }
});

test('integration: commitAndOpenPr happy path against a real scratch git repo and gh CLI opens an actual PR', () => {
  writeFileSync(join(localDir, 'fix.txt'), 'the fix\n');

  const result = commitAndOpenPr({
    cwd: localDir,
    issueId: 'issue-live-1',
    title: 'Fix the thing (integration test)',
    notes: 'Verified via a real scratch repo.',
    specPath: '.context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-execution-hardening.spec.md',
    prBase: 'main',
  });

  assert.equal(result.skipped, false, `expected a successful PR, got skip reason: ${result.reason}`);
  assert.equal(result.branch, 'adev/bugfix-issue-live-1');
  assert.match(result.prUrl, /^https:\/\/github\.com\//);

  // Verify the branch actually exists on the remote.
  const branches = execFileSync('git', ['ls-remote', '--heads', 'origin'], { cwd: localDir, encoding: 'utf8' });
  assert.match(branches, /adev\/bugfix-issue-live-1/);
});
