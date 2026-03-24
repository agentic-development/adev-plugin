config(
  materialized='view'
)

select
  id,
  created_at,
  updated_at
from {{ source('raw', 'users') }}
