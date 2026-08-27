/**
 * Hygiene Audit Pass 19 — Governance Registry Drift.
 *
 * Pass 19 used to look at `validate.yaml` alone. Task 11 removed run-time
 * composition, so a new bundled or domain entry no longer activates by itself:
 * someone has to materialize it. That makes this pass the ONLY
 * upgrade-adoption channel, and it now covers all four registries
 * (`validate`, `review`, `diagnostics`, `gates`) plus three sub-audits:
 *
 *   - `hygiene/disabled-bundled-entry`      (warning) — a bundled/domain entry
 *     switched off in the project file, which the unadopted-upgrade half can
 *     never see because it only reports entries the project does NOT have.
 *   - `hygiene/non-project-execution-field` (info)    — every non-`project`
 *     entry carrying `command`, `runner`, `prompt` or `pattern`, so an
 *     extension-appended `command` that reaches `spawnSync` is visible.
 *   - `hygiene/entry-field-drift`           (warning) — a `bundled`/
 *     `domain:*`-sourced entry whose FIELDS (`context_pack`, `profile`,
 *     `severity_cap`, `dispatch`) no longer match the matching-id entry in
 *     the source it names. Both id-set audits are blind to this: the entry is
 *     present in both files, only its fields moved.
 *
 * Spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md
 * Plan-task: 17
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { createTempDir, cleanupTempDir, writeFixture, PLUGIN_ROOT } from "../helpers.mjs";
import { runRegistryDriftPass, REGISTRY_NAMES } from "../../lib/hygiene/registry-drift.mjs";

const DOMAIN = "acme";
const STAMP = "2026-08-14T00:00:00.000Z";

/** Registry name → [project filename, root key, domain starter filename|null]. */
const SHAPE = {
  validate: ["validate.yaml", "checks", "validate.yaml"],
  review: ["review.yaml", "reviewers", "reviewers.yaml"],
  diagnostics: ["diagnostics.yaml", "diagnostics", null],
  gates: ["gates.yaml", "gates", "gates.yaml"],
};

/** Bundled template basename per registry, for the registries that have one. */
const TEMPLATE = {
  diagnostics: "diagnostics-template.yaml",
  gates: "gates-template.yaml",
};

const MARKED = new Set(["review", "diagnostics", "gates"]);

function renderValue(value) {
  if (Array.isArray(value)) {
    return `[${value.map((v) => JSON.stringify(String(v))).join(", ")}]`;
  }
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}

function renderEntry(entry) {
  const keys = Object.keys(entry);
  return (
    keys
      .map((k, i) => `${i === 0 ? "  - " : "    "}${k}: ${renderValue(entry[k])}`)
      .join("\n") + "\n"
  );
}

/** Append one entry under a registry file's root key, keeping the marker top-level. */
function appendEntry(absFile, entry) {
  const current = existsSync(absFile) ? readFileSync(absFile, "utf8") : "";
  const lines = current.split("\n");
  const markerAt = lines.findIndex((l) => l.startsWith("materialized_at:"));
  if (markerAt === -1) {
    writeFileSync(absFile, current + renderEntry(entry));
    return;
  }
  lines.splice(markerAt, 0, ...renderEntry(entry).split("\n").slice(0, -1));
  writeFileSync(absFile, lines.join("\n"));
}

/** A project fixture: manifest, four governance files, empty domain starters. */
function setupProject() {
  const dir = createTempDir();
  const pluginRoot = join(dir, "fake-plugin");

  writeFixture(dir, ".context-index/manifest.yaml", `domain: ${DOMAIN}\n`);

  for (const name of REGISTRY_NAMES) {
    const [file, rootKey, starterFile] = SHAPE[name];
    const marker = MARKED.has(name) ? `\nmaterialized_at: ${STAMP}\n` : "";
    writeFixture(dir, `.context-index/governance/${file}`, `${rootKey}:\n${marker}`);
    if (starterFile) {
      writeFixture(dir, `.context-index/domains/${DOMAIN}/${starterFile}`, `${rootKey}:\n`);
    }
    if (TEMPLATE[name]) {
      writeFixture(pluginRoot, `templates/${TEMPLATE[name]}`, `${rootKey}:\n`);
    }
  }

  return { dir, pluginRoot };
}

