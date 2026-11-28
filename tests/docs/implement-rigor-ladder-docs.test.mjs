import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PLUGIN_ROOT } from "../helpers.mjs";
import { canonicalForMirror, generateMirrorBytes } from "../../lib/sync/provider-skills.mjs";
import { helpExitCodes, helpSynopsisFlags, implementHelp } from "./implement-help.mjs";

const read = (p) => readFileSync(join(PLUGIN_ROOT, p), "utf8");

// The body under `heading` up to the next heading of the same or a higher level.
function section(md, heading) {
  const start = md.indexOf(`${heading}\n`);
  assert.ok(start !== -1, `missing heading: ${heading}`);
  const level = heading.match(/^#+/)[0].length;
  const rest = md.slice(start + heading.length + 1);
  const next = rest.search(new RegExp(`^#{1,${level}} `, "m"));
  return next === -1 ? rest : rest.slice(0, next);
}

const cli = read("docs/cli-reference.md");
const implementSection = section(cli, "### `implement`");

test("cli-reference documents the new verbs and flags", () => {
  for (const s of [
    "adev implement check-flags",
    "adev implement lite-report",
    "adev init prompt implement-rigor",
    "--run-base",
    "--lite",
    "lite_denied",
    "lite_source",
    "escalated_from",
    "INVALID_COMMIT_ID",
  ])
    assert.ok(cli.includes(s), s);
});

test("cli-reference documents check-flags: synopsis, output keys, exit codes and warnings", () => {
  const help = implementHelp();
  const s = section(cli, "#### `implement check-flags`");
  for (const flag of helpSynopsisFlags(help, "check-flags")) assert.ok(s.includes(flag), `check-flags flag ${flag}`);
  for (const key of ["lite_authorized", "lite_source", "tier", "run_base", "warnings"])
    assert.ok(s.includes(`\`${key}\``), `check-flags output key ${key}`);
  for (const code of helpExitCodes(help, "check-flags")) assert.ok(s.includes(code), `check-flags exit code ${code}`);
  for (const w of ["POLICY_UNCOMMITTED_CHANGES", "LITE_SUPPRESSED_PARALLEL"]) assert.ok(s.includes(w), w);
  assert.match(s, /never the policy baseline/i);
});

test("cli-reference documents lite-report: synopsis, output and exit codes", () => {
  const help = implementHelp();
  const s = section(cli, "#### `implement lite-report`");
  for (const flag of helpSynopsisFlags(help, "lite-report")) assert.ok(s.includes(flag), `lite-report flag ${flag}`);
  assert.match(s, /\{ ?count, task_ids, since, capped ?\}/);
  assert.ok(s.includes("implemented without per-task review"), "advisory line");
  assert.ok(s.includes("one reviewer under the lite cap"), "capped advisory line");
  for (const code of helpExitCodes(help, "lite-report")) assert.ok(s.includes(code), `lite-report exit code ${code}`);
});

test("cli-reference documents task-begin: synopsis, lite-only output keys and exit codes (BEH-17)", () => {
  const help = implementHelp();
  const s = section(cli, "#### `implement task-begin`");
  for (const flag of helpSynopsisFlags(help, "task-begin")) assert.ok(s.includes(flag), `task-begin flag ${flag}`);
  for (const code of helpExitCodes(help, "task-begin")) assert.ok(s.includes(code), `task-begin exit code ${code}`);
  for (const key of ["snapshot", "execution_state"]) assert.ok(s.includes(`\`${key}\``), `task-begin output key ${key}`);
  for (const v of ['"written"', '"conflict"', '"failed"']) assert.ok(s.includes(v), `execution_state ${v}`);
  assert.match(s, /resolve-depth --pass provisional/);
  assert.ok(implementSection.includes("`implement task-begin`"), "Purpose names task-begin");
  const row = cli.split("\n").find((l) => l.startsWith("| `implement` |"));
  assert.ok(row.includes("task-begin"), "summary row task-begin");
});

test("cli-reference documents the batches rigor flags, segment, lite solo reasons and advisories", () => {
  const help = implementHelp();
  const s = section(cli, "#### `implement batches`");
  for (const flag of helpSynopsisFlags(help, "batches")) assert.ok(s.includes(flag), `batches flag ${flag}`);
  for (const code of helpExitCodes(help, "batches")) assert.ok(s.includes(code), `batches exit code ${code}`);
  for (const t of ["`segment`", '"lite"', '"lite-assumed"', "LITE_AUTHORIZATION_ASSUMED"]) assert.ok(s.includes(t), t);
});

test("cli-reference lists the implement subverbs in the summary table and Purpose", () => {
  const row = cli.split("\n").find((l) => l.startsWith("| `implement` |"));
  assert.ok(row, "summary-table row for implement");
  for (const v of ["check-flags", "lite-report", "batches", "resolve-depth"]) assert.ok(row.includes(v), `summary row ${v}`);
  for (const v of ["check-flags", "lite-report", "read-routing"]) assert.ok(implementSection.includes(`\`implement ${v}`), v);
});

test("cli-reference documents governance dispatch --tier lite as quick", () => {
  const s = section(cli, "### `governance`");
  assert.ok(s.includes("governance dispatch --spec <path> [--tier <full|quick|lite>]"), "dispatch signature");
  assert.doesNotMatch(s, /--tier <full\|quick>\]/);
  assert.match(s, /`--tier lite` runs as `quick`/);
});

