{{ config(materialized='view') }}

select
    order_id::int as order_id,
    customer_id::int as customer_id,
    product_id::int as product_id,
    quantity::int as quantity,
    order_date,
    total_amount::decimal(10,2) as total_amount
from read_csv_auto('{{ env_var("ADEV_EVAL_DATA_DIR", "data/source") }}/orders.csv')
