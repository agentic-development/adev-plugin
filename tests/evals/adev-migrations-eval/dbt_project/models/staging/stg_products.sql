{{ config(materialized='view') }}

select
    product_id::int as product_id,
    product_name,
    category,
    price::decimal(10,2) as price
from read_csv_auto('{{ env_var("ADEV_EVAL_DATA_DIR", "data/source") }}/products.csv')