test("cli-reference documents route emit-sidecar's lite_eligible output", () => {
  const s = section(cli, "### `route`");
  assert.match(s, /lite_eligible: \{ ?count, total ?\}/);
  assert.ok(s.includes("liteEligible"), "names the predicate");
});

test("cli-reference documents init prompt implement-rigor", () => {
  const s = section(cli, "### `init`");
  assert.ok(
    s.includes("init prompt implement-rigor [--mode lite|quick|full] [--preset prototype|standard|strict]"),
    "init prompt implement-rigor signature",
  );
  assert.ok(s.includes("INVALID_IMPLEMENT_RIGOR"), "INVALID_IMPLEMENT_RIGOR");
  assert.match(s, /never overwrites/i);
});

test("configuration distinguishes implement_mode from implementation_mode", () => {
  const md = read("docs/configuration.md");
  const s = section(md, "## governance/risk-policies.yaml: implement_mode");
  assert.ok(s.includes("`full | quick | lite`") || s.includes("`full` | `quick` | `lite`"), "value set");
  assert.ok(s.includes("LITE_NOT_ALLOWED_FOR_HIGH"), "high refuses lite");
  assert.match(s, /absent[^\n]*resolves to `quick`|resolves to `quick`[^\n]*absent/);
  assert.match(s, /\/adev:init` Step 8c/);
  assert.ok(s.includes("[`implementation_mode`](#implementation_mode)"), "links the other setting");
  assert.match(s, /test discipline/);
  assert.match(s, /review depth/);

  const im = section(md, "### implementation_mode");
  assert.match(im, /`implement_mode`/, "implementation_mode section points at implement_mode");

  const impl = section(md, "### implement");
  for (const key of ["max_review_cycles", "batch_mode", "max_batch_size"]) assert.ok(impl.includes(`\`${key}\``), key);
  for (const code of ["INVALID_MAX_REVIEW_CYCLES", "INVALID_REVIEW_CYCLES"]) assert.ok(impl.includes(code), code);
});

test("concepts describes lite / quick / full", () => {
  const s = section(read("docs/concepts.md"), "## Graduated Rigor Tiers");
  for (const level of ["`full`", "`quick`", "`lite`"]) assert.ok(s.includes(level), level);
  for (const leg of ["`risk-level`", "`boundary`", "`sensitive-path`", "`routing`", "`critical-finding`"])
    assert.ok(s.includes(leg), `floor leg ${leg}`);
  for (const t of [
    "tripwire",
    "LITE_TRIPWIRE_ESCALATED",
    "provider mirror",
    "run_base",
    "routing sidecar",
    "QUALITY_GATES_FAILED",
    "adev implement lite-report",
    "liteEligible",
  ])
    assert.ok(s.includes(t), t);
  assert.match(s, /operator/);
  assert.doesNotMatch(s, /two \*\*rigor tiers\*\*/);
});

test("skill-reference documents the ladder on implement, build, route, init, review-specs and validate", () => {
  const md = read("docs/skill-reference.md");
  const impl = section(md, "### `/adev:implement`");
  assert.ok(impl.includes("- `--lite`:"), "implement --lite");
  assert.ok(impl.includes("- `--tier <full|quick|lite>`:"), "implement --tier");
  assert.ok(impl.includes("adev implement check-flags"), "check-flags first");
  assert.match(impl, /never adds? `--lite`/i, "no-self-selection rule");
  assert.doesNotMatch(impl, /quick-grant/);

  const build = section(md, "### `/adev:build`");
  assert.ok(build.includes("- `--lite`:"), "build --lite");
  assert.ok(build.includes("- `--tier <full|quick|lite>`:"), "build --tier");

  for (const skill of ["review-specs", "validate"]) {
    const s = section(md, `### \`/adev:${skill}\``);
    assert.ok(s.includes("- `--tier <full|quick|lite>`:"), `${skill} --tier`);
    assert.match(s, /`lite` runs as `quick`/, `${skill} maps lite to quick`);
  }
  assert.ok(section(md, "### `/adev:validate`").includes("adev implement lite-report"), "validate advisory");
  assert.ok(section(md, "### `/adev:route`").includes("lite-eligible: <count> of <total>"), "route summary line");
  assert.match(section(md, "### `/adev:init`"), /Step 8c/);
});

