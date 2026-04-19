import { test, describe } from "node:test";
import { strict as assert } from "node:assert";

import { createRedactor } from "../../lib/profiles/redaction.mjs";

describe("profiles/redaction", () => {
  test("exact substring replacement", () => {
    const r = createRedactor({ API_TOKEN: "supersecret-value" });
    assert.equal(
      r.redact("result: supersecret-value appears here"),
      "result: <REDACTED:API_TOKEN> appears here"
    );
  });

  test("values below minimum length (8) are not redacted", () => {
    const r = createRedactor({ SHORT: "abc" });
    assert.equal(r.redact("abc appears"), "abc appears");
  });

  test("shared-value disambiguation lists both keys, sorted", () => {
    const r = createRedactor({ KEY_B: "shared-val-123", KEY_A: "shared-val-123" });
    assert.equal(
      r.redact("echo shared-val-123"),
      "echo <REDACTED:KEY_A|KEY_B>"
    );
  });

  test("longest values are replaced first to avoid partial shadowing", () => {
    const r = createRedactor({
      SHORT_KEY: "token-12345",
      LONG_KEY: "token-12345-extra-data",
    });
    assert.equal(
      r.redact("see token-12345-extra-data here"),
      "see <REDACTED:LONG_KEY> here"
    );
  });

  test("streaming: redacts match split across chunk boundaries", () => {
    const r = createRedactor({ API_TOKEN: "my-secret-value" });
    const stream = r.createStream();
    const out1 = stream.push("leading-my-sec");
    const out2 = stream.push("ret-value-trailing");
    const tail = stream.flush();
    const combined = out1 + out2 + tail;
    assert.equal(combined, "leading-<REDACTED:API_TOKEN>-trailing");
  });

  test("streaming: flushes final buffer", () => {
    const r = createRedactor({ KEY: "exactly-this" });
    const stream = r.createStream();
    const out = stream.push("before ");
    const tail = stream.flush();
    assert.equal(out + tail, "before ");
  });

  test("no redactions when map is empty", () => {
    const r = createRedactor({});
    assert.equal(r.redact("anything"), "anything");
  });
});
