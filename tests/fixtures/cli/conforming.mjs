// Fixture: a conforming lifecycle-bound CLI helper.
// - Exports run, help, and LIFECYCLE_STEP.
// - First executable statement of run() is requireGate(...).
// Used by tests/cli-driver-pattern.test.mjs as the positive-case fixture.

import { requireGate } from "../../../lib/lifecycle-state.mjs";

export const LIFECYCLE_STEP = "plan";

export async function run({ state, mode }) {
  requireGate(state, LIFECYCLE_STEP, { mode });
  // ... actual work would follow
}

export function help() {
  console.log("fixture: conforming");
}
