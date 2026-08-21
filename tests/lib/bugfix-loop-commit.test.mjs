// tests/lib/bugfix-loop-commit.test.mjs
//
// Spec: .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-execution-hardening.spec.md
// Plan-task: 8, 9
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { validateCommitContent, safeCommitMessage, commitAndOpenPr, branchNameFor } from '../../lib/bugfix-loop-commit.mjs';

// A recording fake for execFileImpl: returns canned output keyed by argv[0]
// (git subcommand or 'pr'), and records every call for assertion. Never
// touches a real subprocess — this is how Task 9's tests assert argv-array
// safety without mocking node:child_process globally.
function makeFakeExec({ currentBranch = 'adev/bugfix-issue-1', prUrl = 'https://github.com/org/repo/pull/1', failOn = null } = {}) {
  const calls = [];
  const exec = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    if (failOn && failOn(cmd, args)) {
      throw new Error(`simulated failure for ${cmd} ${args.join(' ')}`);
    }
    if (cmd === 'git' && args[0] === 'branch' && args[1] === '--show-current') {
      return `${currentBranch}\n`;
    }
    if (cmd === 'gh' && args[0] === 'pr' && args[1] === 'create') {
      return `${prUrl}\n`;
    }
    // Any other recognized-but-uninteresting call (git add, git commit, git
    // checkout, git push) succeeds as a silent no-op. This is safe only
    // because every test below asserts the SPECIFIC call it cares about via
    // `.find()` + `assert.ok(...)` — a test that forgets to assert presence
    // would silently pass against a call that never happened. Do not widen
    // this default to stand in for a call a test actually depends on.
    return '';
  };
  exec.calls = calls;
  return exec;
}

test('validateCommitContent accepts an ordinary WorkItem title', () => {
  assert.equal(validateCommitContent('Fix null pointer in parser'), true);
});

test('validateCommitContent accepts punctuation commonly found in titles', () => {
  assert.equal(validateCommitContent("Handle bug-selection's edge case (issue #42): null vs. undefined"), true);
});

test('validateCommitContent refuses shell-metacharacter content: ; rm -rf, backticks, $(...)', () => {
  for (const unsafe of ['; rm -rf /', '`whoami`', '$(cat /etc/passwd)', 'title && curl evil.com', 'a | b', 'a\nb']) {
    assert.equal(validateCommitContent(unsafe), false, `expected refusal for ${JSON.stringify(unsafe)}`);
  }
});

test('validateCommitContent refuses non-string, empty, and over-length input', () => {
  assert.equal(validateCommitContent(''), false);
  assert.equal(validateCommitContent(null), false);
  assert.equal(validateCommitContent(undefined), false);
  assert.equal(validateCommitContent(123), false);
  assert.equal(validateCommitContent('a'.repeat(201)), false);
  assert.equal(validateCommitContent('a'.repeat(200)), true);
});

test('safeCommitMessage builds a message using the safe title/notes when both validate', () => {
  const msg = safeCommitMessage('issue-42', 'Fix null pointer in parser', 'Root cause was a missing guard.');
  assert.match(msg, /Fix null pointer in parser/);
  assert.match(msg, /issue-42/);
});

test('safeCommitMessage falls back to a generic templated message keyed only by issue id when title is unsafe (refuse, not sanitize)', () => {
  const msg = safeCommitMessage('issue-42', '; rm -rf /', 'notes here');
  assert.doesNotMatch(msg, /rm -rf/);
  assert.match(msg, /issue-42/);
});

test('safeCommitMessage falls back to the generic template when notes are unsafe, even if title is safe', () => {
  const msg = safeCommitMessage('issue-42', 'Fix null pointer', '$(cat /etc/passwd)');
  assert.doesNotMatch(msg, /cat \/etc\/passwd/);
  assert.match(msg, /issue-42/);
});

test('validateCommitContent refuses Unicode line/paragraph separators (U+2028/U+2029), not just ASCII CR/LF', () => {
  assert.equal(validateCommitContent('Fix bug' + String.fromCharCode(0x2028) + 'Spec: fake.spec.md'), false);
  assert.equal(validateCommitContent('Fix bug' + String.fromCharCode(0x2029) + 'Spec: fake.spec.md'), false);
});

test('validateCommitContent refuses whitespace-only content', () => {
  assert.equal(validateCommitContent('   '), false);
});

test('validateCommitContent refuses content starting with a leading dash (argv flag-position ambiguity)', () => {
  assert.equal(validateCommitContent('--force-with-lease'), false);
  assert.equal(validateCommitContent('-x'), false);
});

