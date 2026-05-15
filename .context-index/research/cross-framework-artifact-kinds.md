---
topic: "cross-framework patterns for distinguishing kinds and modes of design artifacts (specs, RFCs, ADRs, charters, work items)"
date: "2026-05-14"
relates-to: "epic-73"
sources:
  - web
status: draft
---

## Summary

Across twelve established frameworks for distinguishing kinds of design artifacts — IETF RFCs, Python PEPs, Rust RFCs, TC39, Java JEPs, ADR/MADR, C4, TOGAF, DDD, Kubernetes, OpenAPI, Cargo, Diataxis, and agile work-item systems (JIRA, Linear, GitHub Issues, Shape Up) — three patterns dominate: (a) a small fixed taxonomy of 3–6 kinds beats both binary splits and 20+ enumerations, (b) the discriminator is almost always an explicit named field in frontmatter or manifest (Kubernetes `kind:`, PEP `Type:`, RFC "Category:"), and (c) backward compatibility is handled by defaulting unspecified artifacts to the "primary" kind rather than via forced migration. Adev's planned six-mode (specs) + four-kind (charters) taxonomy sits comfortably inside the proven size band and should adopt the named-frontmatter-field convention with a behavioral/feature default and an optional template-resolution per kind.

## Findings

### Web

#### RFC processes (3–5 kinds, prose-declared field)

- **IETF RFCs use five status categories**: Standards Track (further subdivided Proposed → Internet Standard), Best Current Practice (BCP), Informational, Experimental, and Historic. The category is set by the RFC Editor in the document header's "Status of This Memo" boilerplate per RFC 7322 / RFC 5741, not by the author in YAML. Each category implies different normative weight: Standards Track and BCP are normative; Informational and Experimental are not. Source: <https://datatracker.ietf.org/doc/html/rfc2026>, <https://datatracker.ietf.org/doc/html/rfc7322>, <https://www.ietf.org/process/process/informational-vs-experimental/>.
- **Python PEPs use three types**: Standards Track (normative, new feature or interop standard), Informational (non-normative, background/guidelines), Process (normative, governance/workflow). The type is declared via a `Type:` header in the PEP's pseudo-RFC-822 frontmatter; PEP 1 defines the taxonomy. Source: <https://peps.python.org/pep-0001/>.
- **Rust RFCs use informal categories** organized as folder/label conventions: lang, libs, infra, process, compiler, tools. The discriminator is by sub-team ownership rather than a YAML field on the RFC itself, and category drives review path rather than template. Source: <https://rust-lang.github.io/rfcs/0002-rfc-process.html>, <https://github.com/rust-lang/rfcs>.
- **TC39 uses stages (0–4), not kinds**: stage is a *lifecycle* axis (Strawperson → Proposal → Draft → Candidate → Finished), orthogonal to the implicit kinds (syntax / library / process). TC39 does not formalize the kind axis; the orthogonal stage axis carries most of the discriminator weight. Source: <https://tc39.es/process-document/>.
- **Java JEPs split numerically**: process JEPs get numbers <100, feature JEPs get numbers ≥101. Within features there are status-level flags: incubator, preview, permanent. The discriminator is partially in the number range and partially in a status field — two discriminators stacked. Source: <https://openjdk.org/jeps/1>, <https://en.wikipedia.org/wiki/JDK_Enhancement_Proposal>.

#### ADR variants (≤2 dimensions of difference, very lightweight)

- **Michael Nygard's original ADR template does not distinguish decision types** — every ADR has Context, Decision, Status, Consequences. The deliberate lack of typing is the design choice: keep it lightweight. Source: <https://martinfowler.com/bliki/ArchitectureDecisionRecord.html>.
- **MADR (Markdown ADR)** offers two template *sizes* (minimal vs. full) but does not introduce ADR kinds. It adds a `status:` lifecycle field (Proposed / Accepted / Deprecated / Superseded) — that's a lifecycle discriminator, not a kind discriminator. The Y-statement template is a structural variant for terse statements. Source: <https://ozimmer.ch/practices/2022/11/22/MADRTemplatePrimer.html>, <https://adr.github.io/madr/>.

