/**
 * Transition compliance — did the gates a lifecycle transition requires
 * actually pass, on this spec, against this version of it?
 *
 * Spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md
 *
 * `governance/gates.yaml` declares `transitions.<name>.required_gates`. Before
 * this module the only thing that read them was a markdown check body asking an
 * agent to "verify each required_gates was run and passed in Check 1" — a
 * comparison with no comparator behind it. This is the comparator: it reads the
 * `gate_outcomes` Check 1 records on the spec's lifecycle log and decides,
 * deterministically, whether each required id has a FRESH, ATTESTED, PASSING
 * record.
 *
 * **It never executes a gate.** Execution belongs to validate's Check 1; this
 * module has no `child_process` import and no execution capability to lose. It
 * also does not evaluate workflow preconditions — ADR-0010's decision flow
 * routes those to `requireGate` (`adev gate require`).
 *
 * ## SKIP is not PASS
 *
 * A project with no transitions configured gets `SKIP`, never `PASS`. A PASS
 * would assert that a verification happened; nothing was verified. Every
 * per-gate degradation below is likewise a `skip`, and a `skip` never satisfies
 * a required gate.
 *
 * ## The attestation is PARTIAL, and deliberately so
 *
 * `command_sha` is a plain SHA-256 of the gate's resolved argv (see
 * {@link computeCommandSha}). It catches DRIFT — a recorded outcome whose gate
 * no longer runs the command it ran when the outcome was recorded — and it
 * catches CROSS-GATE COPYING — an outcome for `lint` relabelled as `test`. It
 * does NOT catch deliberate forgery: any caller who can read `gates.yaml` can
 * compute the same digest and write a matching outcome. Nothing here should be
 * read as proof that a gate ran. Closing that gap needs an unforgeable
 * attestation (a per-run nonce or a keyed MAC) and is tracked as follow-up work.
 *
 * Zero external dependencies (Constitution Principle 1).
 *
 * @module lib/governance/transitions
 */

import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";

import { DEFAULT_GATES_PATH, computeCommandSha, loadCheck1Gates } from "../gates/gate-sets.mjs";
import { readEvents } from "../lifecycle-state.mjs";
import { parseYaml } from "../profiles/yaml.mjs";
import { extractManifestFromFrontmatter } from "../source-manifest.mjs";

/**
 * Per-gate reasons. Each is a stable string a caller may match on.
 *
 * - `recorded-pass` / `recorded-fail` / `recorded-skip` — the record survived
 *   every admissibility rule and its own verdict stands.
 * - `no-recorded-outcome` — the gate exists in the resolved set, but the latest
 *   report carrying outcomes says nothing about it.
 * - `unknown-gate` — the TRANSITION names an id the resolved gate set does not
 *   declare, and no outcome mentions it either. A config error; `/adev:hygiene`
 *   Pass 8 reports it as `MISSING_GATE_REF`. Non-passing: a gate that does not
 *   exist cannot have passed.
 * - `stale-gate-record` — freshness could not be established (DDR-2).
 * - `unattested-gate-record` — attestation failed (DDR-3).
 */
export const GATE_REASONS = Object.freeze({
  RECORDED: "recorded-",
  NO_OUTCOME: "no-recorded-outcome",
  UNKNOWN_GATE: "unknown-gate",
  STALE: "stale-gate-record",
  UNATTESTED: "unattested-gate-record",
});

/**
 * Read the `transitions` map from the project's governance gates file.
 *
 * `loadDoctorGates` / `loadCheck1Gates` deliberately expose only the `gates:`
 * list, so the `transitions:` section is read here. This is a different section
 * of the same file, not a second view of the gate set — the gate set itself
 * still comes from `loadCheck1Gates` and is never re-derived.
 *
 * @param {string} absRoot Absolute project root.
 * @param {string} gatesPath Project-relative (or absolute) gates.yaml path.
 * @returns {object} The transitions map, or `{}` when absent/empty/not a map.
 * @throws {Error} `code: "GATES_PATH_ESCAPE"` / `code: "GATES_PARSE_ERROR"`.
 */
function readTransitions(absRoot, gatesPath) {
  const abs = isAbsolute(gatesPath) ? gatesPath : resolve(absRoot, gatesPath);
  if (abs !== absRoot && !abs.startsWith(absRoot + sep)) {
    const err = new Error(`gates path escapes the project root: ${gatesPath}`);
    err.code = "GATES_PATH_ESCAPE";
    throw err;
  }
  if (!existsSync(abs)) return {};

  let raw;
  try {
    raw = readFileSync(abs, "utf8");
  } catch {
    return {};
  }
  if (raw.trim() === "") return {};

  let doc;
  try {
    doc = parseYaml(raw);
  } catch (parseErr) {
    const err = new Error(parseErr?.message ?? String(parseErr));
    err.code = "GATES_PARSE_ERROR";
    throw err;
  }

  const transitions = doc?.transitions;
  if (!transitions || typeof transitions !== "object" || Array.isArray(transitions)) return {};
  return transitions;
}

