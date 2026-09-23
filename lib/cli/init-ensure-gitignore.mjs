// lib/cli/init-ensure-gitignore.mjs
//
// Sub-verb adapter for `adev init ensure-gitignore [--remove]`. Mirrors the
// shape of `lib/cli/init-prompt-session-capture.mjs` (signature
// `run({ projectRoot, argv, manifest })`).
//
// Behavior:
//   - default (no --remove): respects `setup.managed_gitignore` knob; when
//     false, prints the disabled-by-manifest advisory and exits 0 without
//     writing.
//   - `--remove`: ALWAYS bypasses the knob. Operators must be able to
//     remove a block they previously installed even after disabling the
//     install-time write.
//
// Exit codes:
//   0  success (write / update / repair / dedupe / remove / noop / advisory)
//   1  read-only file or unexpected error
//   2  UNSAFE_GITIGNORE_PATH (path-containment violation)

import { ensureManagedBlock, removeManagedBlock } from "../gitignore-installer.mjs";
import { loadManifest } from "../manifest.mjs";

/**
 * @param {{
 *   projectRoot: string,
 *   argv: string[],
 *   manifest?: object|null,
 * }} ctx
 */
export async function run({ projectRoot, argv, manifest }) {
  const isRemove = Array.isArray(argv) && argv.includes("--remove");

  // Resolve the manifest knob (default true). Use the caller-provided manifest
  // when present so tests can inject a manifest without disk-touching.
  let m = manifest;
  if (m === undefined || m === null) {
    try {
      m = loadManifest(projectRoot);
    } catch {
      m = null;
    }
  }
  const knob = m?.setup?.managed_gitignore;
  const enabled = knob !== false;

  try {
    if (isRemove) {
      // --remove always bypasses the manifest knob (operator escape hatch).
      const result = removeManagedBlock(projectRoot);
      console.log(`managed gitignore: ${result}`);
      process.exit(0);
    }
    if (!enabled) {
      console.log("managed gitignore: disabled by manifest");
      process.exit(0);
    }
    const result = ensureManagedBlock(projectRoot);
    console.log(`managed gitignore: ${result}`);
    process.exit(0);
  } catch (err) {
    if (err?.code === "UNSAFE_GITIGNORE_PATH") {
      console.error(
        "error: UNSAFE_GITIGNORE_PATH — .gitignore escapes project root via symlink",
      );
      process.exit(2);
    }
    if (err?.code === "EACCES") {
      console.error("error: .gitignore is read-only");
      process.exit(1);
    }
    throw err;
  }
}

export function help() {
  console.log("usage: adev init ensure-gitignore [--remove]");
  console.log("");
  console.log("  Install or refresh the adev:gitignore managed block in the project's");
  console.log("  .gitignore. With --remove, excise the block (always bypasses the");
  console.log("  setup.managed_gitignore manifest knob).");
}

export default { run, help };
