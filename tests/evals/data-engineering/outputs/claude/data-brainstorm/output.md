Now I have a thorough understanding of the project. Let me proceed with the brainstorm skill workflow.

---

## Brainstorm: Customer Lifetime Value Module

### Context Summary

Here's what I've found in the existing project:

- **Project:** `adev_data_eval` — an e-commerce analytics project using dbt + DuckDB
- **Existing models follow dimensional modeling:** staging layer (views), intermediate layer (tables), marts layer (tables)
- **CLV building blocks already exist:**
  - `dim_customers` already has `lifetime_value` (sum of completed order totals), `number_of_orders`, `first_order_date`, `most_recent_order_date`
  - `int_customer_order_history` computes the aggregations feeding `dim_customers`
  - `fct_orders` has per-order payment breakdowns by method
- **Existing analysis:** `analyses/customer_cohort_analysis.sql` already does monthly cohort analysis (active customers, orders, revenue by signup cohort)
- **Data shape:** 50 customers, 125 orders, spanning Feb 2024 - Dec 2024, with repeat purchasers (e.g., customer 1 has 7+ orders)

**Key observation:** The current `lifetime_value` in `dim_customers` is just a simple sum of completed order totals — it's a historical metric, not a predictive or segmented CLV. The cohort analysis exists only as an ad-hoc analysis file, not a materialized model.

---

### Step 2: Clarify

Before proposing approaches, I have one question to narrow the scope:

**What is the primary business use case for the CLV module?**

a) **Customer segmentation** — group customers into value tiers (e.g., high/medium/low) for marketing targeting
b) **Predictive CLV** — estimate future customer value using purchase frequency and recency patterns (e.g., BG/NBD or simple heuristic models)
c) **Cohort retention analysis** — materialize cohort-level metrics (retention rates, revenue curves) as reusable mart models
d) **All of the above** — a comprehensive CLV module that covers segmentation, prediction, and cohort analytics

Which best describes your goal?

---

## Generated Files

### `.env.example`

```
# Development (DuckDB - local, no credentials needed)
DEV_DB_PATH=target/dev.duckdb

# Production (example - DO NOT use real credentials here)
# PROD_DB_HOST=warehouse.prod.example.com
# PROD_DB_PORT=5432
# PROD_DB_USER=prod_readonly
# PROD_DB_PASSWORD=<replace-with-vault-reference>
# PROD_DB_NAME=analytics
# SNOWFLAKE_ACCOUNT=acme.us-east-1
# SNOWFLAKE_PASSWORD=<replace-with-vault-reference>
# BIGQUERY_PROJECT=acme-analytics-prod
# BIGQUERY_KEYFILE=/path/to/service-account.json
```

### `.gitignore`

```
# Python
__pycache__/
*.py[cod]
*.egg-info/
.venv/
venv/

# dbt
target/
dbt_packages/
logs/

# DuckDB
*.duckdb
*.duckdb.wal

# Great Expectations
great_expectations/uncommitted/
great_expectations/checkpoints/

# Environment
.env

# OS
.DS_Store
.user.yml
```

### `.python-version`

```
3.11
```

### `analyses/customer_cohort_analysis.sql`

```
-- Customer cohort analysis: monthly cohorts by signup date
-- Shows order count and revenue per cohort over time
with cohorts as (
    select
        customer_id,
        date_trunc('month', created_at) as cohort_month
    from {{ ref('dim_customers') }}
),

orders as (
    select
        customer_id,
        date_trunc('month', order_date) as order_month,
        total_amount
    from {{ ref('fct_orders') }}
    where order_status = 'completed'
)

select
    cohorts.cohort_month,
    orders.order_month,
    count(distinct orders.customer_id) as active_customers,
    count(*) as total_orders,
    round(sum(orders.total_amount), 2) as total_revenue
from cohorts
inner join orders on cohorts.customer_id = orders.customer_id
group by cohorts.cohort_month, orders.order_month
order by cohorts.cohort_month, orders.order_month
```

### `analyses/revenue_by_product.sql`

```
-- Revenue breakdown by product category
-- Note: This is a simplified version since we don't have order line items
select
    category,
    count(*) as product_count,
    round(avg(price), 2) as avg_price,
    round(min(price), 2) as min_price,
    round(max(price), 2) as max_price
from {{ ref('dim_products') }}
group by category
order by product_count desc
```

### `dags/data_quality_check.py`

```
"""
Airflow DAG: Data quality checks
Runs Great Expectations validation suite after dbt models are built
"""
from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.bash import BashOperator

GE_PROJECT_DIR = "/opt/dbt/adev_data_eval/great_expectations"

default_args = {
    "owner": "data-team",
    "depends_on_past": False,
    "start_date": datetime(2024, 1, 1),
    "retries": 1,
    "retry_delay": timedelta(minutes=2),
}

with DAG(
    dag_id="data_quality_check",
    default_args=default_args,
    description="Run Great Expectations data quality checks",
    schedule_interval="0 8 * * *",
    catchup=False,
    tags=["quality", "great-expectations"],
) as dag:

    validate_customers = BashOperator(
        task_id="validate_raw_customers",
        bash_command=(
            f"cd {GE_PROJECT_DIR} && "
            "great_expectations checkpoint run raw_customers_checkpoint"
        ),
    )

    validate_orders = BashOperator(
        task_id="validate_raw_orders",
        bash_command=(
            f"cd {GE_PROJECT_DIR} && "
            "great_expectations checkpoint run raw_orders_checkpoint"
        ),
    )

    [validate_customers, validate_orders]
```

