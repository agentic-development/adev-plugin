## Step 2: Load Context for Each Spec

For each spec to be reviewed, gather the context the orchestrator needs. **Not all of it reaches the reviewers.** Items 1-7 are delivered to a reviewer only insofar as that reviewer's context pack includes them (see Step 4 — packs are per-reviewer, so a category listed here may reach one reviewer and not another). Items 8 and 9 are orchestrator-only and are never forwarded to a reviewer subagent.

1. **The spec itself:** Read the full Live Spec file. *Delivered to every reviewer — appended as the fenced target spec, not as a pack include (see Step 4).*
2. **Parent charter:** Read `.context-index/specs/features/<module>/charter.md` (the charter that owns this spec). *Delivered via the reviewer's context pack (see Step 4) — in `review-base`, so all three bundled reviewers get it.*
3. **Constitution:** Read `.context-index/constitution.md`. *Delivered via the reviewer's context pack (see Step 4) — in `base`.*
4. **Sibling specs:** Read other specs under the same charter (for cross-reference checks). *Delivered via the reviewer's context pack (see Step 4) — in `review-base`, with the target spec itself excluded.*
5. **Cross-cutting specs:** Read all files in `.context-index/specs/cross-cutting/` (for contract compatibility). *Delivered via the reviewer's context pack (see Step 4) — in `consistency` only, so the Consistency Analyzer gets these and the other two bundled reviewers do not.*
6. **ADRs:** Read all files in `.context-index/adrs/` (for decision compliance). *Delivered via the reviewer's context pack (see Step 4) — in `architecture` and `security`, not in `consistency`.*
7. **Platform context:** Read `.context-index/platform-context.yaml` (for technology constraints). *Delivered via the reviewer's context pack (see Step 4) — in `base`.*
8. **External references:** If `.context-index/references/` exists and has files, read `.context-index/references/**/*.md`. Note external reference charters and contracts that specs must comply with. *Orchestrator-only — not passed to reviewers.* No bundled pack includes `.context-index/references/`, so reviewer prompts must not promise them as input. The Consistency Analyzer's "External Reference Compliance" review scope stays conditional (*"If external references are provided"*) precisely because the default packs do not provide them; a project that wants that scope active must add the include to a project-level pack in `.context-index/governance/review.yaml`.
9. **Governance policies:** *Orchestrator-only — not passed to reviewers.* The reads below drive the orchestrator's own risk gating and report footer, and their results are not forwarded to any reviewer subagent. Note the distinction: the `security` pack separately enumerates `.context-index/governance/risk-policies.yaml` and `.context-index/governance/gates.yaml` as **content** for the Security Reviewer to read as material — that is the pack delivering the files, not this step forwarding its decisions.

   If `.context-index/governance/risk-policies.yaml` exists, read it.
   Check the spec's `risk_level` frontmatter field (default: "medium"). If the policy allows
   skipping review for this level (`require_review: false`), inform the user and offer to skip.
   If skipped, write a `.review.md` with verdict PASS and note "Review skipped per risk policy."

   If `.context-index/governance/gates.yaml` exists, read the `transitions` section. If a
   `spec-to-plan` transition defines an `approver_role`, note it in the review report footer
   (informational only, do not block).

   If `.context-index/governance/overrides/<charter-slug>.yaml` exists, let it override the
   base risk policy for this charter's specs.

   If governance files do not exist, proceed normally (all specs require review).

If a charter or constitution file is missing, warn the user and ask whether to proceed with reduced context or abort.