/** Seed an entry into the PROJECT's registry file. */
function seedEntry(ctx, registry, entry) {
  appendEntry(join(ctx.dir, ".context-index/governance", SHAPE[registry][0]), entry);
}

/** Seed an entry into the registry's STARTER (domain overlay, or bundled template). */
function addStarterEntry(ctx, registry, entry) {
  const starterFile = SHAPE[registry][2];
  const abs = starterFile
    ? join(ctx.dir, ".context-index/domains", DOMAIN, starterFile)
    : join(ctx.pluginRoot, "templates", TEMPLATE[registry]);
  appendEntry(abs, entry);
}

/**
 * Seed an entry into the registry's BUNDLED TEMPLATE specifically — distinct
 * from {@link addStarterEntry}, which prefers the domain overlay when a
 * registry has one (`gates` has both). A `source: bundled` entry must be
 * compared against the template, never the domain overlay, so tests that
 * pin that need a way to target the template even for `gates`.
 */
function addBundledTemplateEntry(ctx, registry, entry) {
  appendEntry(join(ctx.pluginRoot, "templates", TEMPLATE[registry]), entry);
}

async function runPass19(ctx) {
  const result = await runRegistryDriftPass(ctx.dir, { pluginRoot: ctx.pluginRoot });
  return result.findings;
}

function withProject(fn) {
  return async () => {
    const ctx = setupProject();
    try {
      await fn(ctx);
    } finally {
      cleanupTempDir(ctx.dir);
    }
  };
}

test(
  "a new bundled entry produces a drift finding for each registry",
  withProject(async (ctx) => {
    for (const reg of REGISTRY_NAMES) {
      addStarterEntry(ctx, reg, { id: `new-${reg}` });
      const findings = await runPass19(ctx);
      assert.ok(
        findings.some((f) => f.registry === reg && f.message.includes("new-")),
        `expected an unadopted-upgrade finding for ${reg}`,
      );
    }
  }),
);

test(
  "the unadopted-upgrade finding covers all four registries in one run",
  withProject(async (ctx) => {
    for (const reg of REGISTRY_NAMES) addStarterEntry(ctx, reg, { id: `new-${reg}` });
    const findings = await runPass19(ctx);
    const covered = new Set(
      findings.filter((f) => f.id === "hygiene/unadopted-upgrade").map((f) => f.registry),
    );
    assert.deepEqual([...covered].sort(), [...REGISTRY_NAMES].sort());
  }),
);

test(
  "an already-adopted bundled entry produces no unadopted-upgrade finding",
  withProject(async (ctx) => {
    addStarterEntry(ctx, "gates", { id: "adopted-gate" });
    seedEntry(ctx, "gates", { id: "adopted-gate", source: "bundled" });
    const findings = await runPass19(ctx);
    assert.equal(
      findings.filter((f) => f.id === "hygiene/unadopted-upgrade" && f.entry_id === "adopted-gate")
        .length,
      0,
    );
  }),
);

test(
  "enabled:false on a bundled entry is flagged",
  withProject(async (ctx) => {
    seedEntry(ctx, "review", {
      id: "security-reviewer",
      source: "bundled",
      enabled: false,
      disabled_reason: "n/a",
    });
    const f = (await runPass19(ctx)).find((x) => x.id === "hygiene/disabled-bundled-entry");
    assert.ok(f, "expected a disabled-bundled-entry finding");
    assert.equal(f.severity, "warning");
    assert.equal(f.registry, "review");
    assert.match(f.message, /security-reviewer/);
  }),
);

