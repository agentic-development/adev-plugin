// Fixture: a LIFECYCLE_STEP-bound module that does NOT call requireGate first.
// The pattern detector must flag this as non-conforming.

export const LIFECYCLE_STEP = "plan";

export async function run() {
  // Declares lifecycle binding but does NOT call requireGate first.
  console.log("doing work without gating");
}

export function help() {
  console.log("fixture: non-conforming-no-gate");
}