### `dags/dbt_daily_run.py`

```
"""
Airflow DAG: Daily dbt pipeline
Runs seed → test sources → run models → test models
"""
from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.bash import BashOperator

DBT_PROJECT_DIR = "/opt/dbt/adev_data_eval"

default_args = {
    "owner": "data-team",
    "depends_on_past": False,
    "start_date": datetime(2024, 1, 1),
    "retries": 2,
    "retry_delay": timedelta(minutes=5),
    "email_on_failure": True,
    "email": ["data-alerts@example.com"],
}

with DAG(
    dag_id="dbt_daily_run",
    default_args=default_args,
    description="Daily dbt pipeline: seed, test, run, test",
    schedule_interval="0 6 * * *",
    catchup=False,
    tags=["dbt", "daily"],
) as dag:

    seed = BashOperator(
        task_id="dbt_seed",
        bash_command=f"cd {DBT_PROJECT_DIR} && dbt seed --target prod",
    )

    test_sources = BashOperator(
        task_id="dbt_test_sources",
        bash_command=f"cd {DBT_PROJECT_DIR} && dbt test --select source:*",
    )

    run_staging = BashOperator(
        task_id="dbt_run_staging",
        bash_command=f"cd {DBT_PROJECT_DIR} && dbt run --select staging",
    )

    run_intermediate = BashOperator(
        task_id="dbt_run_intermediate",
        bash_command=f"cd {DBT_PROJECT_DIR} && dbt run --select intermediate",
    )

    run_marts = BashOperator(
        task_id="dbt_run_marts",
        bash_command=f"cd {DBT_PROJECT_DIR} && dbt run --select marts",
    )

    test_models = BashOperator(
        task_id="dbt_test_models",
        bash_command=f"cd {DBT_PROJECT_DIR} && dbt test --exclude source:*",
    )

    snapshot = BashOperator(
        task_id="dbt_snapshot",
        bash_command=f"cd {DBT_PROJECT_DIR} && dbt snapshot",
    )

    seed >> test_sources >> run_staging >> run_intermediate >> run_marts >> test_models >> snapshot
```

### `dbt_project.yml`

```
name: adev_data_eval
version: '1.0.0'
config-version: 2

profile: adev_data_eval

model-paths: ["models"]
analysis-paths: ["analyses"]
test-paths: ["tests"]
seed-paths: ["seeds"]
macro-paths: ["macros"]
snapshot-paths: ["snapshots"]

clean-targets:
  - target
  - dbt_packages

seeds:
  adev_data_eval:
    +schema: raw

models:
  adev_data_eval:
    staging:
      +materialized: view
      +schema: staging
    intermediate:
      +materialized: table
      +schema: intermediate
    marts:
      +materialized: table
      +schema: marts
```

### `docs/erd.md`

```
# Entity-Relationship Diagram

## Data Model Overview

```
Seeds (Raw Layer)                Staging                    Intermediate                 Marts
═══════════════                  ═══════                    ════════════                 ═════

┌──────────────┐    ┌─────────────────┐
│ raw_customers│───>│  stg_customers  │──────────────────────────────────┐
└──────────────┘    └─────────────────┘                                  │
                                                                        ▼
                                                    ┌────────────────────────────┐
                                                    │  int_customer_order_history │
                                                    └─────────────┬──────────────┘
                                                                  │
                                                                  ▼
                                                    ┌──────────────────┐
                                                    │  dim_customers   │
                                                    └──────────────────┘

┌──────────────┐    ┌─────────────────┐
│  raw_orders  │───>│   stg_orders    │──┐
└──────────────┘    └─────────────────┘  │          ┌──────────────────┐
                                         ├─────────>│    fct_orders    │
┌──────────────┐    ┌─────────────────┐  │          └──────────────────┘
│ raw_payments │───>│  stg_payments   │──┘                  ▲
└──────────────┘    └─────────────────┘                     │
                                         ┌─────────────────────────────────┐
                                         │ int_orders_pivoted_to_payments  │
                                         └─────────────────────────────────┘

┌──────────────┐    ┌─────────────────┐             ┌──────────────────┐
│ raw_products │───>│  stg_products   │────────────>│  dim_products    │
└──────────────┘    └─────────────────┘             └──────────────────┘
```

## Key Relationships

| From | To | Join Key | Cardinality |
|------|-----|----------|-------------|
| stg_orders | stg_customers | customer_id | Many-to-One |
| stg_payments | stg_orders | order_id | Many-to-One |
| fct_orders | dim_customers | customer_id | Many-to-One |
| int_orders_pivoted_to_payments | stg_payments | order_id | One-to-Many (aggregated) |
| int_customer_order_history | stg_orders | customer_id | One-to-Many (aggregated) |
```

### `great_expectations/expectations/raw_customers_suite.json`

```
{
  "expectation_suite_name": "raw_customers_suite",
  "ge_cloud_id": null,
  "expectations": [
    {
      "expectation_type": "expect_column_values_to_not_be_null",
      "kwargs": { "column": "id" },
      "meta": {}
    },
    {
      "expectation_type": "expect_column_values_to_be_unique",
      "kwargs": { "column": "id" },
      "meta": {}
    },
    {
      "expectation_type": "expect_column_values_to_not_be_null",
      "kwargs": { "column": "first_name" },
      "meta": {}
    },
    {
      "expectation_type": "expect_column_values_to_not_be_null",
      "kwargs": { "column": "last_name" },
      "meta": {}
    },
    {
      "expectation_type": "expect_column_values_to_be_in_set",
      "kwargs": {
        "column": "country",
        "value_set": ["US", "UK", "CA", "MX", "AU", "DE", "FR", "IN", "BR"]
      },
      "meta": {}
    },
    {
      "expectation_type": "expect_table_row_count_to_be_between",
      "kwargs": { "min_value": 1, "max_value": 10000 },
      "meta": {}
    }
  ],
  "data_asset_type": null,
  "meta": {
    "great_expectations_version": "0.18.0"
  }
}
```

