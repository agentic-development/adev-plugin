import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = resolve(join(__dirname, "..", "..", "..", "fixtures"));

const fixtureProfiles = [
  {
    fixture_id: "sample-project-small",
    fixture_name: "Sample Project (Small)",
    fixture_root: join(fixturesRoot, "sample-project"),
    complexity: "small",
    feature_slug: "fixture-task-search",
    feature_task:
      "Add task search support for the sample task service, including a focused API surface and tests that prove filtering behavior.",
  },
  {
    fixture_id: "sample-project-medium",
    fixture_name: "Sample Project (Medium)",
    fixture_root: join(fixturesRoot, "sample-project-medium"),
    complexity: "medium",
    feature_slug: "fixture-task-reminders",
    feature_task:
      "Add task reminder scheduling with notification integration, including specs, implementation, and tests for reminder generation.",
  },
  {
    fixture_id: "sample-project-large",
    fixture_name: "Sample Project (Large)",
    fixture_root: join(fixturesRoot, "sample-project-large"),
    complexity: "large",
    feature_slug: "fixture-reporting-summary",
    feature_task:
      "Add a reporting summary capability that aggregates task and user data through the larger layered architecture, with tests and validation evidence.",
  },
];

const fixtureProfileMap = new Map(fixtureProfiles.map((profile) => [profile.fixture_id, profile]));

export function listCodexFixtureProfiles() {
  return fixtureProfiles.map((profile) => ({ ...profile }));
}

export function getDefaultCodexFixtureProfileId() {
  return "sample-project-small";
}

export function resolveCodexFixtureProfile(fixtureProfileId = getDefaultCodexFixtureProfileId()) {
  const fixtureProfile = fixtureProfileMap.get(fixtureProfileId);
  if (!fixtureProfile) {
    const error = new Error(`unknown_fixture_profile: ${fixtureProfileId}`);
    error.code = "unknown_fixture_profile";
    throw error;
  }
  if (!existsSync(fixtureProfile.fixture_root)) {
    const error = new Error(`invalid_fixture_root: ${fixtureProfile.fixture_root}`);
    error.code = "invalid_fixture_root";
    throw error;
  }
  return { ...fixtureProfile };
}

export default {
  listCodexFixtureProfiles,
  getDefaultCodexFixtureProfileId,
  resolveCodexFixtureProfile,
};