test("no live doc or build pipeline step promises a fixed two-stage review per task", () => {
  for (const p of [
    "docs/skill-reference.md",
    "docs/build-phase.md",
    "docs/getting-started.md",
    "docs/concepts.md",
    "skills/build/references/pipeline/step-4-implement.md",
  ])
    assert.doesNotMatch(read(p), /2-stage review|two-stage review|two review stages run automatically/i, p);
});

test("implement reference headers carry no extraction narration", () => {
  for (const ref of ["parallel-mode", "batched-mode", "integration-gate"]) {
    const text = read(`skills/implement/references/${ref}.md`);
    assert.doesNotMatch(text, /Content is\s+verbatim/, ref);
    assert.doesNotMatch(text, /Extracted from the SKILL body/, ref);
  }
});

test("governance's standard tier row states the standard preset's implement_mode", () => {
  const row = read("docs/governance.md").split("\n").find((l) => l.startsWith("| `standard` (default) |"));
  assert.ok(row, "standard tier row");
  assert.match(row, /`implement_mode: quick` at every level/);
  assert.doesNotMatch(row, /unchanged since before tiers existed/);
});

test("getting-started names every way lite is authorized", () => {
  const md = read("docs/getting-started.md");
  for (const s of ["`--lite`", "`--tier lite`", "`implement_mode: lite`"]) assert.ok(md.includes(s), s);
});

test("resolve-depth's ROUTING_SIDECAR_MISSING denial is scoped to an authorized lite", () => {
  assert.match(cli, /`ROUTING_SIDECAR_MISSING` when the routing sidecar is not committed at `run_base` \(when `lite` is authorized, every task is then denied with `lite_denied: no-routing-entry`\)/);
});

test("concepts and the route docs state the revision-4 grant and the lite cap", () => {
  const s = section(read("docs/concepts.md"), "## Graduated Rigor Tiers");
  assert.match(s, /\*\*The lite cap\.\*\*/);
  assert.match(s, /routed `auto-agent` or `assisted-agent`\. Scores are not consulted\./);
  assert.match(s, /escalates the task to `quick` under the lite cap/);
  assert.doesNotMatch(s, /at or above `0\.6`/);
  const route = section(cli, "### `route`");
  assert.match(route, /routed `auto-agent` or `assisted-agent`\. Scores are not consulted\./);
});

test("skill-reference's review-depth summary and configuration's implement_mode table name the lite cap", () => {
  const sr = read("docs/skill-reference.md");
  const summary = sr.split("\n").find((line) => line.startsWith("**Review depth per task:**"));
  assert.ok(summary, "missing the /adev:implement review-depth summary");
  assert.match(summary, /lite cap/);
  assert.match(summary, /sensitive path or governance boundary gives `quick`/);
  const conf = section(read("docs/configuration.md"), "## governance/risk-policies.yaml: implement_mode");
  const liteRow = conf.split("\n").find((line) => line.startsWith("| `lite` |"));
  assert.ok(liteRow, "missing the `lite` row");
  assert.match(liteRow, /lite cap/);
  assert.match(liteRow, /sensitive path or governance boundary gives `quick`/);
});