### `great_expectations/expectations/raw_orders_suite.json`

```
{
  "expectation_suite_name": "raw_orders_suite",
  "ge_cloud_id": null,
  "expectations": [
    {
      "expectation_type": "expect_column_values_to_not_be_null",
      "kwargs": { "column": "id" },
      "meta": {}
    },
    {
      "expectation_type": "expect_column_values_to_be_unique",
      "kwargs": { "column": "id" },
      "meta": {}
    },
    {
      "expectation_type": "expect_column_values_to_not_be_null",
      "kwargs": { "column": "customer_id" },
      "meta": {}
    },
    {
      "expectation_type": "expect_column_values_to_not_be_null",
      "kwargs": { "column": "order_date" },
      "meta": {}
    },
    {
      "expectation_type": "expect_column_values_to_be_in_set",
      "kwargs": {
        "column": "status",
        "value_set": ["placed", "shipped", "completed", "returned"]
      },
      "meta": {}
    },
    {
      "expectation_type": "expect_column_values_to_be_between",
      "kwargs": {
        "column": "total_amount_cents",
        "min_value": 1,
        "max_value": 10000000
      },
      "meta": {}
    },
    {
      "expectation_type": "expect_table_row_count_to_be_between",
      "kwargs": { "min_value": 1, "max_value": 100000 },
      "meta": {}
    }
  ],
  "data_asset_type": null,
  "meta": {
    "great_expectations_version": "0.18.0"
  }
}
```

### `great_expectations/great_expectations.yml`

```
config_version: 3.0

datasources:
  duckdb_dev:
    class_name: Datasource
    module_name: great_expectations.datasource
    execution_engine:
      class_name: SqlAlchemyExecutionEngine
      module_name: great_expectations.execution_engine
      connection_string: duckdb:///target/dev.duckdb
    data_connectors:
      default_runtime_data_connector:
        class_name: RuntimeDataConnector
        module_name: great_expectations.datasource.data_connector
        batch_identifiers:
          - default_identifier_name

config_variables_file_path: uncommitted/config_variables.yml
plugins_directory: plugins/

stores:
  expectations_store:
    class_name: ExpectationsStore
    store_backend:
      class_name: TupleFilesystemStoreBackend
      base_directory: expectations/

  validations_store:
    class_name: ValidationsStore
    store_backend:
      class_name: TupleFilesystemStoreBackend
      base_directory: uncommitted/validations/

  evaluation_parameter_store:
    class_name: EvaluationParameterStore

expectations_store_name: expectations_store
validations_store_name: validations_store
evaluation_parameter_store_name: evaluation_parameter_store
```

### `macros/cents_to_dollars.sql`

```
{% macro cents_to_dollars(column_name) %}
    round({{ column_name }} / 100.0, 2)
{% endmacro %}
```

### `models/intermediate/_intermediate.yml`

```
version: 2

models:
  - name: int_orders_pivoted_to_payments
    description: Order-level payment breakdown by method
    columns:
      - name: order_id
        description: Primary key
        tests:
          - unique
          - not_null
      - name: credit_card_amount
        description: Total credit card payments for this order
      - name: bank_transfer_amount
        description: Total bank transfer payments for this order
      - name: gift_card_amount
        description: Total gift card payments for this order
      - name: total_amount
        description: Sum of all payments for this order

  - name: int_customer_order_history
    description: Aggregated order history per customer
    columns:
      - name: customer_id
        description: Primary key
        tests:
          - unique
          - not_null
      - name: first_order_date
        description: Date of customer's first order
      - name: most_recent_order_date
        description: Date of customer's most recent order
      - name: number_of_orders
        description: Total number of orders placed
      - name: lifetime_value
        description: Total spent on completed orders in dollars
```

### `models/intermediate/int_customer_order_history.sql`

```
with orders as (
    select * from {{ ref('stg_orders') }}
),

aggregated as (
    select
        customer_id,
        min(order_date) as first_order_date,
        max(order_date) as most_recent_order_date,
        count(order_id) as number_of_orders,
        sum(case when order_status = 'completed' then order_total else 0 end) as lifetime_value
    from orders
    group by customer_id
)

select * from aggregated
```

### `models/intermediate/int_orders_pivoted_to_payments.sql`

```
with payments as (
    select * from {{ ref('stg_payments') }}
),

pivoted as (
    select
        order_id,
        sum(case when payment_method = 'credit_card' then amount else 0 end) as credit_card_amount,
        sum(case when payment_method = 'bank_transfer' then amount else 0 end) as bank_transfer_amount,
        sum(case when payment_method = 'gift_card' then amount else 0 end) as gift_card_amount,
        sum(amount) as total_amount
    from payments
    group by order_id
)

select * from pivoted
```

### `models/marts/_marts.yml`

