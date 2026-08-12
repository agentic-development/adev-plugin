// lib/cli/test-policy.mjs
//
// `adev test-policy <resolve|assert-assigned|explain|show|set>` — CLI surface for the
// Test Depth Policy feature. Resolves the effective test depth for a plan task (chain +
// escalation + floor passes), records the assignment as a `test_depth_assigned` lifecycle
// event, and lets operators inspect/edit the manifest-level policy.
//
// Spec: .context-index/specs/features/test-strategies/test-depth-policy.spec.md
// Plan-task: 8
//
// Zero external deps — Node built-ins + the project's own lib modules.

import { resolve as resolvePath } from "node:path";
import { readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { loadManifest } from "../manifest.mjs";
import { detectWorkspace } from "../workspace.mjs";
import { readTaskFiles } from "../test-strategies/task-files.mjs";
import { resolveTestDepth } from "../test-strategies/depth.mjs";
import { effectiveSensitivePaths, DEFAULT_SENSITIVE_PATHS } from "../test-strategies/sensitive-paths.mjs";
import { resolveGranularity } from "../test-strategies/policy.mjs";
import { lookupRoutingEntry } from "../plan-routing-sidecar.mjs";
import { appendEvent, readEvents } from "../lifecycle-state.mjs";
import { loadRigorPolicies } from "../governance/rigor-mode.mjs";
import { parseFrontmatterFields } from "../amendment-graph.mjs";
import { parseYaml } from "../profiles/yaml.mjs";

const TEST_DEPTH_VALUES = new Set(["minimal", "standard", "thorough"]);

function assertContained(projectRoot, relPath) {
  const root = resolvePath(projectRoot);
  const abs = resolvePath(root, relPath);
  if (abs !== root && !abs.startsWith(root + "/")) {
    const err = new Error(`PATH_OUTSIDE_ROOT: '${relPath}' resolves outside the project root`);
    err.code = "PATH_OUTSIDE_ROOT";
    throw err;
  }
  return abs;
}

function assertTaskId(taskId) {
  if (typeof taskId !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(taskId)) {
    const err = new Error(`INVALID_TASK_ID: '${taskId}' does not match ^[a-z0-9][a-z0-9._-]{0,63}$`);
    err.code = "INVALID_TASK_ID";
    throw err;
  }
}

function assertNotWorkspaceRoot(projectRoot) {
  const ws = detectWorkspace(projectRoot);
  if (ws && ws.currentRepoSlug === null) {
    const err = new Error("WORKSPACE_ROOT_REFUSED: test-policy verbs do not run at a workspace root");
    err.code = "WORKSPACE_ROOT_REFUSED";
    throw err;
  }
}

// Validates a `test_depth` value pulled from a chain-stage source (spec frontmatter, a
// modules[] override, or the domain default) that `resolveTestDepth()` does NOT itself
// validate — its own `assertValidDepth` only guards escalation-rule depths. Per the spec's
// Error Cases table, "a test_depth outside minimal|standard|thorough, from any source" must
// raise INVALID_TEST_DEPTH, so this CLI verb validates every chain-stage source itself before
// handing values to resolveTestDepth. (The risk-policy leg is already validated inside
// loadRigorPolicies, which throws INVALID_TEST_DEPTH on a malformed risk-policies.yaml entry.)
function assertValidTestDepth(depth, source) {
  if (depth != null && !TEST_DEPTH_VALUES.has(depth)) {
    const err = new Error(
      `INVALID_TEST_DEPTH: '${depth}' (${source}) — legal set: ${[...TEST_DEPTH_VALUES].join(", ")}`,
    );
    err.code = "INVALID_TEST_DEPTH";
    throw err;
  }
  return depth;
}

// The plan file carries no --spec flag; every subcommand that reads or writes the lifecycle
// event log locates the owning spec via the plan header's `> **Spec:** <path>` line (Plan
// Document Header format, skills/plan/SKILL.md) — `appendEvent`/`readEvents` in
// lib/lifecycle-state.mjs are BOTH `(projectRoot, specPath, ...)`: the event log is one JSONL
// file per spec, not a single global log, so every one of resolve/assert-assigned/explain
// needs this resolution step, not just resolve. Also performs the PATH_OUTSIDE_ROOT check on
// `--plan` itself, before any file is read.
function specRelFromPlan(projectRoot, planRel) {
  if (typeof planRel !== "string" || planRel.length === 0) {
    const err = new Error("INVALID_PLAN_PATH: --plan is required");
    err.code = "INVALID_PLAN_PATH";
    throw err;
  }
  const planAbs = assertContained(projectRoot, planRel);
  const planText = readFileSync(planAbs, "utf8");
  const m = /^>\s*\*\*Spec:\*\*\s*(\S+)/m.exec(planText);
  if (!m) {
    const err = new Error(
      `PLAN_MISSING_SPEC_HEADER: plan '${planRel}' has no '> **Spec:**' header line — cannot resolve its lifecycle event log`,
    );
    err.code = "PLAN_MISSING_SPEC_HEADER";
    throw err;
  }
  return { planAbs, specRel: m[1] };
}

function loadOwningSpec(projectRoot, specRel) {
  const specAbs = assertContained(projectRoot, specRel);
  const fields = parseFrontmatterFields(readFileSync(specAbs, "utf8"));
  return { test_depth: fields.test_depth, risk_level: fields.risk_level ?? "medium" };
}

function moduleOverrideFor(manifest, targetPaths) {
  for (const mod of manifest?.modules ?? []) {
    const paths = mod.paths ?? [];
    if (targetPaths.some((tp) => paths.some((p) => tp.startsWith(p)))) {
      if (mod.test_depth) return mod.test_depth;
    }
  }
  return undefined;
}

// The shipped boundaries.yaml schema documents `pattern` as a regex matched against file
// *content* in its existing consumers (e.g. `import.*from.*prisma`). This verb instead matches
// `pattern` as a regex against each *path string* in `targetPaths`, since `resolve` never reads
// file contents — only declared paths. Narrower than other boundaries.yaml consumers; called
// out in --help text below. The RegExp construction is inside the try block: an
// operator-authored boundaries.yaml can carry a syntactically invalid regex, and a bad pattern
// must degrade the same as an unparseable/absent file, never crash `resolve`.
function boundaryCrossingFor(projectRoot, targetPaths) {
  try {
    const doc = parseYaml(
      readFileSync(resolvePath(projectRoot, ".context-index/governance/boundaries.yaml"), "utf8"),
    );
    const rules = doc?.boundaries ?? [];
    return targetPaths.some((tp) => rules.some((rule) => new RegExp(rule.pattern).test(tp)));
  } catch {
    return false;
  }
}

// Targeted text substitution, not parse+re-serialize: this project ships no YAML *serializer*
// (only `parseYaml`), and manifest.yaml is a hand-authored, heavily commented file — a
// parse-then-dump round-trip would silently drop every comment. `applyTestPolicyEdit` instead
// finds the exact line(s) to change via anchored regex and rewrites only those lines.
function applyTestPolicyEdit(text, flags) {
  if (flags.module) {
    const moduleBlockRe = new RegExp(
      `(-\\s+slug:\\s*${flags.module}\\s*$[\\s\\S]*?)(\\n\\s*-\\s+slug:|\\n\\n|$)`,
      "m",
    );
    const m = moduleBlockRe.exec(text);
    if (!m) {
      const err = new Error(`UNKNOWN_POLICY_MODULE: '${flags.module}' block not found in manifest.yaml`);
      err.code = "UNKNOWN_POLICY_MODULE";
      throw err;
    }
    const block = m[1];
    const updatedBlock = /test_depth:\s*\S+/.test(block)
      ? block.replace(/test_depth:\s*\S+/, `test_depth: ${flags.test_depth}`)
      : `${block}\n    test_depth: ${flags.test_depth}`;
    return text.slice(0, m.index) + updatedBlock + text.slice(m.index + block.length);
  }
  if (flags.granularity) {
    if (/test_policy:\s*\n(\s+granularity:\s*\S+)/.test(text)) {
      return text.replace(/(test_policy:\s*\n\s+granularity:\s*)\S+/, `$1${flags.granularity}`);
    }
    return `${text}\ntest_policy:\n  granularity: ${flags.granularity}\n`;
  }
  return text;
}

function parseFlags(rest) {
  return Object.fromEntries(
    rest.reduce((acc, v, i, a) => (v.startsWith("--") ? [...acc, [v.slice(2), a[i + 1]]] : acc), []),
  );
}

export async function run({ projectRoot, argv }) {
  const [sub, ...rest] = argv ?? [];
  const flags = parseFlags(rest);

  // loadManifest() throws INVALID_PROJECT_ROOT when .context-index/manifest.yaml is absent
  // (lib/manifest.mjs). Every downstream branch already reads manifest via `manifest?.`
  // optional chaining, so a fixture-less test project must still resolve — load lazily and
  // degrade to `undefined` rather than letting the whole verb throw before dispatch.
  let manifest;
  try {
    manifest = loadManifest(projectRoot);
  } catch {
    manifest = undefined;
  }

  switch (sub) {
    case "resolve": {
      assertTaskId(flags["task-id"]);
      assertNotWorkspaceRoot(projectRoot);
      const { planAbs, specRel } = specRelFromPlan(projectRoot, flags.plan);
      const { targetPaths, available } = await readTaskFiles(planAbs, flags["task-id"]);

      // lookupRoutingEntry throws ROUTING_SIDECAR_MISSING whenever <plan-stem>.routing.json is
      // absent — the NORMAL case unless /adev:route already ran (spec Preconditions: "its
      // absence means no escalation — a defined outcome, not an error"). Must degrade, not
      // crash. Also degrades on ROUTING_ENTRY_MISSING (sidecar exists but no entry for this
      // task yet) for the same reason.
      let routingEntry;
      try {
        routingEntry = lookupRoutingEntry(planAbs, flags["task-id"]);
      } catch {
        routingEntry = undefined;
      }

      const spec = loadOwningSpec(projectRoot, specRel);
      const moduleOverride = moduleOverrideFor(manifest, targetPaths);
      const domainDefault = manifest?.test_policy?.domain_default;

      assertValidTestDepth(spec.test_depth, "spec frontmatter test_depth");
      assertValidTestDepth(moduleOverride, "modules[].test_depth");
      assertValidTestDepth(domainDefault, "test_policy.domain_default");

      const assignment = resolveTestDepth({
        spec,
        riskLevel: spec.risk_level ?? "medium",
        policies: loadRigorPolicies(projectRoot) ?? {}, // risk-policies.yaml's test_depth per level — NOT a manifest.yaml field
        moduleOverride,
        domainDefault,
        routingScore: routingEntry?.scores,
        escalationRules: manifest?.test_policy?.escalation_rules ?? [],
        escalationEnabled: manifest?.test_policy?.escalation ?? true,
        boundaryCrossing: boundaryCrossingFor(projectRoot, targetPaths),
        targetPaths,
        sensitivePaths: effectiveSensitivePaths(manifest?.sensitive_paths),
      });

      appendEvent(projectRoot, specRel, {
        event: "test_depth_assigned",
        plan: flags.plan,
        task_id: flags["task-id"],
        depth: assignment.depth,
        source: assignment.source,
        escalated: assignment.escalated,
        escalation_skipped: assignment.escalation_skipped,
        floor_applied: assignment.floor_applied,
        floor_legs: assignment.floor_legs,
        floor_inputs: available ? "available" : "unavailable",
      });

      return assignment;
    }

    case "assert-assigned": {
      assertTaskId(flags["task-id"]);
      const { specRel } = specRelFromPlan(projectRoot, flags.plan);
      const events = readEvents(projectRoot, specRel).filter(
        (e) => e.event === "test_depth_assigned" && e.plan === flags.plan && e.task_id === flags["task-id"],
      );
      if (events.length === 0) {
        const err = new Error(
          `MISSING_DEPTH_ASSIGNMENT: no test_depth_assigned event for ${flags.plan}#${flags["task-id"]}`,
        );
        err.code = "MISSING_DEPTH_ASSIGNMENT";
        throw err;
      }
      return { ok: true };
    }

    case "explain": {
      assertTaskId(flags["task-id"]);
      const { specRel } = specRelFromPlan(projectRoot, flags.plan);
      const events = readEvents(projectRoot, specRel).filter(
        (e) => e.event === "test_depth_assigned" && e.plan === flags.plan && e.task_id === flags["task-id"],
      );
      if (events.length === 0) {
        return { code: "NO_RECORDED_ASSIGNMENT" };
      }
      const last = events[events.length - 1];
      return {
        depth: last.depth,
        source: last.source,
        escalated: last.escalated,
        escalation_skipped: last.escalation_skipped,
        floor_applied: last.floor_applied,
        floor_legs: last.floor_legs,
        floor_inputs: last.floor_inputs,
      };
    }

    case "show": {
      // resolveGranularity() already returns { granularity, source } — return it directly
      // under the `granularity`/`granularity_source` keys rather than re-wrapping, so callers
      // read `result.granularity` (a string), not a double-nested `result.granularity.granularity`.
      const granularity = resolveGranularity({
        moduleOverride: flags.module
          ? manifest?.modules?.find((m) => m.slug === flags.module)?.test_policy?.granularity
          : undefined,
        manifestPolicy: manifest?.test_policy?.granularity,
        domainDefault: manifest?.test_policy?.domain_default,
      });
      return {
        granularity: granularity.granularity,
        granularity_source: granularity.source,
        test_depth: flags.module
          ? { value: manifest?.modules?.find((m) => m.slug === flags.module)?.test_depth, source: "module" }
          : undefined,
        sensitive_paths: {
          built_in: DEFAULT_SENSITIVE_PATHS,
          configured: manifest?.sensitive_paths ?? [],
        },
      };
    }

    case "set": {
      assertNotWorkspaceRoot(projectRoot);
      if (flags.module) {
        const mod = manifest?.modules?.find((m) => m.slug === flags.module);
        if (!mod || !/^[a-z0-9][a-z0-9-]*$/.test(flags.module)) {
          const err = new Error(`UNKNOWN_POLICY_MODULE: '${flags.module}' is not a valid or existing module slug`);
          err.code = "UNKNOWN_POLICY_MODULE";
          throw err;
        }
      }
      const manifestPath = assertContained(projectRoot, ".context-index/manifest.yaml");
      const original = readFileSync(manifestPath, "utf8");
      const edited = applyTestPolicyEdit(original, flags);
      const tmpPath = `${manifestPath}.tmp-${process.pid}`;
      writeFileSync(tmpPath, edited);

      // Round-trip verify: re-parse the edited text and confirm the target field now holds the
      // intended value, and that every OTHER top-level key still parses identically to before.
      // On any mismatch, the temp file is discarded and manifest.yaml is left byte-identical.
      let ok = false;
      try {
        const before = parseYaml(original);
        const after = parseYaml(readFileSync(tmpPath, "utf8"));
        const targetOk = flags.module
          ? after?.modules?.find((m) => m.slug === flags.module)?.test_depth === flags.test_depth
          : after?.test_policy?.granularity === flags.granularity;
        const untouchedKeysOk = Object.keys(before)
          .filter((k) => k !== "modules" && k !== "test_policy")
          .every((k) => JSON.stringify(before[k]) === JSON.stringify(after[k]));
        ok = targetOk && untouchedKeysOk;
      } catch {
        ok = false;
      }
      if (!ok) {
        try {
          unlinkSync(tmpPath);
        } catch {
          // best-effort cleanup — do not mask the verification failure below
        }
        const err = new Error(
          "test-policy set: round-trip verification failed; manifest.yaml left byte-identical (temp file discarded, no rename)",
        );
        err.code = "SET_VERIFICATION_FAILED";
        throw err;
      }
      renameSync(tmpPath, manifestPath);
      return { ok: true };
    }

    default: {
      const err = new Error(`unknown test-policy subcommand: ${sub}`);
      err.code = "UNKNOWN_SUBCOMMAND";
      throw err;
    }
  }
}

export function help() {
  console.log(
    [
      "usage: adev test-policy <resolve|assert-assigned|explain|show|set> [flags]",
      "",
      "  resolve --plan <path> --task-id <id>   resolve + record the effective test depth",
      "  assert-assigned --plan <path> --task-id <id>   fail if no assignment was recorded",
      "  explain --plan <path> --task-id <id>   show the recorded assignment (never echoes paths)",
      "  show [--module <slug>]                 print the effective policy",
      "  set --module <slug> --test_depth <depth>   set a module's test_depth override",
      "  set --granularity <granularity>        set the manifest-level test_policy.granularity",
      "",
      "Note: `resolve`'s boundary-crossing check matches governance/boundaries.yaml's `pattern`",
      "against each declared task file *path*, not file content — narrower than other",
      "boundaries.yaml consumers, which match pattern against file content.",
    ].join("\n"),
  );
}

export default { run, help };
