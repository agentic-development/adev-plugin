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
