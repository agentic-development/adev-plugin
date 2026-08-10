// lib/cli/parallel.mjs
//
// `adev parallel` — CLI surface for the /adev:implement --parallel orchestration
// helpers in lib/parallel/*. Keeps skills/implement/SKILL.md markdown-only
// (cli-driver-surface): the SKILL prose names these verbs; the deterministic
// decisions live here + in lib/parallel/*.
//
// Contract: exports run({ projectRoot, argv, manifest }) and help().
//
// Subcommands:
//   groups   --plan <path>                              → { groups, malformed }
//   baseline                                            → { branch, head, clean }
//   assert-clean --base-head <sha>                      → { ok }  | exit 1 ORCHESTRATOR_POLLUTED
//   verify   --branch <b> --base <sha> --tasks a,b
//            --done a,b,c                                → { ok, commitCount } | exit 1 COMMITS_NOT_VERIFIED
//   max-parallel                                        → { max_parallel }
//   collision --slug <s>                                → { collision }
//
// Exit codes: 0 success (JSON on stdout) · 1 argument error / WorktreeError.

import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";

import { parseParallelizationSection } from "../parallel/groups.mjs";
import { recordBaseline, assertOrchestratorClean } from "../parallel/baseline.mjs";
import { verifyGroupComplete } from "../parallel/verify.mjs";
import { clampMaxParallel, detectRerunCollision } from "../parallel/config.mjs";
import { WorktreeError } from "../worktree.mjs";

const USAGE =
  "usage: adev parallel <groups|baseline|assert-clean|verify|max-parallel|collision> [flags]";

export function help() {
  process.stdout.write(USAGE + "\n");
}

function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}
function argErr(msg) {
  process.stderr.write(`${msg}\n${USAGE}\n`);
  return 1;
}
function csv(v) {
  return typeof v === "string" && v.length ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

export async function run({ projectRoot, argv, manifest }) {
  const sub = argv[0];
  let opts;
  try {
    ({ values: opts } = parseArgs({
      args: argv.slice(1),
      options: {
        plan: { type: "string" },
        "base-head": { type: "string" },
        branch: { type: "string" },
        base: { type: "string" },
        tasks: { type: "string" },
        done: { type: "string" },
        slug: { type: "string" },
      },
      allowPositionals: false,
    }));
  } catch (err) {
    return argErr(err.message);
  }

  const cwd = projectRoot || process.cwd();
  try {
    switch (sub) {
      case "groups": {
        if (!opts.plan) return argErr("groups requires --plan");
        emit(parseParallelizationSection(readFileSync(opts.plan, "utf8")));
        return 0;
      }
      case "baseline": {
        emit(recordBaseline(cwd));
        return 0;
      }
      case "assert-clean": {
        if (!opts["base-head"]) return argErr("assert-clean requires --base-head");
        emit(assertOrchestratorClean(cwd, { head: opts["base-head"] }));
        return 0;
      }
      case "verify": {
        if (!opts.branch || !opts.base) return argErr("verify requires --branch and --base");
        emit(verifyGroupComplete({ cwd, branch: opts.branch, base: opts.base, tasks: csv(opts.tasks), doneTasks: csv(opts.done) }));
        return 0;
      }
      case "max-parallel": {
        emit({ max_parallel: clampMaxParallel(manifest) });
        return 0;
      }
      case "collision": {
        if (!opts.slug) return argErr("collision requires --slug");
        emit({ collision: detectRerunCollision(opts.slug, { cwd }) });
        return 0;
      }
      default:
        process.stderr.write(`unknown parallel subcommand: ${sub ?? "(none)"}\n${USAGE}\n`);
        return 1;
    }
  } catch (err) {
    if (err instanceof WorktreeError) {
      process.stderr.write(`${err.code}: ${err.message}\n`);
      return 1;
    }
    process.stderr.write(`${err.message}\n`);
    return 1;
  }
}
