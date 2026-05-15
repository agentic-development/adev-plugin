// Runner that resolves after ~250 ms — exceeds the 200 ms soft budget
// (adev/diagnostic-slow) but stays under the 500 ms hard timeout.
export function run(_ctx) {
  return new Promise((resolve) => {
    setTimeout(() => resolve({ fired: false }), 250);
  });
}
