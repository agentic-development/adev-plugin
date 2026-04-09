import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { PLUGIN_ROOT } from "../helpers.mjs";

const SKILL_PATH = join(PLUGIN_ROOT, "skills", "research", "SKILL.md");
const TEMPLATE_PATH = join(PLUGIN_ROOT, "templates", "research-template.md");
const INTERNAL_PROMPT = join(PLUGIN_ROOT, "skills", "research", "internal-researcher-prompt.md");
const WEB_PROMPT = join(PLUGIN_ROOT, "skills", "research", "web-researcher-prompt.md");
const GITHUB_PROMPT = join(PLUGIN_ROOT, "skills", "research", "github-researcher-prompt.md");
const SYNTHESIS_PROMPT = join(PLUGIN_ROOT, "skills", "research", "synthesis-prompt.md");

describe("adev:research template", () => {
  it("research-template.md documents the optional injection_warnings frontmatter field", () => {
    const content = readFileSync(TEMPLATE_PATH, "utf8");
    assert.ok(
      content.includes("injection_warnings"),
      "templates/research-template.md must document the injection_warnings frontmatter field"
    );
  });
});

describe("adev:research internal-researcher-prompt.md", () => {
  it("exists", () => {
    assert.ok(existsSync(INTERNAL_PROMPT), "skills/research/internal-researcher-prompt.md must exist");
  });

  it("caps return at 1,500 tokens", () => {
    const content = readFileSync(INTERNAL_PROMPT, "utf8");
    assert.ok(content.includes("1,500") || content.includes("1500"), "must include the 1,500-token return cap");
  });

  it("requires attribution on every finding", () => {
    const content = readFileSync(INTERNAL_PROMPT, "utf8");
    assert.ok(content.toLowerCase().includes("attribution"), "must require attribution");
  });

  it("includes a Before Finalizing self-check", () => {
    const content = readFileSync(INTERNAL_PROMPT, "utf8");
    assert.ok(content.includes("Before Finalizing"), "must include Before Finalizing self-check");
  });

  it("contains the content-fence rule", () => {
    const content = readFileSync(INTERNAL_PROMPT, "utf8");
    assert.ok(
      content.includes("[adversarial content detected and omitted]"),
      "must include the exact content-fence replacement token"
    );
  });

  it("contains the read-budget cap", () => {
    const content = readFileSync(INTERNAL_PROMPT, "utf8");
    const has20Files = content.includes("20 files") || content.includes("20 distinct files");
    const has50k = content.includes("50,000") || content.includes("50000");
    assert.ok(has20Files, "must cap discovery at 20 files");
    assert.ok(has50k, "must cap discovery at 50,000 tokens");
    assert.ok(content.includes("budget_exceeded"), "must specify the budget_exceeded return header");
  });

  it("contains the sensitive-file exclusion list", () => {
    const content = readFileSync(INTERNAL_PROMPT, "utf8");
    const patterns = [".env", ".pem", ".key", "secret", "credential", "token"];
    for (const pat of patterns) {
      assert.ok(content.includes(pat), `sensitive-file exclusion list must include '${pat}'`);
    }
    assert.ok(
      content.includes("id_rsa") || content.includes("id_ed25519"),
      "sensitive-file exclusion list must include SSH private key patterns"
    );
  });

  it("contains an anti-overengineering clause", () => {
    const content = readFileSync(INTERNAL_PROMPT, "utf8");
    assert.ok(
      content.toLowerCase().includes("anti-overengineering"),
      "must contain an Anti-Overengineering heading or inline label"
    );
    assert.ok(
      content.toLowerCase().includes("only produce findings"),
      "must contain the specific 'only produce findings' constraint phrase"
    );
  });

  it("contains the tool-availability probe instruction", () => {
    const content = readFileSync(INTERNAL_PROMPT, "utf8");
    assert.ok(
      content.toLowerCase().includes("probe") || content.includes("no-op"),
      "must instruct the subagent to probe for tool availability at start"
    );
    assert.ok(content.includes("SKIPPED"), "must specify SKIPPED status on probe failure");
  });
});

