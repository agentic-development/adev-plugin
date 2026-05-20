import test from 'node:test';
import assert from 'node:assert/strict';
import { rewriteHookConfigForCopilot } from '../lib/providers/copilot/hook-config-rewriter.mjs';

test('absolute pluginRoot/hooks/foo.sh rewritten to ./scripts/foo.sh', () => {
  const pluginRoot = '/Users/dev/adev-plugin';
  const input = {
    version: 1,
    hooks: {
      preToolUse: [{ type: 'command', bash: '/Users/dev/adev-plugin/hooks/foo.sh', cwd: '.' }],
    },
  };
  const { rewrittenConfig, scriptFiles } = rewriteHookConfigForCopilot(input, pluginRoot);
  assert.equal(rewrittenConfig.hooks.preToolUse[0].bash, './scripts/foo.sh');
  assert.deepEqual(scriptFiles, ['foo.sh']);
});

test('${CLAUDE_PLUGIN_ROOT}/hooks/foo.sh runtime placeholder rewritten to ./scripts/foo.sh', () => {
  const pluginRoot = '/Users/dev/adev-plugin';
  const input = {
    version: 1,
    hooks: {
      preToolUse: [{ type: 'command', bash: 'bash "${CLAUDE_PLUGIN_ROOT}/hooks/foo.sh"', cwd: '.' }],
    },
  };
  const { rewrittenConfig, scriptFiles } = rewriteHookConfigForCopilot(input, pluginRoot);
  assert.equal(rewrittenConfig.hooks.preToolUse[0].bash, 'bash "./scripts/foo.sh"');
  assert.deepEqual(scriptFiles, ['foo.sh']);
});

test('output contains zero absolute paths AND zero ${CLAUDE_PLUGIN_ROOT} substrings', () => {
  const pluginRoot = '/Users/dev/adev-plugin';
  const input = {
    version: 1,
    hooks: {
      preToolUse: [{ type: 'command', bash: '/Users/dev/adev-plugin/hooks/a.sh', cwd: '.' }],
      postToolUse: [
        { type: 'command', bash: 'bash "${CLAUDE_PLUGIN_ROOT}/hooks/b.sh"', cwd: '.' },
        { type: 'command', bash: 'bash "${CLAUDE_PLUGIN_ROOT}/hooks/c.sh"', cwd: '.' },
      ],
    },
  };
  const { rewrittenConfig } = rewriteHookConfigForCopilot(input, pluginRoot);
  const json = JSON.stringify(rewrittenConfig);
  assert.equal(json.includes(pluginRoot), false);
  assert.equal(json.includes('/Users/'), false);
  assert.equal(json.includes('${CLAUDE_PLUGIN_ROOT}'), false);
});

test('mixed inputs (some absolute, some placeholder) all rewrite to ./scripts/', () => {
  const pluginRoot = '/Users/dev/adev-plugin';
  const input = {
    hooks: {
      preToolUse: [{ bash: '/Users/dev/adev-plugin/hooks/x.sh' }],
      postToolUse: [{ bash: 'bash "${CLAUDE_PLUGIN_ROOT}/hooks/y.sh"' }],
    },
  };
  const { rewrittenConfig, scriptFiles } = rewriteHookConfigForCopilot(input, pluginRoot);
  assert.equal(rewrittenConfig.hooks.preToolUse[0].bash, './scripts/x.sh');
  assert.equal(rewrittenConfig.hooks.postToolUse[0].bash, 'bash "./scripts/y.sh"');
  assert.deepEqual(scriptFiles.sort(), ['x.sh', 'y.sh']);
});

test('script file list is deduplicated', () => {
  const pluginRoot = '/p';
  const input = {
    hooks: {
      preToolUse: [{ bash: '/p/hooks/dup.sh' }],
      postToolUse: [{ bash: '/p/hooks/dup.sh' }],
    },
  };
  const { scriptFiles } = rewriteHookConfigForCopilot(input, pluginRoot);
  assert.deepEqual(scriptFiles.sort(), ['dup.sh']);
});

test('result is sorted ascending', () => {
  const pluginRoot = '/p';
  const input = {
    hooks: {
      preToolUse: [
        { bash: 'bash "${CLAUDE_PLUGIN_ROOT}/hooks/zeta.sh"' },
        { bash: '/p/hooks/alpha.sh' },
        { bash: 'bash "${CLAUDE_PLUGIN_ROOT}/hooks/mu.sh"' },
      ],
    },
  };
  const { scriptFiles } = rewriteHookConfigForCopilot(input, pluginRoot);
  assert.deepEqual(scriptFiles, ['alpha.sh', 'mu.sh', 'zeta.sh']);
});

test('deep-clone: input config is not mutated', () => {
  const pluginRoot = '/p';
  const input = {
    hooks: {
      preToolUse: [{ bash: '/p/hooks/foo.sh' }],
    },
  };
  const original = JSON.parse(JSON.stringify(input));
  rewriteHookConfigForCopilot(input, pluginRoot);
  assert.deepEqual(input, original);
});

test('regex-special characters in pluginRoot are escaped', () => {
  // pluginRoot like /Users/foo.bar/adev-plugin (dot would otherwise be a regex wildcard)
  const pluginRoot = '/Users/foo.bar/adev-plugin';
  const input = {
    hooks: {
      preToolUse: [{ bash: '/Users/foo.bar/adev-plugin/hooks/x.sh' }],
    },
  };
  const { rewrittenConfig, scriptFiles } = rewriteHookConfigForCopilot(input, pluginRoot);
  assert.equal(rewrittenConfig.hooks.preToolUse[0].bash, './scripts/x.sh');
  assert.deepEqual(scriptFiles, ['x.sh']);
});

test('config with no hooks key returns cleanly', () => {
  const { rewrittenConfig, scriptFiles } = rewriteHookConfigForCopilot({ version: 1 }, '/p');
  assert.deepEqual(rewrittenConfig, { version: 1 });
  assert.deepEqual(scriptFiles, []);
});

test('hook entries without bash field skipped without error', () => {
  const input = {
    hooks: {
      preToolUse: [{ type: 'something-else' }, { bash: '/p/hooks/foo.sh' }],
    },
  };
  const { rewrittenConfig, scriptFiles } = rewriteHookConfigForCopilot(input, '/p');
  assert.equal(rewrittenConfig.hooks.preToolUse[1].bash, './scripts/foo.sh');
  assert.deepEqual(scriptFiles, ['foo.sh']);
});