test(
  "enabled:false on a domain-sourced entry is also flagged",
  withProject(async (ctx) => {
    seedEntry(ctx, "gates", { id: "domain-gate", source: `domain:${DOMAIN}`, enabled: false });
    const f = (await runPass19(ctx)).find((x) => x.id === "hygiene/disabled-bundled-entry");
    assert.ok(f, "expected a disabled-bundled-entry finding for a domain: source");
    assert.equal(f.entry_id, "domain-gate");
    assert.equal(f.severity, "warning");
  }),
);

test(
  "enabled:false on a project entry is NOT flagged",
  withProject(async (ctx) => {
    seedEntry(ctx, "gates", { id: "my-gate", source: "project", enabled: false });
    const findings = await runPass19(ctx);
    assert.equal(findings.filter((f) => f.id === "hygiene/disabled-bundled-entry").length, 0);
  }),
);

test(
  "an entry with no source at all defaults to project and is NOT flagged when disabled",
  withProject(async (ctx) => {
    seedEntry(ctx, "gates", { id: "bare-gate", enabled: false });
    const findings = await runPass19(ctx);
    assert.equal(findings.filter((f) => f.id === "hygiene/disabled-bundled-entry").length, 0);
  }),
);

test(
  "an extension-appended command is listed, not excluded",
  withProject(async (ctx) => {
    seedEntry(ctx, "gates", {
      id: "ext-gate",
      source: "extension:acme",
      command: ["curl", "https://x"],
    });
    const findings = await runPass19(ctx);
    assert.ok(
      findings.some(
        (f) => f.id === "hygiene/non-project-execution-field" && f.message.includes("ext-gate"),
      ),
      "expected an execution-bearing finding naming ext-gate",
    );
  }),
);

test(
  "each execution-bearing field triggers the listing independently",
  withProject(async (ctx) => {
    const cases = [
      ["gates", "cmd-entry", "command", { command: ["npm", "test"] }],
      ["diagnostics", "runner-entry", "runner", { runner: "plugin:tier1/x.mjs" }],
      ["validate", "prompt-entry", "prompt", { prompt: "do a thing" }],
      ["review", "pattern-entry", "pattern", { pattern: "src/**" }],
    ];
    for (const [reg, id, , extra] of cases) {
      seedEntry(ctx, reg, { id, source: "bundled", ...extra });
    }
    const findings = (await runPass19(ctx)).filter(
      (f) => f.id === "hygiene/non-project-execution-field",
    );
    for (const [reg, id, field] of cases) {
      const hit = findings.find((f) => f.entry_id === id);
      assert.ok(hit, `expected an execution-bearing finding for ${id}`);
      assert.equal(hit.registry, reg);
      assert.equal(hit.severity, "info");
      assert.ok(hit.message.includes(field), `message should name the ${field} field`);
    }
  }),
);

test(
  "a project entry carrying a command is NOT listed by the execution-bearing sub-audit",
  withProject(async (ctx) => {
    seedEntry(ctx, "gates", { id: "own-gate", source: "project", command: ["npm", "test"] });
    const findings = await runPass19(ctx);
    assert.equal(findings.filter((f) => f.id === "hygiene/non-project-execution-field").length, 0);
  }),
);

test(
  "the non-project exclusion applies to unadopted-upgrade findings only",
  withProject(async (ctx) => {
    // An extension entry the starter never had: it must NOT be reported as a
    // project customization, but it MUST be reported as execution-bearing.
    seedEntry(ctx, "gates", { id: "ext-gate", source: "extension:acme", command: ["sh", "-c"] });
    const findings = await runPass19(ctx);
    assert.equal(
      findings.filter((f) => f.id === "hygiene/project-addition" && f.entry_id === "ext-gate")
        .length,
      0,
    );
    assert.equal(
      findings.filter(
        (f) => f.id === "hygiene/non-project-execution-field" && f.entry_id === "ext-gate",
      ).length,
      1,
    );
  }),
);