#### Architecture frameworks (explicit level/kind as a first-class concept)

- **C4 model uses four explicit levels**: Context, Container, Component, Code. Each level is a different *kind* of diagram with distinct semantics, and the framework explicitly states "you don't need to use all 4 levels — only those that add value." This is the cleanest example of a small kind-taxonomy where each kind has a distinct template/shape. Source: <https://c4model.com/>, <https://en.wikipedia.org/wiki/C4_model>.
- **TOGAF separates three meta-kinds**: Deliverables (contractually agreed work products), Artifacts (descriptive — further split into catalogs/matrices/diagrams), and Building Blocks (reusable components, split into ABBs and SBBs). The Architecture Content Framework is built on this taxonomy. TOGAF has 50+ artifact types but groups them under these three meta-kinds. Source: <https://pubs.opengroup.org/architecture/togaf91-doc/arch/chap33.html>, <https://medium.com/@leoyeh.me/deliverables-artifacts-and-building-blocks-decoding-the-architecture-content-framework-in-togaf-5c308ff9ef35>.
- **DDD strategic patterns** distinguish Subdomain (problem space) from Bounded Context (solution space) from Context Map (relationship space). The artifact kind tells you which space you are reasoning in — a useful precedent for separating *what something is* from *how it relates*. Source: <https://martinfowler.com/bliki/BoundedContext.html>, <https://learn.microsoft.com/en-us/azure/architecture/microservices/model/domain-analysis>.

#### Agile work-item systems (5–7 kinds; the taxonomy strains at the edges)

- **JIRA's default taxonomy is Epic → (Story | Task | Bug) → Sub-task**, with Story/Task/Bug at the same hierarchy level. JIRA also allows full customization, which is where it strains: every team invents new types ("Spike", "Tech Debt", "Discovery"), and the taxonomy fragments. Source: <https://support.atlassian.com/jira-cloud-administration/docs/what-are-issue-types/>, <https://www.atlassian.com/software/jira/guides/issues/overview>.
- **Linear uses a fixed simpler model**: issues with a fixed five-level priority (Urgent/High/Medium/Low/None), labels for kind, and no native subtask hierarchy beyond parent-issue. The rigidity is the value proposition — less drift. Source: <https://linear.app/docs/conceptual-model>.
- **GitHub Issues has no native kind**: kind is encoded entirely via labels. This is the most flexible and the most prone to drift. Teams reinvent label conventions (`bug`, `enhancement`, `P0-critical`). Cotera reported outgrowing GitHub Issues at ~500 tickets specifically because of taxonomy drift. Source: <https://cotera.co/articles/linear-vs-github-issues-comparison>.
- **Shape Up does not use kinds at all**: the discriminator is "appetite" (small-batch / big-batch — 2-week vs 6-week) and "shape" (rough vs shaped). Both are *lifecycle/sizing* axes, not kind axes. The framework intentionally avoids type taxonomies. Source: <https://basecamp.com/shapeup/2.1-chapter-07>.

#### Schema and manifest discriminators (named field, validated by schema)

- **Kubernetes is the canonical `kind:` discriminator**: every object manifest has `apiVersion:` and `kind:` as the two essential fields. The pair uniquely identifies the schema to validate against. 50+ object kinds exist (Pod, Service, Deployment, ConfigMap, etc.), each with its own schema. The discriminator is mandatory, no default. Source: <https://kubernetes.io/docs/concepts/overview/working-with-objects/>.
- **OpenAPI's `discriminator`** is an explicit named field used inside `oneOf`/`anyOf` polymorphic schemas. The `propertyName` field names the discriminator key (often `type` or `kind`), and the discriminator must appear in every variant schema. Notably, OpenAPI tooling treats the discriminator as a hint for code generation, not as a hard validation requirement. Source: <https://spec.openapis.org/oas/v3.1.0.html>, <https://redocly.com/learn/openapi/discriminator>.
- **Cargo manifests** use multiple target-table sections to discriminate: `[lib]`, `[[bin]]`, `[[example]]`, `[[test]]`, `[[bench]]`, `[[custom-build]]`. Lib variants are further discriminated by a `crate-type` field (lib, rlib, dylib, cdylib, staticlib, proc-macro). The kind is encoded in the *section name* rather than a field. Source: <https://doc.rust-lang.org/cargo/reference/manifest.html>.

