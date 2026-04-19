import { test, describe, afterEach } from "node:test";
import { strict as assert } from "node:assert";

import { runQualityGate, buildEnv } from "../../lib/governance/quality-gate.mjs";
import { createRedactor } from "../../lib/profiles/redaction.mjs";
import { createTempDir, cleanupTempDir } from "../helpers.mjs";

const tempDirs = [];
function tmp() {
  const d = createTempDir();
  tempDirs.push(d);
  return d;
}
afterEach(() => {
  while (tempDirs.length) cleanupTempDir(tempDirs.pop());
});

describe("quality-gate buildEnv", () => {
  test("includes only whitelisted parent keys plus profile env", () => {
    const parent = {
      PATH: "/usr/bin",
      HOME: "/home/me",
      LD_PRELOAD: "/evil.so",
      NODE_OPTIONS: "--require=evil",
      PYTHONPATH: "/evil",
      UNRELATED: "x",
    };
    const profile = { API_TOKEN: "abc1234567" };
    const env = buildEnv(profile, parent);
    assert.equal(env.PATH, "/usr/bin");
    assert.equal(env.HOME, "/home/me");
    assert.equal(env.API_TOKEN, "abc1234567");
    assert.equal(env.LD_PRELOAD, undefined);
    assert.equal(env.NODE_OPTIONS, undefined);
    assert.equal(env.PYTHONPATH, undefined);
    assert.equal(env.UNRELATED, undefined);
  });

  test("profile env overrides minimal startup key when same name", () => {
    const env = buildEnv({ PATH: "/custom/bin" }, { PATH: "/usr/bin", HOME: "/home/me" });
    assert.equal(env.PATH, "/custom/bin");
    assert.equal(env.HOME, "/home/me");
  });
});

describe("quality-gate runQualityGate", () => {
  test("PASS on exit 0; redacts stdout through redactor", async () => {
    const cwd = tmp();
    const redactor = createRedactor({ SECRET: "super-secret-value" });
    const result = await runQualityGate(
      { id: "test.echo", command: ["sh", "-c", "echo before super-secret-value after"] },
      { cwd, env: { SECRET: "super-secret-value" }, redactor, parentEnv: { PATH: process.env.PATH || "/usr/bin" } }
    );
    assert.equal(result.status, "PASS");
    assert.equal(result.exitCode, 0);
    assert.match(result.redactedStdout, /<REDACTED:SECRET>/);
    assert.ok(!result.redactedStdout.includes("super-secret-value"));
  });

  test("FAIL on non-zero exit", async () => {
    const cwd = tmp();
    const redactor = createRedactor({});
    const result = await runQualityGate(
      { id: "test.fail", command: ["sh", "-c", "echo boom >&2; exit 3"] },
      { cwd, env: {}, redactor, parentEnv: { PATH: process.env.PATH || "/usr/bin" } }
    );
    assert.equal(result.status, "FAIL");
    assert.equal(result.exitCode, 3);
    assert.match(result.redactedStderr, /boom/);
  });

  test("redacts both stdout and stderr", async () => {
    const cwd = tmp();
    const redactor = createRedactor({ SECRET: "long-enough-value-abc" });
    const result = await runQualityGate(
      {
        id: "test.both",
        command: [
          "sh",
          "-c",
          "echo 'out: long-enough-value-abc'; echo 'err: long-enough-value-abc' >&2",
        ],
      },
      { cwd, env: { SECRET: "long-enough-value-abc" }, redactor, parentEnv: { PATH: process.env.PATH || "/usr/bin" } }
    );
    assert.match(result.redactedStdout, /<REDACTED:SECRET>/);
    assert.match(result.redactedStderr, /<REDACTED:SECRET>/);
    assert.ok(!result.redactedStdout.includes("long-enough-value-abc"));
    assert.ok(!result.redactedStderr.includes("long-enough-value-abc"));
  });

  test("subprocess does not inherit LD_PRELOAD from parent shell", async () => {
    const cwd = tmp();
    const redactor = createRedactor({});
    const result = await runQualityGate(
      {
        id: "test.env",
        command: ["sh", "-c", "echo LD=${LD_PRELOAD-unset}; echo PATH=${PATH:+set}"],
      },
      {
        cwd,
        env: {},
        redactor,
        parentEnv: {
          PATH: process.env.PATH || "/usr/bin",
          LD_PRELOAD: "/tmp/evil.so",
        },
      }
    );
    assert.match(result.redactedStdout, /LD=unset/);
    assert.match(result.redactedStdout, /PATH=set/);
  });
});
