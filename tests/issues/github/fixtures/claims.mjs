/**
 * Generated unit fixtures for the GitHub board claim lease (claim, release).
 * Not recorded: every entry is served through `replayExec`, so a claim that
 * sends any other document or variable set, or reads the item more times than
 * a fixture records, hits UNRECORDED_GITHUB_REQUEST.
 *
 * Clock: built for NOW = 2026-11-26T10:00:00.000Z and `claim_ttl_minutes: 240`.
 * Owner strings (agent-a, agent-b) are Project field values, never GitHub logins.
 *
 * Request contract these entries pin, for gh-5 (item PVTI_fixture_5) on project
 * acme/projects/7 with home repo acme/board, on top of the AdevPreflight,
 * PROJECT_ITEMS_QUERY board read and ISSUE_PROJECT_ITEMS_QUERY lookup of
 * board.mjs (the lookup resolves the ID to its item; a board recorded as a
 * `sequence` changes between the read before the write and the read after it,
 * and so does gh-5's lookup, so a read after the claim must not be served from
 * a cache):
 *
 *   claim(id, owner, opts):
 *   1. PROJECT_ITEM_QUERY `{ itemId }`: the fresh precondition read, never the
 *      cached board. requireClaimable() runs on this item.
 *   2. setFieldsDocument(["text", "text"]) `{ projectId, itemId, f0Field: Claimed
 *      At, f0Value: claimed_at, f1Field: Owner, f1Value: owner }`: claimed_at
 *      first, then owner, one request. claimed_at is NOW, or the held one on a
 *      re-claim inside a live lease. When GitHub rejects only one alias, one
 *      PROJECT_ITEM_QUERY re-read follows, then the claim throws:
 *      - claimed_at rejected, owner landed: when the re-read shows the claimant as
 *        owner, one setFieldsDocument(["clear"]) `{ f0Field: Owner }` request.
 *      - owner rejected, claimed_at landed, on a takeover of an expired lease
 *        (another write would hand the previous holder a fresh lease): when the
 *        re-read shows the previous holder with this claim's claimed_at, one
 *        setFieldsDocument(["clear", "clear"]) `{ f0Field: Owner, f1Field:
 *        Claimed At }` request. Off a takeover, there is no re-read and no clear.
 *      - on a re-claim inside the claimant's own live lease, neither direction is
 *        compensated: no re-read and no clear, since the holder's lease stays valid.
 *      Any other re-read is another writer's state: nothing further is written.
 *   3. PROJECT_ITEM_QUERY: the first re-read. Another owner: throw, nothing further.
 *   4. sleep(claim_settle_ms), then PROJECT_ITEM_QUERY: the settle re-read.
 *      Another owner: throw, nothing further.
 *   5. Only with opts.branch / opts.pr: setFieldsDocument of their text slots
 *      (branch, then pr), then a PROJECT_ITEM_QUERY read-back, which claim returns.
 *   No step writes the status field.
 *
 *   release(id, owner, opts):
 *   1. PROJECT_ITEM_QUERY: the fresh precondition read; requireReleasable() runs on it.
 *      Nothing held: no mutation and no further read.
 *   2. setFieldsDocument(["clear", "clear"]) `{ projectId, itemId, f0Field: Owner,
 *      f1Field: Claimed At }`: owner cleared first, then claimed_at, one request.
 *   3. PROJECT_ITEM_QUERY read-back, which release returns. branch and pr stay.
 */

import { buildBoard } from "./board.mjs";
import { setFieldsRequest, itemNode, slot, task, CLOSED, rejected } from "./writes.mjs";
import { PROJECT_ITEMS_QUERY, PROJECT_ITEM_QUERY, ISSUE_PROJECT_ITEMS_QUERY } from "../../../../lib/issues/github/queries.mjs";

export const NOW_ISO = "2026-11-26T10:00:00.000Z";
export const LIVE_AT = "2026-11-26T09:30:00.000Z";
// 241 minutes before NOW: past the 240-minute lease.
export const STALE_AT = "2026-11-26T05:59:00.000Z";
// Exactly 240 minutes before NOW: a lease is stale once its age reaches the TTL.
export const TTL_EDGE_AT = "2026-11-26T06:00:00.000Z";
// One millisecond short of the TTL: still live.
export const TTL_INSIDE_AT = "2026-11-26T06:00:00.001Z";
// The competing claimant's stamp, inside the race window.
export const WINNER_AT = "2026-11-26T10:00:00.400Z";
export const OWNER_REJECTION = "adev-fixture: Owner could not be written";