// BEH-13: lines naming the lite flags on live surfaces are definitions,
// forwarding rules or operator-facing examples. `.context-index/` is out of
// scope because specs and reviews quote the pattern they forbid.
//
// A prose line is allowed only when it matches one of the explicit SHAPES;
// there is no fallback for "sounds harmless". Two vetoes apply on top:
//   - a line naming a judgment signal (easy, eligible, scores, low-risk) is
//     refused unless it negates it or states the resolver's grant condition;
//   - each clause (split at `.`, `;`, `!`, `?` and dashes) that names the flag
//     and carries an imperative (add, pass, append, always, every, ...) is
//     refused unless that same clause ties the imperative to operator input,
//     so mentioning the operator elsewhere in the line does not launder it.
// A fenced command line that names the flag unbracketed is an operator
// example, which only docs/ may carry; in skills/ and providers/ a fenced
// line names the flag only as a bracketed synopsis option (`[--lite]`).
const LITE_FLAG = /--lite\b|--tier lite\b/;
const JUDGMENT = /\b(easy|eligible|scores?|scored|low-risk|simple|trivial|small)\b/i;
const NEGATED = /\bnever\b|\bnot an authorization\b/i;
const GRANT_CONDITION = /\bgranted `lite` only when\b/;
const IMPERATIVE = /\b(add|adds|pass|passes|append|appends|always|every|prefer|include|includes|use|uses|invoke)\b/i;
const OPERATOR_TIED =
  /\b(?:exactly |only )?as the operator passed\b|\bonly (?:when|if) the operator (?:typed|types|passed|passes)\b|\boperator's `(?:lite|--lite|--tier)|\bnever (?:add|adds|pass|passes) `--(?:lite|tier lite)`|\bwas passed to `\/adev:[a-z-]+`/i;