test(
  "a project-added entry absent from the starter is reported as a project customization",
  withProject(async (ctx) => {
    seedEntry(ctx, "validate", { id: "project.custom-check", source: "project" });
    const findings = await runPass19(ctx);
    assert.ok(
      findings.some(
        (f) => f.id === "hygiene/project-addition" && f.entry_id === "project.custom-check",
      ),
    );
  }),
);

test(
  "every finding from the pass is info except the disabled-entry sub-audit",
  withProject(async (ctx) => {
    addStarterEntry(ctx, "gates", { id: "new-gate" });
    seedEntry(ctx, "validate", { id: "project.custom-check", source: "project" });
    seedEntry(ctx, "review", { id: "sec", source: "bundled", enabled: false });
    seedEntry(ctx, "diagnostics", { id: "d1", source: "bundled", runner: "plugin:x.mjs" });
    const findings = await runPass19(ctx);
    assert.ok(findings.length > 0, "fixture should produce findings");
    for (const f of findings) {
      const expected = f.id === "hygiene/disabled-bundled-entry" ? "warning" : "info";
      assert.equal(f.severity, expected, `${f.id} severity`);
    }
  }),
);

test(
  "an unmaterialized marked registry is reported, not read",
  withProject(async (ctx) => {
    const abs = join(ctx.dir, ".context-index/governance/gates.yaml");
    writeFileSync(abs, "gates:\n"); // marker removed
    const findings = await runPass19(ctx);
    const f = findings.find((x) => x.id === "hygiene/registry-not-materialized");
    assert.ok(f, "expected a not-materialized finding");
    assert.equal(f.registry, "gates");
    assert.equal(f.severity, "info");
  }),
);

test("a missing project registry file is reported as a skip, not a crash", async () => {
  const dir = createTempDir();
  try {
    writeFixture(dir, ".context-index/manifest.yaml", `domain: ${DOMAIN}\n`);
    const result = await runRegistryDriftPass(dir, { pluginRoot: join(dir, "fake-plugin") });
    assert.equal(result.findings.filter((f) => f.id === "hygiene/registry-absent").length, 4);
  } finally {
    cleanupTempDir(dir);
  }
});

// ── The CLI surface the SKILL names. Pass 19's logic is control flow, so
//    skills/hygiene/SKILL.md may only NAME a verb; these pin that verb.

function cli(args, cwd) {
  return spawnSync(process.execPath, [join(PLUGIN_ROOT, "cli", "index.mjs"), ...args], {
    cwd,
    encoding: "utf8",
  });
}

test("adev governance drift emits the envelope and exits 0 even with findings", async () => {
  const ctx = setupProject();
  try {
    seedEntry(ctx, "review", { id: "sec", source: "bundled", enabled: false });
    const r = cli(["governance", "drift", "--json"], ctx.dir);
    assert.equal(r.status, 0, r.stderr);
    const envelope = JSON.parse(r.stdout);
    assert.equal(envelope.verdict, "FINDINGS");
    assert.equal(envelope.summary.warning_count, 1);
    assert.ok(
      envelope.findings.some((f) => f.id === "hygiene/disabled-bundled-entry"),
      "envelope must carry the disabled-entry finding",
    );
  } finally {
    cleanupTempDir(ctx.dir);
  }
});

test("adev governance drift refuses a registry outside the pass's remit", async () => {
  const ctx = setupProject();
  try {
    const r = cli(["governance", "drift", "--registry", "boundaries"], ctx.dir);
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes("unknown registry"), r.stderr);
  } finally {
    cleanupTempDir(ctx.dir);
  }
});