const N = 5;
const ITEM_ID = `PVTI_fixture_${N}`;

const free = (extra = {}) => task(N, extra);
const held = (owner, claimedAt, fields = {}) => task(N, { fields: { owner, ...(claimedAt === undefined ? {} : { claimed_at: claimedAt }), ...fields } });

const ok = (count) => ({ data: Object.fromEntries(Array.from({ length: count }, (_, i) => [`f${i}`, { clientMutationId: null }])) });

/**
 * The board read and gh-5's direct lookup, once per state: one state is a plain
 * entry, several a sequence of each (the n-th listing and the n-th lookup of gh-5
 * both see the n-th state).
 */
function boards(states, others = []) {
  const built = states.map((spec, i) => buildBoard([spec, ...others], i === 0 ? {} : { preflight: [] }));
  if (built.length === 1) return built[0];
  const itemsOf = (entries) => entries.find((e) => e.query === PROJECT_ITEMS_QUERY);
  const lookupOf = (entries) => entries.find((e) => e.query === ISSUE_PROJECT_ITEMS_QUERY && e.variables.number === N);
  const head = itemsOf(built[0]);
  const lookup = lookupOf(built[0]);
  return [
    ...built[0].filter((e) => e !== head && e !== lookup),
    { query: head.query, variables: head.variables, sequence: built.map((entries) => ({ response: itemsOf(entries).response })) },
    { query: lookup.query, variables: lookup.variables, sequence: built.map((entries) => ({ response: lookupOf(entries).response })) },
  ];
}

/** The PROJECT_ITEM_QUERY reads of gh-5, in request order. */
function itemReads(...specs) {
  return { query: PROJECT_ITEM_QUERY, variables: { itemId: ITEM_ID }, sequence: specs.map((spec) => ({ response: { data: { node: itemNode(spec) } } })) };
}

const claimWrite = (claimedAt, owner, response = ok(2)) => ({
  ...setFieldsRequest(ITEM_ID, [slot.text("claimed_at", claimedAt), slot.text("owner", owner)]),
  response,
});
const releaseWrite = () => ({ ...setFieldsRequest(ITEM_ID, [slot.clear("owner"), slot.clear("claimed_at")]), response: ok(2) });

// The owner alias is rejected after the claimed_at alias landed.
const ownerRejected = {
  data: { f0: { clientMutationId: null }, f1: null },
  errors: rejected("f1", OWNER_REJECTION).errors,
};

// The claimed_at alias is rejected while the owner alias landed: owner without claimed_at.
export const CLAIMED_AT_REJECTION = "adev-fixture: Claimed At could not be written";
export const COMPENSATION_REJECTION = "adev-fixture: Owner could not be cleared";
const claimedAtRejected = {
  data: { f0: null, f1: { clientMutationId: null } },
  errors: rejected("f0", CLAIMED_AT_REJECTION).errors,
};
// Both aliases rejected: nothing landed.
const bothRejected = {
  data: { f0: null, f1: null },
  errors: [...rejected("f0", CLAIMED_AT_REJECTION).errors, ...rejected("f1", OWNER_REJECTION).errors],
};
// A request-level error with no path: no alias is known to have run.
const requestRejected = { data: null, errors: [{ type: "UNPROCESSABLE", message: CLAIMED_AT_REJECTION }] };
const ownerClear = (response = ok(1)) => ({ ...setFieldsRequest(ITEM_ID, [slot.clear("owner")]), response });
export const LEASE_CLEAR_REJECTION = "adev-fixture: Owner and Claimed At could not be cleared";
const leaseClear = (response = ok(2)) => ({ ...setFieldsRequest(ITEM_ID, [slot.clear("owner"), slot.clear("claimed_at")]), response });

const WORK = Object.freeze({ branch: "feat/a", pr: "#12" });

