# Changelog

## [0.28.0-next.3](https://github.com/agentic-development/adev-plugin/compare/adev-cli-v0.28.0-next.2...adev-cli-v0.28.0-next.3) (2026-08-18)


### Bug Fixes

* **provider:** install only what ships — 358MB to 5.7MB, suite 360s to 28s ([9101252](https://github.com/agentic-development/adev-plugin/commit/9101252e9ce14b66efb5e53d74767befc506bb1f))
* **provider:** install only what ships, derived from package.json files ([d82de7b](https://github.com/agentic-development/adev-plugin/commit/d82de7ba0a106c126c1484e3c0db747fd22d8c3c))
* **provider:** install only what ships, derived from package.json files ([787c366](https://github.com/agentic-development/adev-plugin/commit/787c3662c7bed3ea6c570da6b929f7be434fb7ac))
* **review-specs:** stop Step 6b-ter claiming signature-ranked heuristics are prior occurrences ([a212892](https://github.com/agentic-development/adev-plugin/commit/a2128922ca61603c2006d181be77eba847ad669c))
* **review-specs:** stop Step 6b-ter claiming signature-ranked heuristics are prior occurrences ([38b0d98](https://github.com/agentic-development/adev-plugin/commit/38b0d980345832582d645955495680df76c43034))
* **session-capture:** resolve transcripts path under dot-directory cwds ([e3dfd48](https://github.com/agentic-development/adev-plugin/commit/e3dfd480562fcf219e8919e1cababe9f86b45ab5))
* **token-epic:** dot-directory transcripts path, machine-independent evals, test-suite reduction ([0de08ca](https://github.com/agentic-development/adev-plugin/commit/0de08cabd4c0b14e87d107dc679bace4b64c6da9))

## [0.28.0-next.2](https://github.com/agentic-development/adev-plugin/compare/adev-cli-v0.28.0-next.1...adev-cli-v0.28.0-next.2) (2026-08-17)


### Features

* **heuristics:** implement failure-capture and signature-retrieval ([315d0a6](https://github.com/agentic-development/adev-plugin/commit/315d0a6adfc1e7f17ea3f784fa430e253144bacc))
* **review:** add per-pack delivery field defaulting to inline ([9e4a30d](https://github.com/agentic-development/adev-plugin/commit/9e4a30dc3d43356716f73cf279c8b201c7b33a56))
* **review:** per-pack delivery + path-manifest context packs (inert; does not close j7pq.6) ([88ffed5](https://github.com/agentic-development/adev-plugin/commit/88ffed5d738dec3fbf36cdbbdf13ab026e3d68b9))
* **review:** reject manifest-pack reviewers whose profile cannot read files ([5204f60](https://github.com/agentic-development/adev-plugin/commit/5204f6031e0aaa1d4338148af39fef417fd8f420))
* **review:** render path-manifest sections for delivery: manifest packs ([9c24b6e](https://github.com/agentic-development/adev-plugin/commit/9c24b6e5ba04942aeb82777ffcf3b17ef99c703e))
* **review:** tell manifest-pack reviewers to read path-manifest paths on demand ([e9623fa](https://github.com/agentic-development/adev-plugin/commit/e9623fafd0b0b9cc9846b6e92ce0d1e1a75895fe))
* **review:** warn TARGET_SPEC_OVERSIZE without truncating the target spec ([519d6ab](https://github.com/agentic-development/adev-plugin/commit/519d6ab992e1f0973ddd66f928d61ed311dbcde8))


### Bug Fixes

* **hygiene:** resolve /adev:hygiene findings and the self-chaining hook bug ([a632d18](https://github.com/agentic-development/adev-plugin/commit/a632d18f5ac70d351b31219368d98fbe6e101dad))
* **hygiene:** resolve /adev:hygiene findings and the self-chaining hook bug ([04f23a7](https://github.com/agentic-development/adev-plugin/commit/04f23a779dae064a92e00168daa47f958eed7d8e))
* **review:** narrow consistency pack glob to *.spec.md ([3408deb](https://github.com/agentic-development/adev-plugin/commit/3408debb47c7254e8d91b46c4e0ccc83c8668e2a))
* **review:** neutralize fence tokens in manifest path lines ([806a134](https://github.com/agentic-development/adev-plugin/commit/806a134ab2da6be777206c00bb0069e0e85c1b31))
* **specify:** open and close specify on an amendment's own log ([6e7f351](https://github.com/agentic-development/adev-plugin/commit/6e7f35178d212a9f8a28c100b8168fb4cc672d47))

## [0.28.0-next.1](https://github.com/agentic-development/adev-plugin/compare/adev-cli-v0.27.9-next.1...adev-cli-v0.28.0-next.1) (2026-08-16)


### ⚠ BREAKING CHANGES

* **cli:** stop core.hooksPath from becoming code in the generated hook

### Features

* **cli:** add adev governance materialize with write-once marker ([3b4c318](https://github.com/agentic-development/adev-plugin/commit/3b4c31894b22b614a2972f386be4bbfad3d7a4e5))
* **cli:** add adev heuristics signature derived mode ([2f8c790](https://github.com/agentic-development/adev-plugin/commit/2f8c7903e63674e2ce060a7a78fbf68a62eba53b))
* **cli:** add adev report --gate-outcomes for per-gate validator outcomes ([869b79a](https://github.com/agentic-development/adev-plugin/commit/869b79a01d8323cc1ff93681a79ffe69be568b61))
* **cli:** add migrate-keys classification for the heuristic store rekey ([4355155](https://github.com/agentic-development/adev-plugin/commit/4355155cb3d5d4e83d36bda36c014094330c2c9a))
* **cli:** derive review-specs signatures from blocker_id ([f2956ae](https://github.com/agentic-development/adev-plugin/commit/f2956ae90e5cfc50f7ad9ad6bf1c2b89960e9bbe))
* **cli:** rekey the heuristic store to location-independent ids ([4cec5b1](https://github.com/agentic-development/adev-plugin/commit/4cec5b102038a007d03dc70b06a824562737ef9e))
* **design:** cross-reference behavior IDs from extract and from-diff modes ([87dab4a](https://github.com/agentic-development/adev-plugin/commit/87dab4ab98629971ac97ad2d557f1671e100ec24))
* **design:** state behavior-ID revision obligations in specify Step 4 ([5e8d60b](https://github.com/agentic-development/adev-plugin/commit/5e8d60bd41c87a1114e7ce29c4703fccda289e38))
* **design:** state the BEH-&lt;n&gt; behavior-ID convention in specify Step 4 ([4fddeb2](https://github.com/agentic-development/adev-plugin/commit/4fddeb2e975fa0139a462a423fce22a8f18f4419))
* **domain-extensions:** add governance value safety primitives ([a322d13](https://github.com/agentic-development/adev-plugin/commit/a322d1344c30046b96f7f862d058af0f86510551))
* **domain-extensions:** add writable-registry table and field allowlists ([8a0e115](https://github.com/agentic-development/adev-plugin/commit/8a0e11513d3d000493b6e00666b665d679d5774b))
* **domain-extensions:** contain and relocate extension executable payloads ([1991b60](https://github.com/agentic-development/adev-plugin/commit/1991b60f04c251f9a6f7ab460b3af96adfcca82b))
* **domain-extensions:** require install-time consent for executable contributions ([36615e4](https://github.com/agentic-development/adev-plugin/commit/36615e492bd50d7156be23bc6c5ea784009077d0))
* **domain-extensions:** splice registry entries in place, preserving every other byte ([7e36e9f](https://github.com/agentic-development/adev-plugin/commit/7e36e9f02bf695482785944fad7246794054f9d7))
* **domain-extensions:** validate and consent the whole install before any write ([5ab029f](https://github.com/agentic-development/adev-plugin/commit/5ab029f907e6ddf91a192a2fd91ef89abb9c06fc))
* **eval:** ship the default rubric and make Layer 3 binary ([4cc0e39](https://github.com/agentic-development/adev-plugin/commit/4cc0e39742eb07ef36bd2d9b44c060d2a2993add))
* **extensions:** refuse installs into un-materialized registries; init stamps the marker ([e964bc8](https://github.com/agentic-development/adev-plugin/commit/e964bc86b1b93d87c9fcbc38ce2ba3d36c746284))
* **governance:** unbundle governance into explicit registries, and harden extension merges ([a05a00a](https://github.com/agentic-development/adev-plugin/commit/a05a00a8356b28e417c6ac6a806effceed8dc5c0))
* **heuristics:** add shared digest function and the two normalizers ([68c7162](https://github.com/agentic-development/adev-plugin/commit/68c716274c6e167ad2efb5cb84f04dea3ac19bcd))
* **heuristics:** author three Phase 3 Live Specs ([f856683](https://github.com/agentic-development/adev-plugin/commit/f856683ab60bf7086ef11cd2fbc5e9126f72a34e))
* **heuristics:** carry signature through validate, write, and serialize ([f7f0d7f](https://github.com/agentic-development/adev-plugin/commit/f7f0d7f7201e87df1b28f100cc9033737b0fb01e))
* **heuristics:** charter revision 6 — Phase 3 close the loop ([3ceca67](https://github.com/agentic-development/adev-plugin/commit/3ceca67eb5ba6f7509846b8e909bdf712394895a))
* **heuristics:** Phase 3 failure-signature-key — one content-addressed identity for recurring failures ([b00eb71](https://github.com/agentic-development/adev-plugin/commit/b00eb71a20bd0f053dbda81a39311f4e7279ae3d))
* **review:** populate reviewer context packs and fence dispatch input ([d1878dc](https://github.com/agentic-development/adev-plugin/commit/d1878dcdfc2d5af1718765e4275252e8b8254f58))
* **review:** populate reviewer context packs and fence dispatch input ([631a12a](https://github.com/agentic-development/adev-plugin/commit/631a12ad31f060480d2de963b66292f22ce93d1a))
* **setup:** render Behaviors placeholders with BEH-&lt;n&gt; IDs in spec templates ([82a981b](https://github.com/agentic-development/adev-plugin/commit/82a981bfc6c64617fd6b4b11f2a21cff4a1947bb))
* **specify:** give spec behaviors stable BEH-&lt;n&gt; IDs ([5e98ab8](https://github.com/agentic-development/adev-plugin/commit/5e98ab8f27b9a81ef3f06dfc807fc610a292fa33))
* **unified-gates:** add adev gate transitions over recorded gate outcomes ([8366ad4](https://github.com/agentic-development/adev-plugin/commit/8366ad49c355c91b274fdd143a6bd890632d37bf))
* **unified-gates:** populate transitions with gates carrying argv commands ([8b99d82](https://github.com/agentic-development/adev-plugin/commit/8b99d8212d001b0c5076b8f0435299883b8c72c2))
* **validation:** add deterministic boundary evaluator and adev boundaries check ([97a0105](https://github.com/agentic-development/adev-plugin/commit/97a01054eed534bda9975f9ce41bb9cb1010a940))
* **validation:** carry per-gate outcomes on the validator_report payload ([68bc76b](https://github.com/agentic-development/adev-plugin/commit/68bc76b036e2fc348d97f17e95e61bba964c7f8f))
* **validation:** Check 1 records per-gate outcomes on its validator_report ([4801d19](https://github.com/agentic-development/adev-plugin/commit/4801d19204382436ccf5ac31bd3c39adc78ddb2a))
* **validation:** fail closed on un-materialized governance registries ([a885608](https://github.com/agentic-development/adev-plugin/commit/a885608c885e79f919978fc100ad906bf10e361f))
* **validation:** make Checks 8 and 9 deterministic verb calls ([b746569](https://github.com/agentic-development/adev-plugin/commit/b7465694a1bba21a969ff4535267432118404ae5))
* **validation:** populate boundaries.yaml from the constitution's mechanical rules ([5fc8e17](https://github.com/agentic-development/adev-plugin/commit/5fc8e17a8e9ab92281dba0051a30324df620960a))
* **validation:** surface disabled_reason and add enabled parity across registries ([dc51dd4](https://github.com/agentic-development/adev-plugin/commit/dc51dd4c4ab592c500266b54740c62a3c9cc0060))
* **validation:** widen hygiene Pass 19 to all governance registries ([b5aa12f](https://github.com/agentic-development/adev-plugin/commit/b5aa12f4f37c7d5f51712d1cc39c356378161ad5))


### Bug Fixes

* **cli:** honour the install scope answer, and stop asking project questions ([d81166c](https://github.com/agentic-development/adev-plugin/commit/d81166c8bd1db479cd9a2225fa05f3ba5ac996c3))
* **cli:** honour the install scope answer, and stop asking project questions ([b9342ee](https://github.com/agentic-development/adev-plugin/commit/b9342eeaee6e1f83b88e3a4362155ada9e3bb8f1))
* **cli:** make the chained git-hook wrapper fail closed and portable ([4aae4f5](https://github.com/agentic-development/adev-plugin/commit/4aae4f54014a6ddecbe1b75bd78d4d38e40b6aec))
* **cli:** make the chained git-hook wrapper fail closed and portable ([bf55ea6](https://github.com/agentic-development/adev-plugin/commit/bf55ea67b8df2e9f0781fd8ceca7e1b794fb4270))
* **cli:** migrate legacy shell-string gate commands on upgrade ([6870b21](https://github.com/agentic-development/adev-plugin/commit/6870b218cf503be56ff77628e1ccbca2b231ecf9))
* **cli:** migrate legacy shell-string gate commands on upgrade ([f9818ea](https://github.com/agentic-development/adev-plugin/commit/f9818ea273de16b327d88bf3cade3162dfa52cea))
* **cli:** pin the report verb's exit-2 path and stop swallowing unexpected errors ([67fa53d](https://github.com/agentic-development/adev-plugin/commit/67fa53dc32bc364ac63b27abd15a08743f237243))
* **cli:** recognize both validate-report suffixes in migrate-keys ([c2d77dc](https://github.com/agentic-development/adev-plugin/commit/c2d77dc7e420d8c26dc5ffd1605494dc476db245))
* **cli:** refuse to stamp a registry whose rows failed to load; complete the source mapping ([0f2dd66](https://github.com/agentic-development/adev-plugin/commit/0f2dd669b86677003033171deb67c48be87bdbd4))
* **cli:** refuse to write settings through a symlink; close review blockers ([728de4e](https://github.com/agentic-development/adev-plugin/commit/728de4eae1b8e8defd31c48cb95c83aa547344c5))
* **cli:** restore migrateLegacyGateCommands, deleted by a rebase resolution ([76849ce](https://github.com/agentic-development/adev-plugin/commit/76849ce5a22727008bf912b10b64c625136c3715))
* **cli:** stop core.hooksPath from becoming code in the generated hook ([5db2257](https://github.com/agentic-development/adev-plugin/commit/5db225712f3ff62c33153f2d253986fea939985e))
* **cli:** wire the dispatching reviewer set through a verb and correct the overlay docs ([3f15c95](https://github.com/agentic-development/adev-plugin/commit/3f15c9541e85ed50a1ff3a4664f07c18f0ecade4))
* **cli:** write governance registries atomically and drop the duplicate marker reader ([8414429](https://github.com/agentic-development/adev-plugin/commit/8414429196992a877ab718fc930984b21fee3ee7))
* **domain-extensions:** assert YAML emission safety of rewritten payload paths ([2a6e537](https://github.com/agentic-development/adev-plugin/commit/2a6e537eaa012f44f3017243522cda9f089bbaac))
* **domain-extensions:** code directory payloads and plan/apply mismatch as refusals ([8315493](https://github.com/agentic-development/adev-plugin/commit/83154933e3f9a4ac502f990dc8706502a7210c80))
* **domain-extensions:** handle CRLF and unrecognised sibling keys in the splice ([5213c5c](https://github.com/agentic-development/adev-plugin/commit/5213c5cbdbe6d3bc7759b88d7bba357eb869d402))
* **domain-extensions:** make the governance merge contained, additive and refusing ([7f84182](https://github.com/agentic-development/adev-plugin/commit/7f841825358058982dba84f9481780b4c7b95f88))
* **domain-extensions:** make the reference extension installable outside this repo ([aec1fc5](https://github.com/agentic-development/adev-plugin/commit/aec1fc569bcf3b937ae0add71c69abc8dc4010d6))
* **domain-extensions:** name the extension and entry in governance refusals ([7eb0518](https://github.com/agentic-development/adev-plugin/commit/7eb0518464752bcb7f7f1e3ab91744e016c1d64e))
* **domain-extensions:** refuse colon-space and type-flip scalars ([ea0ffef](https://github.com/agentic-development/adev-plugin/commit/ea0ffef51a9394448571d61bd50fc71371e84e55))
* **domain-extensions:** refuse package rewrites onto entries without a package ([ba56470](https://github.com/agentic-development/adev-plugin/commit/ba5647022e432feb7bafa0ad87e311a46b933b06))
* **domain-extensions:** refuse zero-indent block sequences instead of splicing them ([bc16e20](https://github.com/agentic-development/adev-plugin/commit/bc16e20adc9e99b79cc03876f09ed549b2f25f8e))
* **domain-extensions:** update the example template and integration suite to the payload contract ([761eba8](https://github.com/agentic-development/adev-plugin/commit/761eba80742e536a63b8c236708ab1cfcf9a720a))
* **domain-extensions:** use argv rule for commands and constrain severity_cap ([9e1f4fd](https://github.com/agentic-development/adev-plugin/commit/9e1f4fd5770000814294e87ec7559e0d56d09f7f))
* **domain-extensions:** wire the interactive consent prompt into the CLI ([6cfc917](https://github.com/agentic-development/adev-plugin/commit/6cfc9177f2391bc571d0d33e1dce221220a0c7e4))
* **domain-extensions:** write NUL key separator as an escape, not a raw byte ([c8d57c0](https://github.com/agentic-development/adev-plugin/commit/c8d57c0b5bd491bd2858227f979a25be8095cbbb))
* **evals:** assert token-budget Strategy 1 against its realized structure ([d65c517](https://github.com/agentic-development/adev-plugin/commit/d65c517271befb59bf319d5f788a6e80c9a32fe6))
* **evals:** correct configurable-governance assertions to the post-restructure contract ([0324dda](https://github.com/agentic-development/adev-plugin/commit/0324dda64b0ed67fce4ac3ed95641ba8a9b66ccb))
* **evals:** repair the skill-compression variant matrix and guard it ([135c512](https://github.com/agentic-development/adev-plugin/commit/135c5123c54bbabc7ff0571102fde5615f6d41f8))
* **extensions:** assert the governance marker before exec-consent; describe the scaffold marker honestly ([f7ae04d](https://github.com/agentic-development/adev-plugin/commit/f7ae04d341c234e9dc2cd0ea99b6e5ae2a71f114))
* **gaming:** make the detector comment- and string-aware ([54e11ad](https://github.com/agentic-development/adev-plugin/commit/54e11ad289ad22bf5ae62cca23146f305c2a5642))
* **gates:** make the materialization opt-out a single named flag ([5ba7574](https://github.com/agentic-development/adev-plugin/commit/5ba75749e7af5c8d2f72e4602eafa55eb8e110b6))
* **gates:** the only quality gate in this repo was never running ([2c43db0](https://github.com/agentic-development/adev-plugin/commit/2c43db03f89f055bfed53dea2f72836b9cac8b90))
* **governance:** adopt 0.27.9-next config surfaces; the only gate was silently dropped ([26f302e](https://github.com/agentic-development/adev-plugin/commit/26f302e4a4948f98877d65681e81c772f998a5b5))
* **governance:** reconcile explicit-registries unbundling with domain-profiles tests ([a25971e](https://github.com/agentic-development/adev-plugin/commit/a25971e2b72f95d4bcc78271a21408d613f57d69))
* **governance:** surface plugin-provided entries the source: stamp never reached ([e3cef1d](https://github.com/agentic-development/adev-plugin/commit/e3cef1dd1eefb0c16cd5242a85e235efe1b89eb5))
* **heuristics:** address six review blockers in failure-signature-key rev 2 ([ddea5eb](https://github.com/agentic-development/adev-plugin/commit/ddea5eb9ab9284e7bfe84beba90631dc46121204))
* **heuristics:** address two new blockers in failure-signature-key rev 3 ([c5dfd99](https://github.com/agentic-development/adev-plugin/commit/c5dfd99d968d068c3d0b59944585070ee0ef26a3))
* **heuristics:** correct charter rev 6 against review findings ([027eb35](https://github.com/agentic-development/adev-plugin/commit/027eb3568d7da89dd0fd1b26430888b9cac49c23))
* **heuristics:** handle both legacy slug conventions in migrate-keys ([920919a](https://github.com/agentic-development/adev-plugin/commit/920919a918a697b7f81bbc70807416441ba5c46c))
* **heuristics:** replace unsatisfiable migration proof with prefix discriminator ([4dc26d4](https://github.com/agentic-development/adev-plugin/commit/4dc26d4bb866d908ff05f5b428b9b1eab434aa33))
* **heuristics:** resolve charter-invariant conflict in failure-signature-key ([c8d4350](https://github.com/agentic-development/adev-plugin/commit/c8d4350550b1f903d2dafa989c4194c5d9a90bd2))
* **heuristics:** resolve rev-6 id/signature contradiction and stale refs ([ae46b3d](https://github.com/agentic-development/adev-plugin/commit/ae46b3d505d860047f297c32980e0af51c95a237))
* **heuristics:** restore genuine provenance for failure-signature-key ([5fb71a6](https://github.com/agentic-development/adev-plugin/commit/5fb71a64cb11400871e9479b7d94c72aa89e4c7d))
* **heuristics:** sync Task Map with Behaviors; normalize evidence source aliases ([93a1e10](https://github.com/agentic-development/adev-plugin/commit/93a1e10f572c26ec7c5f20769c9029bcb5e78fd6))
* **heuristics:** two-mode verb and structural migration discriminator ([9a4bac0](https://github.com/agentic-development/adev-plugin/commit/9a4bac0d13960a5b74c9ce2476976b8e67d9f202))
* **hooks:** derive heuristic ids from repo-relative spec paths ([4752f1f](https://github.com/agentic-development/adev-plugin/commit/4752f1fe1cf0de89721a784b5325a89b52c7b61f))
* **hygiene:** make plan-immutability exemptions survive history rewrites ([7053118](https://github.com/agentic-development/adev-plugin/commit/7053118fc4c4f22130092dc4c11dd66d857d5d11))
* **implement:** cap the Stage-2 review loop and route it through convergence ([80e7013](https://github.com/agentic-development/adev-plugin/commit/80e70136a304279221ffd03b850cebb292ce94a0))
* **implement:** get back under the Copilot size cap, and guard it ([d4e5fbf](https://github.com/agentic-development/adev-plugin/commit/d4e5fbfc4d7c1c0c62eb7980f5baaddfecd45deb))
* **issues:** raise the br floor to 0.2.19 and correct the documented backends ([2d9cc14](https://github.com/agentic-development/adev-plugin/commit/2d9cc1436f49d821a970038597e5be5a3347c89c))
* **issues:** silent body loss on issue and epic create ([4de1d45](https://github.com/agentic-development/adev-plugin/commit/4de1d459c8238e181008c6ee2e2247fdac55ccf0))
* **issues:** stop silently dropping body/description on issue create ([2de5523](https://github.com/agentic-development/adev-plugin/commit/2de55233d73f4f20eb3cb1342071ea80c33ab339))
* **issues:** validateEpic no longer drops the epic body ([ef25524](https://github.com/agentic-development/adev-plugin/commit/ef2552469033ce6003f6b49ec023cff63e6658e2))
* **lifecycle:** accept BLOCK verdicts, and stop projecting them as PASS ([9dd21e1](https://github.com/agentic-development/adev-plugin/commit/9dd21e13e5b1e69b9228a4629811c058e48f3758))
* **lifecycle:** project drift and amendment events instead of dropping them ([f4ab5ce](https://github.com/agentic-development/adev-plugin/commit/f4ab5ceb68de123aa8a7bde3026faf2ae6091b82))
* **lifecycle:** resolve actor severity from the materialized registry, not the domain overlay ([de56efa](https://github.com/agentic-development/adev-plugin/commit/de56efa5d295e79381adec202f8173ebadd0b73d))
* **lifecycle:** verdicts that could not be recorded, and failures that projected as passes ([0e12c7e](https://github.com/agentic-development/adev-plugin/commit/0e12c7ef04780ac1a117c028335af392992f4d6a))
* **milestones:** resolve gates_pass from governance config, not manifest.gates ([24bfeb9](https://github.com/agentic-development/adev-plugin/commit/24bfeb92638c521e8254d45abd4fa1be89fe8c67))
* **review-specs:** a per-reviewer verdict is never BLOCK ([9c68639](https://github.com/agentic-development/adev-plugin/commit/9c68639c27cafd30b2a70cbb4fd849cdeb319feb))
* **review:** map run-time __source provenance onto the on-disk source enum ([e60319a](https://github.com/agentic-development/adev-plugin/commit/e60319a8b0e5dafb85a18f05b190b1d4e906feac))
* **route:** normalize routing scores to the sidecar schema and stop --task wiping peers ([c2a9c1e](https://github.com/agentic-development/adev-plugin/commit/c2a9c1e4da85ea5ee9288148260fe484aafc3ccd))
* **session-capture:** redact out-of-repo absolute paths at both write chokepoints ([e291afa](https://github.com/agentic-development/adev-plugin/commit/e291afa1f45e5e860b2468896ac1d9664732f336))
* **session-capture:** redact out-of-repo paths, and keep capture on post-commit ([3d8e7a0](https://github.com/agentic-development/adev-plugin/commit/3d8e7a02a207ee90a27ffaac676eadf9a36e61c6))
* **skills:** actually emit step_failed on failure paths ([aa239f0](https://github.com/agentic-development/adev-plugin/commit/aa239f0b0a3c7828458b4600121d6f90c8aa9b44))
* **skills:** back under the Copilot size cap, plus a guard and two routing fixes ([0b002a0](https://github.com/agentic-development/adev-plugin/commit/0b002a07fe528889aa1c2c0734a208be76ad7754))
* **skills:** keep implement/SKILL.md under the Copilot 64 KiB limit ([f62d301](https://github.com/agentic-development/adev-plugin/commit/f62d3013f0635100daa7b232d7af7a97bc922e10))
* **tests:** repair the detector, the rubric, and the eval matrix that measured nothing ([9955bed](https://github.com/agentic-development/adev-plugin/commit/9955bed64f9244745bfabc4520ddd3a614d7db42))
* **unified-gates:** execute argv-array gate commands without a shell ([774d9dc](https://github.com/agentic-development/adev-plugin/commit/774d9dc22a038a83e04223af167f58f0305a0301))
* **unified-gates:** report gate-set divergence and shell-form gate commands ([9e032fa](https://github.com/agentic-development/adev-plugin/commit/9e032facef9d9b07e1288ad53c59a191262c6f10))
* **unified-gates:** separate an unstamped spec from a stale record and align the gate view ([89aaf95](https://github.com/agentic-development/adev-plugin/commit/89aaf957f64bd29e4fa9e2069e5186bd246b0132))
* **unified-gates:** surface an uncomputable merged gate view instead of hiding it ([bfc191e](https://github.com/agentic-development/adev-plugin/commit/bfc191e07153deaaa4144ed0d07c1db040ff94f6))
* **validate:** correct check 8/9 finding fields and stop classifying them as subagent checks ([9302c17](https://github.com/agentic-development/adev-plugin/commit/9302c176835659503243c4a7f2f4fa818200b46a))
* **validation:** address Task 1 review findings on the governance-registry spec ([a4ad964](https://github.com/agentic-development/adev-plugin/commit/a4ad96407d7e466bc64b219a1a8c150ade9496c7))
* **validation:** default gate tier, stop the loader crashing on bad argv, correct the sha contract ([574ec8a](https://github.com/agentic-development/adev-plugin/commit/574ec8aee129fd262cf24d1776538f4fbb8b64eb))
* **validation:** reject a non-string manifest_sha instead of coercing it ([679af0c](https://github.com/agentic-development/adev-plugin/commit/679af0cc7b786b4bdc12624e367337adeec0d0c3))
* **validation:** stop the boundary evaluator dropping a file at a chunk boundary ([5f57e01](https://github.com/agentic-development/adev-plugin/commit/5f57e010905f2c852fe71cb698bd5dea41693011))
* **validation:** surface disabled entries in the reports and add gate enablement parity ([35d6e0d](https://github.com/agentic-development/adev-plugin/commit/35d6e0d3684766534372a591d511922d3cea19df))
* **viz:** app.mjs did not parse; build.mjs crashed on a fresh clone ([6897e86](https://github.com/agentic-development/adev-plugin/commit/6897e864a7e6d275b2821347d66f8319cbee3805))

## [0.27.9-next.1](https://github.com/agentic-development/adev-plugin/compare/adev-cli-v0.27.9-next...adev-cli-v0.27.9-next.1) (2026-08-13)


### Features

* **cli:** add adev test-policy resolve/assert-assigned/explain verb ([e403aab](https://github.com/agentic-development/adev-plugin/commit/e403aabbeb8951061f8e36831a543bd9012ee0cc))
* **diagnostics:** flag specs claiming validated with no validation report ([13378fb](https://github.com/agentic-development/adev-plugin/commit/13378fbb5aea7764e8d612e7fcc3ab584115639c))
* **diagnostics:** flag specs claiming validated with no validation report (issue-563) ([faba0ed](https://github.com/agentic-development/adev-plugin/commit/faba0ed103d5e4af10c26ae5d4f384cc25fb7b9e))
* **gates:** ship a live integration tier in every domain starter ([b27ed4a](https://github.com/agentic-development/adev-plugin/commit/b27ed4a9e4d084ddffed547632253dffd1cbb44a))
* **gates:** ship live fast and integration tiers in gates-template ([8df01b5](https://github.com/agentic-development/adev-plugin/commit/8df01b57be4bcf9b3dd652329c643755ecff8b95))
* **governance:** extend risk policies with test_depth per risk level ([c10ed50](https://github.com/agentic-development/adev-plugin/commit/c10ed503083daddb21741fe394e6fb962e97a5c3))
* **hooks:** add lifecycle-gate consolidation refactor spec ([ddfad96](https://github.com/agentic-development/adev-plugin/commit/ddfad96f9867494f5f57054e867c9e8864f060f6))
* **hooks:** plan lifecycle-gate consolidation (8 tasks); spec rev-2 wording fixes ([fde1b56](https://github.com/agentic-development/adev-plugin/commit/fde1b560417de3c9f936224183f5ddfaa5f8742a))
* **hooks:** revise lifecycle-gate consolidation spec to rev 2 (address review blockers) ([05aa754](https://github.com/agentic-development/adev-plugin/commit/05aa754ab4949868f1575afc045ba04def0b6188))
* **hygiene:** add test-policy drift pass for floor_inputs: unavailable tasks ([d5fbf46](https://github.com/agentic-development/adev-plugin/commit/d5fbf468d15d54a34bfa82332ad1ec95d78f1ef6))
* **implement:** call test-policy resolve and assert-assigned per task ([484fbf1](https://github.com/agentic-development/adev-plugin/commit/484fbf1932fe4b3cb212abdee69dea2bb137c533))
* **implement:** source integration gates from the merged gate list ([f04bce6](https://github.com/agentic-development/adev-plugin/commit/f04bce651803887be8f32c8066bbeca61e6ce31c))
* **init:** emit test_policy and test_depth on greenfield and brownfield init ([beae315](https://github.com/agentic-development/adev-plugin/commit/beae315eb9cd69f67037023be5dab959ca9a1231))
* **init:** seed both gate tiers in argv form at Step 7a ([cdc3d59](https://github.com/agentic-development/adev-plugin/commit/cdc3d59241f98b4ea83adc2a930f81f2ef03d8c0))
* **issues:** bind issues to branch/PR and add atomic claim ([7b55e07](https://github.com/agentic-development/adev-plugin/commit/7b55e0752dbf969b686d6ee75309c2e8f4650a6f))
* **issues:** bind issues to branch/PR and add atomic claim (issue-608 + issue-609) ([7c0e0a6](https://github.com/agentic-development/adev-plugin/commit/7c0e0a6cf72fe3da95eca3476372856582891b8f))
* **issues:** claim leases with a TTL, and enforce the claim in implement/debug preflight ([3efbf33](https://github.com/agentic-development/adev-plugin/commit/3efbf3319f19042c0f008883674d3fdc107d6bf9))
* **issues:** give claims a TTL, a takeover path, and a stale report ([16eb340](https://github.com/agentic-development/adev-plugin/commit/16eb34055e3f98fd07adb0474748db9583ebc068))
* **issues:** mint merge-safe board IDs — closes issue-613 via option (a) ([d797747](https://github.com/agentic-development/adev-plugin/commit/d7977475db343cf0507a56e666e9136596a4538b))
* **issues:** mint merge-safe board IDs — closes issue-613 via option (a) ([6713dc3](https://github.com/agentic-development/adev-plugin/commit/6713dc316928d4ab9ce0923b7f49ab9b4300874c))
* **issues:** mint merge-safe board IDs — closes issue-613 via option (a) ([45c243f](https://github.com/agentic-development/adev-plugin/commit/45c243fb60acaec60d2eae49f8d5a7dee384a7b6))
* **lifecycle:** enforce the issue claim in implement and debug preflight ([26dedad](https://github.com/agentic-development/adev-plugin/commit/26dedad769cf15a2f69749606619997e00e61772))
* **lifecycle:** register test_depth_assigned canonical event ([901c5dd](https://github.com/agentic-development/adev-plugin/commit/901c5ddfb1dc76bbc1b32ccba6e2d20974a3a79f))
* **maintenance:** /adev:hygiene Audit Pass 23 — test-debt detection ([2ae8463](https://github.com/agentic-development/adev-plugin/commit/2ae8463176c4bc00f7cdd936626989b188106988))
* **maintenance:** adev test-debt scan — Audit Pass 23 detection engine ([411bda9](https://github.com/agentic-development/adev-plugin/commit/411bda99171c5fba6c1c90abdc5b8d91ad167ec0))
* **maintenance:** wire Audit Pass 23 (Test Debt) into /adev:hygiene ([64a68b0](https://github.com/agentic-development/adev-plugin/commit/64a68b0b5054f60b0f6529c57e6493de1b979adf))
* **plan:** emit Tests: fields per granularity chain ([e8bec11](https://github.com/agentic-development/adev-plugin/commit/e8bec11d9e481a33d937fae05240feb61b28847c))
* **specify:** accept test_depth: as legal spec frontmatter ([e9b5e6a](https://github.com/agentic-development/adev-plugin/commit/e9b5e6ab89d2a18744f6f6674f90afa3948a9f5a))
* **status:** count task completion from lifecycle events, not file existence ([149991d](https://github.com/agentic-development/adev-plugin/commit/149991dfe5bca295758f63025e2e306c1954a98a))
* **test-strategies:** add DEFAULT_SENSITIVE_PATHS and effectiveSensitivePaths ([a6111ce](https://github.com/agentic-development/adev-plugin/commit/a6111cee621528ccbeacb7ea03c885e55206a80d))
* **test-strategies:** add parseTestPolicy and resolveGranularity ([42bc7ea](https://github.com/agentic-development/adev-plugin/commit/42bc7ead3265d4965f7eef83e125166b9ac3c636))
* **test-strategies:** add path classification for gaming detector gate ([bc55a66](https://github.com/agentic-development/adev-plugin/commit/bc55a66b8229ec3150f6f743e879d3f3ffc09ead))
* **test-strategies:** add readTaskFiles plan-region parser ([bcbd676](https://github.com/agentic-development/adev-plugin/commit/bcbd676f3b8c3d4e062fe3232da795a5e742feec))
* **test-strategies:** add resolveSuitePath for granularity-driven suite reuse ([7d028e4](https://github.com/agentic-development/adev-plugin/commit/7d028e436e15fa843fd10e075f3c82ec064544d5))
* **test-strategies:** add resolveTestDepth chain, escalation, and floor ([a63bf1a](https://github.com/agentic-development/adev-plugin/commit/a63bf1a7376a34251bac9f388b0d50a116963769))
* **test-strategies:** add test-helper inventory lib and adev test-helpers verb ([a7a8c0a](https://github.com/agentic-development/adev-plugin/commit/a7a8c0a8632e7c5974524df84457694b26eda2de))
* **test-strategies:** diff gaming violations before/after a pending edit ([25867c5](https://github.com/agentic-development/adev-plugin/commit/25867c5d4e14df51f63c44b55d0e8db07a51dea4))
* **test-strategies:** dispatch gaming detectors without size cap ([b08565a](https://github.com/agentic-development/adev-plugin/commit/b08565a218ebe238fb0fa635b562503466fca7a7))
* **test-strategies:** inject shared test-helper inventory into write-test and implement ([a8192c0](https://github.com/agentic-development/adev-plugin/commit/a8192c03d2956c6a280a27e637a1b6234eae355a))
* **test-strategies:** inject the shared test helper inventory into write-test and implement ([154f2be](https://github.com/agentic-development/adev-plugin/commit/154f2be6f2761c7ecc4dcfac22afc694f49392c1))
* **test-strategies:** land charter revision 3 for test depth policy ([056972f](https://github.com/agentic-development/adev-plugin/commit/056972f4e1443841be10d56f14c31a133952d542))
* **test-strategies:** reconstruct pre-write file content for the gaming gate ([c70e707](https://github.com/agentic-development/adev-plugin/commit/c70e707b8da613da52cb5995535dca7e7c75ef91))
* **test-strategies:** test depth policy — risk-scaled, escalation-only test coverage ([e925655](https://github.com/agentic-development/adev-plugin/commit/e925655f8ae1be8773f4f1f647c6e909791354ae))
* **test-strategies:** wire gaming detectors into a PreToolUse enforcement gate ([ef7360d](https://github.com/agentic-development/adev-plugin/commit/ef7360d05339dff4a34f0309f52c5a6394313b11))
* **test-strategies:** wire gaming detectors into a PreToolUse hard-blocking hook ([ad59b34](https://github.com/agentic-development/adev-plugin/commit/ad59b340b8f7e6b7b6007c7b2fd44ff8cedf144d))
* **unified-gates:** adev gate doctor — verify gates can run and tests get collected ([a5d9b2a](https://github.com/agentic-development/adev-plugin/commit/a5d9b2a89c05dccb0b35bf92951abdaa6b38af5b))
* **unified-gates:** adev gate doctor — verify gates run and tests get collected ([ffe4441](https://github.com/agentic-development/adev-plugin/commit/ffe4441e0d9c64c9742b3dcca57721fdb81af22a))
* **unified-gates:** gate doctor accepts argv-list gate commands ([e27938b](https://github.com/agentic-development/adev-plugin/commit/e27938ba3bfd78fdc85885e75ae0b85e9283e364))
* **unified-gates:** ship a live integration tier by default ([8c45676](https://github.com/agentic-development/adev-plugin/commit/8c456762587d1928a7793e59cb784cd9b18e4798))
* **work:** pre-flight concurrency scan for /adev:work Step 1 ([f3e73b2](https://github.com/agentic-development/adev-plugin/commit/f3e73b2ff1748309d6ee4804674aba0f22e77183))
* **work:** pre-flight concurrency scan for /adev:work Step 1 ([267aad9](https://github.com/agentic-development/adev-plugin/commit/267aad978cca1593aaa00f366fdba100c0e8a6d7))
* **write-test:** pin standalone mode to standard depth; document gaming-blocker depth-invariance ([7647ba4](https://github.com/agentic-development/adev-plugin/commit/7647ba406c1b15fd5ab8d872584db827fd7e8b9e))


### Bug Fixes

* **artifact:** reject reports whose frontmatter is not first ([888196f](https://github.com/agentic-development/adev-plugin/commit/888196fceb064f9d2f6777f9a3fc90d36eff2ace))
* **artifact:** reject reports whose frontmatter is not first ([526e8a1](https://github.com/agentic-development/adev-plugin/commit/526e8a174b95ee83504952bacebd13c8a63f68ba))
* **build:** accept and propagate --tier rigor argument to review and validate steps ([df11ba5](https://github.com/agentic-development/adev-plugin/commit/df11ba5de73086bdc5fc95ffa186f2c72ffbae10))
* **build:** accept and propagate --tier rigor argument to review and validate steps ([d73b2b2](https://github.com/agentic-development/adev-plugin/commit/d73b2b2b14ed55ab08dfd4d039a3f220dc52b11e))
* **cli:** print test-policy JSON to stdout; validate set's test_depth/granularity enums ([71549b3](https://github.com/agentic-development/adev-plugin/commit/71549b337d39b8194e9c45a63bc605b0daaaed41))
* **cli:** wire test-policy resolve/show to actually read governance/sensitive-paths.yaml ([b16a9f1](https://github.com/agentic-development/adev-plugin/commit/b16a9f1073803d1064e1f9d4604f1994561f336a))
* **diagnose:** a slow producer must not suppress the success verdict ([b70afec](https://github.com/agentic-development/adev-plugin/commit/b70afece57accd80c6006d00137545374959ba4f))
* **diagnose:** a slow producer must not suppress the success verdict ([fd8f7b5](https://github.com/agentic-development/adev-plugin/commit/fd8f7b5895e8e803a32bdc006d97dd1e1271bf67))
* **execution-state:** close the two shadow-path sites the shared root exposed ([db0496d](https://github.com/agentic-development/adev-plugin/commit/db0496dc336076fe64b6b36a74fbde6ab25035aa))
* **execution-state:** resolve storage root across worktrees like the board ([2326977](https://github.com/agentic-development/adev-plugin/commit/2326977403f43836d4689d3f8df17fbfd97e9e37))
* **execution-state:** resolve storage root across worktrees, and close the two shadow-path sites it exposed ([323f399](https://github.com/agentic-development/adev-plugin/commit/323f3997a1dc31deb2ad2061e656757ec093af71))
* **gate:** remove two mappings that made gates pass unconditionally ([a78f4e6](https://github.com/agentic-development/adev-plugin/commit/a78f4e644b9f5599dbc27d119d545f773b206f9f))
* **gate:** remove two mappings that made gates pass unconditionally ([3f28515](https://github.com/agentic-development/adev-plugin/commit/3f28515c8e3d7563d5176c4384c089228c27b967))
* **hooks:** merge-guard blocked read-only plumbing and every PR merge ([5836117](https://github.com/agentic-development/adev-plugin/commit/5836117692e66a93670521e37e3e03cb26593abc))
* **hooks:** merge-guard refused read-only plumbing and every PR merge ([b8a7bad](https://github.com/agentic-development/adev-plugin/commit/b8a7bada088603d4f86cd5308273bcbe8c30d6c5))
* **hygiene:** wire Test-Policy Drift pass into summary table, --check enum, and pass count ([05196e4](https://github.com/agentic-development/adev-plugin/commit/05196e4c3ef00db00bf03bc6d8417ead417804b5))
* **init:** restore explicit inferGranularity-not-implemented disclosure; file real follow-up issue; strengthen placeholder test ([c242d7d](https://github.com/agentic-development/adev-plugin/commit/c242d7d557c3f8ad790ba3ac603a937371d1c85d))
* **issues:** close the beads claim gate's fail-open path ([2d26bdd](https://github.com/agentic-development/adev-plugin/commit/2d26bdd95cdcf703f2ac28ecd009643ae96aff7e))
* **issues:** detect the stale shadow tasks.json inside git worktrees ([23d96a5](https://github.com/agentic-development/adev-plugin/commit/23d96a5c282be1889b88ccf00be534646c2ef3cd))
* **issues:** detect the stale shadow tasks.json inside git worktrees ([a54e218](https://github.com/agentic-development/adev-plugin/commit/a54e218d64dd9ebcd65e739383932d8511e08557))
* **issues:** make the beads backend work against br 0.2.x, and make beads its single source of truth ([e55a4ed](https://github.com/agentic-development/adev-plugin/commit/e55a4edc282d9eee06030ac10e0fab76a300b213))
* **issues:** make the beads backend work against br 0.2.x, with claim parity ([11a06cc](https://github.com/agentic-development/adev-plugin/commit/11a06cc8c0d90f8b2e2998e52f4cdb09a63e3842))
* **issues:** migrate status faithfully and read dependencies back ([b603828](https://github.com/agentic-development/adev-plugin/commit/b603828d485e797d1f4929984a1e5ef99e65dea0))
* **issues:** preserve source ids across migration — closes issue-628 ([a0e0c1d](https://github.com/agentic-development/adev-plugin/commit/a0e0c1d598f045354595ac3f1c2a16787b6bd21d))
* **issues:** preserve source ids across migration (closes issue-628) ([cb80337](https://github.com/agentic-development/adev-plugin/commit/cb8033773b01e919a30145426dfb0bbdc06705ea))
* **lifecycle-gate:** quote-aware command splitting in bash passthrough matching ([562701e](https://github.com/agentic-development/adev-plugin/commit/562701ef1bdd0c7c4cdb7aa45222dd595d6aa328))
* **lifecycle-gate:** quote-aware command splitting in bash passthrough matching ([7b4a828](https://github.com/agentic-development/adev-plugin/commit/7b4a8289fac2ddac74b3138891e7ca2b4e522328))
* **lifecycle-gate:** structural passthrough for the standalone escape hatch ([d5d2d55](https://github.com/agentic-development/adev-plugin/commit/d5d2d554c47e3ac102a2b8406e4e50b01d301759))
* **lifecycle-gate:** structural passthrough for the standalone escape hatch ([859564d](https://github.com/agentic-development/adev-plugin/commit/859564d6ed08e39481b69fcc5e236db240fdc71f))
* **lifecycle:** project test_depth_assigned events instead of dropping to unknownEvents ([8396700](https://github.com/agentic-development/adev-plugin/commit/83967009db8fd5b68d89b0a21a2072c18214fbcf))
* **maintenance:** mask template literals before Class A extraction ([78c6b37](https://github.com/agentic-development/adev-plugin/commit/78c6b37578b1957a2666fa66187f927434b38675))
* **maintenance:** post-validation corrections to the test-debt pass; spec rev 5 ([19821ab](https://github.com/agentic-development/adev-plugin/commit/19821abef44e08158155a1c951c2c6af49bf5cb4))
* **session-capture:** derive specs-touched from changed spec paths ([479e391](https://github.com/agentic-development/adev-plugin/commit/479e3919c359fbb6e2f1c963a696b6f9aecd9eeb))
* **session-capture:** derive specs-touched from changed spec paths, and allow-list its containment ([bedd3b7](https://github.com/agentic-development/adev-plugin/commit/bedd3b71d477361c35e0cb10e20509b5da3311c6))
* **session-capture:** pass git values to summary writer via env, never JS interpolation ([24c4a2d](https://github.com/agentic-development/adev-plugin/commit/24c4a2d44dcc80b8be4e1fcf7c2f236d38ca8ec0))
* **session-capture:** pass git values to summary writer via env, never JS interpolation ([7766e3a](https://github.com/agentic-development/adev-plugin/commit/7766e3a5169df3fa0d21081f3f00ec740372e624))
* **spec-lifecycle:** correct status-counting description in amendment; strengthen amendment tests ([70284d8](https://github.com/agentic-development/adev-plugin/commit/70284d8f7a14f67ca9cd4d9bff5433e5d7ce741e))
* **templates:** emit frontmatter before the H1 in all six spec templates ([b7072e8](https://github.com/agentic-development/adev-plugin/commit/b7072e8674eecab208e115afea46539f44845ae7))
* **templates:** emit frontmatter before the H1 in all six spec templates ([d7d3786](https://github.com/agentic-development/adev-plugin/commit/d7d3786da1bb70b0d964f2949fcf0f1f4feafdde))
* **test-strategies:** address second-opinion review findings on gaming gate ([9c5e8a4](https://github.com/agentic-development/adev-plugin/commit/9c5e8a4002f1f76e6bd0bba4e60340768b729971))
* **test-strategies:** guard malformed escalation_rules shape in parseTestPolicy ([5ad5132](https://github.com/agentic-development/adev-plugin/commit/5ad513203a1dfea4cafbaf0ec909658f59893879))
* **test-strategies:** reject invalid escalation-rule depth values in resolveTestDepth ([09f5a70](https://github.com/agentic-development/adev-plugin/commit/09f5a70ecc734aa1e801a193556714944334758a))
* **test-strategies:** renumber ADR 0016 -&gt; 0017 to avoid collision with main ([4f96870](https://github.com/agentic-development/adev-plugin/commit/4f96870f4ee64e8b4fcfa5423d8a6d014b19f88f))
* **test-strategies:** revert plan.md ADR renumbering, restore immutability ([83dc6e5](https://github.com/agentic-development/adev-plugin/commit/83dc6e5a5bee5f9b4ca95fec452e5310971669ad))
* **test-strategies:** scope readTaskFiles to Files:/Tests: fields, skip fenced-code headings ([f48cd65](https://github.com/agentic-development/adev-plugin/commit/f48cd654fc2dee29a851a5c0d061a1be44409092))
* **test-strategies:** stop the 500KB gaming-gate test tripping Linux's MAX_ARG_STRLEN ([16c5e54](https://github.com/agentic-development/adev-plugin/commit/16c5e5425478ba7334038e064e978d2317afd017))
* **test-strategies:** sync charter revision counter; wire dimensions into test_depth_assigned/explain ([6a2a2cb](https://github.com/agentic-development/adev-plugin/commit/6a2a2cb3f07ff3b13426e3c76f40a571719e3a4a))
* **test-strategies:** un-export oversized CLAUDE_TOOL_INPUT_* before spawning anything ([076545e](https://github.com/agentic-development/adev-plugin/commit/076545ef8ca86ef044db68ccb1fb60f4b25283e8))
* **test:** discover tests in Node instead of a shell glob ([48a7a45](https://github.com/agentic-development/adev-plugin/commit/48a7a4526def76c2968a2e7e50c38d0a66cf8c46))
* **test:** discover tests in Node instead of a shell glob (77 of 416 files never ran) ([c0a4356](https://github.com/agentic-development/adev-plugin/commit/c0a4356926fb6c73821da6eb8b74ffa78959f449))
* **tests:** run the bucket the runner announces — --evals ran the default set ([b233c9d](https://github.com/agentic-development/adev-plugin/commit/b233c9da1d0989e96eba15820c889129fce605aa))
* **tests:** run the bucket the runner announces — --evals silently ran the default set ([c80847d](https://github.com/agentic-development/adev-plugin/commit/c80847ddda7a9c9df339001da0343f3e76351bed))
* **unified-gates:** position-aware path severity and precise CI matching ([504c8cb](https://github.com/agentic-development/adev-plugin/commit/504c8cbd7a82a37672241a79cab7181d471cbb7b))


### Reverts

* **release:** drop manual version bump, release-please owns this ([f12299d](https://github.com/agentic-development/adev-plugin/commit/f12299deb8a0b03bd118fff82dd28bbadce75813))
* **sample:** drop the /adev:sample --test carve-out, defer to issue-616 ([4730fd3](https://github.com/agentic-development/adev-plugin/commit/4730fd31be4b9771855370ea22445abae5eec46f))

## [0.27.9-next](https://github.com/agentic-development/adev-plugin/compare/adev-cli-v0.27.8...adev-cli-v0.27.9-next) (2026-08-10)


### Features

* add worktree-parallelization feature charter ([f9e2231](https://github.com/agentic-development/adev-plugin/commit/f9e2231035a5d36bebda35f0a3d6993e83888cad))
* **governance:** graduated rigor tiers for review and validate gates ([bdb52cb](https://github.com/agentic-development/adev-plugin/commit/bdb52cb14204cdbb91afd1bc55d6673f96f4cfe0))
* make /adev:work the single front door and conductor ([bfbcd15](https://github.com/agentic-development/adev-plugin/commit/bfbcd15860c8c29b0444188ff4568a45e062b532))
* **skills:** deep-wire conductor continue path and next-step chaining ([5021df2](https://github.com/agentic-development/adev-plugin/commit/5021df2935ec0ce9c17bcb2300c66f7a5b8aff0c))
* **skills:** make /adev:work the single front door and conductor ([b0d0252](https://github.com/agentic-development/adev-plugin/commit/b0d0252cf1f76b58d6bd2c8efef93315cbcbace5))
* **worktree:** /adev:implement --parallel orchestration prose ([c415afd](https://github.com/agentic-development/adev-plugin/commit/c415afd83b24c2eb74259b8c2eb3182fcb723b9d))
* **worktree:** 3-arm equivalence eval harness (run-ab-eval) ([b27c9c1](https://github.com/agentic-development/adev-plugin/commit/b27c9c15d4c9ca4af4341441f516090bb4a72e6b))
* **worktree:** adev parallel CLI verb wiring the orchestration helpers ([39035d9](https://github.com/agentic-development/adev-plugin/commit/39035d9c612b51e1d4628233af9c646c180f7ee2))
* **worktree:** adev-managed git worktrees for parallel isolated execution ([409f2b3](https://github.com/agentic-development/adev-plugin/commit/409f2b3e2d2874c6076ba670b9b7b4a7353b41a0))
* **worktree:** adev-managed worktrees + /adev:implement --parallel + equivalence eval ([8dbc8f7](https://github.com/agentic-development/adev-plugin/commit/8dbc8f70bdfcf2906303fdcf3987c8d37dc7cd08))
* **worktree:** equivalence divergence comparator + determinism gate ([978d78e](https://github.com/agentic-development/adev-plugin/commit/978d78e5a7d8925215972d4c6441d37e260d10f2))
* **worktree:** eval group-selection + orphaned-state checks ([057358f](https://github.com/agentic-development/adev-plugin/commit/057358f7f2cdcc2e605b62315edb5f0d574a82d9))
* **worktree:** eval results renderer + rubric scoring ([feacf98](https://github.com/agentic-development/adev-plugin/commit/feacf98f830cd863c639105d85d49171eb2b7f59))
* **worktree:** managed .adev/worktrees git-ignore block ([59a94f0](https://github.com/agentic-development/adev-plugin/commit/59a94f0770429a116211177dd4f54dd4874b0c7c))
* **worktree:** max_parallel clamp + rerun-collision detection (SEC-2, SEC-5) ([fb95c4e](https://github.com/agentic-development/adev-plugin/commit/fb95c4e90fe2da8337049553caba0b959bca97fb))
* **worktree:** orchestrator baseline record + pollution assertion (SA-2) ([5c8e089](https://github.com/agentic-development/adev-plugin/commit/5c8e0896f1306368ae7de12e8353bba4f9103d39))
* **worktree:** parse Parallelization groups + deterministic merge order ([c9ae3aa](https://github.com/agentic-development/adev-plugin/commit/c9ae3aafa244792f95fc2946e296e95523a954ab))
* **worktree:** per-task completeness verification for parallel groups (SA-1) ([c9d2f24](https://github.com/agentic-development/adev-plugin/commit/c9d2f2400693d553606789dbf014f8fb242f4e8c))


### Bug Fixes

* **implement:** parallel dispatch must be synchronous single-message; wire --fresh ([9f6d232](https://github.com/agentic-development/adev-plugin/commit/9f6d232365c35d2ab445d87de46f5446ca60f4e7))
* **lib:** parseFrontmatter drops frontmatter when a marker/heading precedes the fence ([eb0a948](https://github.com/agentic-development/adev-plugin/commit/eb0a948c11abad097f563a454be8361b1ff6d3c8))
* **lib:** parseFrontmatter drops frontmatter when a marker/heading precedes the fence ([e160bce](https://github.com/agentic-development/adev-plugin/commit/e160bcef99823fd27a73485e9746a00d2617bbe3))
* **review-specs:** pin run_in_background:false on quick-tier reviewer dispatch ([4fe2f18](https://github.com/agentic-development/adev-plugin/commit/4fe2f1813a04749dd40f6d8080a016beb516ca9a))
* **skills:** pin run_in_background:false on all Agent dispatches ([ef856f1](https://github.com/agentic-development/adev-plugin/commit/ef856f1bb3701c656eb275a653a601f741ed48d0))
* **skills:** pin run_in_background:false on all Agent dispatches ([ef84d91](https://github.com/agentic-development/adev-plugin/commit/ef84d9184f73674a1451087560897e9c72fd7fa0))
* **worktree:** harden baseRef against git argument injection (SEC-1) ([728db1e](https://github.com/agentic-development/adev-plugin/commit/728db1e2a2e6b528c7072a81779d76e756942fd0))

## [0.27.8](https://github.com/agentic-development/adev-plugin/compare/adev-cli-v0.27.7...adev-cli-v0.27.8) (2026-06-23)


### Features

* add completion-tokens cross-cutting charter ([7cf2ded](https://github.com/agentic-development/adev-plugin/commit/7cf2dede5414f32275b583c819eabd0426b7756d))
* **agent-reliable-state-artifacts:** add spec_amended canonical event + schema + emitter ([3f74590](https://github.com/agentic-development/adev-plugin/commit/3f74590b2cd76c85ce4eda5a6d733af32c6216ce))
* **cli-driver-surface:** add 'adev specify amend' subcommand ([5ddf09c](https://github.com/agentic-development/adev-plugin/commit/5ddf09c4829626d088fb61523baf4f80069a25ad))
* **cli-driver-surface:** add /adev:specify --amend workflow axis ([4bd810f](https://github.com/agentic-development/adev-plugin/commit/4bd810f1437ec7d097b5793a124c8212c2bea6c1))
* **cli-driver-surface:** add lib/specify-amend.mjs amendment scaffolder ([37e28fa](https://github.com/agentic-development/adev-plugin/commit/37e28fa1151b4d54633e6a52a4cd6e832aa6ff81))
* **completion-tokens:** /goal-friendly terminal completion tokens ([f256c3d](https://github.com/agentic-development/adev-plugin/commit/f256c3d430e6b2f86d31011302cc859d072e4d86))
* **completion-tokens:** add implementation plan (5 TDD tasks) ([20ed686](https://github.com/agentic-development/adev-plugin/commit/20ed6865249743519319aecd5bed3a2e5e7cffa3))
* **completion-tokens:** add Live Spec for terminal completion tokens ([ce94ed8](https://github.com/agentic-development/adev-plugin/commit/ce94ed8a562deb5364ce932cbb72d886495c6180))
* **completion-tokens:** document /goal convention + sync provider mirrors (task 5) ([94683bd](https://github.com/agentic-development/adev-plugin/commit/94683bddabd8f0dd6bb88bf55d25452cb5480503))
* **completion-tokens:** emit ADEV-&lt;SKILL&gt;: &lt;STATE&gt; tokens (tasks 1-4) ([b63d000](https://github.com/agentic-development/adev-plugin/commit/b63d00077d0aebf8380e3962fb15181f8341ecbb))
* **completion-tokens:** review-passed (PASS_WITH_NOTES) ([fb5298f](https://github.com/agentic-development/adev-plugin/commit/fb5298f1b8fe29b7d721cb45d9c84ed7ccd86d88))
* **completion-tokens:** stamp source-manifest, status implemented ([a80c712](https://github.com/agentic-development/adev-plugin/commit/a80c712483d65f333d73a8d5da5da1e2b137140d))
* **completion-tokens:** validated PASS ([5d68da5](https://github.com/agentic-development/adev-plugin/commit/5d68da52360e67ea02b24f0ee3963348f98767a1))
* first-class spec amendments (amends: relationship overlay) ([07ad46c](https://github.com/agentic-development/adev-plugin/commit/07ad46c3edaacc3e13c8ea963a1f9f1e8a085e87))
* **lifecycle-artifacts:** document amends/target-revision frontmatter contract ([272156b](https://github.com/agentic-development/adev-plugin/commit/272156bb9189cc9cb0374cd82aa596854171c2a9))
* **skills:** wire universal Load Skill Extensions block into 30 SKILL.md files ([f8f6982](https://github.com/agentic-development/adev-plugin/commit/f8f69829f105f7ac392434c6d39705af75f72f85))
* **spec-lifecycle:** traverse amends graph in status + hygiene with effective-revision ([5c846b9](https://github.com/agentic-development/adev-plugin/commit/5c846b98764fe412cdb5cf9cdca513e46b23c296))


### Bug Fixes

* **context:** restore spec frontmatter machine-readability + refresh orientation/ADRs ([5ef98c4](https://github.com/agentic-development/adev-plugin/commit/5ef98c43bd5b19fe5b887b7cc260e88289354fbe))
* **docs,test:** restore main to green after batch merge ([6e87379](https://github.com/agentic-development/adev-plugin/commit/6e873795c178425454de84e82d2a579487b9a3ec))
* **docs,test:** restore main to green after batch merge ([3c82ff1](https://github.com/agentic-development/adev-plugin/commit/3c82ff19daf81ec197052ceddaf1a9eefe08dee7))
* **init:** distinguish scaffolded-but-unconfigured context index from existing project ([1be8ad3](https://github.com/agentic-development/adev-plugin/commit/1be8ad3fa4f876baec709bb02f26b81fc5bb0031))
* **init:** don't flag a freshly-scaffolded context index as an existing project ([5f9aa5f](https://github.com/agentic-development/adev-plugin/commit/5f9aa5f59c3c6aa926e37a744e4c68844331afd7))
* **lifecycle-state:** self-derive plugin root for severity stamping ([ed23f6a](https://github.com/agentic-development/adev-plugin/commit/ed23f6aeda2d9fc3efa68f6d0b42f818a5650161))
* **lifecycle-state:** self-derive plugin root for severity stamping ([ddfdae4](https://github.com/agentic-development/adev-plugin/commit/ddfdae4ea1a343daaab6d696df35cfbf3bf70075))
* **repomap:** exclude .claude/ worktrees from symbol index + codehealth report ([e390412](https://github.com/agentic-development/adev-plugin/commit/e390412471a8a189d9354769439c5962ac9d8ad5))
* **spec-lifecycle:** derive validated status from SPEC_STATUSES enum index ([8197229](https://github.com/agentic-development/adev-plugin/commit/8197229bccda0d73cab68d68b4669ef1cf032690))

## [0.27.7](https://github.com/agentic-development/adev-plugin/compare/adev-cli-v0.27.6...adev-cli-v0.27.7) (2026-05-29)


### Bug Fixes

* **build:** remove hardcoded model: claude-sonnet-4-6 from frontmatter ([99ff246](https://github.com/agentic-development/adev-plugin/commit/99ff246bebab3765cd16cb313b06854010544f52))
* **implement:** remove context: fork to restore subagent dispatch ([bc5a8d9](https://github.com/agentic-development/adev-plugin/commit/bc5a8d9135acbec349461c4463101052824e06d9))
* **implement:** remove context: fork to restore subagent dispatch capability ([b822488](https://github.com/agentic-development/adev-plugin/commit/b8224889b2188727f71bd80d0361df075357ffe2))
* **skills:** guard build and implement against recursive worktree nesting ([eba1483](https://github.com/agentic-development/adev-plugin/commit/eba1483dabf7a6891e57488a58ca2335a7380e35))
* **skills:** guard build and implement against recursive worktree nesting ([074087e](https://github.com/agentic-development/adev-plugin/commit/074087e9abaeca32bee192b18d66cceaef439ab8))

## [0.27.6](https://github.com/agentic-development/adev-plugin/compare/adev-cli-v0.27.5...adev-cli-v0.27.6) (2026-05-26)


### Bug Fixes

* **install:** show picker menu and ship bundled domain extensions ([5b9a75f](https://github.com/agentic-development/adev-plugin/commit/5b9a75fc037a7e79044f9aaa3df9364b23e8df1b))
* **install:** show picker menu and ship bundled domain extensions ([1b0366f](https://github.com/agentic-development/adev-plugin/commit/1b0366fc082cdb213fd8153b82fda322c2a1f2b9))

## [0.27.5](https://github.com/agentic-development/adev-plugin/compare/adev-cli-v0.27.4...adev-cli-v0.27.5) (2026-05-26)


### Features

* **session-awareness:** add adev report --type cost-checkpoint CLI arm ([b89feb1](https://github.com/agentic-development/adev-plugin/commit/b89feb13ec06ae0f8782b13f6314a92bf0a958e0))
* **session-awareness:** add cost_checkpoint to CANONICAL_EVENTS ([9da353d](https://github.com/agentic-development/adev-plugin/commit/9da353d456c51a2f0f879cb1aa07be8076fe7fa0))
* **session-awareness:** add cost_checkpoint to REQUIRED_FIELDS_BY_EVENT ([de35bda](https://github.com/agentic-development/adev-plugin/commit/de35bda2318c5f7c008d8bd0440668a1458e3d88))
* **session-awareness:** add reportCostCheckpoint emitter to lifecycle-state ([594f030](https://github.com/agentic-development/adev-plugin/commit/594f030fa2f71d9d664ebe4d1c89a9a89645bbc8))
* **session-awareness:** decompose cost-checkpoint-events spec into 7 TDD tasks ([0f1cf1d](https://github.com/agentic-development/adev-plugin/commit/0f1cf1db9e0404fcb7efba9fcc5564544bc843bf))
* **session-awareness:** embed per-step cost into step_completed via --from-summary ([bd684f0](https://github.com/agentic-development/adev-plugin/commit/bd684f0a30fa39bfa8a956fc7b91b3d82ae207f2))
* **session-awareness:** wire cost-checkpoint persistence into build skill step 6 ([2544478](https://github.com/agentic-development/adev-plugin/commit/25444781705b31845019702077a7f0fa2671a8b0))

## [0.27.4](https://github.com/agentic-development/adev-plugin/compare/adev-cli-v0.27.3...adev-cli-v0.27.4) (2026-05-24)


### Bug Fixes

* **release:** document npm token rotation requirement ([32cf2ee](https://github.com/agentic-development/adev-plugin/commit/32cf2ee086a572c91478853aa7aff84770230246))
* **release:** document npm token rotation requirement ([3725660](https://github.com/agentic-development/adev-plugin/commit/3725660f6ac3ee597d1de14e4950d6eef787f890))

## [0.27.3](https://github.com/agentic-development/adev-plugin/compare/adev-cli-v0.27.2...adev-cli-v0.27.3) (2026-05-23)


### Features

* **build:** integrate adev cost summary ticker between pipeline steps ([9af2cc5](https://github.com/agentic-development/adev-plugin/commit/9af2cc50365d2c785d639a11a5cf5ef18860e884))
* **cli:** register adev cost verb in VERB_REGISTRY ([2043a5a](https://github.com/agentic-development/adev-plugin/commit/2043a5aa6bc27635c189d38e0de8db757036d070))
* **session-awareness:** add cost summary CLI verb module ([6c79689](https://github.com/agentic-development/adev-plugin/commit/6c796891bb9f59231974cd33b96134948a6e42a1))
* **session-awareness:** add cost-summary aggregator library ([6a43934](https://github.com/agentic-development/adev-plugin/commit/6a439341c10111bf40be8be7fc6ca6234035e8d8))
* **session-awareness:** add cost-summary text and JSON formatters ([63f0ad0](https://github.com/agentic-development/adev-plugin/commit/63f0ad0d18820b12423195108aef521e2eb757eb))
* **session-awareness:** per-spec cost ticker between /adev:build steps ([a84be4d](https://github.com/agentic-development/adev-plugin/commit/a84be4d4367ec727b53519146d399b0c26b0f6aa))
* **setup:** add adev init ensure-gitignore [--remove] sub-verb ([53d5bca](https://github.com/agentic-development/adev-plugin/commit/53d5bcaca93e87ace5139693ca932427a6852efa))
* **setup:** add MANAGED_GITIGNORE_PATHS canonical list ([e2dbe05](https://github.com/agentic-development/adev-plugin/commit/e2dbe05ae24660f2cf8db6164c3692030b78933e))
* **setup:** adev-managed .gitignore block + ensureManagedBlock installer ([1e2a485](https://github.com/agentic-development/adev-plugin/commit/1e2a4855da50b64f22d46866cfda3cbdec0adb59))
* **setup:** implement ensureManagedBlock / removeManagedBlock ([a7f7437](https://github.com/agentic-development/adev-plugin/commit/a7f7437582b908af5749d4c12bb88c81fe93d011))
* **setup:** wire ensureManagedBlock into adev install/upgrade ([6dac1ec](https://github.com/agentic-development/adev-plugin/commit/6dac1ec494dd125acefd5d01246e924fe49ea19b))

## [0.27.2](https://github.com/agentic-development/adev-plugin/compare/adev-cli-v0.27.1...adev-cli-v0.27.2) (2026-05-21)


### Features

* **agent-reliable-state-artifacts:** add canonical blocker_id emitter ([8adbac6](https://github.com/agentic-development/adev-plugin/commit/8adbac6a50b1105b4a07ded5444a3814ad31bd54))
* **agent-reliable-state-artifacts:** add spec_revised + human_approval_required event variants ([d84c543](https://github.com/agentic-development/adev-plugin/commit/d84c5434639e9ff18d23fb33c06f866f94207f4d))
* **agent-reliable-state-artifacts:** charter rev 8 — sidecar pattern + per-revision events ([fb68e73](https://github.com/agentic-development/adev-plugin/commit/fb68e73bf491235852a9e89bc4252f637e20064c))
* **agent-reliable-state-artifacts:** expose state.steps.&lt;step&gt;.byRevision[N] ([53c1f45](https://github.com/agentic-development/adev-plugin/commit/53c1f45000a8c2359429cdb5c0809f77dc007e63))
* **agent-reliable-state-artifacts:** key .blockers.md entries by canonical blocker_id ([90604b2](https://github.com/agentic-development/adev-plugin/commit/90604b2c68bbc7df0e3c2e2b73d1e68e38d858ce))
* **cli-driver-surface:** add adev specify revise CLI verb ([1da9b0d](https://github.com/agentic-development/adev-plugin/commit/1da9b0dc665a5628fabf2af414838d60aad15d4e))
* **cli:** add 'adev implement read-routing' verb ([5544b4c](https://github.com/agentic-development/adev-plugin/commit/5544b4c81c41abbe9f9f864840f3fb3ceb8319d8))
* **cli:** add 'adev retro session-activity' verb ([f60143e](https://github.com/agentic-development/adev-plugin/commit/f60143e2748d41cb418775ea668a5d6270c02696))
* **cli:** add 'adev route emit-sidecar' verb ([1335b21](https://github.com/agentic-development/adev-plugin/commit/1335b2170f61c5495d99480622259b8e548415f4))
* **cli:** add adev init prompt session-capture verb ([77ad1b7](https://github.com/agentic-development/adev-plugin/commit/77ad1b7b58bfbe1de34ee28b0e322869fbb3890d))
* **cli:** final report, manifest-update prompt, and cleanup for issues migrate ([539c337](https://github.com/agentic-development/adev-plugin/commit/539c337f6c4a43f74c51f9790011238ee6fbbcd5))
* **cli:** implement dry-run path for issues migrate ([be45ed6](https://github.com/agentic-development/adev-plugin/commit/be45ed61b3b1d4772cea65e9fe42619c7e5e54b3))
* **cli:** implement live migration loop with resumable partial-failure ([a133385](https://github.com/agentic-development/adev-plugin/commit/a1333856c380959fea5a6eaaf40d7c510198968c))
* **cli:** installer dispatch by integrations.session_capture.capture ([928ba39](https://github.com/agentic-development/adev-plugin/commit/928ba39228a149a714ede77b1aa88565c2fe3b81))
* **cli:** parse arguments and validate environment for issues migrate ([47f0755](https://github.com/agentic-development/adev-plugin/commit/47f0755a54b7d6a7442b69337dd87334e3ba6c04))
* **cli:** read source backend and apply scope filter ([4978c40](https://github.com/agentic-development/adev-plugin/commit/4978c40cf7f2a7180ad618b57b33a78b18e4e099))
* **cli:** replay dependency edges with out-of-scope warnings ([6060f9c](https://github.com/agentic-development/adev-plugin/commit/6060f9c4b350194989ff48410f966286de992615))
* **cli:** scaffold issues verb with migrate sub-verb ([9b27847](https://github.com/agentic-development/adev-plugin/commit/9b27847ecf264c72497a1d7e6ebfa19a38db50f7))
* **copilot-provider:** add CopilotAdapter install/uninstall/status ([83436f7](https://github.com/agentic-development/adev-plugin/commit/83436f72eece558a33078c157bc6bec2c75354e5))
* **copilot-provider:** add hook-config rewriter (absolute and placeholder to ./scripts/) ([cd62244](https://github.com/agentic-development/adev-plugin/commit/cd62244415f7017ba3b257a4fe7797b3729c09a0))
* **copilot-provider:** add pre-copy symlink scanner ([d55387f](https://github.com/agentic-development/adev-plugin/commit/d55387f8aa5f97cf1faaaaf6951adf1f470e7058))
* **copilot-provider:** add renderCopilotInstructions with SHA-256 tamper-evidence + overflow + dangerous-pattern guardrail ([7c855ac](https://github.com/agentic-development/adev-plugin/commit/7c855ac8f6b3928e084b3287a008cbc24d14a291))
* **copilot-provider:** add renderModuleInstruction with slug/path validation + YAML escaping ([81842a4](https://github.com/agentic-development/adev-plugin/commit/81842a44ba52486a2505426bf98aec27bce4c444))
* **copilot-provider:** add skill-name validator with NFC + regex + frontmatter checks ([5151606](https://github.com/agentic-development/adev-plugin/commit/5151606001a8706ad565f3221166943548d37a47))
* **copilot-provider:** add syncCopilot dispatcher with input caps + path-confinement + atomic write ([86fa159](https://github.com/agentic-development/adev-plugin/commit/86fa15933f24fea018df241d0a4c521ab3591c3f))
* **copilot-provider:** charter + three review-passed specs for GitHub Copilot adapter ([5af6a7c](https://github.com/agentic-development/adev-plugin/commit/5af6a7cf8f2be913453c31baff27e79dd47a145f))
* **copilot-provider:** emit copilot: block in sync summary ([23619c9](https://github.com/agentic-development/adev-plugin/commit/23619c9bec811b72f226c3ff1b602f93551c5871))
* **copilot-provider:** wire adev install/uninstall/status --target copilot ([21caf90](https://github.com/agentic-development/adev-plugin/commit/21caf90c434d33138b4edaa14b1d2b22e1a8d7ca))
* **copilot-provider:** wire format: copilot into /adev:sync dispatcher ([2e40ba6](https://github.com/agentic-development/adev-plugin/commit/2e40ba607d35de1cc04902667faaa1fa1bfa4c3e))
* **cursor-provider:** add Cursor as fourth provider (Specs A–E) ([295f0ad](https://github.com/agentic-development/adev-plugin/commit/295f0adbde59697926511fb9f28752f655fbd540))
* **hooks:** add pre-compact.sh wrapper with SA-2 skip ([32cc041](https://github.com/agentic-development/adev-plugin/commit/32cc04199feaadc5d9612e70bbe448efbc7d547e))
* **hooks:** add session-end.sh wrapper for SessionEnd capture ([61a1740](https://github.com/agentic-development/adev-plugin/commit/61a1740389240e01753f853a28d7fbec677ffc3b))
* **lib/retro:** add aggregateCostTokens sub-helper ([68977a7](https://github.com/agentic-development/adev-plugin/commit/68977a76881154c1df91df5b713d8ae5144bb787))
* **lib/retro:** add bounded non-backtracking body-scan helpers ([96a5d1d](https://github.com/agentic-development/adev-plugin/commit/96a5d1d38c2dab37f4a58c670eea61c7b5a7cb59))
* **lib/retro:** add classifyFormat (hook | post-commit | unknown) ([2ce74a8](https://github.com/agentic-development/adev-plugin/commit/2ce74a878c29d4ee73b9702a2006440f35f25f30))
* **lib/retro:** add countPerSpec sub-helper ([ad2cc14](https://github.com/agentic-development/adev-plugin/commit/ad2cc14432ec9dac41bbb3b9bc94db9c8bcce71d))
* **lib/retro:** add gatherSessionActivity orchestrator core ([bffed39](https://github.com/agentic-development/adev-plugin/commit/bffed391bf375aae03c123637e6b24889e0af0b1))
* **lib/retro:** add issue-id validator (charset + parseId) ([0933749](https://github.com/agentic-development/adev-plugin/commit/09337496600ed62edca5a07f553906ee1f246a19))
* **lib/retro:** add joinClosedIssueXref sub-helper ([9f2c265](https://github.com/agentic-development/adev-plugin/commit/9f2c265277a600588b03a20bbdccce8c5a60be0a))
* **lib/retro:** add parseToolUseDistribution sub-helper ([42bf2c0](https://github.com/agentic-development/adev-plugin/commit/42bf2c0813f3a9062a0ba348b6770c9c38142f07))
* **lib/retro:** add safe YAML frontmatter reader ([55c0e8d](https://github.com/agentic-development/adev-plugin/commit/55c0e8d37f5cb27a0cb77b950713629d77203ab0))
* **lib/retro:** add scanContextGaps sub-helper (frame-anchored) ([38c9147](https://github.com/agentic-development/adev-plugin/commit/38c9147c27fbe74bbcaf527f121233cf7fcd330b))
* **lib:** add plan-routing sidecar writer/reader ([8f8b961](https://github.com/agentic-development/adev-plugin/commit/8f8b9613679f31d6380d5e66630e3127827eab05))
* **lib:** detect inline Routing blocks without sidecar regardless of git history ([dceedd6](https://github.com/agentic-development/adev-plugin/commit/dceedd6a0aaa7c72ef7faea30e57ce343aaf7da6))
* **plan-routing-sidecar:** switch from markdown to JSON before ship ([4d389a1](https://github.com/agentic-development/adev-plugin/commit/4d389a114bd8a00c66353afc92f623cbad5f8351))
* **retro:** classify uncommitted artifacts as durable vs transient ([a66443f](https://github.com/agentic-development/adev-plugin/commit/a66443fabe4bc00dfa746e393336a049a319a6c1))
* **review:** emit canonical blocker_id + section_anchor from reviewer subagents ([039c93b](https://github.com/agentic-development/adev-plugin/commit/039c93be593371736306c1f4cb84240e3f1a02f0))
* **session-awareness:** add detectExistingCapture ([bf269f9](https://github.com/agentic-development/adev-plugin/commit/bf269f9e6870e4997f70eddd4960c13373c14a4a))
* **session-awareness:** add fromTranscript to lib/session-summary.mjs ([d91d833](https://github.com/agentic-development/adev-plugin/commit/d91d833e45c29dae2f5fd18556566ada325becb2))
* **session-awareness:** add redactSecrets to lib/session-summary.mjs ([4fba5e6](https://github.com/agentic-development/adev-plugin/commit/4fba5e67ddb5a63fc50872818d5e7d992a8bdf41))
* **session-awareness:** add runCapture helper for SessionEnd/PreCompact ([d6353d2](https://github.com/agentic-development/adev-plugin/commit/d6353d229e7d9c5375da237e9d8d2020b39b405e))
* **session-awareness:** add validators in lib/session-capture.mjs ([17ff13b](https://github.com/agentic-development/adev-plugin/commit/17ff13bbe9f24e4ca915fe7c21f13be977091e7b))
* **session-awareness:** amend hook-driven-capture spec to rev 4 — optional SessionEnd frontmatter ([de5dc54](https://github.com/agentic-development/adev-plugin/commit/de5dc54a0ff2a2219d691e3d9dd6f55dfb07e26e))
* **session-awareness:** approve charter rev 5 ([f589c1b](https://github.com/agentic-development/adev-plugin/commit/f589c1b2981832561c8fdbb6175e848647d93244))
* **session-awareness:** centralize stderr diagnostic format ([39a3583](https://github.com/agentic-development/adev-plugin/commit/39a358312a1564d2acdb2fd9f8a67e8e4232b8ac))
* **session-awareness:** charter rev 4 — hook-driven capture + retro consumption + init prompt ([cf1f583](https://github.com/agentic-development/adev-plugin/commit/cf1f58328684a1f6a109bdc38f049b7e92da99ba))
* **session-awareness:** plan hook-driven-capture — 22 tasks, TDD-ordered ([f605159](https://github.com/agentic-development/adev-plugin/commit/f60515946fe253650ddcc4ab2b098dc13de5dd99))
* **session-awareness:** plan retro-session-consumption — 18 tasks, TDD-ordered ([9839361](https://github.com/agentic-development/adev-plugin/commit/9839361640a2f0b14804fe3c6cf7e51cc629fe65))
* **session-awareness:** ship hook-driven-capture + retro consumption ([4434cc7](https://github.com/agentic-development/adev-plugin/commit/4434cc7c859bdef1ec236186d89c1be142b01e0a))
* **session-awareness:** write hook-driven-capture.spec.md ([7b4d51d](https://github.com/agentic-development/adev-plugin/commit/7b4d51db897feda2f6319925935e4bf2bb21bd77))
* **session-awareness:** write retro-session-consumption.spec.md ([de226b8](https://github.com/agentic-development/adev-plugin/commit/de226b8f4beacb664b9331351aeefd568e7e1cb6))
* **skills:** /adev:implement reads routing from sidecar instead of plan body ([0900bef](https://github.com/agentic-development/adev-plugin/commit/0900bef0ba9f1095999fd984e3d602b0d18d9af5))
* **skills/retro:** add § 1.8 Session Activity step + remove Step 2 conditional ([28af95d](https://github.com/agentic-development/adev-plugin/commit/28af95de03f44528ac15840d290022c70e9ec68f))
* **skills:** rewrite /adev:route Step 4 to emit sidecar instead of mutating plan ([f81802a](https://github.com/agentic-development/adev-plugin/commit/f81802a3d88121a7943a0991a9e141d9d92e4518))
* **spec-lifecycle:** add --revise workflow axis to /adev:specify ([31ae338](https://github.com/agentic-development/adev-plugin/commit/31ae3383cab7464aeda6b68eb19ac25a548241d7))
* **spec-lifecycle:** add revision-monotonic diagnostic for --revise writes ([fbe9035](https://github.com/agentic-development/adev-plugin/commit/fbe903568b500991af5125757710dce2eacf4680))
* **spec-lifecycle:** add specify-revise companion library ([b9ffc74](https://github.com/agentic-development/adev-plugin/commit/b9ffc74e439b95ff549b66e9b498248e5bad637a))
* **strategic-planning:** add loop-convergence detector ([6d642ee](https://github.com/agentic-development/adev-plugin/commit/6d642ee6d20eb942cc195f843a067a879be14676))
* **strategic-planning:** flip build.max_review_retries default to 2 and validate at load ([9e58a27](https://github.com/agentic-development/adev-plugin/commit/9e58a27dc56dec38a46c6edc2f042a6a19f32838))
* **strategic-planning:** reinstate BLOCK-&gt;revise auto-retry loop in /adev:build ([cce30c7](https://github.com/agentic-development/adev-plugin/commit/cce30c7b7ded0408563743a247a7c3d2ea07f52e))
* **strategic-planning:** render byRevision history in /adev:status and /adev:retro ([ca91483](https://github.com/agentic-development/adev-plugin/commit/ca91483f610fe0ea1cf60d65f941d457dc3dce51))
* **task-management:** add backend-migration CLI verb ([77607cb](https://github.com/agentic-development/adev-plugin/commit/77607cbdf060445fdb4c242e0b99e5f9c01d8fee))


### Bug Fixes

* **build:** remove broken blocker-fix loop — write sidecar + fail loud ([5ec433c](https://github.com/agentic-development/adev-plugin/commit/5ec433ca38a1e85c0fca0bdf0004eac08e5fc43f))
* **build:** Step 0 specify-skip reads lifecycle log instead of dispatching --revise ([a29a95d](https://github.com/agentic-development/adev-plugin/commit/a29a95d16fd0f55f6859c666c0246dc1ee1db7d2))
* **githooks:** prepare-commit-msg appends trailers in same paragraph ([45f5dbd](https://github.com/agentic-development/adev-plugin/commit/45f5dbd154039cd3ce0cc9d92e789fcc52ec9b7d))
* lifecycle cleanup (provenance hook, build orchestrator) + sidecar foundation ([8e7d782](https://github.com/agentic-development/adev-plugin/commit/8e7d782fb444f4f83dbe206d216623bf7fbdb52a))
* **plan-immutability:** block inline routing annotations via PreToolUse hook ([9167f33](https://github.com/agentic-development/adev-plugin/commit/9167f339527b23386f4d967112cbbe657da07298))
* **plan-immutability:** block inline routing in plan bodies via PreToolUse hook ([748cab4](https://github.com/agentic-development/adev-plugin/commit/748cab4b53f1b71e4c300decd8e23d66304447f1))
* **session-awareness:** correct token-pricing table + add Opus 4.7 ([e69cc06](https://github.com/agentic-development/adev-plugin/commit/e69cc06e680efb9a1726a32fc64d3046337930f0))
* **session-awareness:** hook-driven-capture spec rev 3 — address SEC-9, SEC-10 ([d6ca1b2](https://github.com/agentic-development/adev-plugin/commit/d6ca1b25f6ebccaeb25a02a97b583c9ae75630fe))
* **session-awareness:** hook-driven-capture spec rev 3 — address SEC-9, SEC-10 ([d2abf0f](https://github.com/agentic-development/adev-plugin/commit/d2abf0fc7bb1489b27386002bd62043819aae98a))
* **session-awareness:** hook-driven-capture spec rev 5 — address SEC-12, SEC-13 ([d6ca1b2](https://github.com/agentic-development/adev-plugin/commit/d6ca1b25f6ebccaeb25a02a97b583c9ae75630fe))
* **session-awareness:** revise hook-driven-capture spec to rev 2 ([3158b5a](https://github.com/agentic-development/adev-plugin/commit/3158b5aba047a9b14da968e31910e231875b4b54))
* **spec-drift-detection:** idempotent stampDrift to eliminate PR JSONL conflicts ([a108b5f](https://github.com/agentic-development/adev-plugin/commit/a108b5fb6261177ebadc366a2565964c9ffe754e))
* **spec-drift-detection:** make stampDrift idempotent on the JSONL side ([05324ae](https://github.com/agentic-development/adev-plugin/commit/05324ae80c0f05f9d6be82fa60fe27c6b7ea12fc))


### Reverts

* **agent-reliable-state-artifacts:** restore orphan-lock-cleanup plan to first-pending state ([c9a6c94](https://github.com/agentic-development/adev-plugin/commit/c9a6c94fdcc22a22065985ad5b0f154a93ef7764))
* **gitignore:** drop session-capture paired-marker block ([c185323](https://github.com/agentic-development/adev-plugin/commit/c185323358f0c9d1a9b5a7cc0830caa815636cd8))
* **session-awareness:** restore hook-driven-capture plan to first-pending state ([70c3ca3](https://github.com/agentic-development/adev-plugin/commit/70c3ca3549d5889723c7b501df0279e432aca12b))

## [0.27.1](https://github.com/agentic-development/adev-plugin/compare/adev-cli-v0.27.0...adev-cli-v0.27.1) (2026-05-19)


### Features

* **0.27.0:** ship milestone — orphan-lock + post-commit self-skip + board audit ([b7b7889](https://github.com/agentic-development/adev-plugin/commit/b7b788929357ed199d5472dfed2a12b4e0d4ecf3))
* **agent-reliable-state-artifacts:** stamp orphan-lock-cleanup as implemented ([83c9fc8](https://github.com/agentic-development/adev-plugin/commit/83c9fc82dab5d029fc3acdc957773007aa15fb0b))
* **hooks:** self-skip post-commit on sessions-only commits ([4b4b6f5](https://github.com/agentic-development/adev-plugin/commit/4b4b6f519fc306e64f605302f668602d4730c92a))


### Bug Fixes

* **repomap:** include .mjs in typescript extensions + docs refresh ([e98d422](https://github.com/agentic-development/adev-plugin/commit/e98d422b0f364f3c4345c3b242fbf11d039c039b))

## [0.27.0](https://github.com/agentic-development/adev-plugin/compare/adev-cli-v0.26.0...adev-cli-v0.27.0) (2026-05-18)


### ⚠ BREAKING CHANGES

* **agent-reliable-state-artifacts:** the on-disk tasks.json document now carries a `seq` field when written by this adapter. Legacy tasks.json files without seq are upgraded transparently on first mutation; no adev migrate invocation needed. External tooling that reconstructs tasks.json from a parsed shape must preserve the seq field (drop-unknown-top-level-keys rule has a documented exception).

### Features

* add cursor-provider feature charter ([1d5ba77](https://github.com/agentic-development/adev-plugin/commit/1d5ba771eee35160ad228142c438147e0fb7dbe4))
* **agent-reliable-state-artifacts:** CAS over atomic rename for JSON issue board ([517e9d6](https://github.com/agentic-development/adev-plugin/commit/517e9d6375a32ef2dc9e38abb984620623f3ab4f))
* **agent-reliable-state-artifacts:** reportPartialRecovery + partialRecoveries[] projection ([d77db59](https://github.com/agentic-development/adev-plugin/commit/d77db59e0b150819159003c3eba0aa8e9df5cbf2))
* **cli-driver-surface:** adev partial {detect,resume,discard,inspect} verbs ([8dae15e](https://github.com/agentic-development/adev-plugin/commit/8dae15e32fbf9e555cfb52374b3c7346ec5bc57c))
* **cross-cutting:** incremental artifact writes (.partial + atomic-rename) ([39a4c14](https://github.com/agentic-development/adev-plugin/commit/39a4c146c1aed14aeb6446ca70fb8add3ecbd408))
* **cursor-provider:** add Cursor IDE provider adapter charter ([b720758](https://github.com/agentic-development/adev-plugin/commit/b72075883775d2162ec4e916e7e7b333bf5c4502))
* **cursor-provider:** add drift test for cursor hooks generator ([b4a332a](https://github.com/agentic-development/adev-plugin/commit/b4a332a16026defcea2137fbcbc2ba23f0ea891b))
* **cursor-provider:** add TRANSLATION_TABLE and timeout constants for cursor hooks generator ([019494e](https://github.com/agentic-development/adev-plugin/commit/019494ef507452441d605788bc5eb046c3b8468c))
* **cursor-provider:** approve charter (status: approved, rev 2) ([bcf6565](https://github.com/agentic-development/adev-plugin/commit/bcf6565dd6ee6b0489d4f095bbd721cf83d1c4f1))
* **cursor-provider:** commit initial providers/cursor/hooks.json ([f5fa465](https://github.com/agentic-development/adev-plugin/commit/f5fa465d1c91f9a078dab2dd54b167e4e66e8ed1))
* **cursor-provider:** hook config generator + drift test + coverage assertion (Spec C) ([4cd8852](https://github.com/agentic-development/adev-plugin/commit/4cd8852ddd6cebb40ad276f998877fb97bbf7aa9))
* **cursor-provider:** implement buildCursorHooks transform with atomic write ([be2229d](https://github.com/agentic-development/adev-plugin/commit/be2229d99ca48babafc1f27eacbb78a83ac6e3a7))
* **cursor-provider:** incorporate reviewer notes ([27177d9](https://github.com/agentic-development/adev-plugin/commit/27177d955ec1d39e4a95ce08af68c7eb0ea113c0))
* **cursor-provider:** stamp source manifest; flip spec/charter to implemented ([8bdba98](https://github.com/agentic-development/adev-plugin/commit/8bdba988eb51716621fe0976308a69c4012cc384))
* **cursor-provider:** wire build:cursor-hooks npm script ([ed77384](https://github.com/agentic-development/adev-plugin/commit/ed77384ba6c9a08096f07a8de8d2f59f3c4d844f))
* **design:** add Spec Organization Plan to brainstorm Step 8 ([6183c08](https://github.com/agentic-development/adev-plugin/commit/6183c085e321dff1d5d8c16b863c3fe501e34d4f))
* **design:** brainstorm Step 8 capability grouping (issue-338) ([3a1ce65](https://github.com/agentic-development/adev-plugin/commit/3a1ce65650999ba36eb46ab2a409812af8f6c830))
* **design:** spec brainstorm Step 8 capability grouping suggestions ([f4c81ca](https://github.com/agentic-development/adev-plugin/commit/f4c81cabe63051feb4beec0209ff899d1e813e9a))
* **extensions:** extension authoring docs bundle (issue-485) ([0368c6e](https://github.com/agentic-development/adev-plugin/commit/0368c6ec99aef8cde707f1fefc796ad78f6093a1))
* **output-personas:** add verbosity overlay templates ([7113bbb](https://github.com/agentic-development/adev-plugin/commit/7113bbb1d8d7ba381a45cdbb8c3196ca3f1cf53b))
* **output-personas:** calibrated Architect template trim ([c8b7fa2](https://github.com/agentic-development/adev-plugin/commit/c8b7fa292c4bb76b44cf480c7772ca06e66ee109))
* **output-personas:** extend lib/persona.mjs with verbosity axis ([712abd6](https://github.com/agentic-development/adev-plugin/commit/712abd6c1031b6068f3f132bfed47a8f0e66394d))
* **output-personas:** persona x verbosity grouping in JSONL analysis (GREEN) ([88056e7](https://github.com/agentic-development/adev-plugin/commit/88056e7f46c60a6220e0490acd0c0c917a66bcff))
* **output-personas:** universal anti-redundancy rule ([1f50700](https://github.com/agentic-development/adev-plugin/commit/1f50700a2f70bfd68ffed401d45f47fa6a570ea2))
* **output-personas:** verbosity axis + output trimming ([0533412](https://github.com/agentic-development/adev-plugin/commit/05334125bc4bc7364f25c58367f86b7a420f53fe))
* **output-personas:** wire session-start hook to concatenate persona + verbosity ([a630e89](https://github.com/agentic-development/adev-plugin/commit/a630e89cad2d71fdeef143da08878030fd7b6f2c))
* **partial-artifacts:** findPartials + isPartialStale ([10dc414](https://github.com/agentic-development/adev-plugin/commit/10dc4147cfb1b93da0b56baeb438ed62511aa02a))
* **partial-artifacts:** helper skeleton — partialPath, lockPath, commitPartial, assertWithin ([f60848c](https://github.com/agentic-development/adev-plugin/commit/f60848c3878ebc59236d3996d608222b8254415f))
* **partial-artifacts:** lock acquire + steal-on-stale (closes SA-10, SA-11, SEC-7) ([ad9976c](https://github.com/agentic-development/adev-plugin/commit/ad9976cac9fb447c15f5d1ff479b4f8bb663cf42))
* **partial-artifacts:** manifest knobs (lifecycle.partial_* family, closes CON-9) ([61b7f68](https://github.com/agentic-development/adev-plugin/commit/61b7f6884b8b9773ce7d6d76e0c3221ca692e1d2))
* **partial-artifacts:** schema-marker grammar + allowlist (closes SEC-6, CON-12) ([ab5e59f](https://github.com/agentic-development/adev-plugin/commit/ab5e59f00e6b32048502f73ed23000f639c69432))
* **partial-artifacts:** wire PARTIAL_ARTIFACT_OVERSIZE per-append guard ([682034f](https://github.com/agentic-development/adev-plugin/commit/682034f479ef02d3fa054184454709f9136f3aa2))
* **spec-drift-detection:** canonicalize code_drift_detected/code_drift_cleared in lifecycle-event-log ([d23a57b](https://github.com/agentic-development/adev-plugin/commit/d23a57b157645b03c4221a6f8e880ae2f5980ab8))
* **spec-drift-detection:** charter rev 3 - promote multi-file drift tracking, rewrite invariant 4 (Step 5) ([5f9fd0b](https://github.com/agentic-development/adev-plugin/commit/5f9fd0be1f095d0d1341322c26f52d5af420899b))
* **spec-drift-detection:** clearDrift appends code_drift_cleared event ([af85e10](https://github.com/agentic-development/adev-plugin/commit/af85e10bcce2667e59fd3a2e621a3a1efcc03b57))
* **spec-drift-detection:** JSONL drift events — eliminate spurious merge conflicts (closes issue-516) ([05d4f46](https://github.com/agentic-development/adev-plugin/commit/05d4f462d148997a060077b3da63591693d2133b))
* **spec-drift-detection:** one-shot migrate-drift-fields script (Step 4) ([c482bb6](https://github.com/agentic-development/adev-plugin/commit/c482bb686ed12fc08e01884cc19b2d4bb294da69))
* **spec-drift-detection:** stampDrift appends code_drift_detected event with canonicalized path ([71c6343](https://github.com/agentic-development/adev-plugin/commit/71c6343258beafdb6770bab21ad69b1331345cad))
* **spec-drift-detection:** stop writing drift_source/drift_at to frontmatter (Step 3) ([9cc9724](https://github.com/agentic-development/adev-plugin/commit/9cc97245e26c61065ff728d6708caddd8a29f7e9))
* **spec-drift-detection:** update skill prose for JSONL drift model (Step 6) ([e380f71](https://github.com/agentic-development/adev-plugin/commit/e380f71664b7a6fc85ba4c675ad3d512387081d4))
* **spec-drift-detection:** verify check-drift sources from JSONL (Step 2) ([70cf0a2](https://github.com/agentic-development/adev-plugin/commit/70cf0a23ccdd62ced967c4cb53acbb3d269d3160))
* **tree-sitter-repomap:** implement non-code reference detection ([f40761d](https://github.com/agentic-development/adev-plugin/commit/f40761d22db669004e15dd9f37b76ebdb3b379f6))
* **tree-sitter-repomap:** live spec — non-code reference detection ([cba8920](https://github.com/agentic-development/adev-plugin/commit/cba8920a6f7f21fb9aac04dc5e49ea5fa58076ae))
* **tree-sitter-repomap:** live spec — non-code reference detection ([9141699](https://github.com/agentic-development/adev-plugin/commit/914169982151a332fdfc1ced6fea62c657664507))
* **tree-sitter-repomap:** plan — non-code reference detection (9 tasks) ([f580fc5](https://github.com/agentic-development/adev-plugin/commit/f580fc5e897755b5ce47ec41fd7ac171d5264bc1))
* **validation:** single-source validate config + check-set restructure ([7052db6](https://github.com/agentic-development/adev-plugin/commit/7052db6969b2bea125dc9970e46dc39935c672be))


### Bug Fixes

* **cli-driver-surface:** source-manifest verify recognizes H1-prefixed specs ([f74c36e](https://github.com/agentic-development/adev-plugin/commit/f74c36eff9a8042114057b52a278a397502cb811))
* **cli-driver-surface:** source-manifest verify recognizes H1-prefixed specs ([655dbd8](https://github.com/agentic-development/adev-plugin/commit/655dbd8ba5f1bb771b840f1a9ece7a120f7afece))
* **cli-driver-surface:** specify and implement emit verdict on step completion ([df3e3b2](https://github.com/agentic-development/adev-plugin/commit/df3e3b2b619af001dcd9497f294dca89d67fd5a4))
* **cli-driver-surface:** specify and implement emit verdict on step completion ([2f675a8](https://github.com/agentic-development/adev-plugin/commit/2f675a8316f0ac7523a223bcdc0d7454d27d4383))
* **docs:** tasks.md → tasks.json in hooks.md broken link ([466af87](https://github.com/agentic-development/adev-plugin/commit/466af87111b0f76b2f565879df9c5a03bb27a635))
* **hooks:** merge-guard blocks git merge only when current branch is protected ([be70e3d](https://github.com/agentic-development/adev-plugin/commit/be70e3d6756943862d14ad4e11db6417a89c6395))
* **hooks:** merge-guard blocks git merge only when current branch is protected ([e4b6859](https://github.com/agentic-development/adev-plugin/commit/e4b685993244cb9c7a6b53d816e7e14cb7df7410))
* **lifecycle-artifacts:** backfill kind: discriminator on 6 cli-driver-surface specs ([ee9dea0](https://github.com/agentic-development/adev-plugin/commit/ee9dea0be0dd0d5cc78f48924f6e2c0b11ef33f9))
* **lifecycle-artifacts:** specify emits lifecycle events for all 5 modes ([9566038](https://github.com/agentic-development/adev-plugin/commit/95660388ed1587c6ce2f8dec229df73f026b53da))
* **lifecycle-artifacts:** specify emits lifecycle events for all 5 modes ([1f88e9c](https://github.com/agentic-development/adev-plugin/commit/1f88e9cd68f6f40cb7b814d38720412bd45e5c3e))
* **maintenance:** plan-immutability detector honors manifest exempt-commit list ([9f9f93d](https://github.com/agentic-development/adev-plugin/commit/9f9f93d9d53280780a99f7309b33cc06a379a188))
* **tests:** retry cleanupTempDir to absorb ENOTEMPTY race on macOS ([511f7e9](https://github.com/agentic-development/adev-plugin/commit/511f7e9a553d323e0dda25767056cfbf8e9da129))
* **tests:** retry cleanupTempDir to absorb ENOTEMPTY race on macOS ([4cb0ded](https://github.com/agentic-development/adev-plugin/commit/4cb0dedd5c9fa64cdb66dd4bd2206ad1e14a5770))
* **validation:** reality-check falls back to spec source-manifest when no plan ([c29e87b](https://github.com/agentic-development/adev-plugin/commit/c29e87b6875f207b4a64c572a3c94bb526adfa76))
* **validation:** validate skill emits canonical lifecycle events ([72c0df7](https://github.com/agentic-development/adev-plugin/commit/72c0df75ea9b5121ff4e6fd201c5f98d40bf9e50))
* **validation:** validate skill emits canonical lifecycle events ([24dab08](https://github.com/agentic-development/adev-plugin/commit/24dab083a87dd57399b691a0635d44f1a0fa7073))
* **validation:** validator IDs in skill prose match validate.yaml prefix ([7367915](https://github.com/agentic-development/adev-plugin/commit/73679156f6af9f6b84d5cc27ffedb61b360e89e7))
* **validation:** validator IDs in skill prose match validate.yaml prefix ([3984868](https://github.com/agentic-development/adev-plugin/commit/3984868a4e0458a7d822c873ce85822686f9ace6))
* **validation:** validator severity resolves from validate.yaml, not gates.yaml ([64e83ed](https://github.com/agentic-development/adev-plugin/commit/64e83edbcc765c1e5e7b0cf5487bbc9c1dc0923e))

## [0.26.0](https://github.com/agentic-development/adev-plugin/compare/adev-cli-v0.25.1...adev-cli-v0.26.0) (2026-05-16)


### ⚠ BREAKING CHANGES

* **agent-reliable-state-artifacts:** lib/build-state.mjs now writes to .context-index/lifecycle-state/<slug>.json instead of .context-index/build-state/<slug>.json. Reads transparently fall back to the legacy path so existing projects keep resuming, but any external tooling that reads build-state JSON files directly from the legacy path must be updated. Operators should run `adev migrate` to convert legacy build-state/<slug>.json files into lifecycle-state JSONL events and remove the legacy directory.
* **agent-reliable-state-artifacts:** /adev:plan no longer creates per-task issues on the board and no longer mutates plan-file checkboxes; per-task state lives exclusively in the lifecycle event log via reportPlanTask. New plan templates drop the Status column. Existing projects must run `adev migrate` to stamp the DO-NOT-EDIT advisory header on legacy plan files and to convert legacy build-state/<slug>.json files into lifecycle-state JSONL events. Every lifecycle skill's prose has been rewritten — agents following the new SKILL.md instructions will call lib/lifecycle-state.mjs helpers (requireGate, reportStep, etc.) rather than grepping markdown artifacts; downstream tooling that depends on the prior instruction surface (or on per-task Issue creation by /adev:plan) must be updated.

### Features

* add agent-reliable-state-artifacts feature charter ([8a5dbe8](https://github.com/agentic-development/adev-plugin/commit/8a5dbe84b64328ad4699da500b5ceafc4212c932))
* **agent-reliable-state-artifacts:** appendEvent primitive with O_APPEND semantics ([ef5f3f0](https://github.com/agentic-development/adev-plugin/commit/ef5f3f07d5311a5521646fb1a4dd7e9e4a6b8aab))
* **agent-reliable-state-artifacts:** convenience writers (reviewer/validator/step/plan_task/intervention) ([ecea7f5](https://github.com/agentic-development/adev-plugin/commit/ecea7f5c8944e58207b59a8f69636fb2b82d4150))
* **agent-reliable-state-artifacts:** currentState reducer + StateProjection camelCase shape ([6478cc8](https://github.com/agentic-development/adev-plugin/commit/6478cc8ae08c5b79270ade97e76b662a6922472c))
* **agent-reliable-state-artifacts:** ensure/has lifecycle-state helpers ([0d809bd](https://github.com/agentic-development/adev-plugin/commit/0d809bd39efe38b1de4ca756a86eb64a6434c886))
* **agent-reliable-state-artifacts:** execution state JSON migration + hook decoupling ([3ba9732](https://github.com/agentic-development/adev-plugin/commit/3ba97325374d6d5059a9fc6b74d2c57875be7f42))
* **agent-reliable-state-artifacts:** filterEvents predicate API ([d868342](https://github.com/agentic-development/adev-plugin/commit/d8683423bffa8dddb4cc51c34345b6e9b675b32e))
* **agent-reliable-state-artifacts:** JSON issue board + adapter ([0876c08](https://github.com/agentic-development/adev-plugin/commit/0876c082214b122dfa6b558f5e7999402c588d5d))
* **agent-reliable-state-artifacts:** listLifecycleStates aggregate fold ([3039d1f](https://github.com/agentic-development/adev-plugin/commit/3039d1f4abeb33d9824b8e26388d85f4f98b7e4f))
* **agent-reliable-state-artifacts:** markdown rendering layer + migrate CLI subcommand ([8e4702f](https://github.com/agentic-development/adev-plugin/commit/8e4702f9cfcc30685682f59a253b80b333a4d617))
* **agent-reliable-state-artifacts:** milestones JSON migration ([88c3bf0](https://github.com/agentic-development/adev-plugin/commit/88c3bf08dbe6bbe31ec3201bd8b20059a9b236ce))
* **agent-reliable-state-artifacts:** one-shot migration tool ([60192b6](https://github.com/agentic-development/adev-plugin/commit/60192b6cee3a0e321b15186d64ae473c1e1b3d16))
* **agent-reliable-state-artifacts:** path-safety primitives for lifecycle-state ([324d854](https://github.com/agentic-development/adev-plugin/commit/324d8542f8353055bcbc69fc9bc3c17f6b088f2d))
* **agent-reliable-state-artifacts:** plan-task events + lifecycle skill instruction adoption ([5da3f8b](https://github.com/agentic-development/adev-plugin/commit/5da3f8b22ee4cad92cd7ac8349cc5d88a8e7fc51))
* **agent-reliable-state-artifacts:** readEvents primitive with crash-tolerant tail ([0d41ff5](https://github.com/agentic-development/adev-plugin/commit/0d41ff5942de9f811515800bec6858096c5f801e))
* **agent-reliable-state-artifacts:** renderMarkdown stub with stable signature ([7fe8563](https://github.com/agentic-development/adev-plugin/commit/7fe8563b41208aa64622d116df42f49e0c891f0c))
* **agent-reliable-state-artifacts:** replace viz/build.mjs inline markdown parser with adapter ([fd75162](https://github.com/agentic-development/adev-plugin/commit/fd75162329489ce9cd7b0f6e504bba1c7ae8dcd7))
* **agent-reliable-state-artifacts:** requireGate + resolveGateMode ([45abf38](https://github.com/agentic-development/adev-plugin/commit/45abf38549d64a50797f48dbc78f274d8e4800a7))
* **agent-reliable-state-artifacts:** seed lifecycle-state lib with canonical event set ([067a017](https://github.com/agentic-development/adev-plugin/commit/067a017e7465d02449624f0668e5e9dd14411106))
* **agent-reliable-state-artifacts:** severity-resolution helper with best-effort fallback ([96dddc7](https://github.com/agentic-development/adev-plugin/commit/96dddc76bd0bbff9cdffc21323dbc30085a14b20))
* **agent-reliable-state-artifacts:** size caps for events, log file, and notes ([d4bd57a](https://github.com/agentic-development/adev-plugin/commit/d4bd57a14d38374882ab6527944e0c9fea3d8a26))
* **agent-reliable-state-artifacts:** spec the JSON issue board + adapter ([fd05bc7](https://github.com/agentic-development/adev-plugin/commit/fd05bc7fb1725a83aab4dffd81d1b98850205b7d))
* **agent-reliable-state-artifacts:** spec the lifecycle event log ([bdc9238](https://github.com/agentic-development/adev-plugin/commit/bdc92387c881cf36d4ead4e13a07645cd23391c2))
* **agent-reliable-state-artifacts:** step verdict aggregation per severity table ([ce9f9b1](https://github.com/agentic-development/adev-plugin/commit/ce9f9b1c080c9f1cb83d7831f1b927528d3a9071))
* **agent-reliable-state-artifacts:** test migration — schema-version surface and legacy-format guards ([7ffc7d4](https://github.com/agentic-development/adev-plugin/commit/7ffc7d4651d45ddd7e47f0d8a2153680edef9d5f))
* **cli-driver-surface:** add 6 live specs + reviews under cli-driver-surface charter ([3cd1083](https://github.com/agentic-development/adev-plugin/commit/3cd1083c074bb554294560650e43b296c9368c63))
* **cli-driver-surface:** add feature charter ([63c0e1b](https://github.com/agentic-development/adev-plugin/commit/63c0e1b1234837715996404f4ab9948a4510ee18))
* **cli-driver-surface:** add implementation plan for driver-substrate spec ([bed5a22](https://github.com/agentic-development/adev-plugin/commit/bed5a229c0ff8d704c77862ccf12c9a5fddae216))
* **cli-driver-surface:** amend diagnostic-registry spec to rev 2 + ADR-0009 ([fb4703d](https://github.com/agentic-development/adev-plugin/commit/fb4703d02cb3e39c5cda7fb2a616df68d6d21bd6))
* **cli-driver-surface:** close the epic — sweep PRs 1-9 (zero inline-Node blocks across all skills) ([7d4946b](https://github.com/agentic-development/adev-plugin/commit/7d4946be314b9db1c9c79963961a446e2d6e17ab))
* **cli-driver-surface:** implement 4 specs (diagnostic-registry, adev-diagnose-cli, write-time-diagnostic-hook, regression-prevention) ([9e85077](https://github.com/agentic-development/adev-plugin/commit/9e85077209916ad3be5f506006524a0cf019735e))
* **cli-driver-surface:** implement diagnostic-registry, adev-diagnose-cli, write-time-diagnostic-hook, regression-prevention ([a994181](https://github.com/agentic-development/adev-plugin/commit/a994181019b681ddcc817e320339b954b55a5315))
* **cli-driver-surface:** land driver-substrate (verb registry + adev gate) ([35e49f3](https://github.com/agentic-development/adev-plugin/commit/35e49f3421ad231f90deff899df0bc498c5d024c))
* **cli-driver-surface:** land driver-substrate (verb registry + adev gate) ([35496cf](https://github.com/agentic-development/adev-plugin/commit/35496cf768e324e3b1a7c059b204999ba9f2bf18))
* **cli-driver-surface:** plan remaining 5 specs (regression-prevention, diagnostic-registry, adev-diagnose-cli, write-time-diagnostic-hook, inline-node-extraction-sweep) ([00aef82](https://github.com/agentic-development/adev-plugin/commit/00aef82397668552f409efd61b44445b415aee08))
* **cli-driver-surface:** PR 1 — extract Check 13 heuristic extraction (skill: validate) ([9d16883](https://github.com/agentic-development/adev-plugin/commit/9d168834301cf3208362c7b35e54cd7a1f2b6ede))
* **cli-driver-surface:** PR 2 — extract reportValidator per-check emission ([43981ff](https://github.com/agentic-development/adev-plugin/commit/43981ff933cb68734b245dad484d67bf19bb927f))
* **cli-driver-surface:** PR 3 — extract reportStep lifecycle emission ([50ec455](https://github.com/agentic-development/adev-plugin/commit/50ec4553b989fa17f68bb3e3102e3d8ec1c7f220))
* **cli-driver-surface:** PR 4 — extract Step 0a requireGate (all lifecycle skills) ([9702d95](https://github.com/agentic-development/adev-plugin/commit/9702d953a56b9ff26de88fce152bf3dd2055aa2f))
* **cli-driver-surface:** PR 5 — extract source-manifest verify ([0c3eaf4](https://github.com/agentic-development/adev-plugin/commit/0c3eaf47b5e42300b53ad1c85c0bda7a610218f4))
* **cli-driver-surface:** PR 6 — extract domain-aware loading (gates, reviewers, test-config, verification) ([3cfae20](https://github.com/agentic-development/adev-plugin/commit/3cfae209d23ec793f4db73c5b488a4b1459bb1f9))
* **cli-driver-surface:** PR 7 — extract context/state primitives bundle ([453c988](https://github.com/agentic-development/adev-plugin/commit/453c9882793a89f2ddc536891c86efc0b4dc9d14))
* **cli-driver-surface:** PR 8-9 — finish the sweep (zero inline-Node blocks) ([53ddf26](https://github.com/agentic-development/adev-plugin/commit/53ddf265f53d0440a5da08cf33474b9fe6dc5317))
* **cli-driver-surface:** sweep scaffolding (progress index + allowlist test) ([190b3cd](https://github.com/agentic-development/adev-plugin/commit/190b3cdabf3775de78612f00035c5d8aa32e744a))
* **cli:** revise CLI charter to rev 3 (drop single-file constraint) ([e5fc9d2](https://github.com/agentic-development/adev-plugin/commit/e5fc9d267aa5d98f553b8ab353fb0a12666a2380))
* **lifecycle-artifacts:** add --kind routing to /adev:brainstorm ([f7cecb4](https://github.com/agentic-development/adev-plugin/commit/f7cecb467bd3248815fe2f3153aabfe84a48a561))
* **lifecycle-artifacts:** add --kind routing to /adev:specify ([8d33a89](https://github.com/agentic-development/adev-plugin/commit/8d33a89dbc9f5aaef56013fe859cae6fda153873))
* **lifecycle-artifacts:** add 3 new charter templates ([1aff762](https://github.com/agentic-development/adev-plugin/commit/1aff762911d12b393e90f20d2f1cf1832a2b1e2e))
* **lifecycle-artifacts:** add 4 new Devin-style spec templates ([f992d6a](https://github.com/agentic-development/adev-plugin/commit/f992d6afe54bcfb2eb1a7eb698a395ca260368bf))
* **lifecycle-artifacts:** add kind-aware hygiene audit pass ([e0c3983](https://github.com/agentic-development/adev-plugin/commit/e0c3983074ba97e71b0aacd236993aeac2dee136))
* **lifecycle-artifacts:** add lib/kinds.mjs with closed enumerations + validators ([3c99a68](https://github.com/agentic-development/adev-plugin/commit/3c99a685963ec17c2d88e19ecf6f51e5bcd94557))
* **lifecycle-artifacts:** add parseSpecFrontmatter with kind sentinels ([0af45da](https://github.com/agentic-development/adev-plugin/commit/0af45da36b47d32768b6783eceb7d5a46c08bc80))
* **lifecycle-artifacts:** add read-time kind defaulting helpers ([06de933](https://github.com/agentic-development/adev-plugin/commit/06de933d703fb740608c557e67c556b05672fff7))
* **lifecycle-artifacts:** add resolveTemplate helper with path-containment guard ([f58fce9](https://github.com/agentic-development/adev-plugin/commit/f58fce92aa398fe71383d8e3298886d5e212422a))
* **lifecycle-artifacts:** land charter, ADR-0009, and 11 specs ([85e0bd1](https://github.com/agentic-development/adev-plugin/commit/85e0bd13a1122f50293d6b669902d07e43eb922b))
* test migration — schema-version surface + viz adapter migration ([be8276d](https://github.com/agentic-development/adev-plugin/commit/be8276da8e14d7a564a359ebe83cc67c0992d5e7))


### Bug Fixes

* **agent-reliable-state-artifacts:** migrateMilestones writes worktree-local, not main-checkout ([cba8ff0](https://github.com/agentic-development/adev-plugin/commit/cba8ff0f3f85454efdda6df0ac563310b428f290))
* **agent-reliable-state-artifacts:** resolve review blockers + cross-spec warnings ([fee7773](https://github.com/agentic-development/adev-plugin/commit/fee77736b3d5017ed7ad7015068210af322c4802))
* **build:** dispatch optimistically; do not introspect tool availability ([df087e3](https://github.com/agentic-development/adev-plugin/commit/df087e37a379c928f8cafce8cf317edb4cfda069))
* **build:** point prose at lifecycle-state/ instead of legacy build-state/ ([369c860](https://github.com/agentic-development/adev-plugin/commit/369c860502348e8f230fd72d1aeee0974f9dd589))
* **ci:** skip GitHub auto-merge commit in provenance trailer check ([81cd36d](https://github.com/agentic-development/adev-plugin/commit/81cd36dbad5e69b8d65731ad8d21487bde8d73ce))
* **orchestration:** unblock charter-mode builds with subagent dispatch ([f635b6a](https://github.com/agentic-development/adev-plugin/commit/f635b6a6185c670144d92d666fcc662b5a10721c))
* **plan-immutability:** only flag genuine modification commits ([5348ad6](https://github.com/agentic-development/adev-plugin/commit/5348ad6db3aec70f1d71390f26fdc82f8305b5ee))
* **specs:** repair source-manifest path references ([ace26d3](https://github.com/agentic-development/adev-plugin/commit/ace26d3941d37c21633e9d148a1f3e1dd4a066eb))
* **tests:** make lifecycle-state perf harness CI-aware ([c04a5eb](https://github.com/agentic-development/adev-plugin/commit/c04a5eb2a716603eb599acd7b2037d8bc900c3b7))
* **tests:** widen lifecycle-state-perf local margin to x5; promote test-migration to validated ([782aba8](https://github.com/agentic-development/adev-plugin/commit/782aba8f0527bc8b00617ac7244b4b7032baca66))


### Code Refactoring

* **agent-reliable-state-artifacts:** lib/build-state.mjs writes to lifecycle-state path ([5b6f4ba](https://github.com/agentic-development/adev-plugin/commit/5b6f4bacf60a71dc5b41843b2721697ef3263c57))

## [0.25.1](https://github.com/agentic-development/adev-plugin/compare/adev-cli-v0.25.0...adev-cli-v0.25.1) (2026-05-11)


### Bug Fixes

* **cli:** resolve npx invocation failure from in-tree workspaces ([288c378](https://github.com/agentic-development/adev-plugin/commit/288c378e7c063a3a015ed430a69a666ce60b5626))
* **cli:** resolve npx invocation failure from in-tree workspaces ([7b7db13](https://github.com/agentic-development/adev-plugin/commit/7b7db138a95d9668bd5b4190ae36a31492673227))

## [0.25.0](https://github.com/agentic-development/adev-plugin/compare/adev-cli-v0.24.0...adev-cli-v0.25.0) (2026-05-11)


### Features

* 0.23.0 — integration test strategy and plan infra requirements ([5e07193](https://github.com/agentic-development/adev-plugin/commit/5e07193a265887ea21dc0f90053ab01a4949e77b))
* add 3 live specs for heuristics Phase 2 progressive disclosure ([eed51aa](https://github.com/agentic-development/adev-plugin/commit/eed51aa34bec9a143b401630a4b9fdce6374e2dd))
* add debug playbook format and Phase 2 loading ([74b0c70](https://github.com/agentic-development/adev-plugin/commit/74b0c70ca82e3d5abe3f28f2ea5d4afb7b075558))
* add deploy feature charter, assign issue-345 to epic-57 ([2c368fe](https://github.com/agentic-development/adev-plugin/commit/2c368fe9a22985cc8ea87af37f8747a6b3692f73))
* add domain-extensions feature charter ([c52d40b](https://github.com/agentic-development/adev-plugin/commit/c52d40b844f2d39c9d57f6732572f3f2181925f9))
* add domain-profiles feature charter and v1 release research ([350d5d4](https://github.com/agentic-development/adev-plugin/commit/350d5d4f49d0b59c02e2e3f39549e05da06aa8e8))
* add domain-profiles feature charter and v1 release research ([ccd43b6](https://github.com/agentic-development/adev-plugin/commit/ccd43b6b325e734f4924861d5835d32f467939b2))
* add extensions feature charter ([3be4232](https://github.com/agentic-development/adev-plugin/commit/3be42329df36c522b6f2eb6b86c7e775c2bed85f))
* add implementation plans for all 3 Phase 2 heuristics specs ([d1fe16b](https://github.com/agentic-development/adev-plugin/commit/d1fe16ba656c9d47d27bc622c55eff6be41cb2c7))
* add infrastructure preflight feature charter ([2fbca74](https://github.com/agentic-development/adev-plugin/commit/2fbca7477862ad1bcdac32921e8030a1867b8690))
* add infrastructure preflight feature charter ([558cebd](https://github.com/agentic-development/adev-plugin/commit/558cebdf29195f10fed0d8c726ca02a5a8158d35))
* add milestone-lifecycle feature charter ([a2c196e](https://github.com/agentic-development/adev-plugin/commit/a2c196eb5e55cbf4559def423e732cec2fb9dd61))
* add reality-check module for codebase-verified confidence scoring ([9118888](https://github.com/agentic-development/adev-plugin/commit/9118888cc47b5dd9682ccef185643b2c1028c0ad))
* add reality-check module for codebase-verified confidence scoring ([5c0840b](https://github.com/agentic-development/adev-plugin/commit/5c0840b22dcc8021f551ede6bb909d472855ee18))
* add spec-drift-detection feature charter ([9c244d3](https://github.com/agentic-development/adev-plugin/commit/9c244d3b2b0240b092d89f0eab12059da70b31e9))
* add spec-drift-detection feature charter ([e9fb12f](https://github.com/agentic-development/adev-plugin/commit/e9fb12f00ad3be199fac6a68db9224c1c1c9d036))
* add user-docs feature charter ([45d1743](https://github.com/agentic-development/adev-plugin/commit/45d174334dd46ea0632542ac3dea16bae6e2fbcb))
* approve milestone-lifecycle charter, assign issue-355 to epic-57 ([68c6123](https://github.com/agentic-development/adev-plugin/commit/68c6123a6c6f95ae81c8b0baeefbec0949222f44))
* **brainstorm:** reduce charter review loop cap from 3 to 2 ([9fedf72](https://github.com/agentic-development/adev-plugin/commit/9fedf721d8334bf6d45e104c8347f4fd295d4d13))
* **brainstorm:** reduce charter review loop cap from 3 to 2 ([ffad33d](https://github.com/agentic-development/adev-plugin/commit/ffad33d2b68feb54c0824bd4c94d3eacce4c8c05))
* **build:** add --auto flag for unattended pipeline execution ([14021b2](https://github.com/agentic-development/adev-plugin/commit/14021b2bc61929375cd36f591f3ad561b5990f21))
* **build:** add --charter/--module entrypoint for charter-level builds ([3a4bd15](https://github.com/agentic-development/adev-plugin/commit/3a4bd152211a0d4facb647cf00689f94a4a09ebc))
* **build:** add build-state programmatic helper ([b9f4228](https://github.com/agentic-development/adev-plugin/commit/b9f42281dcf5f12fa3214e4339b4e124898b9362))
* **cli:** split init into install/upgrade commands ([46a293e](https://github.com/agentic-development/adev-plugin/commit/46a293e092dfbf1359d19ed2209b4d1cd4589685))
* **cli:** split init into install/upgrade commands, simplify CLI ([4f36cff](https://github.com/agentic-development/adev-plugin/commit/4f36cff35abf74b5a2283213127f72ed2c43fd84))
* codebase hygiene epic — provider sync, param consistency, orphan cleanup ([864037c](https://github.com/agentic-development/adev-plugin/commit/864037cb57a8a2967bda865bbcc21bf9ec96d868))
* codebase hygiene epic — provider sync, param consistency, orphan cleanup ([19d6056](https://github.com/agentic-development/adev-plugin/commit/19d6056a89a3555e45863b01ba50c58e366de5a2))
* **debug-playbooks:** add debug playbook template ([be82b97](https://github.com/agentic-development/adev-plugin/commit/be82b97f8c10d66095876a02376acec325156f53))
* **debug-playbooks:** add playbook loading and trigger matching to debug Phase 2 ([3bbcb11](https://github.com/agentic-development/adev-plugin/commit/3bbcb116b76d2bed5500119bda9281b2932bbcc0))
* **deploy:** add deploy skill, library, and lifecycle artifacts ([52377b1](https://github.com/agentic-development/adev-plugin/commit/52377b1526304bc556d9da038eef439ad456f486))
* **design:** add .adev/ to gitignore for prototype persistence ([a09be2f](https://github.com/agentic-development/adev-plugin/commit/a09be2f66b2df8faf150681cfc1235862e52b8e2))
* **design:** add .adev/ to gitignore for prototype persistence ([d59e593](https://github.com/agentic-development/adev-plugin/commit/d59e593a5f3e8fdf02e614e8113023f1752219e7))
* **design:** add module validation and charter discovery helpers ([1efb89e](https://github.com/agentic-development/adev-plugin/commit/1efb89e63d032ed19e48c06138fd3551a05a6f06))
* **design:** add module validation and charter discovery helpers ([776ff76](https://github.com/agentic-development/adev-plugin/commit/776ff769c158736f951e6f39ddd1895fea5eade4))
* **design:** add prototype skill for tiered prototype generation ([9936de0](https://github.com/agentic-development/adev-plugin/commit/9936de02001c9f5e2fdf9f56b8b056b7e5b2794f))
* **design:** add prototype skill for tiered prototype generation ([d2a064b](https://github.com/agentic-development/adev-plugin/commit/d2a064b9753bd27ccf60b05dd70a0ab934ab24f1))
* **design:** add zero-dep HTTP server helper for prototype serving ([7a27f3e](https://github.com/agentic-development/adev-plugin/commit/7a27f3e28a08bf207a189c9ff32f020ba360888a))
* **design:** add zero-dep HTTP server helper for prototype serving ([3dd7f27](https://github.com/agentic-development/adev-plugin/commit/3dd7f273f4015d7ad02f9d692543d0447c89044a))
* domain profiles + extensions install pipeline (v1) ([c7e930b](https://github.com/agentic-development/adev-plugin/commit/c7e930b20e798177687d82c6d04844665684747f))
* **domain-extensions:** add data-engineering extension spec ([c15eff3](https://github.com/agentic-development/adev-plugin/commit/c15eff3967f29f43f2795d832e446e96467e318c))
* **domain-extensions:** add implementation plans for all 4 specs ([819920d](https://github.com/agentic-development/adev-plugin/commit/819920d058987f62d6de449e670051d16341b215))
* **domain-extensions:** add process-automation, git-fragment, and cleanup specs ([43acfe5](https://github.com/agentic-development/adev-plugin/commit/43acfe58a3f1067ce4b1d7f0c970aa17ae250e70))
* **domain-extensions:** create data-engineering extension package ([2ac562a](https://github.com/agentic-development/adev-plugin/commit/2ac562a9b56a7962d30c5f4e24e0015fe3309df1))
* **domain-extensions:** create process-automation extension package ([2e7b4d4](https://github.com/agentic-development/adev-plugin/commit/2e7b4d41d16bb01ef772d664bd7bd1aad866dc6c))
* **domain-extensions:** data-engineering & process-automation extensions + git subdirectory fragment support ([4542540](https://github.com/agentic-development/adev-plugin/commit/45425404b7297c6402e0cf2ef45c86ebe3401874))
* **domain-profiles:** add 3 live specs with architecture reviews (rev 3, all PASS_WITH_NOTES) ([520b28a](https://github.com/agentic-development/adev-plugin/commit/520b28afeca23e983a6da968e90e746af03a8b5d))
* **domain-profiles:** add documentation requirements to all 3 specs ([7888517](https://github.com/agentic-development/adev-plugin/commit/7888517231f2cc3d7a2ab5562291ce624ce59a0b))
* **domain-profiles:** add three bundled domain profile overlay files ([9e9c1e8](https://github.com/agentic-development/adev-plugin/commit/9e9c1e8d0412d6b5105a3dfa0275ce5d982dfa80))
* **domain-profiles:** complete domain profiles implementation ([411f102](https://github.com/agentic-development/adev-plugin/commit/411f102cea5cf78b6ead4c3d3255dd7c34fe621e))
* **domain-profiles:** update specs to rev 5 — extends model, unbundled defaults ([b4ccd96](https://github.com/agentic-development/adev-plugin/commit/b4ccd96caad7e2634bcf6edb8086cee0e4d56e98))
* **eval-projects:** add comparison harness for plain-claude vs adev-built scoring ([2ab9a07](https://github.com/agentic-development/adev-plugin/commit/2ab9a078d4eeab75f45ed19cf7a9bebaeb95121d))
* **eval-projects:** add eval comparison harness with LLM judge, build/hook fixes ([5c6d383](https://github.com/agentic-development/adev-plugin/commit/5c6d383c849dadea440b7e4b96cc659db705678a))
* **eval-projects:** add eval comparison harness with LLM judge, build/hook fixes ([4f517c0](https://github.com/agentic-development/adev-plugin/commit/4f517c08a813fe6303c7eccc586982087c3a3a3a))
* **eval-projects:** add README and LICENSE following shared conventions ([e178b2d](https://github.com/agentic-development/adev-plugin/commit/e178b2dd16a926c6cd0f4d83b248b5a73bf7b57e))
* **eval-projects:** add README and LICENSE following shared conventions ([6a00b5a](https://github.com/agentic-development/adev-plugin/commit/6a00b5a5fde5b4a27961afc70b77736ceff56935))
* **eval-projects:** add README and LICENSE following shared conventions ([e900357](https://github.com/agentic-development/adev-plugin/commit/e900357d36b36f770451fd0b8128a81d37e76583))
* **eval-projects:** add unit tests for transforms and loaders (no NULL test data) ([d3b218b](https://github.com/agentic-development/adev-plugin/commit/d3b218b7dd227cea093ecbd5c8934b16b2dd82b5))
* **eval-projects:** add unit tests for transforms and loaders (no NULL test data) ([697ee80](https://github.com/agentic-development/adev-plugin/commit/697ee8095bdac3b5d4ee7a9e14ed28d536327942))
* **eval-projects:** add unit tests for transforms and loaders (no NULL test data) ([8f29ede](https://github.com/agentic-development/adev-plugin/commit/8f29edec579823d467fffaa6258c1c850f34e8ea))
* **eval-projects:** create migration eval project repo with seed data ([012d0a9](https://github.com/agentic-development/adev-plugin/commit/012d0a9e27cedbcbdb557dba10ce9a0d3791ab1d))
* **eval-projects:** create migration eval project repo with seed data ([11a1601](https://github.com/agentic-development/adev-plugin/commit/11a16013dcb810facad2a9b0f9648a093322bcfc))
* **eval-projects:** create migration eval project repo with seed data ([41fa625](https://github.com/agentic-development/adev-plugin/commit/41fa6256331d1c9b6008db221cf11c284d1420ad))
* **eval-projects:** implement compare tool for legacy vs modern output diff ([af9f4a6](https://github.com/agentic-development/adev-plugin/commit/af9f4a62945cf83385e23402bb07b5a8d0c5a2cd))
* **eval-projects:** implement compare tool for legacy vs modern output diff ([7ad4314](https://github.com/agentic-development/adev-plugin/commit/7ad43142b407cc6014dd9cff161b0ab9bee29b90))
* **eval-projects:** implement compare tool for legacy vs modern output diff ([2151f4b](https://github.com/agentic-development/adev-plugin/commit/2151f4b678ab1c6682798e2ea00ff1ae6207174e))
* **eval-projects:** implement dbt+DuckDB pipeline with correct LEFT JOIN ([c466822](https://github.com/agentic-development/adev-plugin/commit/c46682206742712995b0cb0b60f47ca24b448a79))
* **eval-projects:** implement dbt+DuckDB pipeline with correct LEFT JOIN ([6dc758e](https://github.com/agentic-development/adev-plugin/commit/6dc758e9adebe333e74d34c51d3ea1782ca2c00c))
* **eval-projects:** implement dbt+DuckDB pipeline with correct LEFT JOIN ([188d849](https://github.com/agentic-development/adev-plugin/commit/188d849d94ebaeb91b5eed20b51ee3d433a23923))
* **eval-projects:** implement legacy pipeline with planted NULL-region bug ([3a62e49](https://github.com/agentic-development/adev-plugin/commit/3a62e49509c817eea844c541938e2f4f96223405))
* **eval-projects:** implement legacy pipeline with planted NULL-region bug ([0c5bed9](https://github.com/agentic-development/adev-plugin/commit/0c5bed9176d1af588e17ba0d3deb4868836f8555))
* **eval-projects:** implement legacy pipeline with planted NULL-region bug ([e8430e7](https://github.com/agentic-development/adev-plugin/commit/e8430e71c2eda67dcd289340f258736ea9a77b21))
* **eval-projects:** register migration eval as submodule and scaffold eval harness ([8975225](https://github.com/agentic-development/adev-plugin/commit/897522514dda768eade5f9070e18b77ebe88bbde))
* **eval-projects:** register migration eval as submodule and scaffold eval harness ([1f00f53](https://github.com/agentic-development/adev-plugin/commit/1f00f53ca72dda057af14f3a0f05066a2d9442d9))
* **eval-projects:** register migration eval as submodule and scaffold eval harness ([da4ace6](https://github.com/agentic-development/adev-plugin/commit/da4ace69f2666e144e44e7bb307a62ecff9f5827))
* **eval-projects:** verify end-to-end pipelines and planted bug behavior ([a8594d6](https://github.com/agentic-development/adev-plugin/commit/a8594d6339fd529b034c4cbaa46bd204418d2768))
* **eval-projects:** verify end-to-end pipelines and planted bug behavior ([f8a1160](https://github.com/agentic-development/adev-plugin/commit/f8a116049a15db0b81d8f2fc96a581b631c9aaf0))
* **eval-projects:** verify end-to-end pipelines and planted bug behavior ([c21b1b8](https://github.com/agentic-development/adev-plugin/commit/c21b1b89a3407f5cbf7dda67cc3446c94db9dd57))
* **eval:** A/B tests for strategies [#1](https://github.com/agentic-development/adev-plugin/issues/1), [#2](https://github.com/agentic-development/adev-plugin/issues/2), [#3](https://github.com/agentic-development/adev-plugin/issues/3), [#9](https://github.com/agentic-development/adev-plugin/issues/9) with real JSONL data ([7745e7a](https://github.com/agentic-development/adev-plugin/commit/7745e7aaa8754904910ac7163a1cc4ec2a8f4cd2))
* **eval:** A/B tests for strategies [#1](https://github.com/agentic-development/adev-plugin/issues/1), [#2](https://github.com/agentic-development/adev-plugin/issues/2), [#3](https://github.com/agentic-development/adev-plugin/issues/3), [#9](https://github.com/agentic-development/adev-plugin/issues/9) with real JSONL data ([8e9b56d](https://github.com/agentic-development/adev-plugin/commit/8e9b56d713ec218a52b23b442b748929f3336ab8))
* **eval:** A/B tests for turn reduction techniques T1, T2+T3, T4 ([9fab4e3](https://github.com/agentic-development/adev-plugin/commit/9fab4e33441fdca03a9fad62e1ff36f81746f28f))
* **eval:** A/B tests for turn reduction techniques T1, T2+T3, T4 ([cbd4ca9](https://github.com/agentic-development/adev-plugin/commit/cbd4ca90b6438594111b67c809f947e20ae2b94e))
* **eval:** add A/B eval for token optimization using real session JSONL ([3ff37bc](https://github.com/agentic-development/adev-plugin/commit/3ff37bc9b56697def2ad227af634237827690c95))
* **eval:** add A/B eval for token optimization using real session JSONL ([66f84c9](https://github.com/agentic-development/adev-plugin/commit/66f84c964a7e3378220aede08931c2bb920096f5))
* **eval:** add artifact-to-disk summarization eval for plan skill ([84e7b6f](https://github.com/agentic-development/adev-plugin/commit/84e7b6f3bcf82eda66c9fabd693c298b80b10948))
* **eval:** add artifact-to-disk summarization eval for plan skill ([561df2e](https://github.com/agentic-development/adev-plugin/commit/561df2e85d0c3a450341b220dd8b87e228c88447))
* **eval:** add real token analysis from session JSONL data ([80cf5d8](https://github.com/agentic-development/adev-plugin/commit/80cf5d829f68211962293285d11cdde6c0d1f11e))
* **eval:** add real token analysis from session JSONL data ([b76f3e5](https://github.com/agentic-development/adev-plugin/commit/b76f3e52125dd6a667c4cac8ec3fbfd3b70ff654))
* **eval:** add token budget eval for all Tier 1 + Tier 2 strategies ([7b4c480](https://github.com/agentic-development/adev-plugin/commit/7b4c480de1b86bae7808ee5cb684945ff8c009a4))
* **eval:** add token budget eval for all Tier 1 + Tier 2 strategies ([5fb65a4](https://github.com/agentic-development/adev-plugin/commit/5fb65a4884485cbb52905dbe7224fc0f4ca553a7))
* **eval:** real token comparison — baseline vs summarized using session JSONL ([2cf8b94](https://github.com/agentic-development/adev-plugin/commit/2cf8b94c46954d3615c03a046d563cc887f40818))
* **eval:** real token comparison — baseline vs summarized using session JSONL ([4faeb46](https://github.com/agentic-development/adev-plugin/commit/4faeb466181a4e94ec59521bca93400f32507448))
* **evals:** add integration-sandbox eval fixture for issue-192 validation ([02de75e](https://github.com/agentic-development/adev-plugin/commit/02de75ecbe6ca3bd52e2c8ac3dfb7c4ba11bad12))
* **extensions:** accept path alias in domain-profile manifest ([29b195c](https://github.com/agentic-development/adev-plugin/commit/29b195ca117c64ed5e65d9cccf283d2e439adeca))
* **extensions:** add CLI extension install and list commands ([32212f5](https://github.com/agentic-development/adev-plugin/commit/32212f59ce519cb2aed06d4f41afb63ec99ff634))
* **extensions:** add extension manifest schema validation ([77aa242](https://github.com/agentic-development/adev-plugin/commit/77aa242fcec0978f0ea79255bbd28db4deeeeb1b))
* **extensions:** add git subdirectory fragment support in resolveGit() ([742d4a6](https://github.com/agentic-development/adev-plugin/commit/742d4a618892f47093f12fe0be8f492b66310819))
* **extensions:** add install orchestrator and manifest stamp writer ([7817590](https://github.com/agentic-development/adev-plugin/commit/7817590450081883f841ab5f990d4fea7c2047f6))
* **extensions:** add provider detection ([679de17](https://github.com/agentic-development/adev-plugin/commit/679de173382b7c461ec40a38dda1761a68705c56))
* **extensions:** add skill and hook registration with path containment ([e6f15e2](https://github.com/agentic-development/adev-plugin/commit/e6f15e2f89d57a23229de8bd5d6b71cb17bc16f8))
* **extensions:** add URI classification and source resolution ([a0c44ed](https://github.com/agentic-development/adev-plugin/commit/a0c44ed7f25eae33f73a2b9eb818cbcb68211a21))
* **extensions:** add version compatibility check ([2454cf4](https://github.com/agentic-development/adev-plugin/commit/2454cf4411649dcdaa1e8c0be180b9cf1abca40f))
* **extensions:** wire orchestrator, fix temp cleanup, validate all specs ([d9c0676](https://github.com/agentic-development/adev-plugin/commit/d9c0676a397e944360dc8968c7d4f77a48a747f3))
* **heuristics:** add tags field, tiered rendering, and keyword retrieval boosting ([cf59435](https://github.com/agentic-development/adev-plugin/commit/cf594358b953760ebcf1fdf5cb08efbe83eef078))
* **heuristics:** capture 3 token optimization lessons from research ([aa9df68](https://github.com/agentic-development/adev-plugin/commit/aa9df6800551cef1220bf894c7492b52c89a91a5))
* **heuristics:** capture 3 token optimization lessons from research ([772c784](https://github.com/agentic-development/adev-plugin/commit/772c784f4bcf6477945b6b18af567c2ba3b504d6))
* **hooks:** add lifecycle gate config module with pattern matching ([67f9c5c](https://github.com/agentic-development/adev-plugin/commit/67f9c5c980d12fbc3fce6ec3e6cf6312376630ea))
* **hooks:** add lifecycle gate config module with pattern matching ([44de6d7](https://github.com/agentic-development/adev-plugin/commit/44de6d7ef887cb8f9425403939177f0eb4e31497))
* **hooks:** add lifecycle gate config module with pattern matching ([ef4c33a](https://github.com/agentic-development/adev-plugin/commit/ef4c33ac39c5ced5e9907b2579fa41303d6482a4))
* **hooks:** add standalone status to execution state vocabulary ([7092bbf](https://github.com/agentic-development/adev-plugin/commit/7092bbf4c026ad3b10d11209ec189c0476fc34f9))
* **hooks:** add standalone status to execution state vocabulary ([ab6aedd](https://github.com/agentic-development/adev-plugin/commit/ab6aeddcf959a071e68ad9fef6dbfffa5754e078))
* **hooks:** add standalone status to execution state vocabulary ([64e6268](https://github.com/agentic-development/adev-plugin/commit/64e626852d0a56a37bc2a9fb030af57fdf6949c5))
* **hooks:** enforce conventional commit message format ([28005d3](https://github.com/agentic-development/adev-plugin/commit/28005d3476c718cd5fa78c22f6d9646f2c9ea23e))
* **hooks:** enforce conventional commit message format ([7fb58d6](https://github.com/agentic-development/adev-plugin/commit/7fb58d6d9cfa4d50997c8fb5b98b2ffa236038df))
* **hygiene:** add Pass 16 for heuristic index health ([be6f86f](https://github.com/agentic-development/adev-plugin/commit/be6f86f1eaab20145371f758a25f1db6583fc92a))
* **implement:** add progress tracking via Claude Code TaskCreate/TaskUpdate ([b9bef45](https://github.com/agentic-development/adev-plugin/commit/b9bef452e6cbf2dd02ec7e4023a39d6de092a8c8))
* **implement:** add progress tracking via Claude Code TaskCreate/TaskUpdate ([3329207](https://github.com/agentic-development/adev-plugin/commit/3329207c32de43f4e563a2d321885c7039d7e32d))
* **infra-preflight:** add @dotenvx/dotenvx as dev dependency ([6d0299f](https://github.com/agentic-development/adev-plugin/commit/6d0299ffa6ab00aa1d406944cfc132e011665a68))
* **infra-preflight:** add @dotenvx/dotenvx as dev dependency ([a13d9e2](https://github.com/agentic-development/adev-plugin/commit/a13d9e231a98329b24c098002178095b26742d2a))
* **infra-preflight:** add preflight steps to 7 SKILL.md files ([23db586](https://github.com/agentic-development/adev-plugin/commit/23db5869d82fc37ba23c980f3531f8f0c110e53a))
* **infra-preflight:** add preflight steps to 7 SKILL.md files ([7dad210](https://github.com/agentic-development/adev-plugin/commit/7dad210a9c7f1df1f910c39d2212e71e08fbebdc))
* **infra-preflight:** add skill integration spec ([51e72f8](https://github.com/agentic-development/adev-plugin/commit/51e72f82a8e0ddc729aae86af5858717183c3932))
* **infra-preflight:** add skill integration spec ([033a20e](https://github.com/agentic-development/adev-plugin/commit/033a20e3601b6bc295850fdaa57a5ec9c62723b5))
* **infra-preflight:** add verification runner and schema extension spec ([8520551](https://github.com/agentic-development/adev-plugin/commit/852055167190d6cd5b29665595e5c7b33dd1d560))
* **infra-preflight:** add verification runner and schema extension spec ([87297b7](https://github.com/agentic-development/adev-plugin/commit/87297b7448a3e183cd1238e5f19c4ddef489a9c9))
* **infra-preflight:** implement verification runner and schema extension ([d6fc043](https://github.com/agentic-development/adev-plugin/commit/d6fc04372994bdae2e7fdcbf88f9888bf121a044))
* **infra-preflight:** implement verification runner and schema extension ([c756f8d](https://github.com/agentic-development/adev-plugin/commit/c756f8d7c1a46cc6999925cc5a265fc448a90daf))
* **infra-preflight:** skill-integration spec review passed ([a258c11](https://github.com/agentic-development/adev-plugin/commit/a258c11b74ea682c61da7607eee4dcabd7fa26db))
* **infra-preflight:** skill-integration spec review passed ([0e10e30](https://github.com/agentic-development/adev-plugin/commit/0e10e3037894da4bfd2d1fa71c947c1991c481f4))
* **infra-preflight:** spec review passed — all 18 findings resolved ([e5ae7c4](https://github.com/agentic-development/adev-plugin/commit/e5ae7c418389a86dfb4e409088d3270b974fcde5))
* **infra-preflight:** spec review passed — all 18 findings resolved ([47d407c](https://github.com/agentic-development/adev-plugin/commit/47d407c26f904f6e3add1ebcbd4fb1769e094ba7))
* integrate reality-check into hygiene and reconcile skills ([3ec1f36](https://github.com/agentic-development/adev-plugin/commit/3ec1f36e56a188f343711eee0089059828c01700))
* integrate reality-check into hygiene and reconcile skills ([2bd515f](https://github.com/agentic-development/adev-plugin/commit/2bd515f59135391ae14096a8af6684c07ad0bea7))
* **lib:** add meta-tools for deterministic multi-file operations ([c312c34](https://github.com/agentic-development/adev-plugin/commit/c312c3424fdacc7b2aec03900fd60c409547ab73))
* **lib:** add meta-tools for deterministic multi-file operations ([630fdb9](https://github.com/agentic-development/adev-plugin/commit/630fdb9f06c58a34fed301e4c11863498a8cabc2))
* **milestone-lifecycle:** add --strategy flag to milestoneCreate ([8cfd28b](https://github.com/agentic-development/adev-plugin/commit/8cfd28bb51f15fdfc12c585fb11c49f50bb21e07))
* **milestone-lifecycle:** add 3 live specs covering all charter capabilities ([9749d4e](https://github.com/agentic-development/adev-plugin/commit/9749d4e87abb407c959c066c65e206df3ebdc6e2))
* **milestone-lifecycle:** add milestone ship, ship criteria evaluation, and defer ([80773a4](https://github.com/agentic-development/adev-plugin/commit/80773a4cf95da04117b9e17ff516ca9626a1a601))
* **milestone-lifecycle:** add name validation and status integration ([8181b11](https://github.com/agentic-development/adev-plugin/commit/8181b11c452112344476f16afe1152123745beaf))
* **milestone-lifecycle:** add resolveStrategy helper for release strategy dispatch ([b5c8593](https://github.com/agentic-development/adev-plugin/commit/b5c85939f6a6ab0a596b688136255dfd137383bf))
* **milestone-lifecycle:** add strategy dispatch and manual strategy to milestoneShip ([d2feb83](https://github.com/agentic-development/adev-plugin/commit/d2feb83893390d4d5393178c0af1a38330b92904))
* **milestone-lifecycle:** create milestone 1.0.0 targeting 2026-05-14 ([6e38dcd](https://github.com/agentic-development/adev-plugin/commit/6e38dcdb5219b83239a35975e83c21ce8004fc9a))
* **milestone-lifecycle:** implement milestone create and list commands ([d93bfa3](https://github.com/agentic-development/adev-plugin/commit/d93bfa3fb9f29083558e520559b10f22ccd8f4eb))
* **milestone-lifecycle:** implement release-please strategy ([4d78b3d](https://github.com/agentic-development/adev-plugin/commit/4d78b3dc2ff7ccb1505299a7a08eff3b9e8d2596))
* **milestone-lifecycle:** implement tag-only release strategy ([c6ab097](https://github.com/agentic-development/adev-plugin/commit/c6ab0970d7c7ffe23945c29cc490feb03f63fce1))
* **milestone-lifecycle:** serialize release strategy object in milestones I/O ([cdeca69](https://github.com/agentic-development/adev-plugin/commit/cdeca69915b00ddaac29b55277947a853d221f46))
* **milestone-lifecycle:** strategy-based release execution for milestone ship ([5dc400e](https://github.com/agentic-development/adev-plugin/commit/5dc400e15f0727816c0399640f9357af75a0bf19))
* output personas — adapt plugin outputs to user role ([f87c956](https://github.com/agentic-development/adev-plugin/commit/f87c956a765e1fdfec1a4ca002c44c84d3f309ae))
* **plan:** add Task Summary table to plan output (issue-191) ([f855144](https://github.com/agentic-development/adev-plugin/commit/f855144ad761460d22fef1b5435a175d8dc3824d))
* **plan:** add Task Summary table to plan output (issue-191) ([6c4b3a4](https://github.com/agentic-development/adev-plugin/commit/6c4b3a4a922d1157f2ee3789899347c03ffeec8c))
* **planning:** add 5 plan-reviewer checks for task sizing, secrets, complexity, infra, and test scenarios ([a695e76](https://github.com/agentic-development/adev-plugin/commit/a695e76ea3fe6a700291b21ad32951c97b1f7988))
* **planning:** strengthen plan-reviewer with 5 new checks ([1e024bc](https://github.com/agentic-development/adev-plugin/commit/1e024bc28a24153f1464b9e422358ccf91afa367))
* **prototype-brainstorm:** add file copy with dedup and directory creation for visual references ([7906f91](https://github.com/agentic-development/adev-plugin/commit/7906f91325db10ba2d99cae6db318db40600487b))
* **prototype-brainstorm:** add file copy with dedup and directory creation for visual references ([016b6c9](https://github.com/agentic-development/adev-plugin/commit/016b6c95e3235b072eea4c9d94d11e33eabc1f68))
* **prototype-brainstorm:** add path validation, format checking, and slugification for visual references ([346b2fd](https://github.com/agentic-development/adev-plugin/commit/346b2fde0a82561aabf76989732c6435859aa068))
* **prototype-brainstorm:** add path validation, format checking, and slugification for visual references ([89293b9](https://github.com/agentic-development/adev-plugin/commit/89293b99eca428924ae5e2b66eb9ea8633d17dea))
* **prototype-brainstorm:** add session tracker and summary generation for visual references ([998c785](https://github.com/agentic-development/adev-plugin/commit/998c785467b5d6e221e13428350cd0debd6b0b2c))
* **prototype-brainstorm:** add session tracker and summary generation for visual references ([778ab8b](https://github.com/agentic-development/adev-plugin/commit/778ab8b1517f6a67dcc7b37dee77026797bc92aa))
* **prototype-brainstorm:** brainstorm-integration implementation and build artifacts ([79393b8](https://github.com/agentic-development/adev-plugin/commit/79393b821e93607df30c85e5f10a4d4fc6f5f561))
* **prototype-brainstorm:** integrate visual reference capture into prototype SKILL.md ([8a102a0](https://github.com/agentic-development/adev-plugin/commit/8a102a0917a66f544d5b74c36c597525cfc7de7a))
* **prototype-brainstorm:** integrate visual reference capture into prototype SKILL.md ([6561985](https://github.com/agentic-development/adev-plugin/commit/656198557433a9196cecbdacf435137b2f7c08cc))
* **provenance:** add Spec: commit trailer requirement to constitution ([966028f](https://github.com/agentic-development/adev-plugin/commit/966028f8758b7fad49101f9cf90264fa55d9f1bd))
* **provenance:** add Spec: commit trailer requirement to constitution ([9bfc0b9](https://github.com/agentic-development/adev-plugin/commit/9bfc0b970c9b78dfd620297ff1f4b805ba994553))
* **release:** 0.23.0 — integration test strategy and plan infra requirements ([ec87394](https://github.com/agentic-development/adev-plugin/commit/ec873948648babb26cb7aeda1f208a1d2bf661ba))
* review and fix Phase 2 heuristics specs ([30c0d49](https://github.com/agentic-development/adev-plugin/commit/30c0d4979ba16f096c42757be186be235a5551e0))
* revise heuristics charter for Phase 2 progressive disclosure ([caff423](https://github.com/agentic-development/adev-plugin/commit/caff4235ae61759a8e35716c70ef1eef2a566883))
* **skills:** add --verbose override for silent execution ([c517be1](https://github.com/agentic-development/adev-plugin/commit/c517be1bdf8043ed606bc592a3a39294d6f68280))
* **skills:** add --verbose override for silent execution ([eb71644](https://github.com/agentic-development/adev-plugin/commit/eb716440a2307fa3c1b2d0182592408bdbfb61d9))
* **skills:** add artifact-to-disk output protocol to 5 skills ([5f14976](https://github.com/agentic-development/adev-plugin/commit/5f149760e02b90c016a5c9a96eb8ad8deb1c6df3))
* **skills:** add artifact-to-disk output protocol to 5 skills ([9f78a10](https://github.com/agentic-development/adev-plugin/commit/9f78a105aaf343d06f343642fb44dc22e3f2fc96))
* **skills:** add silent execution protocol to all SKILL.md files ([6abb364](https://github.com/agentic-development/adev-plugin/commit/6abb36485fde53ba4d7dbe86fd5f9f4287a42522))
* **skills:** add silent execution protocol to all SKILL.md files ([88db8b2](https://github.com/agentic-development/adev-plugin/commit/88db8b2158452c90f01cf7ae3c1188ff19f91d53))
* **skills:** add source-manifest-guided context loading ([43646c3](https://github.com/agentic-development/adev-plugin/commit/43646c3de38d2657b7c1d8d60aa98bf029c5c029))
* **skills:** add source-manifest-guided context loading ([bb9de67](https://github.com/agentic-development/adev-plugin/commit/bb9de67b3facb406ec87461864503efd40f54c86))
* **skills:** integrate meta-tools into plan, implement, status, validate ([e2c188f](https://github.com/agentic-development/adev-plugin/commit/e2c188fb830c6e061009783aba29b255c1bdebd2))
* **skills:** integrate meta-tools into plan, implement, status, validate ([21a676e](https://github.com/agentic-development/adev-plugin/commit/21a676e43558564a155c0168ab154763e0c56a60))
* **skills:** split plan and build into core + mode companions ([4268268](https://github.com/agentic-development/adev-plugin/commit/42682684a83f0fac3877e6d592afb07595280e28))
* **skills:** split plan and build into core + mode companions ([3008cd9](https://github.com/agentic-development/adev-plugin/commit/3008cd956c3373ba4b5d4c71e4e8c93ca499cef7))
* **skills:** widen heuristic injection to debug/brainstorm/specify/review-specs/validate ([88719ad](https://github.com/agentic-development/adev-plugin/commit/88719ad21fbf4a79ffe73471a119b1a798384a2e))
* **spec-drift-detection:** add 3 live specs covering all 7 capabilities ([353cb44](https://github.com/agentic-development/adev-plugin/commit/353cb445344a1ac84f1d1a212c4139681735b75c))
* **spec-drift-detection:** add 3 live specs covering all 7 capabilities ([6e26535](https://github.com/agentic-development/adev-plugin/commit/6e2653595a0f834ae854f43c6c532c2f2e93edc8))
* **spec-drift-detection:** add clearDrift instruction to implement SKILL.md ([c22e2ee](https://github.com/agentic-development/adev-plugin/commit/c22e2eef0b389c7318ccf238128c679e769b04b2))
* **spec-drift-detection:** add clearDrift instruction to implement SKILL.md ([b1bb3a1](https://github.com/agentic-development/adev-plugin/commit/b1bb3a1f295f1b8bf9b612cfed76335abacd108b))
* **spec-drift-detection:** add CODE_DRIFT gate to plan SKILL.md ([dc6557e](https://github.com/agentic-development/adev-plugin/commit/dc6557edb2961207dc62686d9851fceba1b0a811))
* **spec-drift-detection:** add CODE_DRIFT gate to plan SKILL.md ([4b0be3e](https://github.com/agentic-development/adev-plugin/commit/4b0be3e613b6775205532187c4ea18dec1b20c8e))
* **spec-drift-detection:** add drift integration to validate and hygiene SKILL.md ([d4f2932](https://github.com/agentic-development/adev-plugin/commit/d4f2932bfac7a4df2552119cb35e8ada42b2b72b))
* **spec-drift-detection:** add drift integration to validate and hygiene SKILL.md ([2154483](https://github.com/agentic-development/adev-plugin/commit/2154483b70c4f2c3909a15da7eb49c2024924677))
* **spec-drift-detection:** add lib/spec-drift.mjs with scan, stamp, clear, hasDrift ([c9652c4](https://github.com/agentic-development/adev-plugin/commit/c9652c444c78eafb5d532d6cc0d67ac74e8e9da8))
* **spec-drift-detection:** add lib/spec-drift.mjs with scan, stamp, clear, hasDrift ([cd1527a](https://github.com/agentic-development/adev-plugin/commit/cd1527a838252a4e3a1944aceaac77c73751490f))
* **spec-drift-detection:** approve charter ([2faa436](https://github.com/agentic-development/adev-plugin/commit/2faa436fd2ba244bc3907d6804ce6675d07655b5))
* **spec-drift-detection:** approve charter ([d63669f](https://github.com/agentic-development/adev-plugin/commit/d63669f18ff809b4f5b183f6c8be9c7e1c8a933b))
* **spec-drift-detection:** architecture review — all 3 specs pass with notes ([9f16f92](https://github.com/agentic-development/adev-plugin/commit/9f16f9269ae77d4de40354226ccd65fc8154ce4e))
* **spec-drift-detection:** architecture review — all 3 specs pass with notes ([78a06f6](https://github.com/agentic-development/adev-plugin/commit/78a06f6d1d4c0ed0d02b06bd89eed76a0693c457))
* **spec-drift-detection:** create implementation plan with 5 tasks ([a01115d](https://github.com/agentic-development/adev-plugin/commit/a01115d4571c1aef8c8215632bb5a3fa4a21ba30))
* **spec-drift-detection:** create implementation plan with 5 tasks ([c9e70da](https://github.com/agentic-development/adev-plugin/commit/c9e70da9192497fc3e9fba3cb47dfadea659f745))
* **spec-drift-detection:** extend sync-trigger.sh with drift detection ([c578b8d](https://github.com/agentic-development/adev-plugin/commit/c578b8dcd4600d11358f816b10537a53d03744b7))
* **spec-drift-detection:** extend sync-trigger.sh with drift detection ([d41a51e](https://github.com/agentic-development/adev-plugin/commit/d41a51e83807d00f1c46c857b22a1452560b13ed))
* **spec-drift-detection:** validation PASS — all 3 specs validated ([0a31486](https://github.com/agentic-development/adev-plugin/commit/0a314868de9c3f8f4a4858a4cd291ed54bdbf3c2))
* **spec-drift-detection:** validation PASS — all 3 specs validated ([3ae6ad9](https://github.com/agentic-development/adev-plugin/commit/3ae6ad93c549b7513462e66ecceee794bbd660ac))
* **specs:** spec, review, and plan for .spec.md suffix migration (epic-48) ([85937e0](https://github.com/agentic-development/adev-plugin/commit/85937e05492ac4b0ae9006482483bbcabb75ac33))
* **specs:** spec, review, and plan for .spec.md suffix migration (epic-48) ([9b0d516](https://github.com/agentic-development/adev-plugin/commit/9b0d516990eaff4a4a3f52c2a419d231b6e048a1))
* **specs:** spec, review, and plan for .spec.md suffix migration (epic-48) ([a3bbc2c](https://github.com/agentic-development/adev-plugin/commit/a3bbc2ce97dea2e3b329becc89b812d37ec78d7a))
* **strategic-planning:** add Full Pipeline (--full) and blocker-fix loop to adev:build ([36b8494](https://github.com/agentic-development/adev-plugin/commit/36b849459364002774f370623f431cb08d4a2f4f))
* **strategic-planning:** add One-Step-Per-Invocation dispatch model to adev:build ([4023826](https://github.com/agentic-development/adev-plugin/commit/4023826af0d1a0df7138bdd317cb34d07c88cba7))
* **strategic-planning:** add One-Step-Per-Invocation dispatch model to adev:build ([20b2c1c](https://github.com/agentic-development/adev-plugin/commit/20b2c1c1f8c539266ca7a46a142f11044bad4f08))
* **strategic-planning:** add One-Step-Per-Invocation dispatch model to adev:build ([15a8ecd](https://github.com/agentic-development/adev-plugin/commit/15a8ecdd1770d7816bd9b4aa1013d30d928e278b))
* **strategic-planning:** fix phase filter and add zombie build detection to adev:build ([85be728](https://github.com/agentic-development/adev-plugin/commit/85be7281bbfee26ead3e96d5123e1033a359b72c))
* **strategic-planning:** reinforce subagent isolation and state-first protocol in adev:build ([6d164ef](https://github.com/agentic-development/adev-plugin/commit/6d164ef33633f5a19cf54b1042098afc15d67f3f))
* **strategic-planning:** reinforce subagent isolation and state-first protocol in adev:build ([989c8fc](https://github.com/agentic-development/adev-plugin/commit/989c8fc446a2bfa9ad54552c887ab823c603d6a8))
* **strategic-planning:** reinforce subagent isolation and state-first protocol in adev:build ([4fc46d6](https://github.com/agentic-development/adev-plugin/commit/4fc46d6ed0a43c8e48c4500d6919dc7f85bf1cd9))
* **sync:** add Learned Lessons section injection to /adev:sync ([2833bd8](https://github.com/agentic-development/adev-plugin/commit/2833bd8eb87ad651d1051ffb7a3d79638c588836))
* **test-strategies:** add infra requirements check to plan reviewer prompt ([0a3d6a5](https://github.com/agentic-development/adev-plugin/commit/0a3d6a53d293ac44c63f84da3b360b55e2dbc40d))
* **test-strategies:** add infra requirements prompt to specify Step 4.5 ([97f4415](https://github.com/agentic-development/adev-plugin/commit/97f4415203f90ca18672a7722ffd4dda60929e28))
* **test-strategies:** add infra requirements section emission to plan SKILL.md ([8882e67](https://github.com/agentic-development/adev-plugin/commit/8882e674a4b75e2759c5912f4587bf709f10055f))
* **test-strategies:** add infra_requirements field to live spec template ([bd3ac26](https://github.com/agentic-development/adev-plugin/commit/bd3ac264a165a9867756a80d89625ed55ab73fec))
* **test-strategies:** add integration gaming detection patterns ([c1cd582](https://github.com/agentic-development/adev-plugin/commit/c1cd5827b9c66854a8d47f339ad2982d44b20356))
* **test-strategies:** add integration strategy detection heuristics ([d8fd18c](https://github.com/agentic-development/adev-plugin/commit/d8fd18cbf13e42a7adec36dbf31d84ed73a37351))
* **test-strategies:** add integration strategy profile ([cf03ac5](https://github.com/agentic-development/adev-plugin/commit/cf03ac50cbc3a0d9885a9d0afc1618485dee1ef8))
* **test-strategies:** add mandatory infra block instruction to write-test skill ([55ca95a](https://github.com/agentic-development/adev-plugin/commit/55ca95a9c8719f46cf12f1f9e6328d413f69021c))
* **test-strategies:** enforce fail-hard principle for integration tests (issue-192) ([f1f81d0](https://github.com/agentic-development/adev-plugin/commit/f1f81d0be4bd6bf3b618b082b4dbd9b28efdf6d8))
* **test-strategies:** register integration as 9th strategy type ([33d1880](https://github.com/agentic-development/adev-plugin/commit/33d1880fb6f3d92ff5010efd1bfb414e02dfe0c5))
* **user-docs:** absorb and rewrite docs/governance.md with prerequisites ([43c4f5c](https://github.com/agentic-development/adev-plugin/commit/43c4f5c96ed7db38dbe6200dc997d405b3d047c2))
* **user-docs:** absorb and rewrite docs/test-strategies.md with prerequisites ([fa81edc](https://github.com/agentic-development/adev-plugin/commit/fa81edc3b36c392fda784c44dc41bcce6a099a7d))
* **user-docs:** absorb and rewrite docs/workspaces.md with prerequisites ([919dd46](https://github.com/agentic-development/adev-plugin/commit/919dd46f6becdb41503689d20de895eaa71a68e9))
* **user-docs:** add 6 live specs covering all documentation capabilities ([d400597](https://github.com/agentic-development/adev-plugin/commit/d40059770b02d119c36bca73487b351d859673a3))
* **user-docs:** add breadcrumb and next/previous navigation to all docs pages ([81a7642](https://github.com/agentic-development/adev-plugin/commit/81a764226bbfa565f1b32f8d451c6c0429d92d11))
* **user-docs:** add cross-links to skill reference in advanced guides ([d7d13b4](https://github.com/agentic-development/adev-plugin/commit/d7d13b4c8edaaaddf5c3616cec9a03dfcbb210f5))
* **user-docs:** add cross-page link verification and next-page navigation tests ([c16438d](https://github.com/agentic-development/adev-plugin/commit/c16438d9334e4869c6d56df9cb280fb4fd5671d5))
* **user-docs:** add docs/concepts.md with four pillars overview ([940807c](https://github.com/agentic-development/adev-plugin/commit/940807ce7c11e72671cb1df51f8b5fdf52d85863))
* **user-docs:** add docs/getting-started.md absorbing quickstart content ([f04a0b9](https://github.com/agentic-development/adev-plugin/commit/f04a0b9a0951e2d9f5fc16674de68199a4fee2b9))
* **user-docs:** add docs/installation.md with setup guide ([e4b1d23](https://github.com/agentic-development/adev-plugin/commit/e4b1d23a6ec8899c48094d6bd89763940182e529))
* **user-docs:** add docs/README.md table of contents ([8861425](https://github.com/agentic-development/adev-plugin/commit/88614251ccdc57c43b1cf47a99b11bef9da8c7d9))
* **user-docs:** add docs/troubleshooting.md with FAQ and symptom-based guide ([7caf5d9](https://github.com/agentic-development/adev-plugin/commit/7caf5d9f670c5892aed12396092b356eb4a20f1d))
* **user-docs:** add four lifecycle-phase workflow guides ([f086c49](https://github.com/agentic-development/adev-plugin/commit/f086c49d8ad86e9325c040e4bb1f6b5bf1adaa2a))
* **user-docs:** add reference section — skill reference, configuration, and hooks docs ([e89671f](https://github.com/agentic-development/adev-plugin/commit/e89671f9478174507db053ce7e3c0056bf13e254))
* **user-docs:** architecture review passed for all 6 specs ([ecb4b65](https://github.com/agentic-development/adev-plugin/commit/ecb4b65b072160eff4684f8fc8388f86d561dd4b))
* **user-docs:** mark support-polish plan complete and spec implemented ([a9526d5](https://github.com/agentic-development/adev-plugin/commit/a9526d55f44c5ad7264bbe44e2c9c960c2cd2fcd))
* **user-docs:** remove quickstart.md (absorbed into getting-started.md) ([69e8f43](https://github.com/agentic-development/adev-plugin/commit/69e8f43b6d92b00f3a9c9c76df0c9b28974ea131))
* **user-docs:** remove superseded docs files ([0623ca2](https://github.com/agentic-development/adev-plugin/commit/0623ca21594a5947d7f0cf50052e7ed466b5a7a5))
* **user-docs:** update README.md to point to new docs structure ([6279f68](https://github.com/agentic-development/adev-plugin/commit/6279f68ca89f564ed93894faed11e1c46e7c42e0))
* **user-docs:** update spec status and charter after advanced guides implementation ([c130d00](https://github.com/agentic-development/adev-plugin/commit/c130d0009f5a683b88f27e0be72111e6c436521f))
* **user-docs:** update spec status to implemented and mark plan tasks complete ([5386b4d](https://github.com/agentic-development/adev-plugin/commit/5386b4d5d53f12e1781a7487fcbc4b7575df6fd3))
* **user-docs:** validate all specs, reconcile lifecycle, and apply doc improvements ([d1a3a6a](https://github.com/agentic-development/adev-plugin/commit/d1a3a6a518f689b2bb45396e845b8598951e434e))
* **user-docs:** validate and fix all dead links across docs/ ([bb872c4](https://github.com/agentic-development/adev-plugin/commit/bb872c4ff61ac950f60477779e9a1df8370aee5a))
* **user-docs:** verify TOC links and fix broken references in advanced guides ([96e20ca](https://github.com/agentic-development/adev-plugin/commit/96e20ca01aff11265debc38f15ad816548754f27))


### Bug Fixes

* address charter review issues for milestone-lifecycle ([3db64c6](https://github.com/agentic-development/adev-plugin/commit/3db64c6fb449d9f1460bb7543e16b02ff12bb1f2))
* **brainstorm:** add Step 3b to checklist so prototype offer is not skipped ([e13bd6a](https://github.com/agentic-development/adev-plugin/commit/e13bd6a0164ce0a5bc7c07716e272a8c58e0eac2))
* **build:** replace pseudo-invocation with subagent delegation model ([f9eea3c](https://github.com/agentic-development/adev-plugin/commit/f9eea3cdc16927eb1b5eff914492d0da3d55d262))
* **build:** subagent delegation model for pipeline steps ([3fe2589](https://github.com/agentic-development/adev-plugin/commit/3fe258938ccc8122cee9d3ab59b6dd87ddfd90ce))
* **charter:** address review issues — API overlap, boundary clarity, spec-lifecycle relationship ([869a63d](https://github.com/agentic-development/adev-plugin/commit/869a63dac87661fa4aa99edd4e4ad87c73130efa))
* **charter:** address review issues — API overlap, boundary clarity, spec-lifecycle relationship ([79d47ea](https://github.com/agentic-development/adev-plugin/commit/79d47eaba4624d2e85b30e17c3372ca8f37f5de1))
* **cli:** gitignore transient state files and propagate to user projects ([1e00d52](https://github.com/agentic-development/adev-plugin/commit/1e00d52cf212e307f2945d9ab49b73ad9072d94e))
* **cli:** gitignore transient state files and propagate to user projects ([5d48e7b](https://github.com/agentic-development/adev-plugin/commit/5d48e7bf40112dc8d236d8a88eb4fda2ea5dc904))
* **cli:** replace readlink -f with realpathSync to fix silent failure on macOS ([1345729](https://github.com/agentic-development/adev-plugin/commit/13457298df011baf6797cc5ed0b1c67bafb229d1))
* **cli:** replace readlink -f with realpathSync to fix silent failure on macOS ([c16e0d0](https://github.com/agentic-development/adev-plugin/commit/c16e0d0dbdda8d5c8840c5e5da5c9e6f3a9c195a))
* **context-pack:** resolve repoRoot symlinks before computing relative path ([20805b1](https://github.com/agentic-development/adev-plugin/commit/20805b14010282bb8f10e4b3cfe819b9495a25d3))
* **docs:** restructure project-types.md with h2 sections per project type ([ec93b15](https://github.com/agentic-development/adev-plugin/commit/ec93b15ff2ace4705c846896262f3d24dad647af))
* **domain-profiles:** address review findings — charter alignment, correct counts ([acca614](https://github.com/agentic-development/adev-plugin/commit/acca61435d489c6cf4bef5b8484eaaef8dfcf6e6))
* file issue-124 — build skips post-task implement steps ([9245350](https://github.com/agentic-development/adev-plugin/commit/9245350672577338c9a0f78556b23f4f1bb55f8c))
* **heuristics:** propagate tags field through writeHeuristic ([d6640ba](https://github.com/agentic-development/adev-plugin/commit/d6640baa9822b6f7d266357ac0d166df29d96b8e))
* **hooks:** commit lifecycle-gate hook scripts missing from repo ([7cb4e5d](https://github.com/agentic-development/adev-plugin/commit/7cb4e5dbbc667f795a28da0f3df1f1aaf6d3f5b5))
* **hooks:** commit lifecycle-gate hook scripts missing from repo ([3aa460e](https://github.com/agentic-development/adev-plugin/commit/3aa460e6555168a935bf2aecdc9dfb976bfc61b6))
* **hooks:** register lifecycle-gate hooks and fix session-start test isolation ([96664a8](https://github.com/agentic-development/adev-plugin/commit/96664a85ea69d7f445054bf8ea0f5406b8e4bd05))
* **implementation:** correct computeManifest call signature in implement SKILL.md ([ef2dea2](https://github.com/agentic-development/adev-plugin/commit/ef2dea2c7ca9a4d7d14c3e9a8fda19c7db7e7dc0))
* **implement:** mark plan file checkboxes done after task completion ([a30313c](https://github.com/agentic-development/adev-plugin/commit/a30313c796cd7c7f42d111d2b79a9ef34074b5bd))
* **infra-preflight:** address review blockers and warnings ([7893673](https://github.com/agentic-development/adev-plugin/commit/789367340060d8724876165066a3054091131c13))
* **infra-preflight:** address review blockers and warnings ([f2d216a](https://github.com/agentic-development/adev-plugin/commit/f2d216a5778d41d17c61b405aeffd9db1707710d))
* **infra-preflight:** address skill-integration review blockers and warnings ([6c1b82e](https://github.com/agentic-development/adev-plugin/commit/6c1b82e9c0c9a7813314a67f23d1d6c3deadceb4))
* **infra-preflight:** address skill-integration review blockers and warnings ([8ba5a9c](https://github.com/agentic-development/adev-plugin/commit/8ba5a9c6d6ca2a2ac561540b5a8bdf502cc80bb8))
* **init:** skip cpSync when hook src and dest are same path ([de35cb3](https://github.com/agentic-development/adev-plugin/commit/de35cb320b4352eccd9a08e9fca234492b7c242b))
* **init:** skip cpSync when hook src and dest resolve to same path ([9343b17](https://github.com/agentic-development/adev-plugin/commit/9343b17f79732c9e87d672999cd54e01ba7e836f))
* **lifecycle-gate:** block source edits when no lifecycle session is active ([b289b8f](https://github.com/agentic-development/adev-plugin/commit/b289b8fc0c5fbee67a4c0a710a2e21e314bf5e90))
* **maintenance:** hygiene audit fixes — dead code removal, constitution sync, shell-import detection ([c9c5ddd](https://github.com/agentic-development/adev-plugin/commit/c9c5ddd7f1a38048361d2907b541f62ba0f45c93))
* **maintenance:** hygiene audit fixes — dead code removal, constitution sync, shell-import detection ([1ec188b](https://github.com/agentic-development/adev-plugin/commit/1ec188b74ac17ff651efc12b94f7758e9a9f5b67))
* mark plan checkboxes done after task completion ([5c81e30](https://github.com/agentic-development/adev-plugin/commit/5c81e30c7daf696db3bb090615e70978996f23ac))
* **output-personas:** add persona-awareness to skill output templates ([b51757f](https://github.com/agentic-development/adev-plugin/commit/b51757fe33d9550a36e1514bc42154513b6f1a45))
* **planning:** plan QG checkboxes never checked off + getPlanProgress boundary bug ([be22c87](https://github.com/agentic-development/adev-plugin/commit/be22c87d24333a72e74bc6dfae623af4425f7991))
* **plans:** correct strategy assignment to unit via resolveStrategy chain ([ba81f0f](https://github.com/agentic-development/adev-plugin/commit/ba81f0fd7436d869426ef9dd198d3708d3f62607))
* **prototype:** propose heuristics instead of asking user to recall them ([aabe16a](https://github.com/agentic-development/adev-plugin/commit/aabe16ae96bfce037d35cbe9ca0efb1ce3bf383c))
* **review-specs:** capture file-sha after Step 7 status update (issue-187) ([c663fde](https://github.com/agentic-development/adev-plugin/commit/c663fde0fcc7b72f67451bf756b53c67ede951af))
* **skills:** exclude *-validation.md from spec scanning (issue-245) ([168f78b](https://github.com/agentic-development/adev-plugin/commit/168f78b901166197f9b9a57b37f0236f74f77777))
* **skills:** exclude *-validation.md from spec scanning (issue-245) ([a538e7f](https://github.com/agentic-development/adev-plugin/commit/a538e7f5e397a95dbbee3501d46f52c86a2c0d67))
* **skills:** remove ineffective preamble and parallel annotations ([97b27b6](https://github.com/agentic-development/adev-plugin/commit/97b27b608185bbec47e2f46c31ad7c93b57f207e))
* **skills:** remove ineffective preamble and parallel annotations ([08796fc](https://github.com/agentic-development/adev-plugin/commit/08796fc483c7deb75b24810da68535b379c5483f))
* **spec-drift-detection:** remove ^ anchor from frontmatter regex in stampDrift/clearDrift ([c8687cd](https://github.com/agentic-development/adev-plugin/commit/c8687cda3d19113a55eae9f59712b3fb2296be73))
* **spec-drift-detection:** remove ^ anchor from frontmatter regex in stampDrift/clearDrift ([31fea74](https://github.com/agentic-development/adev-plugin/commit/31fea74ef7641b3f5d4658f6820732a1d4035cbf))
* **specs:** declare test_strategy: unit in spec frontmatter ([f276271](https://github.com/agentic-development/adev-plugin/commit/f276271b86b7006b3edaec8e3d8511e40507c752))
* stamp source manifest on persona-resolution-and-injection spec ([5f819b3](https://github.com/agentic-development/adev-plugin/commit/5f819b330a7c13a016046f0bb25d98ea0e2b1362))
* **strategic-planning:** fix B1 route omission and add validate to build state example in spec ([fa5d711](https://github.com/agentic-development/adev-plugin/commit/fa5d7119b02f49e885b63bdb6c46d8e6b2fcc75b))
* **strategic-planning:** fix resume-mode valid step names to include specify ([d31fad1](https://github.com/agentic-development/adev-plugin/commit/d31fad1e41181958ac5698565f9d9ef9cf922182))
* **strategic-planning:** fix resume-mode valid step names to include specify ([81a19f3](https://github.com/agentic-development/adev-plugin/commit/81a19f3e329d632d01edc89353b642bbd9b13a6f))
* **strategic-planning:** fix resume-mode valid step names to include specify ([f1058e3](https://github.com/agentic-development/adev-plugin/commit/f1058e3acda7623941ddca17f84775b771c77e28))
* **tests:** remove broken comparison-harness test, fix eval fixture thresholds ([37cdfce](https://github.com/agentic-development/adev-plugin/commit/37cdfce2cc42531382f84858e7a2e74f16559200))
* **using-adev:** harden skill invocation rule to prevent lifecycle bypass ([403f8f2](https://github.com/agentic-development/adev-plugin/commit/403f8f2bb6ac90e9bfb7d69b1f7a4ee38aa99034))
* **validate:** add plan checkbox completion check (12e) ([aa996cd](https://github.com/agentic-development/adev-plugin/commit/aa996cd149f9822f140219c95cb84082bd02c87b))
* **validate:** fix three ghost-validation failure modes (issue-184) ([7029380](https://github.com/agentic-development/adev-plugin/commit/70293801ef4363f5b9a75a213d51b0151fa76b0c))
* **validate:** prevent ghost validation — Check 1.5 and Check 2 hardening ([eaa14a2](https://github.com/agentic-development/adev-plugin/commit/eaa14a255fc0e0d6e97f5e6ea1c9d21499cfbb1f))

## [0.24.0] — 2026-05-09

### Infrastructure Preflight

Runtime verification of external system availability before skills execute code or tests. When a spec or plan declares `infra_requirements`, the preflight runs automatically and blocks execution with actionable diagnostics if any system is unavailable.

- **`lib/infra-preflight.mjs`** — generic verification runner: env var presence checks, CLI tool PATH/version checks, and probe commands via `execFileSync` (no shell — manual `$VAR` substitution per-token)
- **Extended `infra_requirements` schema** — new fields: `cli_tools` (string or `{name, version}` object form), `probe` (connectivity command), `check_level` (`full` | `presence-only` | `skip`), `timeout` (per-system probe timeout), `env_file` (path to `.env` file, validated within project root)
- **Skill integration** — preflight step added to 7 skills:
  - **Mandatory** (implement, validate, build, write-test): always run when `infra_requirements` present; block on failure
  - **Conditional** (debug, eval, recover): run when spec/plan with `infra_requirements` can be located via arguments, active plan, or module inference
- **`--no-infra` bypass** — user-only flag (agent prohibited from setting it); also accepts `ADEV_NO_INFRA=1` env var as fallback
- **`@dotenvx/dotenvx` dev dependency** — full `.env` file support (multiline values, variable expansion, cascading) for all projects using adev; falls back to internal `parseDotenv` when unavailable (ADR 0006)
- **Security hardening** — probe output sanitized at capture time (200 char, ANSI stripped); `env_file` path traversal blocked; CLI tool names validated against `[a-zA-Z0-9._-]+`; dispatch detection via `ADEV_DISPATCHED_BY` env var
- **70 new tests** (40 unit for lib, 30 content-presence for SKILL.md files)

### Reality Check (Confidence-Backed Lifecycle Verification)

Verifies lifecycle artifact status fields against actual codebase state before trusting metadata. Prevents ghost validations and stale issue boards.

- **`lib/reality-check.mjs`** — shared helper: `verifySpecImplemented()`, `verifyIssueCompleted()`, `verifyCapabilityStatus()`, `formatConfidenceNote()`
- **Confidence levels** — HIGH (committed + tests pass), MEDIUM (committed), LOW (weak evidence), NONE (contradicts reality)
- **validate** — Check 12 uses reality-check before flagging drift; "After Validation" closes issues only at HIGH confidence with audit-trail notes
- **debug** — Phase 6 closes matching bug issue with confidence note when fix is verified (quality gates pass + spec compliant)
- **hygiene** — Pass 12 step 8: new "Reality Drift" audit detects specs claiming done with no codebase evidence (REALITY_DRIFT, REALITY_WARN)
- **reconcile** — verification guard before closing epics/issues; blocks auto-close when confidence is LOW/NONE
- **26 new tests** (14 unit + 12 fixture integration against integration-sandbox)

### Spec Drift Detection (Real-Time Code-Side Drift)

Real-time awareness when implementation code diverges from its governing spec. Inspired by Kiro's living specs, but implemented as an advisory hook rather than a blocking gate. Complements the existing spec-lifecycle git-drift-detection (spec-side drift) with code-side drift detection.

- **`lib/spec-drift.mjs`** — four functions: `scanForDrift` (scans all spec source manifests for a given file path), `stampDrift` (writes `drift_detected`, `drift_source`, `drift_at` to spec frontmatter), `clearDrift` (removes drift fields), `hasDrift` (reads drift flag). Zero external dependencies.
- **`hooks/sync-trigger.sh` extended** — detects edits to source-manifest-tracked files on every `PostToolUse:Edit` event. Emits advisory JSON warning to stdout; never blocks (exit 0). Path validation ensures edited file is within project root.
- **Downstream skill integration:**
  - **plan** — `CODE_DRIFT` gate blocks planning when `drift_detected: true`; `verifyManifest()` fallback for non-Claude-Code hosts
  - **validate** — non-blocking warning when drift flag is set
  - **hygiene** — new "Code Drift" audit pass (Pass 17) reports all drifted specs
  - **implement** — `clearDrift()` called after source manifest re-stamp in GREEN phase
- **Host portability** — drift flag is an acceleration for Claude Code hooks; on other hosts, skills detect drift via existing `verifyManifest()` SHA comparison
- **34 new tests** (16 unit for lib, 6 hook integration, 12 content-presence for SKILL.md files)

### Prototype Brainstorm (`/adev:prototype`)

Tiered prototype generation from Feature Charters. Generates wireframe, mockup, or functional prototypes, serves them via localhost, and iterates on conversational feedback.

- **Zero-dep HTTP server** — `lib/prototype-server.mjs` binds to `127.0.0.1` only, scans ports 3210-3219, serves raw files with MIME detection and path traversal protection
- **Visual reference capture** — `lib/visual-references.mjs` copies user-provided screenshots to `.context-index/references/<module>/visuals/` with slugified filenames, dedup, format validation (PNG/JPG/WebP, 10 MB max), and session tracking
- **Standalone invocation** — `--module`, `--tier`, `--framework` arguments; charter discovery when `--module` omitted; context construction from charter Business Intent and Capability Map
- **Module validation** — `lib/prototype-args.mjs` validates kebab-case names (`^[a-z0-9][a-z0-9-]*$`, max 64 chars) and discovers charters via directory scan
- **Session summary** — standalone sessions end with tier, iteration count, persistence choice, visual references, and heuristics saved
- **Brainstorm integration** — accepts structured context from `/adev:brainstorm` Step 3b, returns `PROTOTYPE_RESULT` on completion
- **44 new tests** (server security, visual references, prototype-args validation and discovery)

### Build Pipeline Enhancements

- **`--auto` flag** — runs the entire `/adev:build` pipeline without prompting the user. Stale builds auto-overwrite, subagents receive `AUTO: true` directive. Useful for CI, scheduled builds, and batch operations.
- **`lib/build-state.mjs`** — programmatic helper with `readBuildState`, `createBuildState`, `recordStepResult`, `getNextStep`. Replaces manual JSON writing in the dispatch loop. 26 new tests.
- **One-step-per-invocation dispatch** — orchestrator executes exactly one pipeline step per turn, persists state, and re-invokes itself. Prevents context accumulation from causing step-skipping.

### Eval Projects

- **Migration eval** — dbt+DuckDB pipeline with planted bug (incorrect JOIN type), comparison harness with LLM judge
- **Automation eval** — multi-step automation scenario with file processing and validation

### Fixes

- **Ghost validation prevention (issue-184)** — Check 1.5 now verifies files are git-tracked (not just existing on disk) and uses the correct two-argument `verifyManifest(manifest, projectRoot)` API with SHA-256 comparison. Check 2 requires explicit Read tool calls before citing file:line references, with anti-fabrication rule preventing inferred citations.
- **Review-specs file-sha ordering (issue-187)** — Step 6 writes `file-sha: <PENDING>` placeholder, new Step 6b stamps final SHA after Step 7 updates the spec status. Fixes false hash drift on next planning invocation.
- **Plan Quality Gates checkbox bug** — `getPlanProgress` now stops at `## Quality Gates` heading boundary instead of attributing QG checkboxes to the last task. All 63 existing plans migrated from checkboxes to plain bullets in QG sections.
- **Lifecycle gate hook scripts** — committed missing hook scripts for lifecycle enforcement
- **Brainstorm prototype offer** — added Step 3b to checklist so prototype offer is not skipped
- **Heuristics in prototype** — agent proposes heuristics instead of asking user to recall them
- **ADR 0005 title** — fixed header incorrectly labelled as "ADR 0003"
- **Model IDs** — updated stale `claude-opus-4-6` → `claude-opus-4-7` in platform-context, init skill, and cross-cutting spec fallback tables

### Commit Trailers

- **`Spec:` trailer requirement** — added to constitution and CLAUDE.md. Commits implementing spec-tracked work must include `Spec: <path>` trailer for traceability. `Plan-task:` trailer recommended alongside.
- **Manifest** — `recommended_trailers: [Spec, Plan-task]` added to provenance section

### Upgrading from 0.23.x

**Automatic (handled by `npx @adev-org/adev-cli upgrade`):**
- Plugin files, hooks, templates, and lib modules are updated in-place. No manual action needed for the plugin itself.

**New hooks (active immediately after upgrade):**
- **Lifecycle gate hooks** — three new hooks registered in `hooks/hooks.json`: `lifecycle-gate-edit.sh` (PostToolUse:Edit), `lifecycle-gate-bash.sh` (PostToolUse:Bash), `lifecycle-gate-advisory.sh` (Notification). These warn when source code is edited without first reading `.context-index/` context. Default enforcement level: `warn`. Configure via `lifecycle.gate` in your project's `.context-index/user-config` or global `<PLUGIN_ROOT>/user-config` (`off` / `warn` / `confirm` / `block`).
- **Spec drift detection** — `hooks/sync-trigger.sh` now fires on ALL file edits (not just constitution.md). When an edited file is tracked in a spec's `source-manifest`, the hook stamps `drift_detected: true` in the spec's frontmatter. This is advisory only (exit 0, never blocks).

**Optional — run `/adev:init` (Step 7) to set up governance:**
- `.context-index/governance/gates.yaml` — declarative quality gate definitions (replaces the legacy `gates:` section in `manifest.yaml`). Skills that read gates (`/adev:validate` Check 1, `/adev:build`) will use this file if present, otherwise fall back to the constitution's `## Quality Gates` section.
- `.context-index/governance/boundaries.yaml` — architectural boundary rules checked by `/adev:validate` Check 8.
- `.context-index/governance/review.yaml` — configurable reviewer registry for `/adev:review-specs`.
- `.context-index/governance/validate.yaml` — configurable validation check registry for `/adev:validate`.

**If you have `gates:` in `manifest.yaml`:** The manifest `gates:` section is now legacy. `/adev:validate` emits a migration warning. Run `/adev:init` Step 7a to migrate to `governance/gates.yaml` — the init wizard detects the legacy section and offers one-click migration.

**No action required for:**
- Existing specs, charters, plans, and ADRs — all work as before
- Projects without governance files — skills fall back to bundled defaults
- The `@dotenvx/dotenvx` dev dependency — only affects the plugin, not your project

## [Unreleased] — release/0.23.0

### Integration Test Strategy (9th strategy)

Adds the `integration` strategy for behavioral tests that run against real external infrastructure — cloud APIs, managed databases, message queues, and third-party HTTP services. Unlike all other strategies, `integration` prohibits mocking at the infrastructure boundary.

- **9th strategy profile** — `lib/test-strategies/profiles/integration.md` defines RED/GREEN/gaming rules, assertion requirements, seed data rules (UUID suffixes, idempotent teardown), and credential guard requirements
- **Gaming detection** — three new patterns exported as `INTEGRATION_PATTERNS` from `lib/test-strategies/gaming.mjs`: `BOUNDARY_MOCKING` (mocking the declared infra system), `CI_BYPASS` (`if CI skip()`), and `CREDENTIAL_ABSENT_PASS` (SDK instantiated without env guard)
- **Auto-detection heuristics** — project-level signals (`serverless.yml`, `pulumi.yaml`, `firebase.json`) and path/filename patterns (`adapters/`, `integrations/`, `connectors/`, `*-adapter.*`, `*-client.*`, `*-gateway.*`, `*-connector.*`)
- **`INTEGRATION_NO_CREDENTIALS` error code** — missing credentials exit with code 1 and a clear actionable message; NOT a valid RED phase
- **Integration test fixture** — `tests/evals/test-strategies/fixtures/integration-service/` demonstrates correct credential guard, UUID isolation, and idempotent teardown; the gaming fixture demonstrates all three violation patterns
- See [Adopting the integration strategy](docs/test-strategies.md#adopting-the-integration-strategy) for full adoption guide

### Plan Infrastructure Requirements

Surfaces infrastructure requirements from spec `infra_requirements:` frontmatter into the plan output and write-test handoff, ensuring integration tests are never written without first declaring what they depend on.

- **`infra_requirements:` frontmatter** — `/adev:specify` Step 4.5 prompts for external system declarations (env var names only — never credential values); written into spec YAML
- **Plan emission** — `/adev:plan` renders an Infrastructure Requirements section when any task uses the `integration` strategy
- **Write-test enforcement** — `/adev:write-test` requires the `infra_requirements` block to be present before generating integration tests; missing block is a blocking error
- **Integration gate stub** — `governance/gates.yaml` ships with a non-blocking (`required: false`) integration gate stub; promote to `required: true` after wiring real CI credentials

### Fixes

- Eval: updated strategy count assertions 8→9 and `expectedStrategies` array in `tests/evals/test-strategies/test-strategies.test.mjs`
- Eval: added missing `docs/` directories to `sample-project-level3` and `sample-data-project-level3` assess fixtures

## [0.22.0] - 2026-04-24

### Heuristics Phase 2: Progressive Disclosure

Extends the heuristic memory system from a lifecycle-internal layer to a project-wide context layer. Agents now see relevant lessons in every interaction — not just during plan/implement — at minimal token cost via tiered rendering.

### CLI: Install/Upgrade Split

- **`install` command** — new dedicated command for fresh installations. Handles provider selection, plugin registration, and context index scaffolding.
- **`upgrade` command** — new dedicated command for existing installations. Detects installed version, computes diff, and applies incremental updates.
- **Simplified flow** — the old `init` command (which handled both cases) is replaced by two focused commands with clearer intent.

### Output Personas

- **Persona-aware skill templates** — skill output templates now include persona directives so output adapts to the active persona (product, developer, architect).

### Heuristics Phase 2: Progressive Disclosure

Extends the heuristic memory system from a lifecycle-internal layer to a project-wide context layer. Agents now see relevant lessons in every interaction — not just during plan/implement — at minimal token cost via tiered rendering.

#### Features

- **Keyword tags** — `tags` field on heuristic schema (free-form `[a-z0-9-]` string array). Extractors derive tags from task context for relevance matching.
- **Tiered rendering** — `retrieveHeuristics` gains a `tier` parameter: `index` (~5 tok/entry), `summary` (~40 tok, default), `full` (~100 tok). Progressive disclosure scales context injection to the use case.
- **Keyword matching** — optional `keywords` parameter boosts entries whose `tags`, `title`, or `pattern` match, without filtering non-matches.
- **Sync index** — `/adev:sync` appends a `## Learned Lessons` section to all sync targets (CLAUDE.md, AGENTS.md, .cursorrules) containing high-confidence heuristic index.
- **Hygiene Pass 16** — `/adev:hygiene` checks for heuristic index staleness and orphan tags.
- **Wider injection** — heuristics now injected into `/adev:debug`, `/adev:brainstorm`, `/adev:specify`, `/adev:review-specs`, and `/adev:validate` at `summary` tier with keyword matching.

#### Fixes

- **Plan task completion tracking** — `/adev:implement` Step 2h now marks plan file checkboxes (`- [x]`) after each task completes. Previously only the ephemeral execution state and issue board were updated, leaving plan files permanently showing all tasks unchecked. (issue-125)
- **Validate plan checkbox check** — `/adev:validate` Check 12e detects stale unchecked checkboxes on completed tasks and auto-fixes them with `--fix`.
- `writeHeuristic` now propagates `tags` field in both create and update paths (was silently dropping tags).

#### Context Hygiene

- Renumbered duplicate ADR 0003 → 0005 (`configurable-review-registry`)
- Added `Spec` to `required_trailers` for commit provenance enforcement
- Populated capability maps for 9 empty charters (71 capabilities)
- Backfilled `last-reviewed-revision` on 7 review files
- Created 40 epics for orphaned plan files
- Refreshed repo map and generated first retrospective report

### Modified

- `cli/index.mjs` — split `init` into `install` and `upgrade` commands
- `lib/heuristics.mjs` — tags schema, tiered rendering, keyword matching, writeHeuristic fix
- `skills/sync/SKILL.md` — Learned Lessons section injection
- `skills/hygiene/SKILL.md` — Pass 16 heuristic index health
- `skills/implement/SKILL.md` — Step 2h plan checkbox completion on task done
- `skills/validate/SKILL.md` — Check 12e plan checkbox reconciliation, heuristic injection widening
- `skills/brainstorm/SKILL.md`, `skills/debug/SKILL.md`, `skills/specify/SKILL.md`, `skills/review-specs/SKILL.md` — heuristic injection widening
- `.context-index/memory/heuristics/_format.md` — tags and tiered retrieval documentation

### New

- `tests/lib/heuristics-tags-and-tiers.test.mjs` — 41 tests for tags, tiered rendering, keyword matching
- `tests/skills/sync-heuristic-index.test.mjs`, `tests/skills/hygiene-heuristic-pass.test.mjs`, `tests/skills/heuristic-injection-widening.test.mjs`
- `.context-index/hygiene/retros/2026-04-23.md` — first retrospective report

## [0.21.0] - 2026-04-21

### Fix — Build Skill Subagent Delegation (issue-124)

The `/adev:build` orchestrator was pseudo-invoking child skills (review, plan, route, implement, validate) instead of properly delegating to them. The agent would inline a simplified version of each child skill, missing dozens of substeps (specialist routing, TDD, 2-stage review, source manifest stamping, commit trailers, DoD, 13-check validation suites, etc.).

**Root cause:** The build SKILL.md said "Invoke `/adev:implement`" without specifying HOW — the agent interpreted this as "do what the skill does" rather than loading the full skill via the Skill tool.

**Fix — Subagent coordinator model:**

- **`context: fork`** added to build skill frontmatter — isolates the entire build pipeline from the parent conversation
- **Subagent dispatch per step** — every pipeline step is dispatched as a fresh subagent via the Agent tool. The subagent invokes the child skill via the Skill tool in an isolated context. This structurally prevents pseudo-invocation: a fresh subagent has no "knowledge" of what the skill does and must load it properly.
- **Context packet assembly** — each subagent receives a structured prompt with pipeline context (spec path, title, phase, workspace, issue board) and step-specific context (review verdict, plan path, route annotations) read from artifact files on disk.
- **STEP_RESULT contract** — subagents return a structured result (status, verdict, artifacts, summary, error) that the orchestrator uses for skip/stop/continue decisions.
- **Validate→implement retry loop** — configurable via `build.max_retries` in `user-config` (default 0 = disabled, max 3). Extracts specific validation failures, scopes re-implementation, stops on no-progress or regression.
- **Red Flags section** — 10 anti-patterns focused on preventing pseudo-invocation and inline execution.

### Modified

- `skills/build/SKILL.md` — rewritten delegation protocol, context packet assembly, subagent dispatch per step, retry loop, red flags
- `.context-index/specs/features/strategic-planning/adev-build-skill.md` — spec revision 3 with subagent dispatch behaviors, context packet contract, retry behaviors, 26 acceptance criteria
- `.context-index/specs/features/strategic-planning/charter.md` — fixed stale pipeline ordering, capability status → validated
- `.context-index/tasks/tasks.md` — issue-124 closed with updated root cause description

### New

- `.context-index/specs/features/strategic-planning/adev-build-skill-validation.md` — validation report (PASS)
- `.context-index/specs/features/strategic-planning/adev-build-skill.review.md` — architecture review (PASS_WITH_NOTES, 0 blockers)

## [0.20.0] - 2026-04-21

### New Feature — Output Personas

- **Role-adaptive outputs.** Plugin outputs now adapt to three user personas: `product` (PMs, designers), `developer` (default), and `architect` (senior technical). Internal processing, reviews, validations, and TDD cycles are unchanged — only the presentation layer adapts.
- **Layered config hierarchy.** Persona resolves from: per-invocation `--persona` flag > local `.context-index/user-config` > global `<PLUGIN_ROOT>/user-config` > fallback (`developer`). Local config is gitignored so each collaborator has their own preference.
- **Session-start injection.** The resolved persona directive is injected at session start via `session-start.sh`. All skills follow the directive automatically without modification.
- **Three persona templates.** Each template defines output rules across 8 dimensions: verbosity, code references, review verdicts, test results, plan output, spec/ADR citations, error/debug output, and next actions.
- **CLI install prompt.** `npx @adev-org/adev-cli init` now prompts for a default persona during installation.
- **Project-level override.** `/adev:init` offers an optional local persona override per project.
- **Per-invocation override.** Skills can accept `--persona <name>` to override the session default for a single invocation via a shared template section.
- **Security.** Persona names are validated against actual directory listing. Path separators and `..` sequences are rejected with safe fallback to `developer`.

### New modules

- `lib/persona.mjs` — `parseUserConfig()`, `resolvePersona()`, `loadPersonaDirective()` with path traversal protection and warning messages
- `templates/personas/{product,developer,architect}.md` — persona directive templates
- `templates/persona-override-section.md` — shared `--persona` argument section for skills

### Modified

- `hooks/session-start.sh` — persona resolution block + refactored COMBINED assembly to array-join pattern
- `cli/index.mjs` — persona prompt during install, `user-config` added to gitignore
- `skills/init/SKILL.md` — optional local persona configuration step

### Tests

- 18 tests in `tests/persona.test.mjs` covering resolution hierarchy, path traversal rejection, unknown persona fallback, warning messages, and template loading

## [0.19.0] - 2026-04-21

> **Upgrading?** No action required. Projects without `test_strategies` in their manifest behave identically to before. See [`docs/test-strategies.md`](docs/test-strategies.md) for the full adoption guide — covers auto-detection (zero config), manifest declarations, and spec-level overrides.

### New Feature — Test Strategies

- **Domain-specific TDD.** The RED-GREEN-REFACTOR cycle now adapts to the type of work being done. Eight strategies ship: `unit`, `schema` (migrations), `fixture` (data pipelines), `policy` (IaC), `contract` (service integrations), `threshold` (performance), `visual` (UI), and `smoke` (deployments). Each strategy defines its own RED/GREEN semantics, gaming detection patterns, assertion rules, seed data requirements, and handoff format.
- **Auto-detection.** `/adev:plan` inspects task file paths and project structure to assign the right strategy automatically. A Prisma migration gets `schema`, a dbt model gets `fixture`, a Terraform module gets `policy`, a React component gets `visual` — no configuration needed.
- **Manifest override.** Projects can declare `test_strategies` in `manifest.yaml` with explicit commands, tiers, and path globs. Manifest entries override auto-detection; spec-level `test_strategy` frontmatter overrides everything.
- **Strategy profiles.** Each strategy is a markdown profile at `lib/test-strategies/profiles/<strategy>.md` consumed by `/adev:write-test` as structured instructions. Profiles define domain-specific gaming blockers (e.g., "testing a migration on an empty database", "structure-only contract assertions", "trivially small fixtures").
- **Plan integration.** Each task in plan output now includes a `Strategy:` field with the assigned strategy, source, and confidence level. A Strategy Summary table appears when any task uses a non-unit strategy.
- **Write-test dispatch.** `/adev:write-test` loads the matching strategy profile before the RED phase, replacing hardcoded unit-test rules with domain-appropriate ones. Four shared cross-strategy gaming patterns (disabled tests, empty assertions, swallowed assertions, conditional assertions) apply to all strategies.
- **Backward compatible.** Projects with no `test_strategies` config get `unit` for every task — identical to pre-0.19.0 behavior with no warnings.

### New modules

- `lib/test-strategies/registry.mjs` — 8 strategy type definitions
- `lib/test-strategies/detection.mjs` — project-level and task-level auto-detection (2s timeout, no symlink following)
- `lib/test-strategies/manifest.mjs` — manifest `test_strategies` parser with path traversal prevention and command-as-array enforcement
- `lib/test-strategies/assignment.mjs` — `resolveStrategy()` with 4-level priority chain
- `lib/test-strategies/profiles.mjs` — `getStrategyProfile()` with unit fallback chain
- `lib/test-strategies/gaming.mjs` — 4 shared cross-strategy gaming patterns

### Tests

- 168 unit tests across 6 test files
- 85 fixture-based eval tests across 9 project types (node-api, dbt, terraform, prisma, grpc, react, k6, fullstack, data-platform)

## [0.18.1] - 2026-04-19

### Bug Fixes

- **fix(install): register custom marketplace on fresh machines** — `ClaudeCodeAdapter.enable()` now writes the `extraKnownMarketplaces` entry to user-level `~/.claude/settings.json` so Claude Code can resolve `adev@agentic-development` without manual setup.
- **feat(plugin): add `marketplace.json`** — enables native installation via `/plugin marketplace add agentic-development/adev-plugin` followed by `/plugin install adev@agentic-development`.

## [0.18.0] - 2026-04-19

> **Upgrading from 0.17.x?** See [`docs/governance.md`](docs/governance.md) — includes a five-recipe migration guide covering `manifest.yaml:specialists` → `governance/review.yaml`, shell-env-inheriting quality gates → profile `env.allow`, shell-form commands → argv, reviewer write-paths → package mode, and browser-automation reviewers. Zero-config projects need no changes; bundled defaults preserve pre-0.18.0 behavior. Copy-paste starter overlays ship at [`templates/governance/review.example.yaml`](templates/governance/review.example.yaml) and [`validate.example.yaml`](templates/governance/validate.example.yaml).

### New Features — Execution-profile primitive

- **`lib/profiles/`** — zero-dep cross-cutting subsystem for any skill that dispatches a subagent or a subprocess. A profile declares tool permissions (via portable categories, MCP servers, or opt-in tool literals), env-var allowlist with per-file resolution, model tier, limits, and a redaction contract.
- **Bundled profiles** — six at `templates/governance/profiles.yaml`: `read-only`, `browser-review`, `reviewer-fast`, `reviewer-capable`, `reviewer-reasoning`, `implementer` (last is defined-but-unconsumed in v1 per ADR-0004).
- **Seed tool categories** — six at `templates/governance/tool-categories.yaml`. Each adapter declares `IMPLEMENTED` + `UNSUPPORTED` + `AUDITED_CHANNELS` + `capabilities` exports.
- **Claude Code adapter** — all six categories mapped; MCP servers surfaced via `mcp__<name>__*` expansion.
- **OpenCode adapter (v1 partial)** — four categories implemented; `filesystem-write` and `shell` surface as `UNSUPPORTED_CATEGORY` so callers fail closed.
- **Env resolution** — `env.files` supports bare paths (must exist) and `optional:` prefix (silent-skip on absence). Allowlist filters values; missing `required` keys fail load with file list cited. `$workspace/<rest>` resolves via the `adev-workspace.yaml`-anchored root. Per-key contributing-file mapping returned for dispatch-record audit. `@`-prefixed env.files entries rejected with a grammar-disjoint message pointing at `multi-repo-workspace/charter.md`.
- **Redaction pipeline** — single adapter-owned chokepoint covering tool stdout/stderr, harness errors, adapter diagnostics, tool-argument echoing, pre-adapter transcript capture, and subprocess spawn errors. 8-char minimum length gate. Streaming lookback buffer catches cross-chunk matches. Shared-value placeholder `<REDACTED:<K1>|<K2>>` disambiguates shared values.
- **Schema validation** — `{ category: "*" }` and wildcards rejected; `{ tool: <literal> }` requires explicit `allow_unportable: true`; `allow`/`allow_add` mix rejected.
- **Public API** — `loadProfiles(repoRoot)`, `resolveProfile(name, ctx)`, `getEffectivePosture(name, profiles)` in `lib/profiles/index.mjs`. Load-time WARN surfaces: `TOOL_UNPORTABLE_WARN` (per profile/literal-tool pair) and `BROADEN_*` (eager extends-chain walk at load so CI can gate).

### New Features — Configurable reviewer registry

- **`/adev:review-specs` is governance-driven.** Projects declare reviewers in `.context-index/governance/review.yaml`; bundled defaults ship at `templates/review-specs/defaults.yaml`. Subagent mode runs a prompt directly; package mode wraps an external skill as a two-stage runner+adapter pipeline. Severity caps, triggered dispatch (glob + keyword scoring), context-pack extends chains, and in-memory migration of legacy `manifest.yaml:specialists` all land at `loadReviewConfig(repoRoot)` in `lib/governance/review-config.mjs`. Zero-config behavior matches the prior hardcoded flow.
- **Adapter parse-failure sanitization** — `sanitizeAdapterOutput(raw, ctx)` runs raw runner output through the profile's redactor, normalizes absolute paths under `.context-index/`, plugin root, and `$HOME`, and truncates to 8 KiB with a tail marker. Full redacted text retained only in the dispatch record.
- **Reviewer posture clamp** — reviewers rejected at load if their effective profile permits `filesystem-write` / `shell` / literal tools / non-deny filesystem / non-`{deny, read-only}` network. Referencing `implementer` from a reviewer fails load.
- **Path-traversal rejection** on `prompt` / `package.skill` / `package.adapter` with `..` pre-resolution + `fs.realpath` symlink-escape check.

### New Features — Configurable validate check registry

- **`/adev:validate` Checks 2-12 flow through `lib/governance/validate-config.mjs`** + `templates/validate/defaults.yaml`. Projects add/disable/reorder checks via `.context-index/governance/validate.yaml`. Kinds: `quality-gate`, `subagent-review`, `deterministic-check`, `observational`. Topological sort by `after:` with lex-by-id tie-break; cycles fail load.
- **Quality-gate runner** — `lib/governance/quality-gate.mjs` executes quality-gate commands via `execFile` with `shell: false`. Subprocess env scoped to profile-declared keys plus a minimal startup whitelist (`PATH`, `HOME`, `LANG`, `LC_ALL`, `LC_CTYPE`, `TMPDIR`, `USER`, `LOGNAME`) — `LD_PRELOAD`, `NODE_OPTIONS`, `PYTHONPATH`, and other invoking-shell vars do not leak. stdout/stderr pass through the profile's redactor; combined output capped at 64 KiB.
- **Quality-gate hardening** — string-form `command` rejected (`QUALITY_GATE_COMMAND_SHELL`); argv interpolation `{{...}}` / `$VAR` / `${VAR}` / `%VAR%` rejected syntactically (`QUALITY_GATE_INTERPOLATION`); explicit `profile` required with no implicit default; `shell: true` and `cwd` override blocked.

### New Features — Shared infrastructure

- **Context-pack shared library** — `lib/governance/context-pack.mjs` resolves pack `extends` chains, expands globs, and enforces a hard denylist (`.env*`, `*.pem`, `*.key`, `id_*`, `profiles.yaml`, `**/secrets/**`) at both glob-string and resolved-path layers. Used by both reviewer and validate registries.
- **Dispatch-shape harness** — `lib/governance/dispatch-shape.mjs` exposes `buildReviewerDispatches()` and `renderReviewReport()` for LLM-free end-to-end testing: inspects the Task-tool structs the skill would send (prompt, env, redactionSet, allowedTools) and renders a byte-stable `.review.md` body suitable for golden-master verification.
- **Configurable-governance eval** — `tests/evals/configurable-governance/` with three tiers: Tier 1 library-level (workspace fixture, multi-repo env routing, cross-registry pack sharing, malformed-YAML line-citation, quality-gate missing-env), Tier 2 dispatch-shape (prompt-snapshot env-absence, audited-channel enumeration, package-mode two-stage, golden-master `.review.md`), Tier 3 live runner (`run-live.mjs` + pluggable dispatcher — `dispatchers/stub.mjs` default; `dispatchers/anthropic.mjs` template via dynamic import).

### Specs

- `.context-index/specs/cross-cutting/execution-profiles.md` (rev 2, PASS_WITH_NOTES).
- `.context-index/specs/features/review/configurable-reviewers.md` (rev 3, PASS_WITH_NOTES).
- `.context-index/specs/features/validation/configurable-checks.md` (rev 3, PASS_WITH_NOTES).
- `.context-index/adrs/0003-configurable-review-registry.md`.
- `.context-index/adrs/0004-execution-profiles.md`.
- `.context-index/adrs/0004-execution-profiles.md`.

### Other

- 1179 tests pass, 0 failures. 208 suites. ~134 new tests across `tests/profiles/` (62), `tests/governance/` (44), `tests/evals/configurable-governance/` (28).
- 13 PARTIAL acceptance criteria from the /adev:validate reports closed across three eval tiers.
- Zero new external dependencies. All modules ESM, Node built-ins only.
- Version parity held (`package.json` + `.claude-plugin/plugin.json`).

## [0.16.0] - 2026-04-17

### New Features

- **Workspace-aware strategic planning** — `/adev:brainstorm` at the workspace root bootstraps `product.md` with per-repo identity synthesis; `/adev:plan --release` and `--milestone` plan across workspace + repo charters with non-transitive dependency inheritance. Epic-board sync deferred to Phase 2 Shared Issue Tracking (#65)
- **Input-hardening helpers** — `assertPathInWorkspace` (PATH_ESCAPE), `validateModuleName` (INVALID_MODULE_NAME), `sanitizeIdentityOneLiner` (ANSI/control-char stripping), `readCappedText` (512 KB file cap), `resolveWorkspaceProductPath` added to `lib/workspace.mjs`
- **Repo-mode advisory** — Both `/adev:brainstorm` and `/adev:plan` print a one-line stdout advisory when invoked inside a registered repo of a detected workspace

### Breaking Changes

- **`/adev:vision` and `/adev:roadmap` removed** (since 0.15.0) — Vision/identity bootstrap folded into `/adev:brainstorm` Step 5b; milestone/release planning folded into `/adev:plan --milestone` and `--release`

### Other

- 45 new tests (1045 total, 0 failures)
- 1 Live Spec validated (workspace-aware-vision, 23 acceptance criteria)
- Multi-repo workspace charter: all 11 capabilities at `validated` status

## [0.11.0] - 2026-04-06

### New Features

- **Session Awareness module** — Full feature charter with 10 capabilities, all validated
- **Execution state file** — `lib/execution-state.mjs` with read/write/clear, atomic writes (temp-file-then-rename), YAML frontmatter + markdown progress body. Tracks active plan, current task, issue binding, blockers, and next action
- **Session-start resume** — Extended `session-start.sh` to read execution state and inject a resume block (active plan context or blocker alert) at session start, enabling seamless continuation across sessions
- **Issue reminder hook** — New `issue-reminder.sh/.mjs` PostToolUse hook that surfaces active issues every N tool calls and after git commits, with counter-based triggering and git commit detection
- **Idle nudge** — When no in-progress issues exist, the reminder hook shows up to 3 open issues by priority or an "all resolved" message, with a stale execution state warning when applicable
- **Configurable reminder interval** — `tasks.reminder_interval` in manifest.yaml (default 25, set to 0 to disable). Added to scaffold template
- **Session log schema** — Formalized the existing JSONL schema for `.session-tracking.jsonl`, removed undocumented `specs` field, added `tool_name` guard to skip writes when tool name is missing
- **Skill-level state instructions** — Added execution state instructions to `/adev:implement` SKILL.md: resume check at Step 1, per-task state writes at Step 2, blocker state at Step 2d, and clear on completion at Step 4
- **Format documentation** — `FORMAT.md` template documenting execution state and session log schemas as public contracts for external tool interoperability

### Fixes

- **Session capture schema alignment** — Removed undocumented `specs: []` field from JSONL output, added guard to skip writes when `tool_name` is missing (was writing `"unknown"`)

### Other

- 22 new tests across 4 test files (531 total, 0 failures)
- 7 Live Specs written, reviewed (3 specialist reviewers each), and validated (11-check suite)
- Feature charter fully validated: all 10 capabilities at `validated` status

## [0.10.0] - 2026-04-06

### New Features

- **Context-preflight hook** — New PreToolUse hook (`context-preflight.sh`) that warns when source files are edited without reading project context first. Tracks context reads via `context-read-tracker.sh` and a `.context-preflight-ok` flag file (#30)
- **Strategic planning skills** — `/adev:vision`, `/adev:roadmap`, and `/adev:research` skills for product-level planning, dependency sequencing, and structured research. Charter with 8 live specs, all reviewed and planned (#29)
- **Issue model milestone support** — Issues and epics now support milestone fields for roadmap alignment
- **Plugin-namespaced skill rename** — Renamed all skills from `adev-*` to `adev:*` format (e.g., `/adev-brainstorm` → `/adev:brainstorm`) for plugin namespace compliance

### Fixes

- Fixed all 16 pre-existing test failures from skill rename migration
- Skill naming convention aligned across all three providers (Claude Code, OpenCode, Codex)

## [0.9.0] - 2026-04-02

### New Features

- **`/adev:codehealth` skill** — Proactive source code scanning for dead exports, orphan files, unused dependencies, stale code, and duplicate logic. Produces severity-tiered reports from repomap artifacts (#26)
- **Quickstart guide and skill reference** — New `docs/quickstart.md` and `docs/skills.md` with lifecycle flow diagram, full skill inventory, and getting-started instructions (#27)
- **Worktree-shared issue storage** — Issue board data is now shared across git worktrees via `resolveStorageRoot()`, with optional `tasks.db_path` override in manifest (#25)

### Other

- Stamped source manifests on all implemented specs for drift detection (#24)
- Validated spec-lifecycle transitions and fixed stale spec statuses
- Refreshed all generated documentation (`docs/architecture.md`, module docs)

## [0.8.0] - 2026-04-01

### New Features

- **Persistent issue tracking** — `lib/issues/` module with pluggable backends (file-based markdown tables and beads_rust). Includes epic/issue CRUD, dependency tracking with cycle detection, status transitions, and priority ordering. Integrated into `/adev:plan` and `/adev:implement` (#23)
- **`/adev:issues` skill** — Interactive issue management: create, update, close, and view issues and epics with board display
- **Data engineering eval framework** — Cross-tool benchmarks for data engineering skills with dbt project fixtures (#20)
- **`adev-data-eval` submodule** — Dedicated test data repository for data engineering evaluations (#18)

### Fixes

- **Commit guard on protected branches** — `merge-guard.sh` now also blocks `git commit` on protected branches, not just `git push` and `git merge` (#21)

### Other

- Synced provider skills across Claude Code, OpenCode, and Codex (#17)
- Backfilled hygiene metadata and review trailers on existing specs (#15)

## [0.7.1] - 2026-03-30

### Fixes

- **TDD verification uses targeted test runs** — `adev-implement` VERIFY RED/GREEN steps now run only the specific test file instead of the full suite, preventing dozens of unnecessary full-suite runs during multi-task implementation sessions (all three providers updated)

## [0.7.0] - 2026-03-30

### New Features

- **`/adev:work` skill** — Pre-lifecycle triage that classifies incoming work (feature, bug, spike, chore) and routes to the correct `/adev:*` skill. Scans for in-progress plans, unreviewed specs, and recent sessions before classifying (#16)
- **Canonical `/adev:document` SKILL.md** — Created provider-agnostic canonical skill from OpenCode version

### Other

- Converted `/adev:test-write` companion helpers from `.mjs` to bash scripts for cross-provider compatibility

## [0.6.0] - 2026-03-29

### New Features

- **Spec Lifecycle tracking** — Full lifecycle metadata for specs including status transitions, session-capture hooks, enriched post-commit session summaries, and CLI scaffolding for status reporting (#13)
- **`/adev-status` skill** — New skill to query spec and feature lifecycle status at a glance
- **`/adev-write-test` skill** — AI-assisted red-phase test authoring with 67 tests covering the generation pipeline (#10)
- **Model Routing cross-cutting spec** — Applies model tier routing across all skills, enabling cost-aware agent dispatch
- **Golden Samples curation** — Automated golden sample scoring and curation in `.context-index/samples/`, with orientation updates for `lib/repomap` (#12)

### Fixes

- Codex install flow and skill metadata corrections
- Session-capture grep pattern fix
- Backfill lifecycle metadata for existing specs
- Multiple architecture review blocker resolutions across specs

### Other

- Added Claude install coverage
- Updated README for multi-provider support
- Added `session_capture` integration to manifest

## [0.5.0] - 2026-03-25

### New Features

- **Multi-provider support** — Added OpenCode and OpenAI Codex providers with full skill parity (18 skills each) (#5, #6)
- **`/adev-assess` skill** — Codebase readiness assessment across 8 structural dimensions with data domain support (#7)
- **`/adev-document` skill** — Automated documentation generation with architecture docs, module docs, slug validation, and GENERATED.md manifest
- **`/adev-repomap`** — AST-based symbol index using tree-sitter with TypeScript support, PageRank ranking, dependency graph builder, and `--mode` flag
- **Eval framework** — Repomap eval pipeline (cloner, ground truth, parser, compare, report) and skill-compression eval framework
- **CI/CD** — GitHub Actions quality gates workflow, merge-block and publish-on-tags specs
- **Browser-based visual verification** — Added to `/adev-implement` and `/adev-validate` skills
- **Automatic spec status updates** — Specs transition status automatically across skill lifecycle
- **Skill compression** — Eval-validated compression of `/adev-brainstorm` and `/adev-specify`

### Fixes

- Include `.claude-plugin` in package files for `npx` install (#3)
- Resolve symlinks in CLI `isDirectRun` check
- Auto-create `opencode.json` when installing for OpenCode
- Improve scaffolding to detect existing `.context-index/`
- Correct OpenCode plugin installation and fix adev-document tests

### Other

- Added CLAUDE.md with project conventions and architecture boundaries
- Initialized `.context-index/` with constitution, charters, and manifest
- ADR 0001: web-tree-sitter optional dependency
- ADR 0002: TypeScript dev dependency

## [0.4.1] - 2026-03-20

### New Features

- **E2E test suite** — End-to-end tests for the full plugin
- **Merge guard hook** — Prevents direct pushes to main, enforces PR-based workflow

## [0.4.0] - 2026-03-19

### New Features

- **Context packets** — Structured context bundles for cross-skill data sharing
- **Task routing** — Intelligent routing of implementation tasks to specialist subagents
- **Agent recovery** — Structured diagnosis-correction-resume cycle (`/adev-recover`)
- **Golden samples** — Reference implementation curation in `.context-index/samples/`
- **Eval harness** — Graduated evaluation framework (`/adev-eval`)

## [0.3.0] - 2026-03-19

### New Features

- **Declarative governance** — Constitution-gated quality checks across all lifecycle phases

## [0.2.0] - 2026-03-19

### New Features

- **External references** — Support for external references in manifest, init wizard, context-loading skills, and hygiene audit
- Renamed `.context-kit/` to `.context-index/` across all files

## [0.1.0] - 2026-03-19

Initial release.

### New Features

- **Plugin skeleton** — Claude Code plugin structure with `.claude-plugin/plugin.json`
- **`/adev-init` skill** — Interactive onboarding wizard with plugin conflict detection
- **CLI installer** — `npx @adev-org/adev-cli init` for plugin installation and project scaffolding
- **9 core lifecycle skills** — brainstorm, specify, review-specs, plan, implement, validate, debug, hygiene, sync
- **SessionStart hook** — Injects framework context at session start
- **README** — Install guide, quick start, and lifecycle overview
