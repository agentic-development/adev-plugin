# Data Engineering Eval Report

Generated: 2026-05-11T14:50:20.549Z

> **Note:** Only the deterministic layer (required elements) is scored here.
> Quality dimensions require an LLM judge and are scored separately.

## Summary

| Variant | Skill | Elements Passed | Element Score | Max | Status |
|---------|-------|-----------------|---------------|-----|--------|
| baseline | data-assess | 10/11 | 45.5 | 50 | partial |
| baseline | data-brainstorm | 11/12 | 45.8 | 50 | partial |
| baseline | data-debug | 7/11 | 31.8 | 50 | partial |
| baseline | data-document | 9/12 | 37.5 | 50 | partial |
| baseline | data-specify | 10/12 | 41.7 | 50 | partial |
| baseline | data-write-test | - | - | 50 | no output |
| claude | data-assess | 11/11 | 50 | 50 | all pass |
| claude | data-brainstorm | 5/12 | 20.8 | 50 | partial |
| claude | data-debug | 5/11 | 22.7 | 50 | partial |
| claude | data-document | 10/12 | 41.7 | 50 | partial |
| claude | data-specify | 0/12 | 0 | 50 | partial |
| claude | data-write-test | 6/12 | 25 | 50 | partial |
| codex | data-assess | 11/11 | 50 | 50 | all pass |
| codex | data-brainstorm | 11/12 | 45.8 | 50 | partial |
| codex | data-debug | 6/11 | 27.3 | 50 | partial |
| codex | data-document | 8/12 | 33.3 | 50 | partial |
| codex | data-specify | 10/12 | 41.7 | 50 | partial |
| codex | data-write-test | - | - | 50 | no output |
| haiku | data-assess | 10/11 | 45.5 | 50 | partial |
| haiku | data-brainstorm | 12/12 | 50 | 50 | all pass |
| haiku | data-debug | 6/11 | 27.3 | 50 | partial |
| haiku | data-document | 10/12 | 41.7 | 50 | partial |
| haiku | data-specify | 12/12 | 50 | 50 | all pass |
| haiku | data-write-test | - | - | 50 | no output |
| opencode | data-assess | 0/11 | 0 | 50 | partial |
| opencode | data-brainstorm | 3/12 | 12.5 | 50 | partial |
| opencode | data-debug | 4/11 | 18.2 | 50 | partial |
| opencode | data-document | 11/12 | 45.8 | 50 | partial |
| opencode | data-specify | 9/12 | 37.5 | 50 | partial |
| opencode | data-write-test | 2/12 | 8.3 | 50 | partial |

## Details

### baseline / data-assess

**Required Elements:**

| ID | Description | Result |
|----|-------------|--------|
| `per_dimension_scores` | Produced individual numeric scores per dimension (not just an overall score) | PASS |
| `overall_score_formatted` | Overall score in X/100 format | PASS |
| `maturity_level_with_name` | Maturity level with label (e.g., L3 -- Defined, not just L3) | FAIL |
| `orchestration_evidence` | Cited specific Airflow evidence (DAG names or schedule) | PASS |
| `lineage_gap_identified` | Identified the missing source() declarations as a gap | PASS |
| `quality_ge_coverage_gap` | Identified that Great Expectations covers only 2 of 4 tables | PASS |
| `dbt_utils_unused` | Noticed dbt_utils package is installed but unused | PASS |
| `naming_convention_scored` | Recognized the stg_/int_/fct_/dim_ naming convention as a strength | PASS |
| `no_contract_enforced` | Identified lack of dbt model contracts (dbt 1.5+ feature) | PASS |
| `actionable_recommendation_with_file` | At least one recommendation references a specific file or config to change | PASS |
| `iac_score_zero_or_low` | Scored Infrastructure as Code at 0 or very low (no Terraform in project) | PASS |

**Quality Dimensions (manual/LLM scoring needed):**

| ID | Description | Weight | Score |
|----|-------------|--------|-------|
| `dimension_accuracy` | Scores reflect actual project maturity (L3+, not L1-L2 or L5) | 2 | - |
| `gap_specificity` | Gaps cite specific files/configs, not generic advice | 2 | - |
| `data_domain_depth` | Distinguishes data-specific dimensions from generic code dimensions | 1.5 | - |
| `no_hallucinated_files` | Does not reference files that don't exist in the project | 1.5 | - |

### baseline / data-brainstorm

**Required Elements:**

| ID | Description | Result |
|----|-------------|--------|
| `references_dim_customers` | Referenced dim_customers.lifetime_value as existing partial CLV | PASS |
| `references_int_customer_order_history` | Referenced int_customer_order_history as reusable upstream | PASS |
| `references_fct_orders` | Referenced fct_orders for order-level detail | PASS |
| `business_intent_section` | Has a Business Intent section header (not just mentions lifetime value) | PASS |
| `in_out_scope_sections` | Has both In Scope and Out of Scope as distinct sections | PASS |
| `capability_with_priority` | Listed at least one capability with must-have or should-have priority | PASS |
| `proposes_new_intermediate_model` | Proposed a new intermediate model (e.g., purchase intervals, cohort aggregation) | PASS |
| `proposes_new_mart_model` | Proposed a new mart/fact model for CLV | PASS |
| `does_not_modify_staging` | Explicitly states staging models are not modified (out of scope) | FAIL |
| `grain_specified` | Specified the grain of at least one proposed model | PASS |
| `defines_invariant_or_business_rule` | Defined at least one domain invariant or testable business rule | PASS |
| `mentions_segmentation_logic` | Described customer segmentation with named segments | PASS |

**Quality Dimensions (manual/LLM scoring needed):**

| ID | Description | Weight | Score |
|----|-------------|--------|-------|
| `reuse_over_rebuild` | Builds on existing models rather than proposing to rebuild from scratch | 2.5 | - |
| `dimensional_modeling` | Follows dimensional modeling conventions (fact/dim naming, grain, measures vs attributes) | 2 | - |
| `scope_discipline` | CLV-focused, doesn't scope-creep into product recommendations, marketing attribution | 1.5 | - |
| `completeness` | All 6 charter sections present and substantive (not placeholder) | 1 | - |

### baseline / data-debug

**Required Elements:**

