The `.context-index/` directory doesn't exist in this project. Per the skill prerequisites:

> 1. `.context-index/` exists. If not, tell the user to run `/adev:init` first.
> 2. `.context-index/constitution.md` exists and is non-empty.
> 3. At least one Feature Charter exists under `.context-index/specs/features/`

**All three prerequisites are missing.** The `adev-data-eval` project has no adev context directory, no constitution, and no feature charters.

Before I can reverse-engineer a spec from `fct_orders.sql`, you need to initialize the project:

1. Run `/adev:init` to create the `.context-index/` directory with a constitution and manifest
2. Create at least one Feature Charter (e.g., for an `order-analytics` or `data-marts` module) that would scope the `fct_orders` model

Would you like me to:
1. **Initialize the project** with `/adev:init` and then create a charter to unblock the spec extraction?
2. **Skip the prerequisites** and proceed directly with generating the extract spec (deviating from the skill protocol)?
