// Runner that never resolves — must be abandoned by the engine via
// Promise.race after 500 ms with adev/diagnostic-timeout.
export function run(_ctx) {
  return new Promise(() => {
    /* intentionally never resolves */
  });
}
