/**
 * Dispatch-shape helpers.
 *
 * Given a loaded reviewer registry + a target spec path, produce the exact
 * structs the skill would hand to its harness-level `Task` tool. This is
 * PURE data — no subagent is launched. The shape is stable enough to
 * assert properties on without an LLM:
 *
 *   - `env` values never appear in `prompt` text or `description`
 *     (Behavior 35 of execution-profiles)
 *   - `redactionSet` is a Set<string> ready to flow to the adapter
 *   - Package-mode reviewers produce TWO dispatch structs: a runner
 *     under the reviewer's profile and an adapter under the same (or
 *     explicitly chosen) profile
 *   - Context pack renders are attached as a single `contextPack` field
 *
 * Consumers (tests, a future live-runner, or the skill itself if it wires
 * it in) feed the array into whatever dispatcher they have.
 */

import { readFileSync } from "node:fs";

import { renderPack } from "./context-pack.mjs";
import { resolveProfile } from "../profiles/index.mjs";

/**
 * Build the ordered list of dispatch structs for a single reviewer.
 *
 * @param {any} reviewer                     registry entry (post-validate)
 * @param {{
 *   profiles: Record<string, any>,
 *   contextPacks: Record<string, any>,
 *   consumerRepoRoot: string,
 *   workspaceRoot?: string | null,
 *   adapter: any,
 *   mcpAvailable?: Set<string>,
 *   targetSpecPath: string,
 *   targetSpecContent: string,
 *   modelIdFromTier?: (tier: string) => string | undefined,
 * }} ctx
 *
 * @returns {{
 *   dispatches: Array<{
 *     stage: "subagent" | "runner" | "adapter",
 *     reviewerId: string,
 *     description: string,
 *     prompt: string,
 *     contextPack: string,
 *     allowedTools: string[],
 *     modelId?: string,
 *     env: Record<string, string>,
 *     redactionSet: Set<string>,
 *     promptSource: string,
 *     adapterSource?: string,
 *     skillSource?: string,
 *   }>,
 *   errors: {code: string, message: string}[],
 *   warnings: {code: string, message: string}[],
 * }}
 */
export function buildReviewerDispatches(reviewer, ctx) {
  const errors = [];
  const warnings = [];

  const prof = resolveProfile(reviewer.profile, {
    profiles: ctx.profiles,
    consumerRepoRoot: ctx.consumerRepoRoot,
    workspaceRoot: ctx.workspaceRoot ?? null,
    adapter: ctx.adapter,
    mcpAvailable: ctx.mcpAvailable ?? new Set(),
  });
  errors.push(...prof.errors);
  warnings.push(...prof.warnings);
  if (!prof.effective) return { dispatches: [], errors, warnings };

  const packRender = renderPack(reviewer.context_pack ?? "base", ctx.contextPacks, {
    repoRoot: ctx.consumerRepoRoot,
  });
  errors.push(...packRender.errors);
  warnings.push(...packRender.warnings);

  const dispatchStruct = ctx.adapter.prepareForDispatch(prof.effective, {
    env: prof.env,
    redactionSet: prof.redactionSet,
    mcpAvailable: ctx.mcpAvailable,
    modelIdFromTier: ctx.modelIdFromTier,
  });

  const description = `${reviewer.name ?? reviewer.id} review of ${basename(ctx.targetSpecPath)}`;
  const specBlock = `---\n## Target Spec: ${ctx.targetSpecPath}\n${ctx.targetSpecContent}`;
  const contextBlock = packRender.rendered
    ? `---\n## Context Pack\n${packRender.rendered}`
    : "";

  if (reviewer.mode === "subagent") {
    const promptBody = readTextSafe(reviewer.promptPath, errors);
    const prompt = joinNonEmpty([promptBody, contextBlock, specBlock]);
    return {
      dispatches: [
        {
          stage: "subagent",
          reviewerId: reviewer.id,
          description,
          prompt,
          contextPack: packRender.rendered,
          allowedTools: dispatchStruct.allowedTools,
          modelId: dispatchStruct.modelId,
          env: dispatchStruct.env,
          redactionSet: dispatchStruct.redactionSet,
          promptSource: reviewer.promptDisplay ?? reviewer.promptPath,
        },
      ],
      errors,
      warnings,
    };
  }

  // Package mode — two dispatches.
  const skillBody = readTextSafe(reviewer.skillPath, errors);
  const adapterBody = readTextSafe(reviewer.adapterPath, errors);
  const runnerFraming = `You are running as a reviewer subagent. Follow the instructions below faithfully. The arguments and context for this run are appended.`;
  const renderedArgs = renderArgs(reviewer.args ?? {}, ctx.targetSpecPath);
  const runnerPrompt = joinNonEmpty([
    runnerFraming,
    skillBody,
    renderedArgs ? `---\n## Arguments\n${renderedArgs}` : "",
    contextBlock,
    specBlock,
  ]);
  const adapterPrompt = joinNonEmpty([
    adapterBody,
    `---\n## Runner output will be appended by the caller; ID: ${reviewer.id}`,
    specBlock,
  ]);

  return {
    dispatches: [
      {
        stage: "runner",
        reviewerId: reviewer.id,
        description: `Run skill ${basename(reviewer.skillPath ?? "")} for review`,
        prompt: runnerPrompt,
        contextPack: packRender.rendered,
        allowedTools: dispatchStruct.allowedTools,
        modelId: dispatchStruct.modelId,
        env: dispatchStruct.env,
        redactionSet: dispatchStruct.redactionSet,
        promptSource: reviewer.skillDisplay ?? reviewer.skillPath,
        skillSource: reviewer.skillDisplay ?? reviewer.skillPath,
      },
      {
        stage: "adapter",
        reviewerId: reviewer.id,
        description: `${reviewer.name ?? reviewer.id} adapter parse`,
        prompt: adapterPrompt,
        contextPack: "",
        allowedTools: dispatchStruct.allowedTools,
        modelId: dispatchStruct.modelId,
        env: dispatchStruct.env,
        redactionSet: dispatchStruct.redactionSet,
        promptSource: reviewer.adapterDisplay ?? reviewer.adapterPath,
        adapterSource: reviewer.adapterDisplay ?? reviewer.adapterPath,
      },
    ],
    errors,
    warnings,
  };
}

