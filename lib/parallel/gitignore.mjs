// lib/parallel/gitignore.mjs
//
// Ensure the main repo's .gitignore carries a managed block ignoring
// `.adev/worktrees/`, so adev-managed (and retained-on-failure) worktrees can
// never be staged into a commit. Claims the deferred git-ignore guarantee from
// worktree-primitive.spec.md (Coverage Gap) / charter Reliability invariant.
//
// Idempotent; preserves existing content; Node built-ins only.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BEGIN = "# BEGIN adev:worktrees";
const END = "# END adev:worktrees";
const BLOCK = `${BEGIN}\n.adev/worktrees/\n${END}\n`;

/**
 * @param {string} mainRoot  absolute path to the main repo root
 * @returns {{ added: boolean }}
 */
export function ensureWorktreeIgnore(mainRoot) {
  const giPath = join(mainRoot, ".gitignore");
  const existing = existsSync(giPath) ? readFileSync(giPath, "utf8") : "";
  if (existing.includes(BEGIN)) return { added: false };

  const sep = existing.length === 0 || existing.endsWith("\n") ? "" : "\n";
  writeFileSync(giPath, existing + sep + BLOCK);
  return { added: true };
}
