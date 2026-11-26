/**
 * Lazy, once-per-process network preflight for the GitHub board backend.
 *
 * One PREFLIGHT_QUERY request resolves the project, its fields and the home
 * repository. CLI, auth and scope failures surface from the transport unchanged.
 * The probe never reads a token or the authenticated `gh` login.
 *
 * @module lib/issues/github/preflight
 */

import { GITHUB_ERROR_CODES as CODES, githubError } from "./errors.mjs";
import { PREFLIGHT_QUERY } from "./queries.mjs";

const PROJECT_URL = /^https:\/\/github\.com\/(orgs|users)\/([^/\s]+)\/projects\/([1-9][0-9]*)$/;
const REMEDY = "then run `adev issues github setup`.";

// `legacy_id` is required only for migration, which gates it through `setup --check`.
const TEXT_FIELD_KEYS = ["owner", "claimed_at", "next_action", "spec_ref", "planRef", "branch", "pr"];

const TYPE_LABELS = { SINGLE_SELECT: "single-select", TEXT: "text", NUMBER: "number" };

function variablesFor(config) {
  const [, kind, projectOwner, number] = PROJECT_URL.exec(config.project);
  const [repoOwner, repoName] = config.repo.split("/");
  return { projectOwner, projectNumber: Number(number), isOrg: kind === "orgs", repoOwner, repoName };
}

function projectNotFound(config) {
  return githubError(CODES.GITHUB_PROJECT_NOT_FOUND, `GitHub project ${config.project} was not found or is not visible to the authenticated gh user. Check tasks.github.project, ${REMEDY}`);
}

function repoNotFound(config) {
  return githubError(CODES.GITHUB_REPO_NOT_FOUND, `GitHub repository ${config.repo} was not found or is not visible to the authenticated gh user. Check tasks.github.repo, ${REMEDY}`);
}

// GitHub answers an unresolvable project or repository with a NOT_FOUND error on that
// path, which the transport reports as GITHUB_REQUEST_FAILED. Only when every error is
// such a NOT_FOUND is it relabelled; any other error keeps the transport's code.
function mapNotFound(err, ownerKey, config) {
  if (err?.code !== CODES.GITHUB_REQUEST_FAILED || !Array.isArray(err.graphqlErrors) || err.graphqlErrors.length === 0) return err;
  const roots = new Set();
  for (const e of err.graphqlErrors) {
    if (e?.type !== "NOT_FOUND" || !Array.isArray(e.path) || e.path.length === 0) return err;
    roots.add(e.path[0]);
  }
  if ([...roots].some((root) => root !== ownerKey && root !== "repository")) return err;
  return roots.has(ownerKey) ? projectNotFound(config) : repoNotFound(config);
}

function fieldMissing(name, dataType, actual) {
  const expected = TYPE_LABELS[dataType];
  const problem = actual
    ? `is a ${TYPE_LABELS[actual.dataType] ?? String(actual.dataType).toLowerCase()} field, but adev requires a ${expected} field`
    : `does not exist; adev requires a ${expected} field with that name`;
  return githubError(CODES.GITHUB_FIELD_MISSING, `Project field "${name}" ${problem}. Create or fix the field, ${REMEDY}`, { field: name, expectedType: dataType });
}

function requireField(byName, name, dataType) {
  const field = byName.get(name);
  if (!field || field.dataType !== dataType) throw fieldMissing(name, dataType, field);
  return field;
}

function validate(data, ownerKey, config) {
  const project = data?.[ownerKey]?.projectV2;
  if (!project) throw projectNotFound(config);
  const repository = data.repository;
  if (!repository) throw repoNotFound(config);

  const nodes = Array.isArray(project.fields?.nodes) ? project.fields.nodes : [];
  const byName = new Map(nodes.filter((n) => n && typeof n.name === "string").map((n) => [n.name, n]));

  const statusField = requireField(byName, config.status_field, "SINGLE_SELECT");
  for (const key of TEXT_FIELD_KEYS) requireField(byName, config.fieldNames[key], "TEXT");
  if (config.priority_field !== undefined) requireField(byName, config.priority_field, "NUMBER");

  const options = new Set((statusField.options ?? []).map((o) => o?.name));
  for (const [status, names] of Object.entries(config.status_map)) {
    for (const option of names) {
      if (!options.has(option)) {
        throw githubError(
          CODES.GITHUB_STATUS_OPTION_MISSING,
          `Status field "${config.status_field}" has no option "${option}" (mapped from adev status "${status}"). Add the option or fix tasks.github.status_map, ${REMEDY}`,
          { option, status },
        );
      }
    }
  }

  return Object.freeze({
    projectId: project.id,
    repositoryId: repository.id,
    fields: Object.freeze(Object.fromEntries(byName)),
    visibility: Object.freeze({
      repo: repository.visibility === "PUBLIC" ? "public" : "private",
      project: project.public === true ? "public" : "private",
    }),
  });
}

/**
 * Create a lazy preflight. Constructing it makes no request; the first `ensure()`
 * runs the probe and its result — or its error — is cached for every later call.
 *
 * @param {{ transport: { request: Function }, config: object }} options - config from normalizeGithubConfig
 * @returns {{ ensure: () => object, visibility: () => { repo: "public"|"private", project: "public"|"private" } }}
 */
export function createPreflight({ transport, config }) {
  let outcome;

  function ensure() {
    if (!outcome) {
      const variables = variablesFor(config);
      const ownerKey = variables.isOrg ? "organization" : "user";
      try {
        outcome = { value: validate(transport.request(PREFLIGHT_QUERY, variables), ownerKey, config) };
      } catch (err) {
        outcome = { error: mapNotFound(err, ownerKey, config) };
      }
    }
    if (outcome.error) throw outcome.error;
    return outcome.value;
  }

  return {
    ensure,
    visibility: () => ({ ...ensure().visibility }),
  };
}