const SHAPES = [
  /^\s*(?:[-*]|\|)\s*`--(?:lite|tier)\b[^`]*`(?::|\s*\|)/, // argument definition
  OPERATOR_TIED,
  /\b(?:the )?operator authoriz\w* (?:for )?`lite`|\boperator authorization for (?:the )?`lite`|\bThe operator authorized it\b/i, // operator authorization
  /\bnever (?:add|adds) (?:`--lite`|`--tier lite`|either flag)/i, // no self-selection, naming the flag
  /\bis a signal, (?:never|not) an authorization\b/i, // route output is not an authorization
  /\bforward(?:s|ed)? `--tier lite` unchanged\b|\bis not forwarded\b/, // forwarding rule
  /Read `<ADEV_ROOT>\/skills\/[^`]+` for the [^.]*\bhandoff\b/, // pointer to the forwarding rules
  /\bruns? (?:it )?(?:exactly )?as `?quick\b|\bresolves to `quick`/, // lite-as-quick mapping
  /`--lite` (?:changes nothing|does not change)\b/, // stated non-effect
  /`--lite` reads as `lite`|\bis the same as `--lite`|\bequivalent to `--tier lite`/, // stated equivalence
  /`CONFLICTING_TIER_FLAGS` \(`--lite` with `--tier full` or `--tier quick`\)/, // exit-code definition
  /`--run-base` is required whenever `lite` may be authorized\b/, // flag requirement
];

const stripSynopsis = (text) => text.replace(/\[--[^\]]*\]/g, "");

function hasUntiedImperative(line) {
  for (const clause of line.split(/(?<=[.;!?])\s+|\s+—\s+/)) {
    const bare = stripSynopsis(clause);
    if (!LITE_FLAG.test(bare)) continue;
    const words = bare.replace(/--[a-z][a-z-]*/g, " ");
    if (IMPERATIVE.test(words) && !OPERATOR_TIED.test(clause)) return true;
  }
  return false;
}

function isAllowedLiteLine(line, fenced, file = "") {
  if (JUDGMENT.test(line) && !NEGATED.test(line) && !GRANT_CONDITION.test(line)) return false;
  if (fenced) {
    if (!LITE_FLAG.test(stripSynopsis(line))) return true;
    if (!file.startsWith("docs/")) return false;
    return /^\s*(?:\/adev:[a-z-]+|adev [a-z-]+ [a-z-]+) .*--(?:lite|tier lite)\b/.test(line) && !/#/.test(line);
  }
  if (hasUntiedImperative(line)) return false;
  return SHAPES.some((re) => re.test(line));
}

function liveFiles(dir) {
  const out = [];
  for (const e of readdirSync(join(PLUGIN_ROOT, dir), { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...liveFiles(p));
    else if (e.isFile()) out.push(p);
  }
  return out;
}

test("BEH-13 classifier rejects a line that tells an agent to choose lite", () => {
  for (const probe of [
    "If the task looks easy, add `--lite` to the implement call.",
    "Pass `--tier lite` when every route score is high.",
    "If the task looks easy, run `/adev:implement --lite`.",
    "When route reports every task lite-eligible, invoke implement with `--lite`.",
    "Prefer `--lite` for easy tasks.",
    "Forward `--lite` to implement whenever route marks the plan easy.",
    "Add `--lite` so the operator does not wait on reviews.",
    "For low-risk specs, always call `adev implement check-flags --lite`.",
    "Dispatch implement with `--tier lite` when all scores are high.",
    "Always forward `--lite` to implement.",
    "Run `/adev:implement --lite` on this plan.",
    "The operator's tasks can always run with `--lite`.",
    "Save the operator's time: add `--lite` to every implement call.",
    "Add `--lite` unless the operator passed `--tier full`.",
    "Add `--lite` when the operator typed nothing.",
    "If the operator types `/adev:build`, append `--lite` to the implement dispatch.",
    "Only when the operator is absent, add `--lite`.",
    "Append `--lite` by default; operator-only overrides apply.",
    "- `--lite`: add this to every implement call you make.",
    "| `--lite` | always pass it for docs-only plans |",
    "Never add `--tier full`; always add `--lite` instead.",
    "Add `--lite`; it is not an authorization problem.",
    "Add `--lite` to speed things up; it runs as `quick` anyway on review-specs.",
    "`--lite` changes nothing for the operator, so add it.",
    "the operator's tasks can run `--lite` when easy",
    "If the diff is tiny, add `--lite`.",
    "For docs-only changes, add `--lite` to the implement call.",
    "If the route summary shows all tasks as auto-agent, add `--lite`.",
    "When the plan has fewer than three tasks, the run is granted `lite` only when you add `--lite`.",
  ])
    assert.equal(isAllowedLiteLine(probe, false, "skills/x/SKILL.md"), false, probe);
  for (const [line, file] of [
    ["--lite", "docs/x.md"],
    ["adev implement check-flags --lite  # the plan looks easy", "docs/x.md"],
    ["adev implement check-flags --spec <p> --lite", "skills/implement/SKILL.md"],
    ["/adev:build --lite", "skills/build/SKILL.md"],
    ["/adev:implement --lite plan.md", "providers/codex/skills/implement/SKILL.md"],
    ["adev implement check-flags --spec <p> --lite", undefined],
  ])
    assert.equal(isAllowedLiteLine(line, true, file), false, `${file}: ${line}`);
});

test("BEH-13 classifier accepts the definition, forwarding and operator shapes", () => {
  for (const line of [
    "- `--lite`: operator authorization for `lite` review depth.",
    "Pass `--lite` only as the operator passed it.",
    "Never add `--lite` or `--tier lite` on your own judgment.",
    "A `/adev:route` `lite-eligible` count is a signal, never an authorization for `--lite`.",
    "If `--lite` or `--tier lite` was passed to `/adev:build`, append `--lite` so `/adev:implement` receives the operator's `lite` authorization.",
    "Pass `--lite` only when the operator typed it, and `--tier` only as the operator passed it.",
    "Route never passes `--lite` and never recommends it.",
    "Steps 1 and 5 forward `--tier lite` unchanged to `/adev:review-specs`. A bare `--lite` is not forwarded.",
    "An explicit `--tier lite` resolves to `quick`.",
  ])
    assert.ok(isAllowedLiteLine(line, false), line);
  assert.ok(isAllowedLiteLine("  --run-base <run_base> [--tier <t>] [--lite] [--parallel]", true, "skills/implement/x.md"));
  assert.ok(isAllowedLiteLine("/adev:implement --lite .context-index/specs/features/auth/login.plan.md", true, "docs/skill-reference.md"));
});

test("BEH-13: --lite / --tier lite in skills/ providers/ docs/ are only definitions, forwarding rules or operator examples", () => {
  let seen = 0;
  for (const f of ["skills", "providers", "docs"].flatMap(liveFiles)) {
    let fenced = false;
    for (const [i, line] of read(f).split("\n").entries()) {
      if (/^\s*```/.test(line)) {
        fenced = !fenced;
        continue;
      }
      if (!LITE_FLAG.test(line)) continue;
      seen++;
      assert.ok(isAllowedLiteLine(line, fenced, f), `${f}:${i + 1} does not tie the lite flag to operator input: ${line}`);
    }
  }
  assert.ok(seen > 0, "the scan must see the lite flags");
});

test("provider mirror is in sync for every skill the rigor ladder touched", () => {
  const skills = ["build", "implement", "init", "review-specs", "route", "validate", "work"];
  let compared = 0;
  for (const provider of ["codex", "opencode"]) {
    for (const canonical of skills.flatMap((s) => liveFiles(`skills/${s}`))) {
      const mirror = `providers/${provider}/${canonical}`;
      if (!canonicalForMirror(mirror)) continue;
      const expected = generateMirrorBytes(mirror, readFileSync(join(PLUGIN_ROOT, canonical)));
      assert.ok(readFileSync(join(PLUGIN_ROOT, mirror)).equals(expected), `${mirror} is stale; run node scripts/sync-provider-skills.mjs`);
      compared++;
    }
  }
  assert.ok(compared > 0, "at least one mirror compared");
});