/**
 * The latest `validator_report` event that CARRIES `gate_outcomes`.
 *
 * "Latest" is the LAST such event in APPEND ORDER, not the one with the newest
 * `ts`. The log is append-only, so append order is its own authority; `ts` is
 * caller-supplied and can be non-monotonic (clock skew, backfilled records),
 * and trusting it would let a future-dated write resurrect a superseded pass.
 * `ts` is still used for freshness — but only to disqualify a record, never to
 * promote one over a later write.
 *
 * A `validator_report` with no `gate_outcomes` key is a pre-upgrade or
 * non-gate report and is skipped rather than treated as "no outcomes".
 *
 * @param {object[]} events
 * @returns {object|null}
 */
function latestOutcomeEvent(events) {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e?.event === "validator_report" && Array.isArray(e.gate_outcomes)) return e;
  }
  return null;
}

/**
 * Is the EVENT fresh relative to the spec's current source-manifest stamp?
 *
 * Freshness is a property of the event, not of an individual outcome: every
 * outcome in a stale report is stale.
 *
 * Rules (DDR-2 / review blocker CON-1):
 *   1. The spec must carry a source-manifest stamp with a parseable
 *      `computed-at`. **With no stamp there is nothing to compare against, so
 *      freshness cannot be ESTABLISHED and the record does not count.** This is
 *      the conservative reading: the alternative — counting an unanchored
 *      record — would let any spec opt out of freshness by dropping its stamp.
 *   2. The event's own `ts` must be at or after `computed-at`.
 *   3. When the payload carries `manifest_sha`, it must equal the stamp's
 *      `sha`. A MISSING `manifest_sha` falls back to rule 2 alone — fail-soft
 *      on history (pre-upgrade records), never on verdicts.
 *
 * @param {object} event
 * @param {{sha: string, computedAt: string}|null} stamp
 * @returns {boolean}
 */
function isFresh(event, stamp) {
  if (!stamp) return false;
  const computedAt = Date.parse(stamp.computedAt ?? "");
  if (!Number.isFinite(computedAt)) return false;
  const ts = Date.parse(event?.ts ?? "");
  if (!Number.isFinite(ts)) return false;
  if (ts < computedAt) return false;
  if (typeof event.manifest_sha === "string" && event.manifest_sha.length > 0) {
    if (event.manifest_sha !== stamp.sha) return false;
  }
  return true;
}

/**
 * Evaluate one recorded outcome against the admissibility rules, in this order:
 *
 *   1. **Membership** (DDR-3 rule 1) — the outcome's id must be declared by the
 *      resolved gate set. An id nobody declares is `unattested-gate-record`.
 *   2. **Freshness** (DDR-2) — see {@link isFresh}. Otherwise
 *      `stale-gate-record`.
 *   3. **Command hash** (DDR-3 rule 2) — a `command_sha` that is PRESENT must
 *      equal `computeCommandSha(gate.command)`. Otherwise
 *      `unattested-gate-record`. An ABSENT `command_sha` is a pre-upgrade
 *      record: the check is skipped, `command_attested` is `false`, and the
 *      record may still count (DDR-3 rule 3). Refusing it outright would fail
 *      every spec whose Check 1 ran before this landed.
 *
 * Membership precedes freshness so that an outcome for a gate nobody declares
 * reports the more fundamental problem even when it is also stale.
 *
 * @param {object} outcome
 * @param {object|undefined} gate The resolved gate with the same id, if any.
 * @param {boolean} fresh Whether the carrying event is fresh.
 * @returns {{verdict: string, reason: string, command_attested: boolean}}
 */
function evaluateOutcome(outcome, gate, fresh) {
  if (!gate) {
    return { verdict: "skip", reason: GATE_REASONS.UNATTESTED, command_attested: false };
  }
  if (!fresh) {
    return { verdict: "skip", reason: GATE_REASONS.STALE, command_attested: false };
  }
  const recorded = outcome.command_sha;
  if (typeof recorded === "string" && recorded.length > 0) {
    // `loadCheck1Gates` already stamped `command_sha`; recompute only if a
    // caller handed us a gate that did not come through it. Either way the
    // digest is `computeCommandSha`'s, never a second hashing implementation.
    const expected = gate.command_sha ?? computeCommandSha(gate.command);
    if (recorded !== expected) {
      return { verdict: "skip", reason: GATE_REASONS.UNATTESTED, command_attested: false };
    }
    return {
      verdict: outcome.verdict,
      reason: `${GATE_REASONS.RECORDED}${outcome.verdict}`,
      command_attested: true,
    };
  }
  return {
    verdict: outcome.verdict,
    reason: `${GATE_REASONS.RECORDED}${outcome.verdict}`,
    command_attested: false,
  };
}

