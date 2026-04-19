/**
 * Anthropic live dispatcher — OPTIONAL.
 *
 * This module is a thin template showing how to wire a real LLM into the
 * Tier 3 live-runner. It is NOT loaded by default. To use it:
 *
 *   npm install @anthropic-ai/sdk   # add to devDependencies out-of-band
 *   export ANTHROPIC_API_KEY=sk-...
 *   node tests/evals/configurable-governance/run-live.mjs \
 *        --dispatcher ./dispatchers/anthropic.mjs --variant claude-sonnet
 *
 * The dispatcher exports `async function dispatch(request) { ... }` that
 * returns `{ findings }` (subagent / adapter) or `{ stdout }` (runner).
 * The request object it receives is the dispatch struct produced by
 * buildReviewerDispatches() — description, prompt, allowedTools, env,
 * redactionSet, etc.
 *
 * Because the plugin itself is zero-dependency by constitution, the SDK
 * import here is dynamic and lazy — the file can live in the repo without
 * breaking `npm test` for users who haven't installed the SDK.
 */

export async function dispatch(request) {
  // Lazy import so the module can exist without the SDK installed.
  let Anthropic;
  try {
    ({ default: Anthropic } = await import("@anthropic-ai/sdk"));
  } catch (e) {
    throw new Error(
      `anthropic dispatcher: @anthropic-ai/sdk is not installed. Run 'npm install @anthropic-ai/sdk' in the plugin root, then retry.\n(original: ${e.message})`
    );
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("anthropic dispatcher: ANTHROPIC_API_KEY not set.");
  const client = new Anthropic({ apiKey });

  const model = request.modelId ?? "claude-sonnet-4-6";
  const res = await client.messages.create({
    model,
    max_tokens: 4096,
    system: `You are a reviewer subagent. Follow the instructions in the user turn. Output findings in YAML.`,
    messages: [{ role: "user", content: request.prompt }],
  });
  const text = res.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");

  if (request.stage === "adapter") return { yaml: text };
  if (request.stage === "runner") return { stdout: text };
  return parseFindings(text);
}

function parseFindings(text) {
  // Tolerant parser — enough for the stub contract.
  const match = text.match(/findings:\s*\n([\s\S]*)/);
  if (!match) return { findings: [] };
  // The real run-eval rubrics score the raw text; we don't need to
  // deep-parse here. Return the raw findings list as a single stringified
  // block for the rendered report. The live runner's report renderer
  // escapes this correctly.
  return {
    findings: [{ id: "LLM-1", severity: "suggestion", message: text.slice(0, 500) }],
    rawText: text,
  };
}