test("skills/hygiene/SKILL.md names the verb rather than carrying the logic", () => {
  const skill = readFileSync(join(PLUGIN_ROOT, "skills", "hygiene", "SKILL.md"), "utf8");
  const start = skill.indexOf("## Audit Pass 19");
  const end = skill.indexOf("## Audit Pass 20");
  assert.ok(start >= 0 && end > start, "Pass 19 and Pass 20 headings must both be present");
  const section = skill.slice(start, end);
  assert.ok(section.includes("adev governance drift"), "Pass 19 must name the CLI verb");
  for (const reg of REGISTRY_NAMES) {
    assert.ok(section.includes(`\`${reg}.yaml\``), `Pass 19 must name ${reg}.yaml in its remit`);
  }
  assert.ok(section.includes("hygiene/disabled-bundled-entry"));
  assert.ok(section.includes("hygiene/non-project-execution-field"));
  assert.ok(!section.includes("node -e"), "no inline Node in a SKILL section");
  assert.ok(!section.includes("```javascript"), "no fenced JavaScript directive in a SKILL section");
});

test("the pass runs against this repository without throwing", async () => {
  const result = await runRegistryDriftPass(PLUGIN_ROOT);
  assert.ok(Array.isArray(result.findings));
  assert.equal(
    result.findings.filter((f) => f.severity !== "info" && f.severity !== "warning").length,
    0,
  );
});

// ────────────────────────────────────────────────────────────────────────
// Provenance that is NOT carried by `source:`
//
// `materialize` stamps `source:` only on rows it WRITES; a row already on disk
// keeps an absent `source`, which `entrySource()` reads as `project`. The
// module used to justify that with "for a project-file entry [project] is the
// only thing it can be" — which is false. A project file routinely holds
// bundled rows: every entry in this repo's own `diagnostics.yaml` carries
// `runner: plugin:…` and every entry in `validate.yaml` carries
// `prompt: plugin:…`, and none of them carries `source:`. All twelve were
// therefore invisible to the sub-audit built to surface exactly them
// (spec AC 11, DDR-6 / SEC-4).
//
// A `plugin:`-prefixed execution field is self-evident proof that the entry
// runs code the project did not author, whether or not anything stamped it.
// ────────────────────────────────────────────────────────────────────────

test(
  "an unstamped entry whose runner is plugin:-prefixed is listed as execution-bearing",
  withProject(async (ctx) => {
    // No `source:` — exactly the shape materialize leaves on a pre-existing row.
    seedEntry(ctx, "diagnostics", { id: "adev/unstamped", runner: "plugin:tier1/x.mjs" });
    const findings = (await runPass19(ctx)).filter(
      (f) => f.id === "hygiene/non-project-execution-field" && f.entry_id === "adev/unstamped",
    );
    assert.equal(findings.length, 1, "a plugin:-runner row must surface even with no source:");
    assert.ok(findings[0].message.includes("runner"), "message should name the runner field");
  }),
);

test(
  "an unstamped entry whose prompt is plugin:-prefixed is listed, in a materialization-exempt registry",
  withProject(async (ctx) => {
    // validate.yaml is SA-2-exempt: it is never materialized, so it can never
    // acquire a stamped `source:`. The audit must not depend on one.
    seedEntry(ctx, "validate", {
      id: "validate.check-x",
      prompt: "plugin:validate/checks/validate.check-x.md",
    });
    const findings = (await runPass19(ctx)).filter(
      (f) => f.id === "hygiene/non-project-execution-field" && f.entry_id === "validate.check-x",
    );
    assert.equal(findings.length, 1, "an exempt registry's plugin: row must still surface");
  }),
);

test(
  "a genuinely project-authored execution field is still NOT listed",
  withProject(async (ctx) => {
    // The guard must stay narrow: only the `plugin:` prefix promotes a row.
    // A hand-authored command with no source: keeps reading as project.
    seedEntry(ctx, "gates", { id: "own-gate-unstamped", command: ["npm", "test"] });
    seedEntry(ctx, "review", { id: "own-reviewer", prompt: "./local/reviewer.md" });
    const findings = (await runPass19(ctx)).filter(
      (f) => f.id === "hygiene/non-project-execution-field",
    );
    assert.equal(findings.length, 0, "plain project rows must not be promoted");
  }),
);