#### Documentation and testing taxonomies (4 kinds, named convention)

- **Diataxis defines four documentation kinds**: Tutorials (learning), How-To Guides (work), Reference (information), Explanation (understanding). The framework explicitly maps each kind to a user-need quadrant and prescribes different writing style per kind. The taxonomy is enforced by directory convention more than frontmatter. Source: <https://diataxis.fr/>, <https://diataxis.fr/start-here/>.
- **Test taxonomies converge on 4–5 kinds**: unit, integration, e2e (further split into smoke vs comprehensive), and contract. The discriminator is folder convention (e.g., Maven's `src/test/java`, `src/integration-test/java`, `src/e2e-test/java`) rather than file-level metadata. Source: <https://www.innoq.com/en/blog/2021/07/tests-organization-and-naming/>, <https://knowledge.businesscompassllc.com/test-automation-architecture-unit-integration-e2e-and-contract-tests/>.

## Code Examples

### Kubernetes `kind:` — canonical YAML frontmatter discriminator

```yaml
# Example: explicit kind discriminator in Kubernetes manifests
# Source: https://kubernetes.io/docs/concepts/overview/working-with-objects/
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec: { ... }
```

The `kind:` field is mandatory. There is no default — every manifest must declare its kind, and `kubectl` validates the spec body against the kind's schema. The `apiVersion:` field bundles a versioned API group, which lets the same `kind:` evolve across versions.

### Python PEP `Type:` header — RFC-822 frontmatter discriminator

```
PEP: 668
Title: Marking Python base environments as "externally managed"
Author: ...
Status: Final
Type: Standards Track
```

Source: <https://peps.python.org/pep-0001/>. PEP 1 defines exactly three Type values; the type is declared in the PEP's RFC-822-style header. Note PEP 1 also has a separate `Status:` field — kind and lifecycle are orthogonal.

### OpenAPI discriminator on a `oneOf` polymorphic schema

```yaml
# Example: discriminator hint on a polymorphic schema
# Source: https://redocly.com/learn/openapi/discriminator
Pet:
  oneOf:
    - $ref: '#/components/schemas/Dog'
    - $ref: '#/components/schemas/Cat'
  discriminator:
    propertyName: petType
```

The `propertyName` field names the discriminator key, and the property must appear in every variant. Notably, OpenAPI explicitly documents the discriminator as a tooling hint, not a validation primitive — validation still works without it. This is relevant to adev because it suggests `mode:` and `kind:` can be metadata hints used by skills (template routing, hygiene checks) without being hard schema gates that break older artifacts.

## Recommendations

1. **Use an explicit named frontmatter field as the discriminator** — `mode:` for specs and `kind:` for charters, declared in YAML frontmatter. This matches Kubernetes, PEP, OpenAPI, and MADR conventions. Folder-based discrimination (Cargo, Maven tests) is workable but reduces grepability and forces physical file moves on retagging. Frontmatter field is the load-bearing convention across 6+ of the surveyed frameworks. Grounded in Non-Negotiable Principle #2 (skills are primarily markdown — frontmatter is the natural metadata surface in a markdown-first system).

2. **Stay inside the proven 3–6 kinds band**. PEP=3, RFC=5, C4=4, Diataxis=4, JIRA-default≈5, OpenAPI variants are unbounded but typically 2–6 in practice. Adev's planned 6 spec modes and 4 charter kinds both fit. The frameworks that drift into 20+ types (TOGAF artifact catalog, JIRA with full customization) consistently report the taxonomy strains under fragmentation — the same failure mode the companion audit found inside adev itself (`test-strategies/`=19 specs, `agent-reliable-state-artifacts/`=9 specs).

3. **Default unspecified artifacts to the primary kind, do not force migration**. Treat the field as optional-with-default: missing `mode:` → `behavioral`, missing `kind:` → `feature`. This is the OpenAPI pattern (discriminator is a hint, not a hard gate) and the MADR pattern (lifecycle field optional). It avoids forced migration of the 178 existing specs and 41 existing charters, deferring that to Layer 2 in the audit. Grounded in Non-Negotiable Principle #1 (minimize external dependencies — and by extension, minimize migration churn): the framework primitive ships without invalidating existing artifacts.

4. **Couple kind to template resolution, not to lifecycle**. C4 (kind → diagram shape), TOGAF (kind → required sections), Diataxis (kind → writing style) all couple kind to *template shape*. None of them couple kind to *workflow stage* — that's what TC39 stages, MADR `status:`, and PEP `Status:` are for, on a separate axis. Adev should preserve this orthogonality: `mode:` and `kind:` drive which template `/adev:specify` and `/adev:brainstorm` open, while existing lifecycle status (draft / validated / implemented) remains the separate workflow axis.

5. **Validate via skill prompts and a hygiene pass, not a hard schema**. The OpenAPI discriminator is "a hint to speed things up for tooling" rather than a validation gate. PEP types and RFC categories are validated by editor review, not by a parser. Adev should keep validation lightweight: `/adev:specify` and `/adev:brainstorm` ask for the value up front and inject it into frontmatter; `/adev:hygiene` flags charters with `kind: module` that lack a `manifest.yaml` entry, or specs with `mode: skill` that don't sit under a skill-owning charter. No hook-level rejection of files missing the field — that would violate the "graceful default" pattern recommendation (#3).

6. **Avoid two-discriminator stacking** (cf. Java JEPs' numeric ranges + status flags, Cargo's section name + `crate-type`). The companion audits already settled on one discriminator per layer: `mode:` for specs, `kind:` for charters. Resist the urge to add a sub-discriminator (`mode: behavioral` + `flavor: data-engineering`) inside the primary field; that overload is what created the junk-drawer problem the audits flagged. Domain-specific shape variations belong in the template matrix (kind × domain), not in the discriminator field.

7. **Consider naming the field `kind:` for both layers** rather than `mode:` for specs and `kind:` for charters. The companion audits chose distinct names intentionally to signal "specs are about runtime intent, charters are about artifact type." This is defensible, but the surveyed frameworks predominantly converge on `kind:` (Kubernetes, OpenAPI examples, K8s-adjacent tools) or `type:` (PEP, OpenAPI's actual property convention). Using one name across layers would lower onboarding cost and let a single template-resolution helper handle both. If the distinct names stay, document the rationale in the ADR so future maintainers don't conflate them.

## References

### Web Sources

#### RFC and proposal processes
- [IETF RFC 2026 — The Internet Standards Process](https://datatracker.ietf.org/doc/html/rfc2026) — defines the five RFC status categories
- [IETF RFC 7322 — RFC Style Guide](https://datatracker.ietf.org/doc/html/rfc7322) — boilerplate and document-type conventions
- [IETF: Choosing between Informational and Experimental Status](https://www.ietf.org/process/process/informational-vs-experimental/) — kind-disambiguation guidance
- [PEP 1 — PEP Purpose and Guidelines](https://peps.python.org/pep-0001/) — defines the three PEP types
- [The Rust RFC Book — RFC Process](https://rust-lang.github.io/rfcs/0002-rfc-process.html) — Rust's RFC categorization
- [rust-lang/rfcs on GitHub](https://github.com/rust-lang/rfcs) — folder-based category convention in practice
- [TC39 Process Document](https://tc39.es/process-document/) — five-stage lifecycle, orthogonal to kind
- [OpenJDK JEP 1 — JDK Enhancement-Proposal Process](https://openjdk.org/jeps/1) — JEP categorization and lifecycle
- [Wikipedia — JDK Enhancement Proposal](https://en.wikipedia.org/wiki/JDK_Enhancement_Proposal) — overview of JEP types

#### ADR variants
- [Martin Fowler — Architecture Decision Record (Nygard's original)](https://martinfowler.com/bliki/ArchitectureDecisionRecord.html) — explicitly typeless ADR template
- [The MADR Template Explained and Distilled](https://ozimmer.ch/practices/2022/11/22/MADRTemplatePrimer.html) — MADR minimal vs full, status-as-lifecycle
- [ADR Templates Catalog](https://adr.github.io/adr-templates/) — variants including Y-statement, MADR, Nygard

#### Architecture frameworks
- [C4 Model — Home](https://c4model.com/) — four explicit levels, each a distinct artifact kind
- [Wikipedia — C4 model](https://en.wikipedia.org/wiki/C4_model) — overview of levels
- [TOGAF 9.1 — Introduction to the Architecture Content Framework](https://pubs.opengroup.org/architecture/togaf91-doc/arch/chap33.html) — deliverables/artifacts/building-blocks taxonomy
- [Deliverables, Artifacts, and Building Blocks in TOGAF](https://medium.com/@leoyeh.me/deliverables-artifacts-and-building-blocks-decoding-the-architecture-content-framework-in-togaf-5c308ff9ef35) — distilled overview of the three meta-kinds
- [Martin Fowler — Bounded Context](https://martinfowler.com/bliki/BoundedContext.html) — DDD strategic pattern types
- [Microsoft Learn — Domain analysis for microservices](https://learn.microsoft.com/en-us/azure/architecture/microservices/model/domain-analysis) — subdomain vs bounded context vs context map

#### Agile work-item systems
- [Atlassian — Jira work types](https://support.atlassian.com/jira-cloud-administration/docs/what-are-issue-types/) — Epic/Story/Task/Bug/Sub-task default hierarchy
- [Atlassian — Introduction to Jira Work Items](https://www.atlassian.com/software/jira/guides/issues/overview) — work-item type customization
- [Linear Docs — Conceptual Model](https://linear.app/docs/conceptual-model) — fixed-priority, label-based kind
- [Cotera — We Outgrew GitHub Issues at 500 Tickets](https://cotera.co/articles/linear-vs-github-issues-comparison) — empirical taxonomy-drift report
- [Shape Up — Bets, Not Backlogs](https://basecamp.com/shapeup/2.1-chapter-07) — appetite/shape instead of kind
- [Shape Up — The Betting Table](https://basecamp.com/shapeup/2.2-chapter-08) — bet-as-discriminator

#### Schema/manifest discriminators
- [Kubernetes — Objects In Kubernetes](https://kubernetes.io/docs/concepts/overview/working-with-objects/) — `kind:` as canonical discriminator
- [OpenAPI Specification v3.1.0](https://spec.openapis.org/oas/v3.1.0.html) — discriminator spec
- [Redocly — How to use the OpenAPI discriminator](https://redocly.com/learn/openapi/discriminator) — discriminator-as-hint pattern
- [Bump.sh — The Discriminator in OpenAPI Is Generally Redundant & Confusing](https://bump.sh/blog/the-discriminator-in-openapi-is-generally-redundant-and-confusing/) — empirical critique
- [The Cargo Book — The Manifest Format](https://doc.rust-lang.org/cargo/reference/manifest.html) — target sections + `crate-type` discriminator

#### Documentation and testing taxonomies
- [Diátaxis — Home](https://diataxis.fr/) — four-quadrant documentation kind taxonomy
- [Diátaxis — Start Here](https://diataxis.fr/start-here/) — quadrant semantics
- [INNOQ — Test organization and naming](https://www.innoq.com/en/blog/2021/07/tests-organization-and-naming/) — test-kind folder conventions
- [Business Compass — Test Automation Architecture: Unit, Integration, E2E, and Contract Tests](https://knowledge.businesscompassllc.com/test-automation-architecture-unit-integration-e2e-and-contract-tests/) — four-kind test taxonomy