test('safeCommitMessage falls back to the generic template when title exceeds the git subject-line convention (72 chars), even though it is under validateCommitContent\'s 200-char cap', () => {
  const longTitle = 'A'.repeat(100); // valid per validateCommitContent, too long for a subject line
  assert.equal(validateCommitContent(longTitle), true);
  const msg = safeCommitMessage('issue-42', longTitle, null);
  assert.doesNotMatch(msg, /A{100}/);
  assert.match(msg, /issue-42/);
});

test('safeCommitMessage accepts a title right at the 72-char boundary', () => {
  const title = 'A'.repeat(72);
  const msg = safeCommitMessage('issue-42', title, null);
  assert.match(msg, new RegExp(`A{72}`));
});

test('safeCommitMessage handles missing/null notes gracefully', () => {
  const msg = safeCommitMessage('issue-42', 'Fix null pointer in parser', null);
  assert.match(msg, /Fix null pointer in parser/);
  assert.match(msg, /issue-42/);
});

test('branchNameFor builds adev/bugfix-<issue-id>', () => {
  assert.equal(branchNameFor('issue-1'), 'adev/bugfix-issue-1');
});

test('commitAndOpenPr commits with Spec:/Issue: trailers, pushes adev/bugfix-<id>, opens a PR against the resolved base — every call is argv-array, never a shell string (Plan-task 9)', () => {
  const exec = makeFakeExec();
  const result = commitAndOpenPr({
    cwd: '/fake/repo',
    issueId: 'issue-1',
    title: 'Fix null pointer in parser',
    notes: 'Root cause was a missing guard.',
    specPath: '.context-index/specs/features/foo/foo.spec.md',
    prBase: 'main',
    execFileImpl: exec,
  });

  assert.equal(result.skipped, false);
  assert.equal(result.branch, 'adev/bugfix-issue-1');
  assert.equal(result.prUrl, 'https://github.com/org/repo/pull/1');

  // Every call is (cmd, argsArray, opts) — never a single shell-string arg.
  for (const call of exec.calls) {
    assert.equal(typeof call.cmd, 'string');
    assert.ok(Array.isArray(call.args), `expected argv array for ${call.cmd}, got ${typeof call.args}`);
    for (const arg of call.args) assert.equal(typeof arg, 'string');
  }

  const commitCall = exec.calls.find((c) => c.cmd === 'git' && c.args[0] === 'commit');
  assert.ok(commitCall);
  const message = commitCall.args[commitCall.args.indexOf('-m') + 1];
  assert.match(message, /Issue: issue-1/);
  assert.match(message, /Spec: \.context-index\/specs\/features\/foo\/foo\.spec\.md/);

  const pushCall = exec.calls.find((c) => c.cmd === 'git' && c.args[0] === 'push');
  assert.ok(pushCall);
  assert.deepEqual(pushCall.args, ['push', '-u', 'origin', 'adev/bugfix-issue-1']);

  const prCall = exec.calls.find((c) => c.cmd === 'gh');
  assert.ok(prCall);
  assert.equal(prCall.args[prCall.args.indexOf('--base') + 1], 'main');
  assert.equal(prCall.args[prCall.args.indexOf('--head') + 1], 'adev/bugfix-issue-1');
});

test('commitAndOpenPr checks out adev/bugfix-<id> when not already on it (plain --auto-commit, no --worktree-per-bug)', () => {
  const exec = makeFakeExec({ currentBranch: 'main' }); // not yet on the target branch
  commitAndOpenPr({
    cwd: '/fake/repo', issueId: 'issue-1', title: 'Fix bug', notes: null, prBase: 'main', execFileImpl: exec,
  });
  const checkoutCall = exec.calls.find((c) => c.cmd === 'git' && c.args[0] === 'checkout');
  assert.ok(checkoutCall, 'expected a checkout -b call when not already on the target branch');
  assert.deepEqual(checkoutCall.args, ['checkout', '-b', 'adev/bugfix-issue-1']);
});

test('commitAndOpenPr does NOT check out a new branch when already on adev/bugfix-<id> (--worktree-per-bug already created it)', () => {
  const exec = makeFakeExec({ currentBranch: 'adev/bugfix-issue-1' }); // worktree already on target branch
  commitAndOpenPr({
    cwd: '/fake/repo', issueId: 'issue-1', title: 'Fix bug', notes: null, prBase: 'main', execFileImpl: exec,
  });
  const checkoutCall = exec.calls.find((c) => c.cmd === 'git' && c.args[0] === 'checkout');
  assert.equal(checkoutCall, undefined, 'should not re-checkout when already on the target branch');
});