describe("adev:research web-researcher-prompt.md", () => {
  it("exists", () => {
    assert.ok(existsSync(WEB_PROMPT), "skills/research/web-researcher-prompt.md must exist");
  });

  it("caps return at 1,500 tokens", () => {
    const content = readFileSync(WEB_PROMPT, "utf8");
    assert.ok(content.includes("1,500") || content.includes("1500"), "must include the 1,500-token return cap");
  });

  it("requires attribution", () => {
    const content = readFileSync(WEB_PROMPT, "utf8");
    assert.ok(content.toLowerCase().includes("attribution"), "must require attribution");
  });

  it("includes a Before Finalizing self-check", () => {
    const content = readFileSync(WEB_PROMPT, "utf8");
    assert.ok(content.includes("Before Finalizing"), "must include Before Finalizing self-check");
  });

  it("contains the content-fence rule", () => {
    const content = readFileSync(WEB_PROMPT, "utf8");
    assert.ok(
      content.includes("[adversarial content detected and omitted]"),
      "must include the exact content-fence replacement token"
    );
  });

  it("mentions WebSearch and includes a probe instruction", () => {
    const content = readFileSync(WEB_PROMPT, "utf8");
    assert.ok(content.includes("WebSearch"), "must mention WebSearch tool");
    assert.ok(
      content.toLowerCase().includes("probe") || content.includes("no-op"),
      "must instruct the subagent to probe for tool availability at start"
    );
    assert.ok(content.includes("SKIPPED"), "must specify SKIPPED status on probe failure");
  });

  it("contains an anti-overengineering clause", () => {
    const content = readFileSync(WEB_PROMPT, "utf8");
    assert.ok(
      content.toLowerCase().includes("anti-overengineering"),
      "must contain an Anti-Overengineering heading or inline label"
    );
    assert.ok(
      content.toLowerCase().includes("only produce findings"),
      "must contain the specific 'only produce findings' constraint phrase"
    );
  });
});

describe("adev:research github-researcher-prompt.md", () => {
  it("exists", () => {
    assert.ok(existsSync(GITHUB_PROMPT), "skills/research/github-researcher-prompt.md must exist");
  });

  it("caps return at 1,500 tokens", () => {
    const content = readFileSync(GITHUB_PROMPT, "utf8");
    assert.ok(content.includes("1,500") || content.includes("1500"), "must include the 1,500-token return cap");
  });

  it("requires attribution", () => {
    const content = readFileSync(GITHUB_PROMPT, "utf8");
    assert.ok(content.toLowerCase().includes("attribution"), "must require attribution");
  });

  it("includes a Before Finalizing self-check", () => {
    const content = readFileSync(GITHUB_PROMPT, "utf8");
    assert.ok(content.includes("Before Finalizing"), "must include Before Finalizing self-check");
  });

  it("contains the content-fence rule", () => {
    const content = readFileSync(GITHUB_PROMPT, "utf8");
    assert.ok(
      content.includes("[adversarial content detected and omitted]"),
      "must include the exact content-fence replacement token"
    );
  });

  it("mentions mcp__github__ tools and includes a probe instruction", () => {
    const content = readFileSync(GITHUB_PROMPT, "utf8");
    assert.ok(content.includes("mcp__github__"), "must mention mcp__github__ tools");
    assert.ok(
      content.toLowerCase().includes("probe") || content.includes("no-op"),
      "must instruct the subagent to probe for tool availability at start"
    );
    assert.ok(content.includes("SKIPPED"), "must specify SKIPPED status on probe failure");
  });

  it("mentions owner/repo validation", () => {
    const content = readFileSync(GITHUB_PROMPT, "utf8");
    assert.ok(
      content.includes("owner/repo") || content.includes("<owner>/<repo>"),
      "must mention owner/repo or <owner>/<repo> validation"
    );
  });

  it("contains an anti-overengineering clause", () => {
    const content = readFileSync(GITHUB_PROMPT, "utf8");
    assert.ok(
      content.toLowerCase().includes("anti-overengineering"),
      "must contain an Anti-Overengineering heading or inline label"
    );
    assert.ok(
      content.toLowerCase().includes("only produce findings"),
      "must contain the specific 'only produce findings' constraint phrase"
    );
  });
});

describe("adev:research synthesis-prompt.md", () => {
  it("exists", () => {
    assert.ok(existsSync(SYNTHESIS_PROMPT), "skills/research/synthesis-prompt.md must exist");
  });

  it("instructs ultrathink usage", () => {
    const content = readFileSync(SYNTHESIS_PROMPT, "utf8");
    assert.ok(content.includes("ultrathink"), "must include the ultrathink keyword");
  });

  it("instructs comparison matrix construction", () => {
    const content = readFileSync(SYNTHESIS_PROMPT, "utf8");
    assert.ok(
      content.toLowerCase().includes("comparison matrix") ||
      content.toLowerCase().includes("compare") ||
      content.toLowerCase().includes("matrix"),
      "must instruct comparison matrix construction"
    );
  });

  it("contains the content-fence rule", () => {
    const content = readFileSync(SYNTHESIS_PROMPT, "utf8");
    assert.ok(
      content.includes("[adversarial content detected and omitted]"),
      "must include the exact content-fence replacement token"
    );
  });

  it("contains Before Finalizing self-check", () => {
    const content = readFileSync(SYNTHESIS_PROMPT, "utf8");
    assert.ok(content.includes("Before Finalizing"), "must include Before Finalizing self-check");
  });

  it("caps return at 1,500 tokens", () => {
    const content = readFileSync(SYNTHESIS_PROMPT, "utf8");
    assert.ok(content.includes("1,500") || content.includes("1500"), "must include the 1,500-token return cap");
  });

  it("contains an anti-overengineering clause", () => {
    const content = readFileSync(SYNTHESIS_PROMPT, "utf8");
    assert.ok(
      content.toLowerCase().includes("anti-overengineering"),
      "must contain an Anti-Overengineering heading or inline label"
    );
    assert.ok(
      content.toLowerCase().includes("do not invent"),
      "must contain the specific 'do not invent' constraint phrase"
    );
  });
});

