select count(*) from {{ ref('stg_users') }} having count(*) = 0
