/**
 * Quality-gate subprocess runner.
 *
 * Contract: configurable-checks.md rev 3 Behaviors 6, 6a-c, 13a, 25a, 25b.
 *
 * - execFile with shell: false. argv is a static list enforced at load time.
 * - Env = profile-resolved env + a minimal, enumerated startup set. No
 *   invoking-shell vars leak (no LD_PRELOAD, NODE_OPTIONS, PYTHONPATH, etc).
 * - stdout and stderr flow through the provided redactor before any use.
 * - Combined report output is capped at 64 KiB; tail is truncated.
 */

import { execFile } from "node:child_process";

const REPORT_CAP = 64 * 1024; // 64 KiB
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

const MINIMAL_ENV_KEYS = [
  "PATH",
  "HOME",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TMPDIR",
  "USER",
  "LOGNAME",
];

/**
 * @param {{ id: string, command: string[] }} check
 * @param {{
 *   env: Record<string,string>,
 *   redactor: { redact: (s: string) => string },
 *   cwd: string,
 *   timeoutMs?: number,
 *   parentEnv?: Record<string,string>,
 * }} ctx
 */
export function runQualityGate(check, ctx) {
  const timeoutMs = ctx.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const env = buildEnv(ctx.env, ctx.parentEnv ?? process.env);
  const start = Date.now();
  return new Promise((resolve) => {
    const [executable, ...args] = check.command;
    execFile(
      executable,
      args,
      {
        cwd: ctx.cwd,
        env,
        shell: false,
        timeout: timeoutMs,
        windowsHide: true,
        maxBuffer: 16 * 1024 * 1024, // internal buffer; report is truncated separately
      },
      (err, stdout, stderr) => {
        const durationMs = Date.now() - start;
        const rawStdout = typeof stdout === "string" ? stdout : stdout?.toString?.() ?? "";
        const rawStderr = typeof stderr === "string" ? stderr : stderr?.toString?.() ?? "";
        const redactedStdout = ctx.redactor?.redact(rawStdout) ?? rawStdout;
        const redactedStderr = ctx.redactor?.redact(rawStderr) ?? rawStderr;
        const { out, err: trimmed, wasTruncated } = capCombined(redactedStdout, redactedStderr, REPORT_CAP);
        let exitCode;
        let status;
        if (err) {
          exitCode = typeof err.code === "number" ? err.code : err.killed ? 124 : 1;
          status = "FAIL";
          if (err.killed && err.signal === "SIGTERM") status = "TIMEOUT";
        } else {
          exitCode = 0;
          status = "PASS";
        }
        resolve({
          id: check.id,
          status,
          exitCode,
          redactedStdout: out,
          redactedStderr: trimmed,
          wasTruncated,
          durationMs,
        });
      }
    );
  });
}

export function buildEnv(profileEnv, parentEnv) {
  const out = {};
  for (const key of MINIMAL_ENV_KEYS) {
    if (Object.prototype.hasOwnProperty.call(parentEnv, key) && typeof parentEnv[key] === "string") {
      out[key] = parentEnv[key];
    }
  }
  // Profile-resolved env overrides / adds to startup set.
  for (const [k, v] of Object.entries(profileEnv || {})) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function capCombined(stdout, stderr, cap) {
  const combined = stdout.length + stderr.length;
  if (combined <= cap) return { out: stdout, err: stderr, wasTruncated: false };
  // Split cap proportionally, but ensure neither is zero when content exists.
  const share = Math.max(1, Math.floor(cap / 2));
  const outCap = Math.min(stdout.length, share);
  const errCap = Math.min(stderr.length, cap - outCap);
  const marker = (n) => `\n…[truncated ${n} bytes — full redacted output in dispatch record]`;
  const out = stdout.length > outCap ? stdout.slice(0, outCap) + marker(stdout.length - outCap) : stdout;
  const err = stderr.length > errCap ? stderr.slice(0, errCap) + marker(stderr.length - errCap) : stderr;
  return { out, err, wasTruncated: true };
}
