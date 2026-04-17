-- Customer LTV model (stub for fixture)
SELECT
  customer_id,
  COALESCE(SUM(total_usd), 0) AS ltv_usd,
  CURRENT_TIMESTAMP AS computed_at
FROM {{ ref('orders') }}
GROUP BY customer_id
