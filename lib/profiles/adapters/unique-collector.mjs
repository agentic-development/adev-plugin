/**
 * Order-preserving, dedup-on-insert collector.
 *
 * `lib/profiles/adapters/claude-code.mjs` and `lib/profiles/adapters/opencode.mjs`
 * each independently defined an identical `add(name)` closure inside
 * `prepareForDispatch` — a `Set`-backed guard pushing into a locally-scoped
 * array only on first sight (flagged by /adev:codehealth's duplicate-logic
 * pass). Every harness adapter's `prepareForDispatch` needs exactly this
 * shape to build its `allowedTools` list without duplicate tool names, so
 * it's lifted here rather than reimplemented per adapter.
 *
 * @module lib/profiles/adapters/unique-collector
 */

/**
 * @returns {{ list: string[], add: (name: string) => void }}
 *   `list` accumulates unique names in first-seen order; `add` pushes a name
 *   onto it, silently ignoring repeats.
 */
export function createUniqueCollector() {
  const list = [];
  const seen = new Set();
  const add = (name) => {
    if (!seen.has(name)) {
      seen.add(name);
      list.push(name);
    }
  };
  return { list, add };
}
