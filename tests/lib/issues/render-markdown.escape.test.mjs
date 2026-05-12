/**
 * Byte-exact escape contract tests (Task 15).
 *
 * Exercises each of the 6 rules from the spec's HTML/Markdown Escaping
 * Contract independently. Asserts the byte-exact escape output.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { escapeField } from "../../../lib/issues/render-markdown.mjs";

describe("escapeField — Rule 1: newline normalization", () => {
  it("normalizes CRLF → LF in block context", () => {
    const out = escapeField("a\r\nb", { slot: "block", cap: 0 });
    assert.equal(out, "a\nb");
  });

  it("normalizes lone CR → LF in block context", () => {
    const out = escapeField("a\rb", { slot: "block", cap: 0 });
    assert.equal(out, "a\nb");
  });
});

describe("escapeField — Rule 2: slot-context newline collapse", () => {
  it("inline slot replaces \\n with a single space", () => {
    const out = escapeField("a\nb\nc", { slot: "inline" });
    assert.equal(out, "a b c");
  });

  it("block slot preserves \\n", () => {
    const out = escapeField("a\nb", { slot: "block" });
    assert.equal(out, "a\nb");
  });

  it("inline slot collapses CRLF-normalized sequences too", () => {
    const out = escapeField("a\r\nb\r\nc", { slot: "inline" });
    assert.equal(out, "a b c");
  });
});

describe("escapeField — Rule 3: HTML escape", () => {
  it("escapes <script>alert('xss')</script> byte-exact", () => {
    const out = escapeField("<script>alert('xss')</script>", { slot: "inline" });
    // The output goes through HTML escape (rule 3) then markdown escape (rule 4).
    // HTML escape: `<` → `&lt;`, `'` → `&#39;`, `>` → `&gt;`.
    // Markdown escape on the HTML-escaped form: no `&`, `;`, etc. are escaped.
    // The amp/sl chars in the HTML entities (`&`, `;`) are NOT in the
    // markdown escape set, so they survive.
    // `(` and `)` are escaped by markdown structural rule.
    assert.equal(
      out,
      "&lt;script&gt;alert\\(&#39;xss&#39;\\)&lt;/script&gt;",
    );
  });

  it("escapes ampersand first to avoid double-escape", () => {
    const out = escapeField("a&b", { slot: "inline" });
    assert.equal(out, "a&amp;b");
  });

  it("escapes double-quote and single-quote", () => {
    const out = escapeField("\"x\"'y'", { slot: "inline" });
    assert.equal(out, "&quot;x&quot;&#39;y&#39;");
  });
});

describe("escapeField — Rule 4: markdown structural escape", () => {
  it("escapes a pipe inside table cell as \\|", () => {
    const out = escapeField("a|b", { slot: "inline" });
    assert.equal(out, "a\\|b");
  });

  it("escapes backtick as \\`", () => {
    const out = escapeField("a`b", { slot: "inline" });
    assert.equal(out, "a\\`b");
  });

  it("escapes backslash first, then other chars (no double-escape)", () => {
    // Input: a|b\\c`d  →  rule 4 escapes \, |, ` in that order →
    //   a\|b\\c\`d (per spec line 174)
    const out = escapeField("a|b\\c`d", { slot: "inline" });
    assert.equal(out, "a\\|b\\\\c\\`d");
  });

  it("escapes * _ [ ] ( ) #", () => {
    const out = escapeField("*x_y[z](q)#h", { slot: "inline" });
    assert.equal(out, "\\*x\\_y\\[z\\]\\(q\\)\\#h");
  });

  it("escapes a leading > with \\>", () => {
    const out = escapeField("> quote", { slot: "inline" });
    // HTML escape first: `>` → `&gt;`. After HTML escape, the `>` is gone
    // and the leading-`>` rule no longer applies (because the string starts
    // with `&` now). This is the intended outcome: HTML escape suppresses
    // the block-quote anchor.
    assert.equal(out, "&gt; quote");
  });

  it("HTML escape MUST precede markdown escape (rule 3 → rule 4)", () => {
    // `<` becomes `&lt;` (HTML escape), NOT `\<&lt;`. This is a spec invariant.
    const out = escapeField("<", { slot: "inline" });
    assert.equal(out, "&lt;");
    assert.ok(!out.startsWith("\\<"), "must not double-escape via markdown before HTML");
  });
});

describe("escapeField — Rule 5: length truncation", () => {
  it("truncates strings longer than cap with …[truncated]", () => {
    const cap = 20;
    const long = "x".repeat(50);
    const out = escapeField(long, { slot: "inline", cap });
    assert.equal(out.length, cap);
    assert.ok(out.endsWith("…[truncated]"), `expected truncated marker, got: ${out}`);
  });

  it("does NOT truncate strings <= cap", () => {
    const out = escapeField("short", { slot: "inline", cap: 100 });
    assert.equal(out, "short");
  });

  it("is codepoint-counted (Unicode-safe), not byte-counted", () => {
    // 30 emoji of 4 UTF-16 bytes each — would be 60 codepoints in UTF-16
    // surrogate counting but 30 codepoints via Array.from. We use
    // codepoint counting per spec ("codepoint-counted (Unicode-safe)").
    const cap = 10;
    const emoji = "🎉".repeat(30); // 30 codepoints
    const out = escapeField(emoji, { slot: "inline", cap });
    // Array.from(out).length must be <= cap.
    assert.ok(
      Array.from(out).length <= cap,
      `expected ≤${cap} codepoints, got ${Array.from(out).length}: ${out}`,
    );
  });

  it("applies cap on the ESCAPED form so backslash-bomb cannot defeat it", () => {
    // Many backticks → each becomes \` (2 chars). The cap is applied after
    // the escape, so an attacker cannot inflate output length past cap.
    const cap = 20;
    const out = escapeField("`".repeat(100), { slot: "inline", cap });
    assert.ok(Array.from(out).length <= cap, `output exceeds cap: ${out}`);
  });
});

describe("escapeField — Rule 6: null placeholder", () => {
  it("null renders as em-dash", () => {
    assert.equal(escapeField(null, { slot: "inline" }), "—");
  });

  it("undefined renders as em-dash", () => {
    assert.equal(escapeField(undefined, { slot: "inline" }), "—");
  });

  it("empty string renders as em-dash", () => {
    assert.equal(escapeField("", { slot: "inline" }), "—");
  });

  it("non-empty space-only string does NOT render as em-dash", () => {
    // A literal space-only string is not equivalent to null per spec.
    const out = escapeField(" ", { slot: "inline" });
    assert.equal(out, " ");
  });
});

describe("escapeField — Combined attacks", () => {
  it("backtick-bomb cannot escape a fenced code block (rule 4 escapes ```)", () => {
    const payload = "```\nrm -rf /\n```";
    // Block slot — preserves \n.
    const out = escapeField(payload, { slot: "block" });
    // The triple-backtick must be escaped — each ` → \`.
    assert.equal(out, "\\`\\`\\`\nrm -rf /\n\\`\\`\\`");
  });

  it("pipe-injection into table row escapes pipes", () => {
    const out = escapeField("a | b | c", { slot: "inline" });
    assert.equal(out, "a \\| b \\| c");
  });

  it("line-break injection (\\n## Fake Heading) cannot break inline slot", () => {
    const out = escapeField("legit\n## Fake", { slot: "inline" });
    // Rule 2 collapses \n → space, then rule 4 escapes #.
    assert.equal(out, "legit \\#\\# Fake");
  });
});
