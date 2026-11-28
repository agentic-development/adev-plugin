import { test } from "node:test";
import assert from "node:assert/strict";
import { parseId, encodeGithubId, decodeGithubId, normalizeGithubIdInput } from "../../../lib/issues/id-utils.mjs";

const home = { owner: "acme", repo: "board" };

const GH_PARSE = { tier: null, depth: 1, parent_id: null, prefix: "gh", counter: null, legacy: false, github: true };

test("home-repo issues are gh-<n>; other repos encode owner.repo.n losslessly", () => {
  assert.equal(encodeGithubId({ owner: "Acme", repo: "Board", number: 12 }, home), "gh-12");
  assert.equal(encodeGithubId({ owner: "Org2", repo: "my_repo.v2", number: 3 }, home), "gh-org2.my_repo.v2.3");
  assert.deepEqual(decodeGithubId("gh-org2.my_repo.v2.3", home), { owner: "org2", repo: "my_repo.v2", number: 3 });
  assert.notEqual(encodeGithubId({ owner: "org1", repo: "api", number: 3 }, home),
                  encodeGithubId({ owner: "org2", repo: "api", number: 3 }, home));
});

test("gh- IDs are classified before the legacy grammar", () => {
  assert.equal(parseId(encodeGithubId({ owner: "x", repo: "issue", number: 12 }, home)).github, true);
  assert.equal(parseId("issue-12").legacy, true);
});

test("display forms and strict URLs normalize; everything else is refused", () => {
  for (const input of ["#12", "12", "acme/board#12", "https://github.com/acme/board/issues/12"]) {
    assert.equal(normalizeGithubIdInput(input, home), "gh-12");
  }
  for (const bad of ["https://github.com@evil.example/acme/board/issues/1", "https://github.com:8443/acme/board/issues/1",
                     "https://github.com/acme/board/issues/1?x=1", "https://github.com/acme/board/issues/1#c", "http://github.com/acme/board/issues/1",
                     "https://gitlab.com/acme/board/issues/1"]) {
    assert.throws(() => normalizeGithubIdInput(bad, home), { code: "GITHUB_INVALID_ID" });
  }
});

test("a same-owner repo other than home still gets the cross-repo form", () => {
  assert.equal(encodeGithubId({ owner: "acme", repo: "other", number: 5 }, home), "gh-acme.other.5");
  assert.equal(encodeGithubId({ owner: "other", repo: "board", number: 5 }, home), "gh-other.board.5");
});

test("decoding a home-repo ID yields the home owner and repo", () => {
  assert.deepEqual(decodeGithubId("gh-12", home), { owner: "acme", repo: "board", number: 12 });
});

test("encode -> decode round-trips owner/repo names with '-', '.', '_' and mixed case (lowercased)", () => {
  const cases = [
    { item: { owner: "My-Org", repo: "Repo.With.Dots", number: 7 }, id: "gh-my-org.repo.with.dots.7", decoded: { owner: "my-org", repo: "repo.with.dots", number: 7 } },
    { item: { owner: "A-B-C", repo: "Under_Score-dash.X", number: 104 }, id: "gh-a-b-c.under_score-dash.x.104", decoded: { owner: "a-b-c", repo: "under_score-dash.x", number: 104 } },
    { item: { owner: "0rg9", repo: "r", number: 1 }, id: "gh-0rg9.r.1", decoded: { owner: "0rg9", repo: "r", number: 1 } },
    { item: { owner: "acme", repo: "board.v2", number: 99 }, id: "gh-acme.board.v2.99", decoded: { owner: "acme", repo: "board.v2", number: 99 } },
  ];
  for (const { item, id, decoded } of cases) {
    const encoded = encodeGithubId(item, home);
    assert.equal(encoded, id);
    assert.deepEqual(decodeGithubId(encoded, home), decoded);
    assert.deepEqual(parseId(encoded), GH_PARSE);
  }
});

