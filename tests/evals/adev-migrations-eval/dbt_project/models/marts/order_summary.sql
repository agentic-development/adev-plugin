{{ config(materialized='table') }}

with customers as (
    select * from {{ ref('stg_customers') }}
),

orders as (
    select * from {{ ref('stg_orders') }}
),

customer_orders as (
    select
        c.customer_id,
        c.customer_name,
        count(o.order_id) as total_orders,
        round(sum(o.total_amount), 2) as total_revenue,
        round(avg(o.total_amount), 2) as avg_order_value
    from customers c
    left join orders o on c.customer_id = o.customer_id
    group by c.customer_id, c.customer_name
)

select
    customer_id,
    customer_name,
    total_orders,
    total_revenue,
    avg_order_value
from customer_orders
order by customer_id
