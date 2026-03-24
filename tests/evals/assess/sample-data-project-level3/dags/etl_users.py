from airflow import DAG
from datetime import datetime, timedelta

default_args = {
    "owner": "data-team",
    "depends_on_past": False,
    "start_date": datetime(2026, 1, 1),
    "retries": 3,
}

with DAG(
    "etl_users",
    default_args=default_args,
    schedule_interval="@daily",
    catchup=False,
) as dag:
    pass
