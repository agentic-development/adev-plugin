# Customer LTV DAG (stub for fixture)
from airflow import DAG
from airflow.operators.bash import BashOperator
from datetime import datetime

with DAG(
    "customer_ltv",
    schedule="0 2 * * *",
    start_date=datetime(2026, 1, 1),
    catchup=False,
) as dag:
    run_dbt = BashOperator(
        task_id="run_dbt_ltv",
        bash_command="dbt run --select customer_ltv",
        retries=2,
    )
