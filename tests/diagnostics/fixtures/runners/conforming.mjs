// A legitimate runner that returns `{ fired: false }` deterministically.
// Used as the baseline for tier/scope filter tests.
export function run(_ctx) {
  return { fired: false };
}