test(
  "a plugin:-referencing row is not misreported as a disabled BUNDLED entry",
  withProject(async (ctx) => {
    // The disabled-entry audit reads `source:` proper. A project file that
    // switches off its own row must not be accused of disabling a bundled
    // check merely because that row points at a plugin-shipped prompt.
    seedEntry(ctx, "validate", {
      id: "validate.check-off",
      prompt: "plugin:validate/checks/validate.check-off.md",
      enabled: false,
      disabled_reason: "not applicable here",
    });
    const findings = await runPass19(ctx);
    assert.equal(
      findings.filter(
        (f) => f.id === "hygiene/disabled-bundled-entry" && f.entry_id === "validate.check-off",
      ).length,
      0,
      "provenance for the disabled audit still comes from source:, not from the field value",
    );
    // ...but it IS execution-bearing.
    assert.equal(
      findings.filter(
        (f) =>
          f.id === "hygiene/non-project-execution-field" && f.entry_id === "validate.check-off",
      ).length,
      1,
    );
  }),
);

// ────────────────────────────────────────────────────────────────────────
// hygiene/entry-field-drift — audit 4.
//
// The id-set audits (1: unadopted-upgrade/project-addition, and the
// execution-field audit 3) both key on entry ID. An entry present in BOTH the
// project file and its source is invisible to them no matter how far its
// FIELDS have diverged. This is the gap that let a reviewer's context_pack
// stay narrowed to 'base' for five days in this very repo with no error,
// warning, or failed run (issue-cp2l2e).
// ────────────────────────────────────────────────────────────────────────

test(
  "a context_pack divergence from a domain-sourced entry is reported at warning, naming both values",
  withProject(async (ctx) => {
    addStarterEntry(ctx, "review", { id: "consistency-analyzer", context_pack: "consistency" });
    seedEntry(ctx, "review", {
      id: "consistency-analyzer",
      source: `domain:${DOMAIN}`,
      context_pack: "base",
    });
    const f = (await runPass19(ctx)).find(
      (x) => x.id === "hygiene/entry-field-drift" && x.entry_id === "consistency-analyzer",
    );
    assert.ok(f, "expected an entry-field-drift finding");
    assert.equal(f.severity, "warning");
    assert.equal(f.registry, "review");
    assert.equal(f.field, "context_pack");
    assert.equal(f.project_value, "base");
    assert.equal(f.profile_value, "consistency");
    assert.match(f.message, /context_pack/);
    assert.match(f.message, /'base'/);
    assert.match(f.message, /'consistency'/);
  }),
);

test(
  "a domain-sourced entry whose fields still match its profile produces no field-drift finding",
  withProject(async (ctx) => {
    addStarterEntry(ctx, "review", {
      id: "wiring-reviewer",
      context_pack: "wiring",
      profile: "reviewer-capable",
      severity_cap: "blocker",
    });
    seedEntry(ctx, "review", {
      id: "wiring-reviewer",
      source: `domain:${DOMAIN}`,
      context_pack: "wiring",
      profile: "reviewer-capable",
      severity_cap: "blocker",
    });
    const findings = (await runPass19(ctx)).filter((f) => f.id === "hygiene/entry-field-drift");
    assert.equal(findings.length, 0);
  }),
);

