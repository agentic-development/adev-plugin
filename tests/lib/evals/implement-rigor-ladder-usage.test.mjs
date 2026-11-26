import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createTempDir, cleanupTempDir } from '../../helpers.mjs';
import {
  classifyRun,
  implementPrompt,
  sessionTranscriptPaths,
  transcriptUsage,
} from '../../evals/implement-rigor-ladder/run-ab-eval.mjs';

const usage = (input, output, create, read) => ({
  input_tokens: input,
  output_tokens: output,
  cache_creation_input_tokens: create,
  cache_read_input_tokens: read,
});

function assistantRow(id, u, content) {
  return JSON.stringify({ type: 'assistant', message: { id, usage: u, content } });
}

test('transcriptUsage counts each message.id once, last split row wins, and sums across files', () => {
  const dir = createTempDir();
  try {
    const main = join(dir, 'main.jsonl');
    writeFileSync(
      main,
      [
        assistantRow('msg_1', usage(10, 1, 100, 1000), [{ type: 'thinking', thinking: '...' }]),
        assistantRow('msg_1', usage(10, 5, 100, 1000), [{ type: 'text', text: 'dispatching' }]),
        assistantRow('msg_1', usage(10, 7, 100, 1000), [{ type: 'tool_use', id: 'tu_1', name: 'Agent', input: {} }]),
        JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu_1' }] } }),
        assistantRow('msg_2', usage(3, 2, 0, 1200), [{ type: 'tool_use', id: 'tu_2', name: 'Bash', input: {} }]),
        'not json',
      ].join('\n') + '\n',
    );
    const sub = join(dir, 'agent-a.jsonl');
    writeFileSync(
      sub,
      [
        assistantRow('msg_s1', usage(4, 1, 50, 0), [{ type: 'text', text: 'a' }]),
        assistantRow('msg_s1', usage(4, 9, 50, 0), [{ type: 'tool_use', id: 'tu_s1', name: 'Task', input: {} }]),
      ].join('\n') + '\n',
    );

    assert.deepEqual(transcriptUsage([main, sub, join(dir, 'missing.jsonl')]), {
      tokens: usage(10 + 3 + 4, 7 + 2 + 9, 100 + 0 + 50, 1000 + 1200 + 0),
      agentDispatches: 2,
      transcripts: 2,
    });
  } finally {
    cleanupTempDir(dir);
  }
});

test('sessionTranscriptPaths reads the projects root under configDir and includes subagent transcripts', () => {
  const configDir = createTempDir();
  try {
    const projectDir = '/private/var/tmp/adev-ev1-sandbox-abc.d';
    const sessionDir = join(configDir, 'projects', projectDir.replace(/[^a-zA-Z0-9]/g, '-'));
    mkdirSync(join(sessionDir, 'sess-1', 'subagents'), { recursive: true });
    writeFileSync(join(sessionDir, 'sess-1.jsonl'), '');
    writeFileSync(join(sessionDir, 'sess-1', 'subagents', 'agent-x.jsonl'), '');
    writeFileSync(join(sessionDir, 'sess-1', 'subagents', 'notes.txt'), '');

    assert.deepEqual(sessionTranscriptPaths('sess-1', projectDir, { configDir }), [
      join(sessionDir, 'sess-1.jsonl'),
      join(sessionDir, 'sess-1', 'subagents', 'agent-x.jsonl'),
    ]);
    assert.deepEqual(sessionTranscriptPaths('sess-2', projectDir, { configDir }), []);
    assert.deepEqual(sessionTranscriptPaths(null, projectDir, { configDir }), []);
  } finally {
    cleanupTempDir(configDir);
  }
});

test('classifyRun accepts only a clean, committed, measured implement run', () => {
  const ok = { exitCode: 0, verdict: 'PASS', taskCommits: 7, sessionId: 's', transcripts: 3 };
  assert.deepEqual(classifyRun(ok), { valid: true, reasons: [] });
  assert.deepEqual(classifyRun({ ...ok, exitCode: 1 }), { valid: false, reasons: ['implement-exit-nonzero'] });
  assert.deepEqual(classifyRun({ ...ok, exitCode: null }), { valid: false, reasons: ['implement-exit-nonzero'] });
  assert.deepEqual(classifyRun({ ...ok, verdict: 'FAIL' }), { valid: false, reasons: ['implement-verdict-not-pass'] });
  assert.deepEqual(classifyRun({ ...ok, verdict: null }), { valid: false, reasons: ['implement-verdict-not-pass'] });
  assert.deepEqual(classifyRun({ ...ok, taskCommits: 0 }), { valid: false, reasons: ['no-task-commits'] });
  assert.deepEqual(classifyRun({ ...ok, sessionId: null, transcripts: 0 }), { valid: false, reasons: ['no-session-id'] });
  assert.deepEqual(classifyRun({ ...ok, transcripts: 0 }), { valid: false, reasons: ['no-transcripts'] });
  assert.deepEqual(classifyRun({ exitCode: 2, verdict: null, taskCommits: 0, sessionId: 's', transcripts: 0 }), {
    valid: false,
    reasons: ['implement-exit-nonzero', 'implement-verdict-not-pass', 'no-task-commits', 'no-transcripts'],
  });
});

test('implementPrompt passes the plan path positionally', () => {
  assert.equal(
    implementPrompt({ implementArgs: ['--tier full'] }),
    '/adev:implement .context-index/specs/features/example/example.plan.md --tier full',
  );
  assert.equal(implementPrompt({ implementArgs: [] }), '/adev:implement .context-index/specs/features/example/example.plan.md');
});
