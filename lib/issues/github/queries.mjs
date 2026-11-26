/**
 * GraphQL documents sent by the GitHub board backend.
 *
 * Every document is a named operation and every config- or caller-supplied
 * value travels as a variable, never interpolated into the text.
 *
 * @module lib/issues/github/queries
 */

// A project lives under exactly one of organization/user; `$isOrg` selects which
// field is queried so the response carries only that key. GitHub caps a project
// at 50 fields, so `first: 100` reads every field in one page.
export const PREFLIGHT_QUERY = `query AdevPreflight($projectOwner: String!, $projectNumber: Int!, $isOrg: Boolean!, $repoOwner: String!, $repoName: String!) {
  organization(login: $projectOwner) @include(if: $isOrg) {
    projectV2(number: $projectNumber) { ...AdevPreflightProject }
  }
  user(login: $projectOwner) @skip(if: $isOrg) {
    projectV2(number: $projectNumber) { ...AdevPreflightProject }
  }
  repository(owner: $repoOwner, name: $repoName) {
    id
    nameWithOwner
    visibility
  }
}

fragment AdevPreflightProject on ProjectV2 {
  id
  title
  public
  fields(first: 100) {
    totalCount
    nodes {
      ... on ProjectV2FieldCommon { id name dataType }
      ... on ProjectV2SingleSelectField { options { id name } }
    }
  }
}
`;