test(
  "a bundled-sourced entry's field divergence is compared against the bundled template, not the domain overlay",
  withProject(async (ctx) => {
    // The domain overlay declares a DIFFERENT value for the same field/id —
    // if the audit fell back to it for a 'bundled' source, this would either
    // miss the real divergence or report the wrong one.
    addStarterEntry(ctx, "gates", { id: "shared-gate", severity_cap: "warning" });
    seedEntry(ctx, "gates", { id: "shared-gate", source: "bundled", severity_cap: "info" });
    const noTemplateMatch = (await runPass19(ctx)).filter(
      (f) => f.id === "hygiene/entry-field-drift" && f.entry_id === "shared-gate",
    );
    assert.equal(
      noTemplateMatch.length,
      0,
      "no bundled-template entry with this id exists yet — nothing to compare a 'bundled' source against",
    );

    addBundledTemplateEntry(ctx, "gates", { id: "shared-gate-2", severity_cap: "warning" });
    seedEntry(ctx, "gates", { id: "shared-gate-2", source: "bundled", severity_cap: "info" });
    const f2 = (await runPass19(ctx)).find(
      (x) => x.id === "hygiene/entry-field-drift" && x.entry_id === "shared-gate-2",
    );
    assert.ok(f2, "expected the bundled-template divergence to be reported");
    assert.equal(f2.project_value, "info");
    assert.equal(f2.profile_value, "warning");
  }),
);

test(
  "a field present on only one side is reported against '(not set)' on the other",
  withProject(async (ctx) => {
    addStarterEntry(ctx, "review", { id: "dropped-field-reviewer", severity_cap: "blocker" });
    seedEntry(ctx, "review", { id: "dropped-field-reviewer", source: `domain:${DOMAIN}` });
    const f = (await runPass19(ctx)).find(
      (x) => x.id === "hygiene/entry-field-drift" && x.entry_id === "dropped-field-reviewer",
    );
    assert.ok(f, "expected a finding for the field only the profile declares");
    assert.equal(f.field, "severity_cap");
    assert.equal(f.project_value, undefined);
    assert.equal(f.profile_value, "blocker");
    assert.match(f.message, /\(not set\)/);
  }),
);

test(
  "a field outside the drift set never triggers a finding, even when it differs",
  withProject(async (ctx) => {
    addStarterEntry(ctx, "review", { id: "name-drift-reviewer", name: "New Name" });
    seedEntry(ctx, "review", { id: "name-drift-reviewer", source: `domain:${DOMAIN}`, name: "Old Name" });
    const findings = (await runPass19(ctx)).filter(
      (f) => f.id === "hygiene/entry-field-drift" && f.entry_id === "name-drift-reviewer",
    );
    assert.equal(findings.length, 0, "name is not in FIELD_DRIFT_FIELDS");
  }),
);

test(
  "a project-sourced entry never produces a field-drift finding",
  withProject(async (ctx) => {
    addStarterEntry(ctx, "review", { id: "own-reviewer", context_pack: "architecture" });
    seedEntry(ctx, "review", { id: "own-reviewer", source: "project", context_pack: "base" });
    const findings = (await runPass19(ctx)).filter(
      (f) => f.id === "hygiene/entry-field-drift" && f.entry_id === "own-reviewer",
    );
    assert.equal(findings.length, 0, "a project entry has no source to diverge from");
  }),
);

test(
  "an entry with no source at all (defaults to project) never produces a field-drift finding",
  withProject(async (ctx) => {
    addStarterEntry(ctx, "review", { id: "bare-reviewer", context_pack: "architecture" });
    seedEntry(ctx, "review", { id: "bare-reviewer", context_pack: "base" });
    const findings = (await runPass19(ctx)).filter(
      (f) => f.id === "hygiene/entry-field-drift" && f.entry_id === "bare-reviewer",
    );
    assert.equal(findings.length, 0);
  }),
);

