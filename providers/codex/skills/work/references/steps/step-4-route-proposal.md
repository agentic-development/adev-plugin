## Step 4: Route Proposal

### High confidence (clear keywords or unambiguous context)

Propose the route directly with one-line reasoning:

> **Route:** `/adev:debug`
> **Reason:** You described a failing test in the hooks module.
> **Context:** Will pre-load the hooks charter and recent session.
>
> Proceed? (yes / change route)

### Low confidence (ambiguous description, multiple matches)

Ask one clarifying question with numbered options:

> This could be a few things. Which fits best?
> 1. New feature (needs a charter first) --> `/adev:brainstorm`
> 2. New spec within the **auth** charter --> `/adev:specify`
> 3. Update the existing `login-flow.md` spec --> `/adev:specify --module auth`

Wait for the user to choose.
