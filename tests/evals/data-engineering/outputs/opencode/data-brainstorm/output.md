Let me explore the context to understand the project structure and existing work.
This project doesn't have a `.context-index/` directory. Let me initialize the Agentic Development Framework first:
This project doesn't have a `.context-index/` directory yet. The brainstorm skill requires a constitution. Let me initialize the minimal context needed.
Based on my exploration, I found:

- **Existing CLV building blocks**: `dim_customers` has `lifetime_value`, `first_order_date`, `most_recent_order_date`, `number_of_orders`; `int_customer_order_history` aggregates these from `fct_orders`
- **Project structure**: dbt + DuckDB with staging/intermediate/marts layers following Kimball methodology
- **No `.context-index/` exists yet**: I've created the basic skeleton

---

**Question 1 of several:**

What problem does this CLV module solve? Are you looking to:
- A) Analyze historical CLV by cohort (who are our best customers by signup month?)
- B) Predict future CLV (which customers will spend more in next 90 days?)
- C) Segment customers by value (VIP, At-Risk, New, Churned) for marketing?

Please pick one primary goal, or describe what you need.