/**
 * Render a `.review.md` body from a list of dispatches and (optionally)
 * per-reviewer findings. Byte-stable across runs when inputs are equal.
 */
export function renderReviewReport({
  specPath,
  charterPath,
  verdict,
  dispatches,
  findings = {},
  date = "1970-01-01",
}) {
  const lines = [];
  const slug = basename(specPath).replace(/\.md$/, "");
  lines.push(`# Architecture Review: ${slug}`);
  lines.push("");
  lines.push(`> **Date:** ${date}`);
  lines.push(`> **Spec:** ${specPath}`);
  if (charterPath) lines.push(`> **Charter:** ${charterPath}`);
  lines.push(`> **Verdict:** ${verdict}`);
  lines.push("");
  lines.push("## Reviewers Dispatched");
  lines.push("");
  lines.push("| ID | Mode | Profile | Prompt/Skill |");
  lines.push("|----|------|---------|--------------|");
  const seen = new Set();
  for (const d of dispatches) {
    if (seen.has(d.reviewerId)) continue;
    seen.add(d.reviewerId);
    const mode = d.stage === "subagent" ? "subagent" : "package";
    lines.push(`| ${d.reviewerId} | ${mode} | — | ${d.promptSource ?? ""} |`);
  }
  lines.push("");
  for (const id of seen) {
    lines.push(`## ${id}`);
    lines.push("");
    const list = findings[id] ?? [];
    if (list.length === 0) {
      lines.push("No findings.");
    } else {
      for (const f of list) {
        lines.push(`- **${f.severity}**: ${f.message}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

function renderArgs(args, targetSpecPath) {
  const entries = Object.entries(args ?? {});
  if (entries.length === 0) return "";
  return entries
    .map(([k, v]) => {
      const rendered = typeof v === "string" ? v.replaceAll("<target>", targetSpecPath) : String(v);
      return `- ${k}: ${rendered}`;
    })
    .join("\n");
}

function readTextSafe(path, errors) {
  if (!path) return "";
  try {
    return readFileSync(path, "utf8");
  } catch (e) {
    errors.push({ code: "DISPATCH_READ", message: `${path}: ${e.message}` });
    return "";
  }
}

function joinNonEmpty(parts) {
  return parts.filter((p) => typeof p === "string" && p !== "").join("\n\n");
}

function basename(p) {
  if (!p) return "";
  const ix = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return ix >= 0 ? p.slice(ix + 1) : p;
}
