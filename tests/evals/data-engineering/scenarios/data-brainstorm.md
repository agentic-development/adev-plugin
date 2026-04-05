# Scenario: Charter a Customer Lifetime Value module

## Skill
`/adev:brainstorm`

## Target Project
`tests/evals/adev:data-eval` — E-commerce dbt + DuckDB project

## Prompt
Create a feature charter for a "Customer Lifetime Value" analytics module in this project. The module should compute CLV metrics from existing order and customer data using dbt models.

The project already has:
- `dim_customers` with first_order_date, most_recent_order_date, number_of_orders, lifetime_value
- `fct_orders` with payment breakdowns per order
- `int_customer_order_history` with aggregated order stats

## Expected Behavior
The skill should explore existing context, recognize that some CLV building blocks already exist (dim_customers.lifetime_value), and propose a charter that extends rather than duplicates existing models. It should suggest cohort analysis, predictive CLV, and customer segmentation as new capabilities.

## Success Criteria
- References existing models by name
- Proposes new intermediate/mart models that build on existing ones
- Follows dimensional modeling conventions
- Defines testable quality attributes