```
version: 2

models:
  - name: fct_orders
    description: >
      Order fact table at the order grain. Each row is a unique order
      with payment amounts broken down by payment method.
    columns:
      - name: order_id
        description: Primary key
        tests:
          - unique
          - not_null
      - name: customer_id
        description: Foreign key to dim_customers
        tests:
          - not_null
          - relationships:
              arguments:
                to: ref('dim_customers')
                field: customer_id
      - name: order_date
        description: Date the order was placed
        tests:
          - not_null
      - name: order_status
        description: Current status of the order
        tests:
          - not_null
          - accepted_values:
              arguments:
                values: ['placed', 'shipped', 'completed', 'returned']
      - name: credit_card_amount
        description: Amount paid via credit card in dollars
      - name: bank_transfer_amount
        description: Amount paid via bank transfer in dollars
      - name: gift_card_amount
        description: Amount paid via gift card in dollars
      - name: total_amount
        description: Total payment amount in dollars

  - name: dim_customers
    description: >
      Customer dimension table with lifetime order metrics.
      One row per customer.
    columns:
      - name: customer_id
        description: Primary key
        tests:
          - unique
          - not_null
      - name: first_name
        description: Customer first name
        tests:
          - not_null
      - name: last_name
        description: Customer last name
        tests:
          - not_null
      - name: email
        description: Customer email (nullable for some customers)
      - name: country
        description: Country code
        tests:
          - not_null
      - name: created_at
        description: Account creation date
      - name: first_order_date
        description: Date of first order (null if never ordered)
      - name: most_recent_order_date
        description: Date of most recent order
      - name: number_of_orders
        description: Total orders placed
      - name: lifetime_value
        description: Total revenue from completed orders in dollars

  - name: dim_products
    description: >
      Product dimension table with catalog information.
      One row per product.
    columns:
      - name: product_id
        description: Primary key
        tests:
          - unique
          - not_null
      - name: product_name
        description: Product display name
        tests:
          - not_null
      - name: category
        description: Product category
        tests:
          - not_null
      - name: price
        description: Unit price in dollars
        tests:
          - not_null
      - name: created_at
        description: Date product was added to catalog
```

### `models/marts/dim_customers.sql`

```
with customers as (
    select * from {{ ref('stg_customers') }}
),

order_history as (
    select * from {{ ref('int_customer_order_history') }}
),

final as (
    select
        customers.customer_id,
        customers.first_name,
        customers.last_name,
        customers.email,
        customers.country,
        customers.created_at,
        order_history.first_order_date,
        order_history.most_recent_order_date,
        order_history.number_of_orders,
        coalesce(order_history.lifetime_value, 0) as lifetime_value
    from customers
    left join order_history on customers.customer_id = order_history.customer_id
)

select * from final
```

### `models/marts/dim_products.sql`

```
with products as (
    select * from {{ ref('stg_products') }}
),

-- Note: In a real project this would join to an order_items table.
-- For this eval project we use products directly since we don't have line items.
final as (
    select
        products.product_id,
        products.product_name,
        products.category,
        products.price,
        products.created_at
    from products
)

select * from final
```

### `models/marts/fct_orders.sql`

```
with orders as (
    select * from {{ ref('stg_orders') }}
),

payments as (
    select * from {{ ref('int_orders_pivoted_to_payments') }}
),

final as (
    select
        orders.order_id,
        orders.customer_id,
        orders.order_date,
        orders.order_status,
        payments.credit_card_amount,
        payments.bank_transfer_amount,
        payments.gift_card_amount,
        payments.total_amount
    from orders
    left join payments on orders.order_id = payments.order_id
)

select * from final
```

### `models/staging/_staging.yml`

```
version: 2

models:
  - name: stg_customers
    description: Cleaned customer data with standardized column names
    columns:
      - name: customer_id
        description: Primary key
        tests:
          - unique
          - not_null
      - name: first_name
        description: Customer first name
        tests:
          - not_null
      - name: last_name
        description: Customer last name
        tests:
          - not_null
      - name: email
        description: Customer email address (nullable)
      - name: created_at
        description: Account creation date
        tests:
          - not_null
      - name: country
        description: Two-letter country code
        tests:
          - not_null

  - name: stg_orders
    description: Cleaned order data with amounts converted to dollars
    columns:
      - name: order_id
        description: Primary key
        tests:
          - unique
          - not_null
      - name: customer_id
        description: Foreign key to stg_customers
        tests:
          - not_null
          - relationships:
              arguments:
                to: ref('stg_customers')
                field: customer_id
      - name: order_date
        description: Date the order was placed
        tests:
          - not_null
      - name: order_status
        description: Current order status
        tests:
          - not_null
          - accepted_values:
              arguments:
                values: ['placed', 'shipped', 'completed', 'returned']
      - name: order_total
        description: Order total in dollars
        tests:
          - not_null

  - name: stg_products
    description: Cleaned product catalog with prices in dollars
    columns:
      - name: product_id
        description: Primary key
        tests:
          - unique
          - not_null
      - name: product_name
        description: Product display name
        tests:
          - not_null
      - name: category
        description: Product category
        tests:
          - not_null
          - accepted_values:
              arguments:
                values: ['electronics', 'accessories', 'stationery']
      - name: price
        description: Unit price in dollars
        tests:
          - not_null

  - name: stg_payments
    description: Cleaned payment data with amounts in dollars
    columns:
      - name: payment_id
        description: Primary key
        tests:
          - unique
          - not_null
      - name: order_id
        description: Foreign key to stg_orders
        tests:
          - not_null
          - relationships:
              arguments:
                to: ref('stg_orders')
                field: order_id
      - name: payment_method
        description: Payment method used
        tests:
          - not_null
          - accepted_values:
              arguments:
                values: ['credit_card', 'bank_transfer', 'gift_card']
      - name: amount
        description: Payment amount in dollars
        tests:
          - not_null
```