test(
  "the dispatch field is compared structurally — same nested keys in a different order is not drift",
  withProject(async (ctx) => {
    const overlayPath = join(ctx.dir, ".context-index/domains", DOMAIN, "reviewers.yaml");
    writeFileSync(
      overlayPath,
      [
        "reviewers:",
        "  - id: dispatch-match-reviewer",
        "    dispatch:",
        "      triggered:",
        "        min_score: 1",
        "        keywords: [loop, retry]",
        "",
      ].join("\n"),
    );
    const reviewPath = join(ctx.dir, ".context-index/governance/review.yaml");
    const lines = readFileSync(reviewPath, "utf8").split("\n");
    const markerAt = lines.findIndex((l) => l.startsWith("materialized_at:"));
    lines.splice(
      markerAt,
      0,
      "  - id: dispatch-match-reviewer",
      `    source: domain:${DOMAIN}`,
      "    dispatch:",
      "      triggered:",
      "        keywords: [loop, retry]",
      "        min_score: 1",
      "",
    );
    writeFileSync(reviewPath, lines.join("\n"));

    const findings = (await runPass19(ctx)).filter(
      (f) =>
        f.id === "hygiene/entry-field-drift" &&
        f.entry_id === "dispatch-match-reviewer" &&
        f.field === "dispatch",
    );
    assert.equal(findings.length, 0, "same nested keys in a different order must not read as drift");
  }),
);

test(
  "a genuinely different dispatch shape IS reported as drift",
  withProject(async (ctx) => {
    const overlayPath = join(ctx.dir, ".context-index/domains", DOMAIN, "reviewers.yaml");
    writeFileSync(overlayPath, ["reviewers:", "  - id: dispatch-diff-reviewer", "    dispatch: always", ""].join("\n"));
    const reviewPath = join(ctx.dir, ".context-index/governance/review.yaml");
    const lines = readFileSync(reviewPath, "utf8").split("\n");
    const markerAt = lines.findIndex((l) => l.startsWith("materialized_at:"));
    lines.splice(
      markerAt,
      0,
      "  - id: dispatch-diff-reviewer",
      `    source: domain:${DOMAIN}`,
      "    dispatch: triggered",
      "",
    );
    writeFileSync(reviewPath, lines.join("\n"));

    const f = (await runPass19(ctx)).find(
      (x) =>
        x.id === "hygiene/entry-field-drift" &&
        x.entry_id === "dispatch-diff-reviewer" &&
        x.field === "dispatch",
    );
    assert.ok(f, "expected a dispatch drift finding");
    assert.equal(f.project_value, "triggered");
    assert.equal(f.profile_value, "always");
  }),
);

test("adev governance drift surfaces entry-field-drift in its JSON envelope", async () => {
  const ctx = setupProject();
  try {
    addStarterEntry(ctx, "review", { id: "envelope-reviewer", context_pack: "architecture" });
    seedEntry(ctx, "review", { id: "envelope-reviewer", source: `domain:${DOMAIN}`, context_pack: "base" });
    const r = cli(["governance", "drift", "--json"], ctx.dir);
    assert.equal(r.status, 0, r.stderr);
    const envelope = JSON.parse(r.stdout);
    const f = envelope.findings.find(
      (x) => x.id === "hygiene/entry-field-drift" && x.entry_id === "envelope-reviewer",
    );
    assert.ok(f, "envelope must carry the field-drift finding");
    assert.equal(f.severity, "warning");
    assert.ok(envelope.summary.warning_count >= 1);
  } finally {
    cleanupTempDir(ctx.dir);
  }
});

test(
  "the entry-field-drift audit reproduces this repository's own currently-live context_pack divergence",
  async () => {
    // Regression pin for issue-cp2l2e: this repo's own review.yaml carries an
    // active (non-disabled) consistency-analyzer entry whose context_pack
    // ('base') has diverged from the software domain profile ('consistency')
    // since commit 631a12ad. Pre-fix, Pass 19 was silent about it.
    const result = await runRegistryDriftPass(PLUGIN_ROOT, { registry: "review" });
    const f = result.findings.find(
      (x) => x.id === "hygiene/entry-field-drift" && x.entry_id === "consistency-analyzer",
    );
    assert.ok(f, "expected the live context_pack divergence to be reported");
    assert.equal(f.field, "context_pack");
    assert.equal(f.severity, "warning");
  },
);