export const claims = Object.freeze({
  // gh-5 is held by agent-a, 30 minutes into its lease.
  liveLease: [...boards([held("agent-a", LIVE_AT)]), itemReads(held("agent-a", LIVE_AT))],

  // agent-a's owner write lands between agent-b's write and agent-b's first re-read.
  lostBeforeReread: [
    ...boards([free()]),
    itemReads(free(), held("agent-a", WINNER_AT)),
    claimWrite(NOW_ISO, "agent-b"),
  ],

  // agent-b's write is reported applied, yet the first re-read shows gh-5 unowned.
  lostToNoOwner: [
    ...boards([free()]),
    itemReads(free(), free()),
    claimWrite(NOW_ISO, "agent-b"),
  ],

  // agent-b's first re-read confirms it; agent-a's write lands within the settle interval.
  lostDuringSettle: [
    ...boards([free()]),
    itemReads(free(), held("agent-b", NOW_ISO), held("agent-a", WINNER_AT)),
    claimWrite(NOW_ISO, "agent-b"),
  ],

  // claimed_at lands, the owner alias is rejected: the board then shows claimed_at alone.
  ownerWriteFails: [
    ...boards([free(), free({ fields: { claimed_at: NOW_ISO } })]),
    itemReads(free()),
    claimWrite(NOW_ISO, "agent-b", ownerRejected),
  ],

  // owner lands, claimed_at is rejected: the re-read shows agent-b alone, one compensating
  // request clears owner, and the board reads unclaimed.
  claimedAtWriteFails: [
    ...boards([free(), free()]),
    itemReads(free(), held("agent-b", undefined)),
    claimWrite(NOW_ISO, "agent-b", claimedAtRejected),
    ownerClear(),
  ],

  // As claimedAtWriteFails, and the compensating clear is rejected too: owner stays without claimed_at.
  compensationFails: [
    ...boards([free()]),
    itemReads(free(), held("agent-b", undefined)),
    claimWrite(NOW_ISO, "agent-b", claimedAtRejected),
    ownerClear(rejected("f0", COMPENSATION_REJECTION)),
  ],

  // As claimedAtWriteFails, but agent-a's claim lands before the re-read: agent-b clears nothing.
  claimedAtWriteFailsOvertaken: [
    ...boards([free()]),
    itemReads(free(), held("agent-a", WINNER_AT)),
    claimWrite(NOW_ISO, "agent-b", claimedAtRejected),
  ],

  // agent-b takes over agent-a's expired lease; claimed_at lands, owner is rejected, so agent-a
  // would hold a fresh lease. The re-read confirms it; one request clears owner then claimed_at.
  takeoverOwnerWriteFails: [
    ...boards([held("agent-a", STALE_AT), free()]),
    itemReads(held("agent-a", STALE_AT), held("agent-a", NOW_ISO)),
    claimWrite(NOW_ISO, "agent-b", ownerRejected),
    leaseClear(),
  ],

  // As takeoverOwnerWriteFails, and the compensating clear is rejected too: agent-a's lease is extended.
  takeoverClearFails: [
    ...boards([held("agent-a", STALE_AT)]),
    itemReads(held("agent-a", STALE_AT), held("agent-a", NOW_ISO)),
    claimWrite(NOW_ISO, "agent-b", ownerRejected),
    leaseClear(rejected("f0", LEASE_CLEAR_REJECTION)),
  ],

  // As takeoverOwnerWriteFails, but the re-read shows a claimed_at this claim did not write.
  takeoverStampOverwritten: [
    ...boards([held("agent-a", STALE_AT)]),
    itemReads(held("agent-a", STALE_AT), held("agent-a", WINNER_AT)),
    claimWrite(NOW_ISO, "agent-b", ownerRejected),
  ],

  // As takeoverOwnerWriteFails, but the re-read shows another claimant's owner.
  takeoverOvertaken: [
    ...boards([held("agent-a", STALE_AT)]),
    itemReads(held("agent-a", STALE_AT), held("agent-c", WINNER_AT)),
    claimWrite(NOW_ISO, "agent-b", ownerRejected),
  ],

  // agent-a re-claims inside its own live lease; owner lands, claimed_at is rejected. agent-a
  // still holds a valid lease with its held claimed_at, so there is no re-read and no clear.
  reclaimLiveClaimedAtWriteFails: [
    ...boards([held("agent-a", LIVE_AT)]),
    itemReads(held("agent-a", LIVE_AT)),
    claimWrite(LIVE_AT, "agent-a", claimedAtRejected),
  ],

  // As reclaimLiveClaimedAtWriteFails, but claimed_at lands and owner is rejected.
  reclaimLiveOwnerWriteFails: [
    ...boards([held("agent-a", LIVE_AT)]),
    itemReads(held("agent-a", LIVE_AT)),
    claimWrite(LIVE_AT, "agent-a", ownerRejected),
  ],

  // Both aliases rejected: nothing to compensate.
  claimWriteRejected: [...boards([free()]), itemReads(free()), claimWrite(NOW_ISO, "agent-b", bothRejected)],

  // A request-level rejection: no alias is known to have landed, so nothing is compensated.
  claimRequestRejected: [...boards([free()]), itemReads(free()), claimWrite(NOW_ISO, "agent-b", requestRejected)],

  // agent-a's lease expired 1 minute ago; agent-b takes it over.
  staleLease: [
    ...boards([held("agent-a", STALE_AT)]),
    itemReads(held("agent-a", STALE_AT), held("agent-b", NOW_ISO), held("agent-b", NOW_ISO)),
    claimWrite(NOW_ISO, "agent-b"),
  ],

  // The legacy IDs of board.mjs's `migrated` board: issue-7k3f9a is gh-41, epic-2 names gh-42 and gh-43.
  migratedBoard: buildBoard([
    task(41, { fields: { legacy_id: "issue-7k3f9a" } }),
    task(42, { fields: { legacy_id: "epic-2" } }),
    task(43, { fields: { legacy_id: "epic-2" } }),
  ]),

  // agent-a holds gh-5 with a branch and PR; releasing it keeps both.
  release: [
    ...boards([held("agent-a", LIVE_AT, WORK), free({ fields: WORK })]),
    itemReads(held("agent-a", LIVE_AT, WORK), free({ fields: WORK })),
    releaseWrite(),
  ],

  // An unowned gh-5 claimed by agent-b; the board read after the claim shows the claim.
  freeClaim: [
    ...boards([free(), held("agent-b", NOW_ISO)]),
    itemReads(free(), held("agent-b", NOW_ISO), held("agent-b", NOW_ISO)),
    claimWrite(NOW_ISO, "agent-b"),
  ],

  // As freeClaim, with branch and PR written only after the settle re-read confirms.
  claimWithWork: [
    ...boards([free()]),
    itemReads(free(), held("agent-b", NOW_ISO), held("agent-b", NOW_ISO), held("agent-b", NOW_ISO, { branch: "feat/x", pr: "#12" })),
    claimWrite(NOW_ISO, "agent-b"),
    { ...setFieldsRequest(ITEM_ID, [slot.text("branch", "feat/x"), slot.text("pr", "#12")]), response: ok(2) },
  ],

  // agent-a re-claims its own live lease: the held claimed_at is written back, not NOW.
  reclaimLive: [
    ...boards([held("agent-a", LIVE_AT)]),
    itemReads(held("agent-a", LIVE_AT), held("agent-a", LIVE_AT), held("agent-a", LIVE_AT)),
    claimWrite(LIVE_AT, "agent-a"),
  ],

  // agent-a re-claims its own expired lease: a fresh claim with a new clock.
  reclaimStale: [
    ...boards([held("agent-a", STALE_AT)]),
    itemReads(held("agent-a", STALE_AT), held("agent-a", NOW_ISO), held("agent-a", NOW_ISO)),
    claimWrite(NOW_ISO, "agent-a"),
  ],

  // agent-a's lease is exactly 240 minutes old.
  ttlEdge: [
    ...boards([held("agent-a", TTL_EDGE_AT)]),
    itemReads(held("agent-a", TTL_EDGE_AT), held("agent-b", NOW_ISO), held("agent-b", NOW_ISO)),
    claimWrite(NOW_ISO, "agent-b"),
  ],

  // agent-a's lease is one millisecond short of 240 minutes.
  ttlInside: [...boards([held("agent-a", TTL_INSIDE_AT)]), itemReads(held("agent-a", TTL_INSIDE_AT))],

  // agent-a's lease is 30 minutes old, claimed under a 30-minute claim_ttl_minutes.
  shortTtlTakeover: [
    ...boards([held("agent-a", LIVE_AT)]),
    itemReads(held("agent-a", LIVE_AT), held("agent-b", NOW_ISO), held("agent-b", NOW_ISO)),
    claimWrite(NOW_ISO, "agent-b"),
  ],

  // agent-a holds gh-5 with no claimed_at: the lease cannot be proven stale.
  unexpirable: [...boards([held("agent-a", undefined)]), itemReads(held("agent-a", undefined))],

  closedItem: [...boards([free(CLOSED)]), itemReads(free(CLOSED))],

  // The cached board shows gh-5 unowned; the fresh read shows agent-a's live lease.
  cachedBoardStale: [...boards([free()]), itemReads(held("agent-a", LIVE_AT))],

  // Nothing held on gh-5.
  releaseFree: [...boards([free()]), itemReads(free())],

  // agent-a's lease expired; agent-a may still release it.
  releaseStale: [
    ...boards([held("agent-a", STALE_AT)]),
    itemReads(held("agent-a", STALE_AT), free()),
    releaseWrite(),
  ],
});