### `models/staging/stg_customers.sql`

```
with source as (
    select * from {{ ref('raw_customers') }}
),

renamed as (
    select
        id as customer_id,
        first_name,
        last_name,
        email,
        cast(created_at as date) as created_at,
        country
    from source
)

select * from renamed
```

### `models/staging/stg_orders.sql`

```
with source as (
    select * from {{ ref('raw_orders') }}
),

renamed as (
    select
        id as order_id,
        customer_id,
        cast(order_date as date) as order_date,
        status as order_status,
        {{ cents_to_dollars('total_amount_cents') }} as order_total
    from source
)

select * from renamed
```

### `models/staging/stg_payments.sql`

```
with source as (
    select * from {{ ref('raw_payments') }}
),

renamed as (
    select
        id as payment_id,
        order_id,
        payment_method,
        {{ cents_to_dollars('amount_cents') }} as amount,
        cast(created_at as date) as payment_date
    from source
)

select * from renamed
```

### `models/staging/stg_products.sql`

```
with source as (
    select * from {{ ref('raw_products') }}
),

renamed as (
    select
        id as product_id,
        name as product_name,
        category,
        {{ cents_to_dollars('price_cents') }} as price,
        cast(created_at as date) as created_at
    from source
)

select * from renamed
```

### `packages.yml`

```
packages:
  - package: dbt-labs/dbt_utils
    version: ">=1.1.0"
```

### `profiles.yml`

```
adev_data_eval:
  target: dev
  outputs:
    dev:
      type: duckdb
      path: target/dev.duckdb
      threads: 4
    prod:
      type: duckdb
      path: target/prod.duckdb
      threads: 4
```

### `README.md`

```
# adev-data-eval

Real data engineering project for evaluating [adev-plugin](https://github.com/agentic-development/adev-plugin) data skills and safety hooks.

## Stack

- **Database:** DuckDB (zero-dependency, local)
- **Transformation:** dbt-core + dbt-duckdb
- **Orchestration:** Apache Airflow (DAG definitions)
- **Data Quality:** Great Expectations + dbt tests
- **Domain:** E-commerce (customers, orders, products, payments)

## Data Model

Three-layer dbt architecture:

- **Staging** — 1:1 with sources, light renaming and type casting
- **Intermediate** — Business logic joins and aggregations
- **Marts** — Business-facing fact and dimension tables

See [docs/erd.md](docs/erd.md) for the full entity-relationship diagram.

## Quick Start

```bash
# Install dependencies
pip install -r requirements.txt

# Initialize the project (install dbt packages, seed data, run models)
bash scripts/init_duckdb.sh

# Run quality checks
bash scripts/run_quality_checks.sh
```

## Project Structure

```
seeds/          CSV seed data (raw layer)
models/         dbt models (staging → intermediate → marts)
tests/          Custom dbt data tests
macros/         Reusable SQL macros
snapshots/      SCD Type 2 snapshots
analyses/       Ad-hoc SQL queries
dags/           Airflow DAG definitions
great_expectations/  GE configuration and expectation suites
scripts/        Helper scripts
docs/           Documentation
```

## Environment Profiles

| Target | Database | Use |
|--------|----------|-----|
| `dev` | `target/dev.duckdb` | Local development |
| `prod` | `target/prod.duckdb` | Simulated production |

```bash
# Run against dev (default)
dbt run --target dev

# Run against prod (simulated)
dbt run --target prod
```
```

### `requirements.txt`

```
dbt-core>=1.7,<2.0
dbt-duckdb>=1.7,<2.0
great-expectations>=0.18,<1.0
```

### `scripts/init_duckdb.sh`

```
#!/usr/bin/env bash
set -euo pipefail

echo "==> Installing dbt packages..."
dbt deps --target dev

echo "==> Loading seed data into DuckDB..."
dbt seed --target dev

echo "==> Running all models..."
dbt run --target dev

echo "==> Running snapshots..."
dbt snapshot --target dev

echo "==> Done! DuckDB database created at target/dev.duckdb"
```

### `scripts/run_quality_checks.sh`

```
#!/usr/bin/env bash
set -euo pipefail

echo "==> Running dbt tests..."
dbt test --target dev

echo ""
echo "==> All quality checks passed!"
```

### `seeds/raw_customers.csv`

