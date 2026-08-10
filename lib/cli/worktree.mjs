// lib/cli/worktree.mjs
//
// `adev worktree` — CLI surface for adev-managed git worktrees (lib/worktree.mjs).
// Enables parallel, isolated lifecycle execution (e.g. `/adev:implement --parallel`,
// parallel `/adev:build --milestone`) without leaning on the harness's nesting-prone
// `isolation: "worktree"`.
//
// Contract (driver-substrate): exports `run({ projectRoot, argv, manifest })` and `help()`.
//
// Subcommands:
//   add    --slug <s> [--base <ref>]        create (or reuse) a worktree; JSON on stdout
//   list                                     list adev-managed worktrees; JSON array
//   merge  --slug <s> [--no-ff]             merge adev/<slug> into current branch
//   remove --slug <s> [--force] [--delete-branch]
//   guard                                    report nesting status of cwd (JSON)
//
// Exit codes:
//   0  success — JSON on stdout
//   1  argument error, WorktreeError, or unexpected exception

import { parseArgs } from "node:util";

import {
  add,
  list,
  merge,
  remove,
  detectNesting,
  WorktreeError,
} from "../worktree.mjs";

const USAGE =
  "usage: adev worktree <add|list|merge|remove|guard> [--slug <s>] [--base <ref>] [--no-ff] [--force] [--delete-branch]";

export function help() {
  process.stdout.write(USAGE + "\n");
}

function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

export async function run({ projectRoot, argv }) {
  const sub = argv[0];
  const rest = argv.slice(1);

  let opts;
  try {
    ({ values: opts } = parseArgs({
      args: rest,
      options: {
        slug: { type: "string" },
        base: { type: "string" },
        "no-ff": { type: "boolean", default: false },
        force: { type: "boolean", default: false },
        "delete-branch": { type: "boolean", default: false },
      },
      allowPositionals: false,
    }));
  } catch (err) {
    process.stderr.write(`${err.message}\n${USAGE}\n`);
    return 1;
  }

  const cwd = projectRoot || process.cwd();

  try {
    switch (sub) {
      case "add": {
        if (!opts.slug) return argErr("add requires --slug");
        emit(add({ slug: opts.slug, baseRef: opts.base, cwd }));
        return 0;
      }
      case "list": {
        emit(list({ cwd }));
        return 0;
      }
      case "merge": {
        if (!opts.slug) return argErr("merge requires --slug");
        emit(merge({ slug: opts.slug, cwd, noFf: opts["no-ff"] }));
        return 0;
      }
      case "remove": {
        if (!opts.slug) return argErr("remove requires --slug");
        emit(
          remove({
            slug: opts.slug,
            cwd,
            force: opts.force,
            deleteBranch: opts["delete-branch"],
          }),
        );
        return 0;
      }
      case "guard": {
        emit(detectNesting(cwd));
        return 0;
      }
      default:
        process.stderr.write(`unknown worktree subcommand: ${sub ?? "(none)"}\n${USAGE}\n`);
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

function argErr(msg) {
  process.stderr.write(`${msg}\n${USAGE}\n`);
  return 1;
}