/**
 * Collapse the records for ONE gate id into a single result.
 *
 * **Duplicate-id precedence: the most pessimistic verdict wins.** Task 4's
 * Stage-1 reviewer observed that `validateGateOutcomes` accepts duplicate ids
 * with conflicting verdicts. Any non-`pass` record for an id makes that id
 * non-passing, whatever its position in the array, and the FIRST non-passing
 * record (in array order) is the one reported so the reason names the earliest
 * cause. The alternative — last-wins — would let an appended `pass` overwrite a
 * `fail` recorded microseconds earlier in the same run.
 *
 * @param {Array<{verdict: string, reason: string, command_attested: boolean}>} results
 * @returns {{verdict: string, reason: string, command_attested: boolean}}
 */
function collapse(results) {
  const firstNonPass = results.find((r) => r.verdict !== "pass");
  return firstNonPass ?? results[0];
}

/**
 * Evaluate transition compliance for one spec.
 *
 * @param {string} projectRoot Project root (absolute or relative).
 * @param {string} specPath Spec path, project-relative or absolute.
 * @param {object} options
 * @param {string} options.transition Transition name, e.g. `implement-to-validate`.
 * @param {string} [options.gatesPath] Project-relative governance gates path.
 * @param {string|null} [options.moduleSlug] Module slug for domain resolution.
 * @returns {{verdict: "PASS"|"FAIL"|"SKIP", reason: string,
 *            gates: Record<string, {id: string, verdict: string, reason: string,
 *                                   command_attested: boolean}>}}
 *   `verdict` is the transition's; each `gates[id].verdict` is the individual
 *   gate's own (`pass` | `fail` | `skip`, the `gate_outcomes` vocabulary).
 * @throws {Error} Coded errors from `loadCheck1Gates` (`MANIFEST_PARSE_ERROR`,
 *   `BUNDLED_OVERRIDE_BLOCKED`, …) and `GATES_PARSE_ERROR` /
 *   `GATES_PATH_ESCAPE` from the transitions read. The CLI layer owns printing
 *   and exit codes; nothing here calls `process.exit` or writes to stdout.
 */
export function evaluateTransitions(projectRoot, specPath, options = {}) {
  const absRoot = resolve(projectRoot);
  const gatesPath = options.gatesPath ?? DEFAULT_GATES_PATH;
  const name = options.transition;

  // Transitions are read BEFORE the gate set: a project that configures none
  // must SKIP even when its domain overlay is unresolvable, because there is
  // nothing the unresolvable overlay could have been needed for.
  const transitions = readTransitions(absRoot, gatesPath);
  if (Object.keys(transitions).length === 0) {
    return { verdict: "SKIP", reason: "no transitions configured", gates: {} };
  }

  const config = transitions[name];
  if (!config || typeof config !== "object") {
    return {
      verdict: "SKIP",
      reason: `no transition configured named "${name}"`,
      gates: {},
    };
  }

  const required = Array.isArray(config.required_gates)
    ? config.required_gates.filter((id) => typeof id === "string" && id.length > 0)
    : [];
  if (required.length === 0) {
    return {
      verdict: "SKIP",
      reason: `transition "${name}" requires no gates`,
      gates: {},
    };
  }

  const { gates: resolvedGates } = loadCheck1Gates(absRoot, {
    gatesPath,
    moduleSlug: options.moduleSlug ?? null,
  });
  const byId = new Map(resolvedGates.map((g) => [g.id, g]));

  const absSpec = isAbsolute(specPath) ? specPath : resolve(absRoot, specPath);
  const stamp = extractManifestFromFrontmatter(absSpec);
  const event = latestOutcomeEvent(readEvents(absRoot, specPath));
  const fresh = event ? isFresh(event, stamp) : false;
  const outcomes = event?.gate_outcomes ?? [];

  const gates = {};
  const failing = [];
  for (const id of required) {
    const matching = outcomes.filter((o) => o && o.id === id);
    let result;
    if (matching.length === 0) {
      // No record at all. Distinguish "the registry never declared this gate"
      // (a config error) from "the gate exists but nothing ran it".
      result = byId.has(id)
        ? { verdict: "skip", reason: GATE_REASONS.NO_OUTCOME, command_attested: false }
        : { verdict: "skip", reason: GATE_REASONS.UNKNOWN_GATE, command_attested: false };
    } else {
      result = collapse(matching.map((o) => evaluateOutcome(o, byId.get(id), fresh)));
    }
    gates[id] = { id, ...result };
    if (result.verdict !== "pass") failing.push(`${id} (${result.reason})`);
  }

  if (failing.length > 0) {
    return {
      verdict: "FAIL",
      reason:
        `transition "${name}": no fresh, attested, passing outcome for ` + failing.join(", "),
      gates,
    };
  }
  return {
    verdict: "PASS",
    reason: `transition "${name}": every required gate has a fresh, attested, passing outcome`,
    gates,
  };
}