test("parseId returns the github shape for home and cross-repo IDs", () => {
  assert.deepEqual(parseId("gh-12"), GH_PARSE);
  assert.deepEqual(parseId("gh-1"), GH_PARSE);
  assert.deepEqual(parseId("gh-org2.my_repo.v2.3"), GH_PARSE);
});

test("repos named like legacy prefixes never yield a legacy-shaped ID", () => {
  for (const repo of ["issue", "epic", "bd"]) {
    const id = encodeGithubId({ owner: "x", repo, number: 12 }, home);
    assert.equal(id, `gh-x.${repo}.12`);
    const parsed = parseId(id);
    assert.equal(parsed.github, true);
    assert.equal(parsed.legacy, false);
  }
});

test("legacy and tiered IDs keep their existing classification and carry no github flag", () => {
  assert.equal(parseId("issue-12").github, undefined);
  assert.equal(parseId("epic-7k3f9a").legacy, true);
  assert.equal(parseId("bd-abc123").legacy, true);
  assert.equal(parseId("e1.f2").tier, "Feature");
  assert.equal(parseId("e1.f2").github, undefined);
});

test("malformed gh- IDs parse to null rather than falling through to another grammar", () => {
  for (const bad of ["gh-", "gh-abc", "gh-12a", "gh-org.3", "gh-org.repo.", "gh-org.repo.x", "gh-.repo.3", "gh-Org2.repo.3", "gh-org_x.repo.3", "gh-org repo.3"]) {
    assert.equal(parseId(bad), null, `expected null for ${bad}`);
  }
});

test("cross-repo display forms and URLs normalize to the lowercased cross-repo ID", () => {
  assert.equal(normalizeGithubIdInput("Org2/My_Repo.v2#3", home), "gh-org2.my_repo.v2.3");
  assert.equal(normalizeGithubIdInput("https://github.com/Org2/api/issues/3", home), "gh-org2.api.3");
  assert.equal(normalizeGithubIdInput("ACME/Board#12", home), "gh-12");
  assert.equal(normalizeGithubIdInput("https://github.com/Acme/Board/issues/12", home), "gh-12");
});

test("canonical IDs normalize to themselves", () => {
  assert.equal(normalizeGithubIdInput("gh-12", home), "gh-12");
  assert.equal(normalizeGithubIdInput("gh-org2.my_repo.v2.3", home), "gh-org2.my_repo.v2.3");
});

test("URLs with userinfo, a non-issue path, or a look-alike host are refused, not stripped", () => {
  for (const bad of [
    "https://user:secret@github.com/acme/board/issues/1",
    "https://user@github.com/acme/board/issues/1",
    "https://www.github.com/acme/board/issues/1",
    "https://github.com.evil.example/acme/board/issues/1",
    "https://api.github.com/acme/board/issues/1",
    "https://github.com/acme/board/pull/1",
    "https://github.com/acme/board/issues/1/",
    "https://github.com/acme/board/issues/1/comments",
    "https://github.com/acme/board/issues/abc",
    "https://github.com/acme/issues/1",
    "https://github.com/acme/board/issues/",
    "ftp://github.com/acme/board/issues/1",
  ]) {
    assert.throws(() => normalizeGithubIdInput(bad, home), { code: "GITHUB_INVALID_ID" }, `expected refusal for ${bad}`);
  }
});

test("malformed display forms are refused with GITHUB_INVALID_ID", () => {
  for (const bad of ["", "   ", "#", "#abc", "abc", "1.5", "-3", "#-1", "acme/board#", "acme#12", "/board#12", "acme/#12", "a/b/c#1", "my.org/board#1", "gh-abc"]) {
    assert.throws(() => normalizeGithubIdInput(bad, home), { code: "GITHUB_INVALID_ID" }, `expected refusal for ${JSON.stringify(bad)}`);
  }
});