```
id,first_name,last_name,email,created_at,country
1,Alice,Johnson,alice.johnson@example.com,2024-01-15,US
2,Bob,Smith,bob.smith@example.com,2024-01-20,US
3,Carol,Williams,carol.williams@example.com,2024-02-01,UK
4,David,Brown,,2024-02-10,CA
5,Eva,Martinez,eva.martinez@example.com,2024-02-14,MX
6,Frank,Davis,frank.davis@example.com,2024-02-28,US
7,Grace,Wilson,grace.wilson@example.com,2024-03-05,UK
8,Henry,Taylor,henry.taylor@example.com,2024-03-10,AU
9,Iris,Anderson,,2024-03-15,US
10,Jack,Thomas,jack.thomas@example.com,2024-03-20,CA
11,Karen,Jackson,karen.jackson@example.com,2024-04-01,US
12,Leo,White,leo.white@example.com,2024-04-05,DE
13,Mia,Harris,mia.harris@example.com,2024-04-10,FR
14,Noah,Clark,noah.clark@example.com,2024-04-15,US
15,Olivia,Lewis,olivia.lewis@example.com,2024-04-20,UK
16,Paul,Robinson,paul.robinson@example.com,2024-05-01,US
17,Quinn,Walker,,2024-05-05,CA
18,Rachel,Hall,rachel.hall@example.com,2024-05-10,AU
19,Sam,Allen,sam.allen@example.com,2024-05-15,US
20,Tina,Young,tina.young@example.com,2024-05-20,DE
21,Uma,King,uma.king@example.com,2024-06-01,IN
22,Victor,Wright,victor.wright@example.com,2024-06-05,US
23,Wendy,Lopez,wendy.lopez@example.com,2024-06-10,MX
24,Xavier,Hill,xavier.hill@example.com,2024-06-15,US
25,Yara,Scott,yara.scott@example.com,2024-06-20,BR
26,Zach,Green,zach.green@example.com,2024-07-01,US
27,Amy,Adams,amy.adams@example.com,2024-07-05,UK
28,Ben,Baker,ben.baker@example.com,2024-07-10,US
29,Chloe,Carter,chloe.carter@example.com,2024-07-15,FR
30,Dan,Cooper,dan.cooper@example.com,2024-07-20,US
31,Ella,Cruz,ella.cruz@example.com,2024-08-01,MX
32,Finn,Diaz,finn.diaz@example.com,2024-08-05,US
33,Gina,Evans,gina.evans@example.com,2024-08-10,UK
34,Hugo,Fisher,,2024-08-15,DE
35,Ivy,Garcia,ivy.garcia@example.com,2024-08-20,US
36,Jake,Grant,jake.grant@example.com,2024-09-01,CA
37,Kate,Howard,kate.howard@example.com,2024-09-05,AU
38,Liam,James,liam.james@example.com,2024-09-10,US
39,Maya,Kelly,maya.kelly@example.com,2024-09-15,IN
40,Nick,Lee,nick.lee@example.com,2024-09-20,US
41,Olga,Mitchell,olga.mitchell@example.com,2024-10-01,US
42,Pete,Nelson,pete.nelson@example.com,2024-10-05,UK
43,Rose,Ortiz,rose.ortiz@example.com,2024-10-10,MX
44,Sean,Parker,sean.parker@example.com,2024-10-15,US
45,Tara,Quinn,tara.quinn@example.com,2024-10-20,CA
46,Uri,Reed,uri.reed@example.com,2024-11-01,US
47,Val,Stone,val.stone@example.com,2024-11-05,AU
48,Will,Turner,will.turner@example.com,2024-11-10,US
49,Xena,Vargas,xena.vargas@example.com,2024-11-15,BR
50,Yuri,Webb,yuri.webb@example.com,2024-11-20,US
```

### `seeds/raw_orders.csv`

```
id,customer_id,order_date,status,total_amount_cents
1,1,2024-02-01,completed,5998
2,1,2024-03-15,completed,8999
3,2,2024-02-10,completed,2999
4,3,2024-02-20,completed,7498
5,5,2024-03-01,completed,4999
6,1,2024-03-20,completed,1299
7,6,2024-03-25,completed,14998
8,7,2024-04-01,completed,3499
9,8,2024-04-05,shipped,5999
10,2,2024-04-10,completed,12999
11,4,2024-04-15,completed,899
12,10,2024-04-20,completed,2499
13,3,2024-04-25,returned,4499
14,11,2024-05-01,completed,9998
15,12,2024-05-05,completed,6999
16,13,2024-05-10,completed,1999
17,14,2024-05-15,completed,3999
18,5,2024-05-20,completed,1499
19,15,2024-05-25,completed,8999
20,16,2024-06-01,completed,4999
21,1,2024-06-05,completed,1999
22,17,2024-06-10,completed,2999
23,18,2024-06-15,completed,5998
24,19,2024-06-20,completed,499
25,20,2024-06-25,completed,12999
26,21,2024-07-01,completed,899
27,22,2024-07-05,completed,4999
28,23,2024-07-10,completed,7498
29,24,2024-07-15,shipped,3499
30,25,2024-07-20,completed,1899
31,2,2024-07-25,completed,6999
32,26,2024-08-01,completed,2999
33,27,2024-08-05,completed,4499
34,28,2024-08-10,completed,8999
35,29,2024-08-15,returned,1299
36,30,2024-08-20,completed,3999
37,3,2024-08-25,completed,1999
38,31,2024-09-01,completed,5999
39,32,2024-09-05,completed,2499
40,33,2024-09-10,completed,999
41,34,2024-09-15,completed,4999
42,35,2024-09-20,completed,12999
43,36,2024-09-25,completed,1499
44,37,2024-10-01,shipped,6999
45,38,2024-10-05,completed,3499
46,39,2024-10-10,completed,1899
47,40,2024-10-15,completed,8999
48,5,2024-10-20,completed,2999
49,41,2024-10-25,completed,4999
50,42,2024-11-01,completed,499
51,43,2024-11-05,completed,5998
52,44,2024-11-10,completed,7498
53,1,2024-11-15,placed,3999
54,45,2024-11-20,completed,2999
55,46,2024-11-25,completed,1999
56,47,2024-12-01,completed,4499
57,48,2024-12-05,placed,8999
58,49,2024-12-10,completed,1299
59,50,2024-12-15,completed,6999
60,2,2024-12-20,completed,3499
61,6,2024-02-15,completed,2999
62,7,2024-03-10,completed,4999
63,8,2024-03-20,completed,1899
64,9,2024-04-01,completed,8999
65,10,2024-04-10,completed,2999
66,11,2024-05-05,completed,1499
67,12,2024-05-15,returned,999
68,14,2024-06-01,completed,4999
69,15,2024-06-10,completed,3499
70,16,2024-06-20,completed,12999
71,19,2024-07-01,completed,2499
72,20,2024-07-10,completed,5999
73,21,2024-07-20,completed,1999
74,22,2024-08-01,completed,3999
75,23,2024-08-10,completed,899
76,24,2024-08-20,completed,4499
77,25,2024-09-01,completed,6999
78,26,2024-09-10,completed,1299
79,27,2024-09-20,completed,2999
80,28,2024-10-01,completed,5999
81,30,2024-10-10,completed,1999
82,31,2024-10-20,completed,4999
83,32,2024-11-01,completed,3499
84,33,2024-11-10,shipped,8999
85,35,2024-11-20,completed,2999
86,36,2024-12-01,completed,1499
87,38,2024-12-10,completed,4999
88,39,2024-12-15,completed,7498
89,40,2024-12-20,placed,2999
90,1,2024-04-01,completed,4999
91,2,2024-05-01,completed,3499
92,3,2024-06-01,completed,5999
93,5,2024-07-01,completed,8999
94,6,2024-08-01,completed,1999
95,7,2024-09-01,completed,2999
96,8,2024-10-01,completed,4499
97,10,2024-11-01,completed,6999
98,11,2024-12-01,completed,1899
99,14,2024-12-10,completed,3999
100,16,2024-12-15,completed,2499
101,19,2024-08-15,completed,5999
102,20,2024-09-15,completed,1299
103,21,2024-10-15,completed,4999
104,22,2024-11-15,completed,8999
105,23,2024-12-15,completed,2999
106,25,2024-10-15,completed,3499
107,26,2024-11-15,completed,1999
108,27,2024-12-15,completed,4999
109,28,2024-11-15,returned,6999
110,30,2024-12-01,completed,2499
111,31,2024-12-10,completed,3999
112,32,2024-12-15,completed,1499
113,33,2024-12-20,completed,5999
114,35,2024-12-25,completed,2999
115,36,2024-12-28,completed,4499
116,38,2024-12-30,completed,7498
117,40,2024-12-30,completed,1899
118,42,2024-12-01,completed,3999
119,44,2024-12-05,completed,8999
120,46,2024-12-10,completed,4999
121,48,2024-12-15,completed,2999
122,50,2024-12-20,completed,1499
123,1,2024-12-25,completed,5999
124,3,2024-12-28,completed,3499
125,5,2024-12-30,completed,2999
```

