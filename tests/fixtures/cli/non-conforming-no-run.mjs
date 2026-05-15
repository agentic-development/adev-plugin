// Fixture: a module that does NOT export run.
// The pattern detector must flag this as non-conforming.

export function help() {
  console.log("fixture: non-conforming-no-run");
}
