// lib/parallel/config.mjs
//
// Config + safety helpers for /adev:implement --parallel:
//   - clampMaxParallel: bound concurrency, floored at 1 (SEC-5) — mirrors the
//     `cas_lock_stale_seconds` floor pattern in lib/issues/json-adapter.mjs.
//   - detectRerunCollision: a retained worktree from a prior failed run must NOT
//     be silently reused (idempotent `add` would merge stale partial commits →
//     wrong result; SEC-2). The caller aborts that group with RERUN_COLLISION.
//
// Pure + an injectable worktree lister (defaults to lib/worktree.mjs::list).

import { list as defaultList } from "../worktree.mjs";

const DEFAULT_MAX_PARALLEL = 4;

/**
 * @param {object|null|undefined} manifest
 * @returns {number} concurrency cap, integer ≥ 1
 */
export function clampMaxParallel(manifest) {
  const raw = manifest?.implement?.max_parallel;
  const n = raw === undefined || raw === null ? DEFAULT_MAX_PARALLEL : Number(raw);
  if (!Number.isFinite(n)) return 1;
  const floored = Math.floor(n);
  return floored < 1 ? 1 : floored;
}

/**
 * @param {string} slug  the group's worktree slug
 * @param {object} [opts]
 * @param {string} [opts.cwd]
 * @param {() => Array<{slug:string}>} [opts.listFn]  injectable for tests
 * @returns {boolean} true if a retained worktree already exists for the slug
 */
export function detectRerunCollision(slug, { cwd = process.cwd(), listFn } = {}) {
  const list = listFn || (() => defaultList({ cwd }));
  return list().some((w) => w.slug === slug);
}
