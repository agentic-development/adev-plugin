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

// Repository-scoped issue reference: enough to encode a canonical gh ID, plus the
// issue's own state, the only status known for a referenced issue off the project.
const ISSUE_REF = "number state repository { name owner { login } }";
const CONNECTION_PAGE = `totalCount pageInfo { hasNextPage endCursor } nodes { ${ISSUE_REF} }`;

// Every field decodeItem reads from one project item. GitHub caps a
// project at 50 fields, so `fieldValues(first: 50)` is complete; the embedded
// blocked-by and sub-issue pages are continued per item by the two documents below.
// `labels` has no continuation, so its totalCount lets the reader refuse a truncated
// page. `repository.issueTypes.totalCount` resolves `type_source: auto` per owner
// without a further request.
const ITEM_SELECTION = `id
          type
          fieldValues(first: 50) {
            nodes {
              __typename
              ... on ProjectV2ItemFieldTextValue { text field { ... on ProjectV2FieldCommon { name } } }
              ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2FieldCommon { name } } }
              ... on ProjectV2ItemFieldNumberValue { number field { ... on ProjectV2FieldCommon { name } } }
            }
          }
          content {
            __typename
            ... on Issue {
              id
              number
              title
              body
              state
              url
              createdAt
              updatedAt
              repository { name owner { login } issueTypes(first: 1) { totalCount } }
              issueType { name }
              labels(first: 100) { totalCount nodes { name } }
              milestone { title }
              parent { ${ISSUE_REF} }
              blockedBy(first: 100) { ${CONNECTION_PAGE} }
              subIssues(first: 100) { ${CONNECTION_PAGE} }
            }
          }`;

export const PROJECT_ITEMS_QUERY = `query ProjectItems($projectId: ID!, $after: String) {
  node(id: $projectId) {
    ... on ProjectV2 {
      items(first: 100, after: $after) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes {
          ${ITEM_SELECTION}
        }
      }
    }
  }
}
`;

// One project item by its node id, in the PROJECT_ITEMS_QUERY node shape: the
// read-back after a write. A whole-board re-read would repeat the pre-write
// board request, which a replay (or a cache) answers without the new item, and
// GitHub's items listing can lag the write by seconds.
export const PROJECT_ITEM_QUERY = `query ProjectItem($itemId: ID!) {
  node(id: $itemId) {
    ... on ProjectV2Item {
      ${ITEM_SELECTION}
    }
  }
}
`;

// One home-repo issue by number with its project items, each in the
// PROJECT_ITEMS_QUERY node shape plus its project's id: how a gh-<n> ID resolves.
// The project items listing is eventually consistent (an item added seconds ago
// can be missing from it, or carry its old field values); this lookup is not.
// An archived item is not on the board, so archived items are excluded. The connection is
// continued through `$after` under the same page bound as every other.
export const ISSUE_PROJECT_ITEMS_QUERY = `query IssueProjectItems($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) {
      projectItems(first: 100, after: $after, includeArchived: false) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes {
          project { id }
          ${ITEM_SELECTION}
        }
      }
    }
  }
}
`;

// `$issueId` is the Issue (content) node id and `$after` the embedded page's endCursor.
export const SUB_ISSUES_PAGE_QUERY = `query SubIssuesPage($issueId: ID!, $after: String) {
  node(id: $issueId) {
    ... on Issue {
      subIssues(first: 100, after: $after) { ${CONNECTION_PAGE} }
    }
  }
}
`;

export const BLOCKED_BY_PAGE_QUERY = `query BlockedByPage($issueId: ID!, $after: String) {
  node(id: $issueId) {
    ... on Issue {
      blockedBy(first: 100, after: $after) { ${CONNECTION_PAGE} }
    }
  }
}
`;

// Repository lookups for the write path. Label, issue type and milestone ids come
// only from these; a name with no node is refused, never created.
export const REPO_LABELS_QUERY = `query RepoLabels($owner: String!, $name: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    labels(first: 100, after: $after) { totalCount pageInfo { hasNextPage endCursor } nodes { id name } }
  }
}
`;

export const REPO_ISSUE_TYPES_QUERY = `query RepoIssueTypes($owner: String!, $name: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    issueTypes(first: 100, after: $after) { totalCount pageInfo { hasNextPage endCursor } nodes { id name } }
  }
}
`;

export const REPO_MILESTONES_QUERY = `query RepoMilestones($owner: String!, $name: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    milestones(first: 100, after: $after) { totalCount pageInfo { hasNextPage endCursor } nodes { id title } }
  }
}
`;

// One home-repo issue by number, whether or not it is on the project: the
// migration verifies the issue its unanchored record names before any write.
export const ISSUE_QUERY = `query Issue($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) {
      id
      number
      state
    }
  }
}
`;