| ID | Description | Result |
|----|-------------|--------|
| `read_fct_orders_sql` | Actually read and quoted from fct_orders.sql (not generic description) | PASS |
| `traced_upstream_chain` | Traced the full upstream chain (stg_payments -> int_orders_pivoted -> fct_orders) | PASS |
| `left_join_as_root_cause` | Identified the LEFT JOIN as the mechanism producing NULLs | PASS |
| `diagnostic_sql_query` | Proposed a specific SQL query to find the affected rows | FAIL |
| `coalesce_fix_proposed` | Proposed COALESCE(..., 0) as the fix (not just described the issue) | PASS |
| `noticed_seed_data_has_all_payments` | Noticed that the current seed data has payments for ALL orders (so NULLs wouldn't occur with current seeds) | FAIL |
| `placed_orders_connection` | Connected the 3 NULL rows to the 3 orders with 'placed' status (IDs 53, 57, 89) | PASS |
| `rerun_specific_test` | Proposed re-running the specific test (not just 'run dbt test') | PASS |
| `all_payment_columns_fixed` | Applied fix to ALL four payment columns, not just total_amount | PASS |
| `data_vs_model_distinction` | Distinguished between 'fix the model' vs 'fix the data' approaches | FAIL |
| `no_trial_and_error` | Did not suggest random fixes before reading the code | FAIL |

**Quality Dimensions (manual/LLM scoring needed):**

| ID | Description | Weight | Score |
|----|-------------|--------|-------|
| `systematic_rigor` | Followed reproduce -> investigate -> hypothesize -> fix -> validate, in order | 2 | - |
| `seed_data_awareness` | Recognized the paradox: seed data has all payments, so the bug requires different data | 2.5 | - |
| `fix_completeness` | Fixed all four columns and suggested adding not_null tests for the others | 1.5 | - |
| `non_destructive` | COALESCE preserves the LEFT JOIN (don't switch to INNER JOIN) | 1 | - |

### baseline / data-document

**Required Elements:**

| ID | Description | Result |
|----|-------------|--------|
| `all_nine_models_listed` | Listed all 9 dbt models by name (4 staging + 2 intermediate + 3 marts) | FAIL |
| `materialization_per_layer` | Documented that staging=views, intermediate=tables, marts=tables | PASS |
| `intermediate_tables_materialized` | Documented intermediate and marts as tables (not views) | PASS |
| `visual_data_flow` | Included a visual/ASCII data flow diagram (not just prose) | PASS |
| `flow_shows_all_layers` | Diagram shows seeds -> staging -> intermediate -> marts flow | PASS |
| `cents_to_dollars_documented` | Documented the cents_to_dollars macro with its formula | PASS |
| `payment_pivot_documented` | Documented the payment pivoting transformation with method names | PASS |
| `lifetime_value_logic` | Documented that lifetime_value only counts completed orders | PASS |
| `test_count_mentioned` | Mentioned the total test count (50 tests) | FAIL |
| `snapshot_documented` | Documented the SCD Type 2 snapshot on order_status | PASS |
| `both_dags_named` | Named both Airflow DAGs (dbt_daily_run AND data_quality_check) | FAIL |
| `dag_execution_order` | Documented the dbt_daily_run task execution order (seed -> run -> test -> snapshot) | PASS |

**Quality Dimensions (manual/LLM scoring needed):**

| ID | Description | Weight | Score |
|----|-------------|--------|-------|
| `accuracy` | No factual errors about the project structure | 2.5 | - |
| `completeness` | Covers models, transformations, testing, orchestration, and consumers | 2 | - |
| `onboarding_value` | A new team member could understand the project from this doc alone | 1.5 | - |
| `no_hallucination` | Does not reference models, files, or features that don't exist | 1.5 | - |

### baseline / data-specify

**Required Elements:**

| ID | Description | Result |
|----|-------------|--------|
| `grain_explicit` | Explicitly states grain as one row per order with order_id as PK | PASS |
| `left_join_documented` | Documented LEFT JOIN type specifically (not just 'join') | PASS |
| `fan_out_risk_addressed` | Addressed fan-out risk (or lack thereof) from the join | PASS |
| `when_then_statements` | At least 3 distinct When...Then behavioral statements | PASS |
| `null_payment_behavior` | Documented what happens when an order has no payments (NULL columns) | PASS |
| `payment_method_unknown_edge` | Identified edge case of unknown payment methods not captured in named columns | PASS |
| `all_payment_columns_listed` | Listed all four payment columns explicitly | FAIL |
| `cents_to_dollars_noted` | Noted that amounts are converted from cents to dollars upstream | PASS |
| `both_upstream_models_named` | Named both direct upstream models (stg_orders AND int_orders_pivoted_to_payments) | PASS |
| `transitive_dependency_traced` | Traced at least one transitive dependency (e.g., stg_payments feeds int_orders_pivoted) | PASS |
| `untested_criteria_identified` | Identified at least one acceptance criterion that is NOT currently tested | PASS |
| `order_total_discrepancy` | Noticed stg_orders.order_total exists but fct_orders uses payment totals instead | FAIL |

**Quality Dimensions (manual/LLM scoring needed):**

| ID | Description | Weight | Score |
|----|-------------|--------|-------|
| `extraction_accuracy` | Spec accurately reflects what the SQL does, not what it should do | 2.5 | - |
| `edge_case_depth` | Identifies non-obvious edge cases beyond the happy path | 2 | - |
| `lineage_completeness` | Full upstream chain traced, not just direct refs | 1.5 | - |
| `gap_identification` | Identifies testing or design gaps in the existing model | 1.5 | - |

### baseline / data-write-test

> Output file not found. Run the scenario with this variant and save output to:
> `outputs/baseline/data-write-test/output.md`

### claude / data-assess

**Required Elements:**

| ID | Description | Result |
|----|-------------|--------|
| `per_dimension_scores` | Produced individual numeric scores per dimension (not just an overall score) | PASS |
| `overall_score_formatted` | Overall score in X/100 format | PASS |
| `maturity_level_with_name` | Maturity level with label (e.g., L3 -- Defined, not just L3) | PASS |
| `orchestration_evidence` | Cited specific Airflow evidence (DAG names or schedule) | PASS |
| `lineage_gap_identified` | Identified the missing source() declarations as a gap | PASS |
| `quality_ge_coverage_gap` | Identified that Great Expectations covers only 2 of 4 tables | PASS |
| `dbt_utils_unused` | Noticed dbt_utils package is installed but unused | PASS |
| `naming_convention_scored` | Recognized the stg_/int_/fct_/dim_ naming convention as a strength | PASS |
| `no_contract_enforced` | Identified lack of dbt model contracts (dbt 1.5+ feature) | PASS |
| `actionable_recommendation_with_file` | At least one recommendation references a specific file or config to change | PASS |
| `iac_score_zero_or_low` | Scored Infrastructure as Code at 0 or very low (no Terraform in project) | PASS |

**Quality Dimensions (manual/LLM scoring needed):**

| ID | Description | Weight | Score |
|----|-------------|--------|-------|
| `dimension_accuracy` | Scores reflect actual project maturity (L3+, not L1-L2 or L5) | 2 | - |
| `gap_specificity` | Gaps cite specific files/configs, not generic advice | 2 | - |
| `data_domain_depth` | Distinguishes data-specific dimensions from generic code dimensions | 1.5 | - |
| `no_hallucinated_files` | Does not reference files that don't exist in the project | 1.5 | - |

### claude / data-brainstorm

**Required Elements:**

| ID | Description | Result |
|----|-------------|--------|
| `references_dim_customers` | Referenced dim_customers.lifetime_value as existing partial CLV | PASS |
| `references_int_customer_order_history` | Referenced int_customer_order_history as reusable upstream | PASS |
| `references_fct_orders` | Referenced fct_orders for order-level detail | PASS |
| `business_intent_section` | Has a Business Intent section header (not just mentions lifetime value) | FAIL |
| `in_out_scope_sections` | Has both In Scope and Out of Scope as distinct sections | FAIL |
| `capability_with_priority` | Listed at least one capability with must-have or should-have priority | FAIL |
| `proposes_new_intermediate_model` | Proposed a new intermediate model (e.g., purchase intervals, cohort aggregation) | FAIL |
| `proposes_new_mart_model` | Proposed a new mart/fact model for CLV | PASS |
| `does_not_modify_staging` | Explicitly states staging models are not modified (out of scope) | FAIL |
| `grain_specified` | Specified the grain of at least one proposed model | PASS |
| `defines_invariant_or_business_rule` | Defined at least one domain invariant or testable business rule | FAIL |
| `mentions_segmentation_logic` | Described customer segmentation with named segments | FAIL |

**Quality Dimensions (manual/LLM scoring needed):**

| ID | Description | Weight | Score |
|----|-------------|--------|-------|
| `reuse_over_rebuild` | Builds on existing models rather than proposing to rebuild from scratch | 2.5 | - |
| `dimensional_modeling` | Follows dimensional modeling conventions (fact/dim naming, grain, measures vs attributes) | 2 | - |
| `scope_discipline` | CLV-focused, doesn't scope-creep into product recommendations, marketing attribution | 1.5 | - |
| `completeness` | All 6 charter sections present and substantive (not placeholder) | 1 | - |

### claude / data-debug

**Required Elements:**

| ID | Description | Result |
|----|-------------|--------|
| `read_fct_orders_sql` | Actually read and quoted from fct_orders.sql (not generic description) | PASS |
| `traced_upstream_chain` | Traced the full upstream chain (stg_payments -> int_orders_pivoted -> fct_orders) | FAIL |
| `left_join_as_root_cause` | Identified the LEFT JOIN as the mechanism producing NULLs | PASS |
| `diagnostic_sql_query` | Proposed a specific SQL query to find the affected rows | FAIL |
| `coalesce_fix_proposed` | Proposed COALESCE(..., 0) as the fix (not just described the issue) | PASS |
| `noticed_seed_data_has_all_payments` | Noticed that the current seed data has payments for ALL orders (so NULLs wouldn't occur with current seeds) | FAIL |
| `placed_orders_connection` | Connected the 3 NULL rows to the 3 orders with 'placed' status (IDs 53, 57, 89) | FAIL |
| `rerun_specific_test` | Proposed re-running the specific test (not just 'run dbt test') | PASS |
| `all_payment_columns_fixed` | Applied fix to ALL four payment columns, not just total_amount | PASS |
| `data_vs_model_distinction` | Distinguished between 'fix the model' vs 'fix the data' approaches | FAIL |
| `no_trial_and_error` | Did not suggest random fixes before reading the code | FAIL |

**Quality Dimensions (manual/LLM scoring needed):**

| ID | Description | Weight | Score |
|----|-------------|--------|-------|
| `systematic_rigor` | Followed reproduce -> investigate -> hypothesize -> fix -> validate, in order | 2 | - |
| `seed_data_awareness` | Recognized the paradox: seed data has all payments, so the bug requires different data | 2.5 | - |
| `fix_completeness` | Fixed all four columns and suggested adding not_null tests for the others | 1.5 | - |
| `non_destructive` | COALESCE preserves the LEFT JOIN (don't switch to INNER JOIN) | 1 | - |

### claude / data-document

**Required Elements:**

| ID | Description | Result |
|----|-------------|--------|
| `all_nine_models_listed` | Listed all 9 dbt models by name (4 staging + 2 intermediate + 3 marts) | PASS |
| `materialization_per_layer` | Documented that staging=views, intermediate=tables, marts=tables | PASS |
| `intermediate_tables_materialized` | Documented intermediate and marts as tables (not views) | PASS |
| `visual_data_flow` | Included a visual/ASCII data flow diagram (not just prose) | PASS |
| `flow_shows_all_layers` | Diagram shows seeds -> staging -> intermediate -> marts flow | PASS |
| `cents_to_dollars_documented` | Documented the cents_to_dollars macro with its formula | PASS |
| `payment_pivot_documented` | Documented the payment pivoting transformation with method names | PASS |
| `lifetime_value_logic` | Documented that lifetime_value only counts completed orders | PASS |
| `test_count_mentioned` | Mentioned the total test count (50 tests) | FAIL |
| `snapshot_documented` | Documented the SCD Type 2 snapshot on order_status | PASS |
| `both_dags_named` | Named both Airflow DAGs (dbt_daily_run AND data_quality_check) | FAIL |
| `dag_execution_order` | Documented the dbt_daily_run task execution order (seed -> run -> test -> snapshot) | PASS |

**Quality Dimensions (manual/LLM scoring needed):**

| ID | Description | Weight | Score |
|----|-------------|--------|-------|
| `accuracy` | No factual errors about the project structure | 2.5 | - |
| `completeness` | Covers models, transformations, testing, orchestration, and consumers | 2 | - |
| `onboarding_value` | A new team member could understand the project from this doc alone | 1.5 | - |
| `no_hallucination` | Does not reference models, files, or features that don't exist | 1.5 | - |

### claude / data-specify

**Required Elements:**

| ID | Description | Result |
|----|-------------|--------|
| `grain_explicit` | Explicitly states grain as one row per order with order_id as PK | FAIL |
| `left_join_documented` | Documented LEFT JOIN type specifically (not just 'join') | FAIL |
| `fan_out_risk_addressed` | Addressed fan-out risk (or lack thereof) from the join | FAIL |
| `when_then_statements` | At least 3 distinct When...Then behavioral statements | FAIL |
| `null_payment_behavior` | Documented what happens when an order has no payments (NULL columns) | FAIL |
| `payment_method_unknown_edge` | Identified edge case of unknown payment methods not captured in named columns | FAIL |
| `all_payment_columns_listed` | Listed all four payment columns explicitly | FAIL |
| `cents_to_dollars_noted` | Noted that amounts are converted from cents to dollars upstream | FAIL |
| `both_upstream_models_named` | Named both direct upstream models (stg_orders AND int_orders_pivoted_to_payments) | FAIL |
| `transitive_dependency_traced` | Traced at least one transitive dependency (e.g., stg_payments feeds int_orders_pivoted) | FAIL |
| `untested_criteria_identified` | Identified at least one acceptance criterion that is NOT currently tested | FAIL |
| `order_total_discrepancy` | Noticed stg_orders.order_total exists but fct_orders uses payment totals instead | FAIL |

**Quality Dimensions (manual/LLM scoring needed):**

| ID | Description | Weight | Score |
|----|-------------|--------|-------|
| `extraction_accuracy` | Spec accurately reflects what the SQL does, not what it should do | 2.5 | - |
| `edge_case_depth` | Identifies non-obvious edge cases beyond the happy path | 2 | - |
| `lineage_completeness` | Full upstream chain traced, not just direct refs | 1.5 | - |
| `gap_identification` | Identifies testing or design gaps in the existing model | 1.5 | - |

### claude / data-write-test

**Required Elements:**

| ID | Description | Result |
|----|-------------|--------|
| `schema_yml_format` | Produced tests in dbt YAML schema format (version: 2 + models section) | PASS |
| `relationship_test_with_arguments` | Used the dbt 1.7+ arguments format for relationship tests | FAIL |
| `accepted_values_for_country` | Proposed accepted_values test on country with specific country codes | PASS |
| `custom_test_sql_format` | Proposed custom tests as SQL SELECT that returns failing rows (dbt convention) | FAIL |
| `lifetime_value_non_negative` | Test that lifetime_value >= 0 (not just not_null) | PASS |
| `date_consistency_test` | Test that first_order_date <= most_recent_order_date | PASS |
| `zero_orders_implies_null_dates` | Test invariant: customers with 0 orders have null order dates | FAIL |
| `specific_customer_id_assertion` | Referenced a specific customer_id from seed data in a test assertion | PASS |
| `null_email_customers_identified` | Identified the specific customers with NULL emails (IDs 4, 9, 17, or 34) | FAIL |
| `expected_lifetime_value` | Computed an expected lifetime_value for a specific customer from seed data | PASS |
| `no_loose_count_assertion` | Does not rely on loose assertions like count > 0 or count(*) > 0 as a passing test | FAIL |
| `row_count_test` | Tests that dim_customers has exactly 50 rows (matching seed) | FAIL |

**Quality Dimensions (manual/LLM scoring needed):**

| ID | Description | Weight | Score |
|----|-------------|--------|-------|
| `dbt_idiomatic` | Uses schema tests + custom data tests, not raw SQL assertions or pytest | 2 | - |
| `business_logic_coverage` | Tests the completed-only LTV calculation, not just schema constraints | 2 | - |
| `edge_case_coverage` | Tests NULL emails, zero-order customers, date ordering | 1.5 | - |
| `seed_determinism` | Assertions reference specific known values from seed data, not dynamic counts | 2 | - |

### codex / data-assess

**Required Elements:**

| ID | Description | Result |
|----|-------------|--------|
| `per_dimension_scores` | Produced individual numeric scores per dimension (not just an overall score) | PASS |
| `overall_score_formatted` | Overall score in X/100 format | PASS |
| `maturity_level_with_name` | Maturity level with label (e.g., L3 -- Defined, not just L3) | PASS |
| `orchestration_evidence` | Cited specific Airflow evidence (DAG names or schedule) | PASS |
| `lineage_gap_identified` | Identified the missing source() declarations as a gap | PASS |
| `quality_ge_coverage_gap` | Identified that Great Expectations covers only 2 of 4 tables | PASS |
| `dbt_utils_unused` | Noticed dbt_utils package is installed but unused | PASS |
| `naming_convention_scored` | Recognized the stg_/int_/fct_/dim_ naming convention as a strength | PASS |
| `no_contract_enforced` | Identified lack of dbt model contracts (dbt 1.5+ feature) | PASS |
| `actionable_recommendation_with_file` | At least one recommendation references a specific file or config to change | PASS |
| `iac_score_zero_or_low` | Scored Infrastructure as Code at 0 or very low (no Terraform in project) | PASS |

**Quality Dimensions (manual/LLM scoring needed):**

| ID | Description | Weight | Score |
|----|-------------|--------|-------|
| `dimension_accuracy` | Scores reflect actual project maturity (L3+, not L1-L2 or L5) | 2 | - |
| `gap_specificity` | Gaps cite specific files/configs, not generic advice | 2 | - |
| `data_domain_depth` | Distinguishes data-specific dimensions from generic code dimensions | 1.5 | - |
| `no_hallucinated_files` | Does not reference files that don't exist in the project | 1.5 | - |

### codex / data-brainstorm

**Required Elements:**

| ID | Description | Result |
|----|-------------|--------|
| `references_dim_customers` | Referenced dim_customers.lifetime_value as existing partial CLV | PASS |
| `references_int_customer_order_history` | Referenced int_customer_order_history as reusable upstream | PASS |
| `references_fct_orders` | Referenced fct_orders for order-level detail | PASS |
| `business_intent_section` | Has a Business Intent section header (not just mentions lifetime value) | PASS |
| `in_out_scope_sections` | Has both In Scope and Out of Scope as distinct sections | PASS |
| `capability_with_priority` | Listed at least one capability with must-have or should-have priority | PASS |
| `proposes_new_intermediate_model` | Proposed a new intermediate model (e.g., purchase intervals, cohort aggregation) | PASS |
| `proposes_new_mart_model` | Proposed a new mart/fact model for CLV | PASS |
| `does_not_modify_staging` | Explicitly states staging models are not modified (out of scope) | FAIL |
| `grain_specified` | Specified the grain of at least one proposed model | PASS |
| `defines_invariant_or_business_rule` | Defined at least one domain invariant or testable business rule | PASS |
| `mentions_segmentation_logic` | Described customer segmentation with named segments | PASS |

**Quality Dimensions (manual/LLM scoring needed):**

| ID | Description | Weight | Score |
|----|-------------|--------|-------|
| `reuse_over_rebuild` | Builds on existing models rather than proposing to rebuild from scratch | 2.5 | - |
| `dimensional_modeling` | Follows dimensional modeling conventions (fact/dim naming, grain, measures vs attributes) | 2 | - |
| `scope_discipline` | CLV-focused, doesn't scope-creep into product recommendations, marketing attribution | 1.5 | - |
| `completeness` | All 6 charter sections present and substantive (not placeholder) | 1 | - |

### codex / data-debug

**Required Elements:**

| ID | Description | Result |
|----|-------------|--------|
| `read_fct_orders_sql` | Actually read and quoted from fct_orders.sql (not generic description) | PASS |
| `traced_upstream_chain` | Traced the full upstream chain (stg_payments -> int_orders_pivoted -> fct_orders) | FAIL |
| `left_join_as_root_cause` | Identified the LEFT JOIN as the mechanism producing NULLs | PASS |
| `diagnostic_sql_query` | Proposed a specific SQL query to find the affected rows | FAIL |
| `coalesce_fix_proposed` | Proposed COALESCE(..., 0) as the fix (not just described the issue) | PASS |
| `noticed_seed_data_has_all_payments` | Noticed that the current seed data has payments for ALL orders (so NULLs wouldn't occur with current seeds) | PASS |
| `placed_orders_connection` | Connected the 3 NULL rows to the 3 orders with 'placed' status (IDs 53, 57, 89) | FAIL |
| `rerun_specific_test` | Proposed re-running the specific test (not just 'run dbt test') | PASS |
| `all_payment_columns_fixed` | Applied fix to ALL four payment columns, not just total_amount | FAIL |
| `data_vs_model_distinction` | Distinguished between 'fix the model' vs 'fix the data' approaches | PASS |
| `no_trial_and_error` | Did not suggest random fixes before reading the code | FAIL |

**Quality Dimensions (manual/LLM scoring needed):**

| ID | Description | Weight | Score |
|----|-------------|--------|-------|
| `systematic_rigor` | Followed reproduce -> investigate -> hypothesize -> fix -> validate, in order | 2 | - |
| `seed_data_awareness` | Recognized the paradox: seed data has all payments, so the bug requires different data | 2.5 | - |
| `fix_completeness` | Fixed all four columns and suggested adding not_null tests for the others | 1.5 | - |
| `non_destructive` | COALESCE preserves the LEFT JOIN (don't switch to INNER JOIN) | 1 | - |

### codex / data-document

**Required Elements:**

| ID | Description | Result |
|----|-------------|--------|
| `all_nine_models_listed` | Listed all 9 dbt models by name (4 staging + 2 intermediate + 3 marts) | PASS |
| `materialization_per_layer` | Documented that staging=views, intermediate=tables, marts=tables | PASS |
| `intermediate_tables_materialized` | Documented intermediate and marts as tables (not views) | PASS |
| `visual_data_flow` | Included a visual/ASCII data flow diagram (not just prose) | PASS |
| `flow_shows_all_layers` | Diagram shows seeds -> staging -> intermediate -> marts flow | FAIL |
| `cents_to_dollars_documented` | Documented the cents_to_dollars macro with its formula | PASS |
| `payment_pivot_documented` | Documented the payment pivoting transformation with method names | FAIL |
| `lifetime_value_logic` | Documented that lifetime_value only counts completed orders | PASS |
| `test_count_mentioned` | Mentioned the total test count (50 tests) | FAIL |
| `snapshot_documented` | Documented the SCD Type 2 snapshot on order_status | PASS |
| `both_dags_named` | Named both Airflow DAGs (dbt_daily_run AND data_quality_check) | FAIL |
| `dag_execution_order` | Documented the dbt_daily_run task execution order (seed -> run -> test -> snapshot) | PASS |

**Quality Dimensions (manual/LLM scoring needed):**

| ID | Description | Weight | Score |
|----|-------------|--------|-------|
| `accuracy` | No factual errors about the project structure | 2.5 | - |
| `completeness` | Covers models, transformations, testing, orchestration, and consumers | 2 | - |
| `onboarding_value` | A new team member could understand the project from this doc alone | 1.5 | - |
| `no_hallucination` | Does not reference models, files, or features that don't exist | 1.5 | - |

### codex / data-specify

**Required Elements:**

| ID | Description | Result |
|----|-------------|--------|
| `grain_explicit` | Explicitly states grain as one row per order with order_id as PK | PASS |
| `left_join_documented` | Documented LEFT JOIN type specifically (not just 'join') | PASS |
| `fan_out_risk_addressed` | Addressed fan-out risk (or lack thereof) from the join | PASS |
| `when_then_statements` | At least 3 distinct When...Then behavioral statements | PASS |
| `null_payment_behavior` | Documented what happens when an order has no payments (NULL columns) | PASS |
| `payment_method_unknown_edge` | Identified edge case of unknown payment methods not captured in named columns | FAIL |
| `all_payment_columns_listed` | Listed all four payment columns explicitly | PASS |
| `cents_to_dollars_noted` | Noted that amounts are converted from cents to dollars upstream | PASS |
| `both_upstream_models_named` | Named both direct upstream models (stg_orders AND int_orders_pivoted_to_payments) | PASS |
| `transitive_dependency_traced` | Traced at least one transitive dependency (e.g., stg_payments feeds int_orders_pivoted) | PASS |
| `untested_criteria_identified` | Identified at least one acceptance criterion that is NOT currently tested | PASS |
| `order_total_discrepancy` | Noticed stg_orders.order_total exists but fct_orders uses payment totals instead | FAIL |

**Quality Dimensions (manual/LLM scoring needed):**

| ID | Description | Weight | Score |
|----|-------------|--------|-------|
| `extraction_accuracy` | Spec accurately reflects what the SQL does, not what it should do | 2.5 | - |
| `edge_case_depth` | Identifies non-obvious edge cases beyond the happy path | 2 | - |
| `lineage_completeness` | Full upstream chain traced, not just direct refs | 1.5 | - |
| `gap_identification` | Identifies testing or design gaps in the existing model | 1.5 | - |

### codex / data-write-test

> Output file not found. Run the scenario with this variant and save output to:
> `outputs/codex/data-write-test/output.md`

### haiku / data-assess

**Required Elements:**

| ID | Description | Result |
|----|-------------|--------|
| `per_dimension_scores` | Produced individual numeric scores per dimension (not just an overall score) | PASS |
| `overall_score_formatted` | Overall score in X/100 format | PASS |
| `maturity_level_with_name` | Maturity level with label (e.g., L3 -- Defined, not just L3) | FAIL |
| `orchestration_evidence` | Cited specific Airflow evidence (DAG names or schedule) | PASS |
| `lineage_gap_identified` | Identified the missing source() declarations as a gap | PASS |
| `quality_ge_coverage_gap` | Identified that Great Expectations covers only 2 of 4 tables | PASS |
| `dbt_utils_unused` | Noticed dbt_utils package is installed but unused | PASS |
| `naming_convention_scored` | Recognized the stg_/int_/fct_/dim_ naming convention as a strength | PASS |
| `no_contract_enforced` | Identified lack of dbt model contracts (dbt 1.5+ feature) | PASS |
| `actionable_recommendation_with_file` | At least one recommendation references a specific file or config to change | PASS |
| `iac_score_zero_or_low` | Scored Infrastructure as Code at 0 or very low (no Terraform in project) | PASS |

**Quality Dimensions (manual/LLM scoring needed):**

| ID | Description | Weight | Score |
|----|-------------|--------|-------|
| `dimension_accuracy` | Scores reflect actual project maturity (L3+, not L1-L2 or L5) | 2 | - |
| `gap_specificity` | Gaps cite specific files/configs, not generic advice | 2 | - |
| `data_domain_depth` | Distinguishes data-specific dimensions from generic code dimensions | 1.5 | - |
| `no_hallucinated_files` | Does not reference files that don't exist in the project | 1.5 | - |

### haiku / data-brainstorm

**Required Elements:**

| ID | Description | Result |
|----|-------------|--------|
| `references_dim_customers` | Referenced dim_customers.lifetime_value as existing partial CLV | PASS |
| `references_int_customer_order_history` | Referenced int_customer_order_history as reusable upstream | PASS |
| `references_fct_orders` | Referenced fct_orders for order-level detail | PASS |
| `business_intent_section` | Has a Business Intent section header (not just mentions lifetime value) | PASS |
| `in_out_scope_sections` | Has both In Scope and Out of Scope as distinct sections | PASS |
| `capability_with_priority` | Listed at least one capability with must-have or should-have priority | PASS |
| `proposes_new_intermediate_model` | Proposed a new intermediate model (e.g., purchase intervals, cohort aggregation) | PASS |
| `proposes_new_mart_model` | Proposed a new mart/fact model for CLV | PASS |
| `does_not_modify_staging` | Explicitly states staging models are not modified (out of scope) | PASS |
| `grain_specified` | Specified the grain of at least one proposed model | PASS |
| `defines_invariant_or_business_rule` | Defined at least one domain invariant or testable business rule | PASS |
| `mentions_segmentation_logic` | Described customer segmentation with named segments | PASS |

**Quality Dimensions (manual/LLM scoring needed):**

| ID | Description | Weight | Score |
|----|-------------|--------|-------|
| `reuse_over_rebuild` | Builds on existing models rather than proposing to rebuild from scratch | 2.5 | - |
| `dimensional_modeling` | Follows dimensional modeling conventions (fact/dim naming, grain, measures vs attributes) | 2 | - |
| `scope_discipline` | CLV-focused, doesn't scope-creep into product recommendations, marketing attribution | 1.5 | - |
| `completeness` | All 6 charter sections present and substantive (not placeholder) | 1 | - |

### haiku / data-debug

**Required Elements:**

| ID | Description | Result |
|----|-------------|--------|
| `read_fct_orders_sql` | Actually read and quoted from fct_orders.sql (not generic description) | PASS |
| `traced_upstream_chain` | Traced the full upstream chain (stg_payments -> int_orders_pivoted -> fct_orders) | PASS |
| `left_join_as_root_cause` | Identified the LEFT JOIN as the mechanism producing NULLs | PASS |
| `diagnostic_sql_query` | Proposed a specific SQL query to find the affected rows | FAIL |
| `coalesce_fix_proposed` | Proposed COALESCE(..., 0) as the fix (not just described the issue) | PASS |
| `noticed_seed_data_has_all_payments` | Noticed that the current seed data has payments for ALL orders (so NULLs wouldn't occur with current seeds) | FAIL |
| `placed_orders_connection` | Connected the 3 NULL rows to the 3 orders with 'placed' status (IDs 53, 57, 89) | FAIL |
| `rerun_specific_test` | Proposed re-running the specific test (not just 'run dbt test') | PASS |
| `all_payment_columns_fixed` | Applied fix to ALL four payment columns, not just total_amount | PASS |
| `data_vs_model_distinction` | Distinguished between 'fix the model' vs 'fix the data' approaches | FAIL |
| `no_trial_and_error` | Did not suggest random fixes before reading the code | FAIL |

**Quality Dimensions (manual/LLM scoring needed):**

| ID | Description | Weight | Score |
|----|-------------|--------|-------|
| `systematic_rigor` | Followed reproduce -> investigate -> hypothesize -> fix -> validate, in order | 2 | - |
| `seed_data_awareness` | Recognized the paradox: seed data has all payments, so the bug requires different data | 2.5 | - |
| `fix_completeness` | Fixed all four columns and suggested adding not_null tests for the others | 1.5 | - |
| `non_destructive` | COALESCE preserves the LEFT JOIN (don't switch to INNER JOIN) | 1 | - |

### haiku / data-document

**Required Elements:**

| ID | Description | Result |
|----|-------------|--------|
| `all_nine_models_listed` | Listed all 9 dbt models by name (4 staging + 2 intermediate + 3 marts) | FAIL |
| `materialization_per_layer` | Documented that staging=views, intermediate=tables, marts=tables | PASS |
| `intermediate_tables_materialized` | Documented intermediate and marts as tables (not views) | PASS |
| `visual_data_flow` | Included a visual/ASCII data flow diagram (not just prose) | PASS |
| `flow_shows_all_layers` | Diagram shows seeds -> staging -> intermediate -> marts flow | PASS |
| `cents_to_dollars_documented` | Documented the cents_to_dollars macro with its formula | PASS |
| `payment_pivot_documented` | Documented the payment pivoting transformation with method names | PASS |
| `lifetime_value_logic` | Documented that lifetime_value only counts completed orders | PASS |
| `test_count_mentioned` | Mentioned the total test count (50 tests) | PASS |
| `snapshot_documented` | Documented the SCD Type 2 snapshot on order_status | PASS |
| `both_dags_named` | Named both Airflow DAGs (dbt_daily_run AND data_quality_check) | FAIL |
| `dag_execution_order` | Documented the dbt_daily_run task execution order (seed -> run -> test -> snapshot) | PASS |

**Quality Dimensions (manual/LLM scoring needed):**

| ID | Description | Weight | Score |
|----|-------------|--------|-------|
| `accuracy` | No factual errors about the project structure | 2.5 | - |
| `completeness` | Covers models, transformations, testing, orchestration, and consumers | 2 | - |
| `onboarding_value` | A new team member could understand the project from this doc alone | 1.5 | - |
| `no_hallucination` | Does not reference models, files, or features that don't exist | 1.5 | - |

### haiku / data-specify

**Required Elements:**

| ID | Description | Result |
|----|-------------|--------|
| `grain_explicit` | Explicitly states grain as one row per order with order_id as PK | PASS |
| `left_join_documented` | Documented LEFT JOIN type specifically (not just 'join') | PASS |
| `fan_out_risk_addressed` | Addressed fan-out risk (or lack thereof) from the join | PASS |
| `when_then_statements` | At least 3 distinct When...Then behavioral statements | PASS |
| `null_payment_behavior` | Documented what happens when an order has no payments (NULL columns) | PASS |
| `payment_method_unknown_edge` | Identified edge case of unknown payment methods not captured in named columns | PASS |
| `all_payment_columns_listed` | Listed all four payment columns explicitly | PASS |
| `cents_to_dollars_noted` | Noted that amounts are converted from cents to dollars upstream | PASS |
| `both_upstream_models_named` | Named both direct upstream models (stg_orders AND int_orders_pivoted_to_payments) | PASS |
| `transitive_dependency_traced` | Traced at least one transitive dependency (e.g., stg_payments feeds int_orders_pivoted) | PASS |
| `untested_criteria_identified` | Identified at least one acceptance criterion that is NOT currently tested | PASS |
| `order_total_discrepancy` | Noticed stg_orders.order_total exists but fct_orders uses payment totals instead | PASS |

**Quality Dimensions (manual/LLM scoring needed):**

| ID | Description | Weight | Score |
|----|-------------|--------|-------|
| `extraction_accuracy` | Spec accurately reflects what the SQL does, not what it should do | 2.5 | - |
| `edge_case_depth` | Identifies non-obvious edge cases beyond the happy path | 2 | - |
| `lineage_completeness` | Full upstream chain traced, not just direct refs | 1.5 | - |
| `gap_identification` | Identifies testing or design gaps in the existing model | 1.5 | - |

### haiku / data-write-test

> Output file not found. Run the scenario with this variant and save output to:
> `outputs/haiku/data-write-test/output.md`

### opencode / data-assess

**Required Elements:**

| ID | Description | Result |
|----|-------------|--------|
| `per_dimension_scores` | Produced individual numeric scores per dimension (not just an overall score) | FAIL |
| `overall_score_formatted` | Overall score in X/100 format | FAIL |
| `maturity_level_with_name` | Maturity level with label (e.g., L3 -- Defined, not just L3) | FAIL |
| `orchestration_evidence` | Cited specific Airflow evidence (DAG names or schedule) | FAIL |
| `lineage_gap_identified` | Identified the missing source() declarations as a gap | FAIL |
| `quality_ge_coverage_gap` | Identified that Great Expectations covers only 2 of 4 tables | FAIL |
| `dbt_utils_unused` | Noticed dbt_utils package is installed but unused | FAIL |
| `naming_convention_scored` | Recognized the stg_/int_/fct_/dim_ naming convention as a strength | FAIL |
| `no_contract_enforced` | Identified lack of dbt model contracts (dbt 1.5+ feature) | FAIL |
| `actionable_recommendation_with_file` | At least one recommendation references a specific file or config to change | FAIL |
| `iac_score_zero_or_low` | Scored Infrastructure as Code at 0 or very low (no Terraform in project) | FAIL |

**Quality Dimensions (manual/LLM scoring needed):**

| ID | Description | Weight | Score |
|----|-------------|--------|-------|
| `dimension_accuracy` | Scores reflect actual project maturity (L3+, not L1-L2 or L5) | 2 | - |
| `gap_specificity` | Gaps cite specific files/configs, not generic advice | 2 | - |
| `data_domain_depth` | Distinguishes data-specific dimensions from generic code dimensions | 1.5 | - |
| `no_hallucinated_files` | Does not reference files that don't exist in the project | 1.5 | - |

### opencode / data-brainstorm

**Required Elements:**

| ID | Description | Result |
|----|-------------|--------|
| `references_dim_customers` | Referenced dim_customers.lifetime_value as existing partial CLV | PASS |
| `references_int_customer_order_history` | Referenced int_customer_order_history as reusable upstream | PASS |
| `references_fct_orders` | Referenced fct_orders for order-level detail | PASS |
| `business_intent_section` | Has a Business Intent section header (not just mentions lifetime value) | FAIL |
| `in_out_scope_sections` | Has both In Scope and Out of Scope as distinct sections | FAIL |
| `capability_with_priority` | Listed at least one capability with must-have or should-have priority | FAIL |
| `proposes_new_intermediate_model` | Proposed a new intermediate model (e.g., purchase intervals, cohort aggregation) | FAIL |
| `proposes_new_mart_model` | Proposed a new mart/fact model for CLV | FAIL |
| `does_not_modify_staging` | Explicitly states staging models are not modified (out of scope) | FAIL |
| `grain_specified` | Specified the grain of at least one proposed model | FAIL |
| `defines_invariant_or_business_rule` | Defined at least one domain invariant or testable business rule | FAIL |
| `mentions_segmentation_logic` | Described customer segmentation with named segments | FAIL |

**Quality Dimensions (manual/LLM scoring needed):**

| ID | Description | Weight | Score |
|----|-------------|--------|-------|
| `reuse_over_rebuild` | Builds on existing models rather than proposing to rebuild from scratch | 2.5 | - |
| `dimensional_modeling` | Follows dimensional modeling conventions (fact/dim naming, grain, measures vs attributes) | 2 | - |
| `scope_discipline` | CLV-focused, doesn't scope-creep into product recommendations, marketing attribution | 1.5 | - |
| `completeness` | All 6 charter sections present and substantive (not placeholder) | 1 | - |

### opencode / data-debug

**Required Elements:**

| ID | Description | Result |
|----|-------------|--------|
| `read_fct_orders_sql` | Actually read and quoted from fct_orders.sql (not generic description) | FAIL |
| `traced_upstream_chain` | Traced the full upstream chain (stg_payments -> int_orders_pivoted -> fct_orders) | FAIL |
| `left_join_as_root_cause` | Identified the LEFT JOIN as the mechanism producing NULLs | PASS |
| `diagnostic_sql_query` | Proposed a specific SQL query to find the affected rows | FAIL |
| `coalesce_fix_proposed` | Proposed COALESCE(..., 0) as the fix (not just described the issue) | PASS |
| `noticed_seed_data_has_all_payments` | Noticed that the current seed data has payments for ALL orders (so NULLs wouldn't occur with current seeds) | PASS |
| `placed_orders_connection` | Connected the 3 NULL rows to the 3 orders with 'placed' status (IDs 53, 57, 89) | FAIL |
| `rerun_specific_test` | Proposed re-running the specific test (not just 'run dbt test') | FAIL |
| `all_payment_columns_fixed` | Applied fix to ALL four payment columns, not just total_amount | FAIL |
| `data_vs_model_distinction` | Distinguished between 'fix the model' vs 'fix the data' approaches | PASS |
| `no_trial_and_error` | Did not suggest random fixes before reading the code | FAIL |

**Quality Dimensions (manual/LLM scoring needed):**

| ID | Description | Weight | Score |
|----|-------------|--------|-------|
| `systematic_rigor` | Followed reproduce -> investigate -> hypothesize -> fix -> validate, in order | 2 | - |
| `seed_data_awareness` | Recognized the paradox: seed data has all payments, so the bug requires different data | 2.5 | - |
| `fix_completeness` | Fixed all four columns and suggested adding not_null tests for the others | 1.5 | - |
| `non_destructive` | COALESCE preserves the LEFT JOIN (don't switch to INNER JOIN) | 1 | - |

### opencode / data-document

**Required Elements:**

| ID | Description | Result |
|----|-------------|--------|
| `all_nine_models_listed` | Listed all 9 dbt models by name (4 staging + 2 intermediate + 3 marts) | PASS |
| `materialization_per_layer` | Documented that staging=views, intermediate=tables, marts=tables | PASS |
| `intermediate_tables_materialized` | Documented intermediate and marts as tables (not views) | PASS |
| `visual_data_flow` | Included a visual/ASCII data flow diagram (not just prose) | PASS |
| `flow_shows_all_layers` | Diagram shows seeds -> staging -> intermediate -> marts flow | PASS |
| `cents_to_dollars_documented` | Documented the cents_to_dollars macro with its formula | PASS |
| `payment_pivot_documented` | Documented the payment pivoting transformation with method names | PASS |
| `lifetime_value_logic` | Documented that lifetime_value only counts completed orders | PASS |
| `test_count_mentioned` | Mentioned the total test count (50 tests) | PASS |
| `snapshot_documented` | Documented the SCD Type 2 snapshot on order_status | PASS |
| `both_dags_named` | Named both Airflow DAGs (dbt_daily_run AND data_quality_check) | FAIL |
| `dag_execution_order` | Documented the dbt_daily_run task execution order (seed -> run -> test -> snapshot) | PASS |

**Quality Dimensions (manual/LLM scoring needed):**

| ID | Description | Weight | Score |
|----|-------------|--------|-------|
| `accuracy` | No factual errors about the project structure | 2.5 | - |
| `completeness` | Covers models, transformations, testing, orchestration, and consumers | 2 | - |
| `onboarding_value` | A new team member could understand the project from this doc alone | 1.5 | - |
| `no_hallucination` | Does not reference models, files, or features that don't exist | 1.5 | - |

### opencode / data-specify

**Required Elements:**

| ID | Description | Result |
|----|-------------|--------|
| `grain_explicit` | Explicitly states grain as one row per order with order_id as PK | PASS |
| `left_join_documented` | Documented LEFT JOIN type specifically (not just 'join') | PASS |
| `fan_out_risk_addressed` | Addressed fan-out risk (or lack thereof) from the join | PASS |
| `when_then_statements` | At least 3 distinct When...Then behavioral statements | PASS |
| `null_payment_behavior` | Documented what happens when an order has no payments (NULL columns) | PASS |
| `payment_method_unknown_edge` | Identified edge case of unknown payment methods not captured in named columns | PASS |
| `all_payment_columns_listed` | Listed all four payment columns explicitly | PASS |
| `cents_to_dollars_noted` | Noted that amounts are converted from cents to dollars upstream | PASS |
| `both_upstream_models_named` | Named both direct upstream models (stg_orders AND int_orders_pivoted_to_payments) | FAIL |
| `transitive_dependency_traced` | Traced at least one transitive dependency (e.g., stg_payments feeds int_orders_pivoted) | FAIL |
| `untested_criteria_identified` | Identified at least one acceptance criterion that is NOT currently tested | PASS |
| `order_total_discrepancy` | Noticed stg_orders.order_total exists but fct_orders uses payment totals instead | FAIL |

**Quality Dimensions (manual/LLM scoring needed):**

| ID | Description | Weight | Score |
|----|-------------|--------|-------|
| `extraction_accuracy` | Spec accurately reflects what the SQL does, not what it should do | 2.5 | - |
| `edge_case_depth` | Identifies non-obvious edge cases beyond the happy path | 2 | - |
| `lineage_completeness` | Full upstream chain traced, not just direct refs | 1.5 | - |
| `gap_identification` | Identifies testing or design gaps in the existing model | 1.5 | - |

### opencode / data-write-test

**Required Elements:**

| ID | Description | Result |
|----|-------------|--------|
| `schema_yml_format` | Produced tests in dbt YAML schema format (version: 2 + models section) | PASS |
| `relationship_test_with_arguments` | Used the dbt 1.7+ arguments format for relationship tests | FAIL |
| `accepted_values_for_country` | Proposed accepted_values test on country with specific country codes | PASS |
| `custom_test_sql_format` | Proposed custom tests as SQL SELECT that returns failing rows (dbt convention) | FAIL |
| `lifetime_value_non_negative` | Test that lifetime_value >= 0 (not just not_null) | FAIL |
| `date_consistency_test` | Test that first_order_date <= most_recent_order_date | FAIL |
| `zero_orders_implies_null_dates` | Test invariant: customers with 0 orders have null order dates | FAIL |
| `specific_customer_id_assertion` | Referenced a specific customer_id from seed data in a test assertion | FAIL |
| `null_email_customers_identified` | Identified the specific customers with NULL emails (IDs 4, 9, 17, or 34) | FAIL |
| `expected_lifetime_value` | Computed an expected lifetime_value for a specific customer from seed data | FAIL |
| `no_loose_count_assertion` | Does not rely on loose assertions like count > 0 or count(*) > 0 as a passing test | FAIL |
| `row_count_test` | Tests that dim_customers has exactly 50 rows (matching seed) | FAIL |

**Quality Dimensions (manual/LLM scoring needed):**

| ID | Description | Weight | Score |
|----|-------------|--------|-------|
| `dbt_idiomatic` | Uses schema tests + custom data tests, not raw SQL assertions or pytest | 2 | - |
| `business_logic_coverage` | Tests the completed-only LTV calculation, not just schema constraints | 2 | - |
| `edge_case_coverage` | Tests NULL emails, zero-order customers, date ordering | 1.5 | - |
| `seed_determinism` | Assertions reference specific known values from seed data, not dynamic counts | 2 | - |