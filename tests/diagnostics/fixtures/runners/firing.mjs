// A legitimate runner that always fires with a fixed verdict.
// Used to exercise the engine's verdict annotation and runner_path stamping.
export function run(_ctx) {
  return {
    fired: true,
    severity: 'warning',
    message: 'fixture firing',
  };
}