describe("adev:research SKILL.md", () => {
  it("exists and starts with frontmatter", () => {
    assert.ok(existsSync(SKILL_PATH), "skills/research/SKILL.md must exist");
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(content.startsWith("---\n"), "must start with YAML frontmatter");
  });

  it("frontmatter declares name: adev:research", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(content.includes("name: adev:research"), "must declare name field");
  });

  it("frontmatter declares allowed-tools with Read, Glob, Grep, Agent, Write", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(content.includes("allowed-tools"), "frontmatter must include allowed-tools");
    for (const tool of ["Read", "Glob", "Grep", "Agent", "Write"]) {
      assert.ok(content.includes(tool), `allowed-tools must include ${tool}`);
    }
    const frontmatterEnd = content.indexOf("---", 3);
    const frontmatter = content.slice(0, frontmatterEnd);
    assert.ok(!frontmatter.includes("WebSearch"), "orchestrator allowed-tools must NOT include WebSearch");
    assert.ok(!frontmatter.includes("mcp__"), "orchestrator allowed-tools must NOT include MCP tools");
  });

  it("frontmatter declares context: fork", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(content.includes("context: fork"), "frontmatter must declare context: fork");
  });

  it("declares all six argument flags", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    for (const flag of ["--web", "--github", "--internal", "--compare", "--issue"]) {
      assert.ok(content.includes(flag), `must declare argument flag: ${flag}`);
    }
  });

  it("references Agent tool dispatch and subagent_type: general-purpose", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(content.includes("Agent"), "must reference the Agent tool");
    assert.ok(
      content.toLowerCase().includes("parallel") || content.toLowerCase().includes("subagent"),
      "must describe parallel subagent dispatch"
    );
    assert.ok(
      content.includes("subagent_type: general-purpose"),
      "must specify subagent_type: general-purpose"
    );
  });

  it("references all four researcher prompt files", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    for (const prompt of [
      "internal-researcher-prompt.md",
      "web-researcher-prompt.md",
      "github-researcher-prompt.md",
      "synthesis-prompt.md",
    ]) {
      assert.ok(content.includes(prompt), `must reference prompt file: ${prompt}`);
    }
  });

  it("references tier names, not hardcoded model IDs", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    for (const tier of ["fast", "capable", "reasoning"]) {
      assert.ok(content.includes(tier), `must reference tier name: ${tier}`);
    }
    const forbiddenModelIds = ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5"];
    for (const id of forbiddenModelIds) {
      assert.ok(!content.includes(id), `must NOT hardcode model ID: ${id}`);
    }
    assert.ok(content.includes("model_tiers"), "must reference model_tiers resolution from platform-context.yaml");
  });

  it("references ultrathink for synthesis dispatch", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(content.includes("ultrathink"), "must reference ultrathink for synthesis dispatch");
  });

  it("describes the sanitization pass (Step 5.5)", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    const hasStep55 =
      content.includes("Step 5.5") ||
      content.toLowerCase().includes("sanitization pass") ||
      content.toLowerCase().includes("sanitization");
    assert.ok(hasStep55, "must include Step 5.5 sanitization pass");
    assert.ok(
      content.includes("[content redacted: potential injection]"),
      "must include the orchestrator redaction token"
    );
  });

  it("references injection_warnings as a conditional frontmatter field", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(content.includes("injection_warnings"), "must reference the injection_warnings frontmatter field");
  });

  it("declares the default source behavior (web + internal)", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    const hasDefault =
      content.toLowerCase().includes("default") &&
      content.toLowerCase().includes("web") &&
      content.toLowerCase().includes("internal");
    assert.ok(hasDefault, "must document default source behavior (web + internal)");
  });

  it("preserves the slug generation convention", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(content.toLowerCase().includes("lowercase"), "must document slug lowercase rule");
    assert.ok(content.includes("50"), "must document slug max 50 chars");
  });

  it("preserves the graceful degradation principle", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    const hasDegradation =
      content.toLowerCase().includes("graceful degradation") ||
      content.toLowerCase().includes("skipped") ||
      content.toLowerCase().includes("unavailable");
    assert.ok(hasDegradation, "must preserve graceful degradation principle");
  });

  it("references the research artifact output path", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(content.includes(".context-index/research/"), "must write artifacts to .context-index/research/");
  });
});