test('commitAndOpenPr with worktree-per-bug active stacks the PR base on the previous bug branch (not always main) (Plan-task 9)', () => {
  const exec = makeFakeExec();
  const result = commitAndOpenPr({
    cwd: '/fake/repo', issueId: 'issue-2', title: 'Fix another bug', notes: null,
    prBase: 'adev/bugfix-issue-1', // stacked base, resolved by the caller (not this function)
    execFileImpl: exec,
  });
  assert.equal(result.skipped, false);
  const prCall = exec.calls.find((c) => c.cmd === 'gh');
  assert.equal(prCall.args[prCall.args.indexOf('--base') + 1], 'adev/bugfix-issue-1');
});

test('commitAndOpenPr degrades to a logged COMMIT_PR_SKIPPED when gh is missing/unauthenticated — never throws (Plan-task 9)', () => {
  const exec = makeFakeExec({ failOn: (cmd) => cmd === 'gh' });
  const result = commitAndOpenPr({
    cwd: '/fake/repo', issueId: 'issue-1', title: 'Fix bug', notes: null, prBase: 'main', execFileImpl: exec,
  });
  assert.equal(result.skipped, true);
  assert.match(result.reason, /gh pr create failed/);
});

test('commitAndOpenPr degrades to a logged COMMIT_PR_SKIPPED when push is rejected — never throws (Plan-task 9)', () => {
  const exec = makeFakeExec({ failOn: (cmd, args) => cmd === 'git' && args[0] === 'push' });
  const result = commitAndOpenPr({
    cwd: '/fake/repo', issueId: 'issue-1', title: 'Fix bug', notes: null, prBase: 'main', execFileImpl: exec,
  });
  assert.equal(result.skipped, true);
  assert.match(result.reason, /push failed/);
  // gh pr create must never be attempted after a push failure.
  assert.equal(exec.calls.some((c) => c.cmd === 'gh'), false);
});

test('commitAndOpenPr names the specific failing git sub-stage in its degrade reason — branch resolution, checkout, and staging are distinct from "commit failed" (Plan-task 9)', () => {
  const branchFail = makeFakeExec({ failOn: (cmd, args) => cmd === 'git' && args[0] === 'branch' });
  const branchResult = commitAndOpenPr({ cwd: '/fake/repo', issueId: 'issue-1', title: 'Fix bug', notes: null, prBase: 'main', execFileImpl: branchFail });
  assert.equal(branchResult.skipped, true);
  assert.match(branchResult.reason, /branch resolution failed/);

  const checkoutFail = makeFakeExec({ currentBranch: 'main', failOn: (cmd, args) => cmd === 'git' && args[0] === 'checkout' });
  const checkoutResult = commitAndOpenPr({ cwd: '/fake/repo', issueId: 'issue-1', title: 'Fix bug', notes: null, prBase: 'main', execFileImpl: checkoutFail });
  assert.equal(checkoutResult.skipped, true);
  assert.match(checkoutResult.reason, /checkout failed/);

  const addFail = makeFakeExec({ failOn: (cmd, args) => cmd === 'git' && args[0] === 'add' });
  const addResult = commitAndOpenPr({ cwd: '/fake/repo', issueId: 'issue-1', title: 'Fix bug', notes: null, prBase: 'main', execFileImpl: addFail });
  assert.equal(addResult.skipped, true);
  assert.match(addResult.reason, /staging failed/);
});

test('commitAndOpenPr degrades to COMMIT_PR_SKIPPED when the commit itself fails (e.g. nothing to commit) — never throws (Plan-task 9)', () => {
  const exec = makeFakeExec({ failOn: (cmd, args) => cmd === 'git' && args[0] === 'commit' });
  const result = commitAndOpenPr({
    cwd: '/fake/repo', issueId: 'issue-1', title: 'Fix bug', notes: null, prBase: 'main', execFileImpl: exec,
  });
  assert.equal(result.skipped, true);
  assert.match(result.reason, /commit failed/);
  assert.equal(exec.calls.some((c) => c.cmd === 'git' && c.args[0] === 'push'), false);
});

test('commitAndOpenPr falls back to a generic templated commit message when title/notes are refused by validateCommitContent (Plan-task 9)', () => {
  const exec = makeFakeExec();
  commitAndOpenPr({
    cwd: '/fake/repo', issueId: 'issue-1', title: '; rm -rf /', notes: null, prBase: 'main', execFileImpl: exec,
  });
  const commitCall = exec.calls.find((c) => c.cmd === 'git' && c.args[0] === 'commit');
  const message = commitCall.args[commitCall.args.indexOf('-m') + 1];
  assert.doesNotMatch(message, /rm -rf/);
  assert.match(message, /issue-1/);

  const prCall = exec.calls.find((c) => c.cmd === 'gh');
  const prTitle = prCall.args[prCall.args.indexOf('--title') + 1];
  assert.doesNotMatch(prTitle, /rm -rf/);
  assert.match(prTitle, /issue-1/);
});