### `seeds/raw_payments.csv`

```
id,order_id,payment_method,amount_cents,created_at
1,1,credit_card,5998,2024-02-01
2,2,credit_card,8999,2024-03-15
3,3,bank_transfer,2999,2024-02-10
4,4,credit_card,4999,2024-02-20
5,4,gift_card,2499,2024-02-20
6,5,credit_card,4999,2024-03-01
7,6,gift_card,1299,2024-03-20
8,7,credit_card,10000,2024-03-25
9,7,bank_transfer,4998,2024-03-25
10,8,credit_card,3499,2024-04-01
11,9,credit_card,5999,2024-04-05
12,10,bank_transfer,12999,2024-04-10
13,11,gift_card,899,2024-04-15
14,12,credit_card,2499,2024-04-20
15,13,credit_card,4499,2024-04-25
16,14,credit_card,5000,2024-05-01
17,14,gift_card,4998,2024-05-01
18,15,bank_transfer,6999,2024-05-05
19,16,credit_card,1999,2024-05-10
20,17,credit_card,3999,2024-05-15
21,18,bank_transfer,1499,2024-05-20
22,19,credit_card,8999,2024-05-25
23,20,credit_card,4999,2024-06-01
24,21,gift_card,1999,2024-06-05
25,22,credit_card,2999,2024-06-10
26,23,bank_transfer,3000,2024-06-15
27,23,credit_card,2998,2024-06-15
28,24,gift_card,499,2024-06-20
29,25,credit_card,12999,2024-06-25
30,26,bank_transfer,899,2024-07-01
31,27,credit_card,4999,2024-07-05
32,28,credit_card,5000,2024-07-10
33,28,gift_card,2498,2024-07-10
34,29,credit_card,3499,2024-07-15
35,30,bank_transfer,1899,2024-07-20
36,31,credit_card,6999,2024-07-25
37,32,credit_card,2999,2024-08-01
38,33,bank_transfer,4499,2024-08-05
39,34,credit_card,8999,2024-08-10
40,35,credit_card,1299,2024-08-15
41,36,credit_card,3999,2024-08-20
42,37,gift_card,1999,2024-08-25
43,38,credit_card,5999,2024-09-01
44,39,bank_transfer,2499,2024-09-05
45,40,credit_card,999,2024-09-10
46,41,credit_card,4999,2024-09-15
47,42,credit_card,12999,2024-09-20
48,43,bank_transfer,1499,2024-09-25
49,44,credit_card,6999,2024-10-01
50,45,credit_card,3499,2024-10-05
51,46,gift_card,1899,2024-10-10
52,47,credit_card,8999,2024-10-15
53,48,credit_card,2999,2024-10-20
54,49,bank_transfer,4999,2024-10-25
55,50,gift_card,499,2024-11-01
56,51,credit_card,3000,2024-11-05
57,51,bank_transfer,2998,2024-11-05
58,52,credit_card,7498,2024-11-10
59,53,credit_card,3999,2024-11-15
60,54,bank_transfer,2999,2024-11-20
61,55,credit_card,1999,2024-11-25
62,56,credit_card,4499,2024-12-01
63,57,credit_card,8999,2024-12-05
64,58,gift_card,1299,2024-12-10
65,59,bank_transfer,6999,2024-12-15
66,60,credit_card,3499,2024-12-20
67,61,credit_card,2999,2024-02-15
68,62,bank_transfer,4999,2024-03-10
69,63,credit_card,1899,2024-03-20
70,64,credit_card,8999,2024-04-01
71,65,gift_card,2999,2024-04-10
72,66,credit_card,1499,2024-05-05
73,67,credit_card,999,2024-05-15
74,68,bank_transfer,4999,2024-06-01
75,69,credit_card,3499,2024-06-10
76,70,credit_card,12999,2024-06-20
77,71,gift_card,2499,2024-07-01
78,72,credit_card,5999,2024-07-10
79,73,bank_transfer,1999,2024-07-20
80,74,credit_card,3999,2024-08-01
81,75,gift_card,899,2024-08-10
82,76,credit_card,4499,2024-08-20
83,77,bank_transfer,6999,2024-09-01
84,78,credit_card,1299,2024-09-10
85,79,credit_card,2999,2024-09-20
86,80,credit_card,5999,2024-10-01
87,81,bank_transfer,1999,2024-10-10
88,82,credit_card,4999,2024-10-20
89,83,credit_card,3499,2024-11-01
90,84,credit_card,8999,2024-11-10
91,85,bank_transfer,2999,2024-11-20
92,86,credit_card,1499,2024-12-01
93,87,credit_card,4999,2024-12-10
94,88,credit_card,5000,2024-12-15
95,88,gift_card,2498,2024-12-15
96,89,credit_card,2999,2024-12-20
97,90,bank_transfer,4999,2024-04-01
98,91,credit_card,3499,2024-05-01
99,92,credit_card,5999,2024-06-01
100,93,credit_card,8999,2024-07-01
101,94,gift_card,1999,2024-08-01
102,95,bank_transfer,2999,2024-09-01
103,96,credit_card,4499,2024-10-01
104,97,credit_card,6999,2024-11-01
105,98,bank_transfer,1899,2024-12-01
106,99,credit_card,3999,2024-12-10
107,100,gift_card,2499,2024-12-15
108,101,credit_card,5999,2024-08-15
109,102,bank_transfer,1299,2024-09-15
110,103,credit_card,4999,2024-10-15
111,104,credit_card,8999,2024-11-15
112,105,bank_transfer,2999,2024-12-15
113,106,credit_card,3499,2024-10-15
114,107,gift_card,1999,2024-11-15
115,108,credit_card,4999,2024-12-15
116,109,credit_card,6999,2024-11-15
117,110,bank_transfer,2499,2024-12-01
118,111,credit_card,3999,2024-12-10
119,112,gift_card,1499,2024-12-15
120,113,credit_card,5999,2024-12-20
121,114,bank_transfer,2999,2024-12-25
122,115,credit_card,4499,2024-12-28
123,116,credit_card,5000,2024-12-30
124,116,bank_transfer,2498,2024-12-30
125,117,gift_card,1899,2024-12-30
126,118,credit_card,3999,2024-12-01
127,119,bank_transfer,8999,2024-12-05
128,120,credit_card,4999,2024-12-10
129,121,credit_card,2999,2024-12-15
130,122,gift_card,1499,2024-12-20
131,123,credit_card,5999,2024-12-25
132,124,bank_transfer,3499,2024-12-28
133,125,credit_card,2999,2024-12-30
```

