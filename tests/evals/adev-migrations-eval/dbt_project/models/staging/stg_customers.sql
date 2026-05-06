{{ config(materialized='view') }}

select
    customer_id::int as customer_id,
    customer_name,
    email,
    region,
    created_at
from read_csv_auto('{{ env_var("ADEV_EVAL_DATA_DIR", "data/source") }}/customers.csv')
