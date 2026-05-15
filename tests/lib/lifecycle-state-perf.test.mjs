/**
 * Performance harness for lib/lifecycle-state.mjs.
 *
 * Asserts the charter Quality Attributes latency targets at single-process
 * scale, wrapped in a generous CI margin to avoid flakes on shared
 * runners (local: x3, CI: x10 — rented runners vary wildly).
 *
 *   appendEvent             p99 < 5 ms  -> local 25 ms / CI 50 ms
 *   currentState (N=50)     p99 < 5 ms  -> local 25 ms / CI 50 ms
 *   currentState (N=1000)   p99 < 50 ms -> local 250 ms / CI 500 ms
 *   listLifecycleStates(100 specs) p99 < 100 ms -> local 500 ms / CI 1000 ms
 *
 * On heavily loaded runners (CI loadavg > 4, local loadavg > 8) individual
 * perf cases are skipped defensively. The local threshold is higher because
 * dev machines often idle at 2-5 loadavg from background services.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadavg } from 'node:os';
import { createTempDir, cleanupTempDir } from '../helpers.mjs';
import { appendEvent, currentState, listLifecycleStates } from '../../lib/lifecycle-state.mjs';

// GitHub Actions sets CI=true; some other CIs set CI=1; accept any truthy.
const ON_CI = !!process.env.CI && process.env.CI !== 'false' && process.env.CI !== '0';
const CI_MARGIN = ON_CI ? 10 : 5;
const APPEND_TARGET_MS = 5;
const FOLD_SMALL_TARGET_MS = 5;
const FOLD_LARGE_TARGET_MS = 50;
const AGGREGATE_TARGET_MS = 100;

function isOverloaded() {
  const threshold = ON_CI ? 4 : 8;
  return loadavg()[0] > threshold;
}

function makeProject() {
  const root = createTempDir();
  mkdirSync(join(root, '.context-index'), { recursive: true });
  writeFileSync(join(root, '.context-index', 'manifest.yaml'), 'project:\n  name: test\nlifecycle:\n  event_diagnostics: off\n');
  return root;
}

function p99(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * 0.99);
  return sorted[Math.min(idx, sorted.length - 1)];
}

function bigintMs(start) {
  return Number(process.hrtime.bigint() - start) / 1_000_000;
}

test('appendEvent p99 < 5 ms over 1000 iterations', () => {
  if (isOverloaded()) return;
  const root = makeProject();
  try {
    const specPath = '.context-index/specs/features/test/perf.spec.md';
    const samples = [];
    for (let i = 0; i < 1000; i++) {
      const t0 = process.hrtime.bigint();
      appendEvent(root, specPath, { event: 'lifecycle_step', step: 'specify', iter: i });
      samples.push(bigintMs(t0));
    }
    const observed = p99(samples);
    assert.ok(
      observed < APPEND_TARGET_MS * CI_MARGIN,
      `appendEvent p99 = ${observed.toFixed(2)} ms, expected < ${APPEND_TARGET_MS * CI_MARGIN} ms`,
    );
  } finally {
    cleanupTempDir(root);
  }
});

test('currentState p99 < 5 ms at N=50', () => {
  if (isOverloaded()) return;
  const root = makeProject();
  try {
    const specPath = '.context-index/specs/features/test/perf-small.spec.md';
    for (let i = 0; i < 50; i++) {
      appendEvent(root, specPath, { event: 'lifecycle_step', step: 'specify', iter: i });
    }
    const samples = [];
    for (let i = 0; i < 50; i++) {
      const t0 = process.hrtime.bigint();
      currentState(root, specPath);
      samples.push(bigintMs(t0));
    }
    const observed = p99(samples);
    assert.ok(
      observed < FOLD_SMALL_TARGET_MS * CI_MARGIN,
      `currentState(N=50) p99 = ${observed.toFixed(2)} ms, expected < ${FOLD_SMALL_TARGET_MS * CI_MARGIN} ms`,
    );
  } finally {
    cleanupTempDir(root);
  }
});

test('currentState p99 < 50 ms at N=1000', () => {
  if (isOverloaded()) return;
  const root = makeProject();
  try {
    const specPath = '.context-index/specs/features/test/perf-large.spec.md';
    for (let i = 0; i < 1000; i++) {
      appendEvent(root, specPath, { event: 'lifecycle_step', step: 'specify', iter: i });
    }
    const samples = [];
    for (let i = 0; i < 20; i++) {
      const t0 = process.hrtime.bigint();
      currentState(root, specPath);
      samples.push(bigintMs(t0));
    }
    const observed = p99(samples);
    assert.ok(
      observed < FOLD_LARGE_TARGET_MS * CI_MARGIN,
      `currentState(N=1000) p99 = ${observed.toFixed(2)} ms, expected < ${FOLD_LARGE_TARGET_MS * CI_MARGIN} ms`,
    );
  } finally {
    cleanupTempDir(root);
  }
});

test('listLifecycleStates p99 < 100 ms at 100 specs', () => {
  if (isOverloaded()) return;
  const root = makeProject();
  try {
    // Seed 100 spec logs, each with a handful of events.
    for (let i = 0; i < 100; i++) {
      const specPath = `.context-index/specs/features/test/spec-${i}.spec.md`;
      for (let j = 0; j < 5; j++) {
        appendEvent(root, specPath, { event: 'lifecycle_step', step: 'specify', iter: j });
      }
    }
    const samples = [];
    for (let i = 0; i < 10; i++) {
      const t0 = process.hrtime.bigint();
      listLifecycleStates(root);
      samples.push(bigintMs(t0));
    }
    const observed = p99(samples);
    assert.ok(
      observed < AGGREGATE_TARGET_MS * CI_MARGIN,
      `listLifecycleStates(100) p99 = ${observed.toFixed(2)} ms, expected < ${AGGREGATE_TARGET_MS * CI_MARGIN} ms`,
    );
  } finally {
    cleanupTempDir(root);
  }
});