### `seeds/raw_products.csv`

```
id,name,category,price_cents,created_at
1,Wireless Mouse,electronics,2999,2024-01-01
2,USB-C Hub,electronics,4999,2024-01-01
3,Mechanical Keyboard,electronics,8999,2024-01-01
4,Monitor Stand,accessories,3499,2024-01-01
5,Laptop Sleeve,accessories,2499,2024-01-01
6,Webcam HD,electronics,5999,2024-01-15
7,Desk Lamp,accessories,4499,2024-01-15
8,Notebook Set,stationery,1299,2024-02-01
9,Pen Pack,stationery,899,2024-02-01
10,Sticky Notes,stationery,499,2024-02-01
11,Headphones,electronics,12999,2024-03-01
12,Mouse Pad XL,accessories,1999,2024-03-01
13,Cable Organizer,accessories,1499,2024-03-01
14,Phone Stand,accessories,1999,2024-04-01
15,Screen Protector,accessories,999,2024-04-01
16,Bluetooth Speaker,electronics,6999,2024-05-01
17,Desk Organizer,accessories,2999,2024-05-01
18,Planner 2025,stationery,1899,2024-06-01
19,Ergonomic Chair Pad,accessories,4999,2024-07-01
20,Portable Charger,electronics,3999,2024-08-01
```

### `snapshots/snapshot_orders.sql`

```
{% snapshot snapshot_orders %}

{{
    config(
        target_schema='snapshots',
        unique_key='order_id',
        strategy='check',
        check_cols=['order_status'],
    )
}}

select * from {{ ref('stg_orders') }}

{% endsnapshot %}
```

### `tests/assert_orders_have_valid_status.sql`

```
-- Every order should have a recognized status
select
    order_id,
    order_status
from {{ ref('stg_orders') }}
where order_status not in ('placed', 'shipped', 'completed', 'returned')
```

### `tests/assert_positive_order_amounts.sql`

```
-- Orders should always have a positive total amount
select
    order_id,
    order_total
from {{ ref('stg_orders') }}
where order_total <= 0
```

