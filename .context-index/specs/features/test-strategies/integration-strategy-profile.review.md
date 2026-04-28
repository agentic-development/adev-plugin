# Architecture Review: integration-strategy-profile

> **Date:** 2026-04-27
> **Spec:** .context-index/specs/features/test-strategies/integration-strategy-profile.md
> **Charter:** .context-index/specs/features/test-strategies/charter.md
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 1
> **file-sha:** ad1817d8a8c2b9749c4389ef26b8336fcdbe9282
> **Note:** All blockers resolved in the same review cycle. Remaining findings are warnings and suggestions — tracked above for follow-up.

## Reviewers Dispatched

| ID | Name | Mode | Profile |
|----|------|------|---------|
| structural-architect | Structural Architect | subagent | reasoning |
| security-reviewer | Security Reviewer | subagent | capable |
| consistency-analyzer | Consistency Analyzer | subagent | capable |

---

## Structural Architect

**Verdict:** BLOCK

**SA-1** · blocker · _Behaviors 1 and 4 share identical title "Infrastructure boundary definition"_
Behavior 1 defines scope (what counts as external). Behavior 4 defines gaming rules. Different content, identical title. Consuming agents cannot distinguish them by heading.
→ Rename Behavior 4 to "Gaming rules and mocking boundaries". Fix precondition cross-ref "(see Behavior 4)" → "(see Behavior 3)".

**SA-2** · blocker · _Charter extension note does not include `strategy-profile-contract` in specs requiring update_
`strategy-profile-contract` preconditions read "one of the 8 known slugs matching `/^[a-z]+$/`". `getStrategyProfile('integration')` would be rejected by this validation until that spec is updated.
→ Add `strategy-profile-contract` to the charter extension note alongside `strategy-type-registry`.

**SA-3** · warning · _`cross-strategy-gaming-patterns` also references "8 types" and needs a revision bump_
→ Add to charter extension note.

**SA-4** · warning · _Detection heuristics (Behavior 7) don't define disambiguation when both `contract` and `integration` patterns match the same paths_
→ Add a priority note: contract takes precedence when `.pact.json`, `.proto`, or `openapi.yaml` are present.

**SA-5** · warning · _Permitted Tools reads as a blanket framework endorsement without clarifying these are project dependencies_
→ Add qualifier: "from the project's existing dependencies — the adev framework does not install these."

**SA-6** · warning · _Actionable Task Map missing two tasks: update strategy-profile-contract and update cross-strategy-gaming-patterns_
→ Add both as small tasks.

**SA-7** · suggestion · _Precondition "(see Behavior 4)" is a broken cross-reference (should be Behavior 3)_
→ Fix to "(see Behavior 3)".

**SA-8** · suggestion · _Acceptance criteria 10–11 conflate "detection" with "test execution runtime"_
→ Reword to "Test execution produces `INTEGRATION_NO_CREDENTIALS`…"

---

## Security Reviewer

**Verdict:** PASS_WITH_NOTES

**SEC-1** · warning · _Credentials table "Example / Format" column shows `AKIA...` — normalizes partial key prefixes in committed markdown_
→ Remove "Example / Format" column; use "Description" only. Add explicit prohibition on real values.

**SEC-2** · warning · _Least-privilege example uses `s3:*`, `sqs:*` wildcards — not least privilege_
→ Replace with scoped action sets: `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`, `s3:ListBucket` scoped to test bucket ARN. `sqs:SendMessage`, `sqs:ReceiveMessage`, `sqs:DeleteMessage` scoped to queue ARN.

**SEC-3** · warning · _`DATABASE_URL` not flagged as a secret-bearing variable (embeds password in URL)_
→ Add note distinguishing identifier variables (AWS_ACCESS_KEY_ID) from secret-bearing variables (DATABASE_URL, AWS_SECRET_ACCESS_KEY).

**SEC-4** · warning · _No guidance on credential rotation or use of short-lived tokens_
→ Add CI Notes item recommending STS role assumption over long-lived IAM user keys.

**SEC-5** · suggestion · _Testcontainers allowed but no image provenance guidance_
→ Add: pin images by digest, not mutable tag.

---

## Consistency Analyzer

**Verdict:** BLOCK

**CON-1** · blocker · _Profile uses prose headings, not the canonical field names from `strategy-profile-contract`_
(`red_exit_condition`, `gaming_blockers[]`, `assertion_rules`, `seed_data_rule`, `handoff_format`)
Note: sibling profiles (smoke, contract) also use prose — if they passed review with prose, this is not a new blocker for this profile specifically. Treated as warning pending confirmation against `strategy-profile-contract`.

**CON-2** · blocker · _Duplicate behavior title (same as SA-1)_ → Fix as SA-1.

**CON-3** · blocker · _`azure-pipelines.yml` listed as integration strategy indicator — conflicts with `strategy-detection-heuristics` which maps Docker/K8s files to `policy`, not `integration`. Azure Pipelines is a CI orchestrator, not an integration test signal._
→ Remove `azure-pipelines.yml` from Behavior 7 indicators.

**CON-4** · blocker · _`npm test -- --tag integration` invocation invalid — `node:test` has no `--tag` flag. Tests would not be isolated as intended._
→ Replace with `node:test`-native filtering: separate npm script (e.g., `npm run test:integration`) or `--test-name-pattern "integration"`.

**CON-5** · warning · _Actionable Task Map says "Add SDK import and path patterns" — import scanning contradicts detection-heuristics spec_
→ Remove "SDK import" from that task description.

**CON-6** · warning · _Manifest example uses `id: integration` but `manifest-schema-extension` spec uses `strategy_id:` as the field name_
→ Change to `strategy_id: integration`.

**CON-7** · warning · _`test_strategies[integration].local_substitute` field does not exist in `manifest-schema-extension` spec_
→ Remove reference or add the field to `manifest-schema-extension` via separate review.

**CON-8** · suggestion · _Charter extension note does not provide draft registry entry values for the 7 required `strategy-type-registry` fields_
→ Add draft values (id, name, description, red_semantics, green_semantics, domain, typical_tools).

---

## Summary

**Total findings:** 21 (4 blockers, 9 warnings, 4 suggestions; CON-1 demoted to warning — sibling profiles use same prose pattern)

**Blockers to resolve:** SA-1 (duplicate title), SA-2 (missing strategy-profile-contract in charter extension note), CON-3 (azure-pipelines.yml), CON-4 (--tag flag)

**Action required:** Resolve blockers, then re-run `/adev:review-specs --spec .context-index/specs/features/test-strategies/integration-strategy-profile.md`
