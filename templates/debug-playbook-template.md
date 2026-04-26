---
last-verified: {{ date }}
---

<!-- Debug Playbook Template
     Place this file at:
       .context-index/specs/features/<module>/debug-playbook.md   (module-scoped)
       .context-index/specs/cross-cutting/debug-playbook.md       (cross-cutting)

     /adev:debug Phase 2 loads playbooks and matches failure mode triggers
     against Phase 1 symptoms. Module-scoped playbooks take precedence over
     cross-cutting when triggers overlap on the same symptom.

     Each failure mode describes a category of problems with an ordered
     diagnostic procedure. Keep each failure mode under ~200 tokens for
     token efficiency. -->

<!-- Repeat this section for each failure mode in the module.
     Each failure mode needs a unique kebab-case id. -->

## Failure Mode: {{ Title of the failure mode }}

<!-- A short descriptive title for this category of problems. -->

id: example-failure-mode

<!-- Triggers are symptom patterns that /adev:debug matches against Phase 1
     findings. Include error messages, log patterns, or behavioral descriptions.
     The more specific the trigger, the better the match quality. -->

triggers:
- {{ error message pattern or behavioral description }}
- {{ another symptom pattern }}

### Steps

<!-- Ordered diagnostic steps. Follow this sequence during investigation.
     Each step must have a description. Steps may optionally include a command
     to execute and the expected output to compare against. -->

1. description: {{ What this step investigates and why }}
   command: {{ shell command to run, e.g. git log --oneline -5 }}
   expected: {{ What healthy output looks like vs. unhealthy output }}

2. description: {{ Next diagnostic action }}
   command: {{ optional command }}
   expected: {{ expected result }}

3. description: {{ Further investigation if previous steps inconclusive }}

### Escalation:

<!-- When to stop following this playbook and change approach.
     Every failure mode must have an escalation to prevent infinite loops. -->

condition: {{ When to escalate, e.g. "steps 1-3 all show healthy output but problem persists" }}
target: {{ human | ADR review | architecture reassessment }}

---

<!-- Second failure mode example — delete or replace with actual failure modes. -->

## Failure Mode: {{ Another failure category }}

id: another-failure-mode

triggers:
- {{ symptom pattern }}

### Steps

1. description: {{ First diagnostic action }}

2. description: {{ Second diagnostic action }}
   command: {{ diagnostic command }}
   expected: {{ what to look for }}

### Escalation:

condition: {{ when to stop and escalate }}
target: {{ human | ADR review | architecture reassessment }}