test("the GITHUB_INVALID_ID error names the refused input", () => {
  assert.throws(
    () => normalizeGithubIdInput("acme#12", home),
    (err) => err.code === "GITHUB_INVALID_ID" && err.message.includes("acme#12"),
  );
});

test("decodeGithubId refuses IDs that are not canonical gh IDs", () => {
  for (const bad of ["issue-12", "e1.f2", "#12", "gh-abc", "gh-org.3"]) {
    assert.throws(() => decodeGithubId(bad, home), { code: "GITHUB_INVALID_ID" }, `expected refusal for ${bad}`);
  }
});

test("encodeGithubId refuses an owner containing '.', which would break lossless decoding", () => {
  assert.throws(() => encodeGithubId({ owner: "my.org", repo: "board", number: 1 }, home), { code: "GITHUB_INVALID_ID" });
});

test("a refused URL carrying userinfo never echoes the username or password in the error", () => {
  const cases = [
    { input: "https://alice:hunter2@github.com/acme/board/issues/1", secrets: ["alice", "hunter2"] },
    { input: "https://:hunter2@github.com/acme/board/issues/1", secrets: ["hunter2"] },
    { input: "https://alice@github.com/acme/board/issues/1", secrets: ["alice"] },
    { input: "https:alice:hunter2@github.com/acme/board/issues/1", secrets: ["alice", "hunter2"] },
    { input: "https://alice:hun@ter2@github.com/acme/board/issues/1", secrets: ["alice", "hun", "ter2"] },
  ];
  for (const { input, secrets } of cases) {
    assert.throws(
      () => normalizeGithubIdInput(input, home),
      (err) => {
        assert.equal(err.code, "GITHUB_INVALID_ID");
        for (const secret of secrets) {
          assert.equal(err.message.includes(secret), false, `message leaked ${secret}: ${err.message}`);
        }
        assert.equal(err.message.includes("github.com/acme/board/issues/1"), true);
        return true;
      },
    );
  }
});

test("URLs whose path contains dot segments are refused, not resolved", () => {
  for (const bad of [
    "https://github.com/acme/evil/../board/issues/1",
    "https://github.com/acme/board/./issues/1",
    "https://github.com/acme/x/%2e%2e/board/issues/1",
  ]) {
    assert.throws(() => normalizeGithubIdInput(bad, home), { code: "GITHUB_INVALID_ID" }, `expected refusal for ${bad}`);
  }
});

test("URL forms the WHATWG parser would silently normalize are refused", () => {
  for (const bad of [
    "https://github.com:443/acme/board/issues/1",
    "https://github.com/acme/board/issues/1?",
    "https://github.com/acme/board/issues/1#",
    "https://github.com/acme/bo\tard/issues/1",
    "https://github.com/acme/bo\nard/issues/1",
    "https://github.com/acme\\board/issues/1",
    "https:github.com/acme/board/issues/1",
  ]) {
    assert.throws(() => normalizeGithubIdInput(bad, home), { code: "GITHUB_INVALID_ID" }, `expected refusal for ${JSON.stringify(bad)}`);
  }
});

test("repo names '.' and '..' are refused", () => {
  for (const repo of [".", ".."]) {
    assert.throws(() => encodeGithubId({ owner: "acme", repo, number: 1 }, home), { code: "GITHUB_INVALID_ID" }, `encode ${repo}`);
    assert.throws(() => normalizeGithubIdInput(`acme/${repo}#1`, home), { code: "GITHUB_INVALID_ID" }, `normalize ${repo}`);
  }
});

test("decodeGithubId never echoes URL userinfo in its error", () => {
  assert.throws(
    () => decodeGithubId("https://alice:hunter2@github.com/acme/board/issues/1", home),
    (err) => {
      assert.equal(err.code, "GITHUB_INVALID_ID");
      assert.equal(err.message.includes("alice"), false, err.message);
      assert.equal(err.message.includes("hunter2"), false, err.message);
      return true;
    },
  );
});
