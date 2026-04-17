// LTV endpoint (stub for fixture)
export function registerLtvRoute(app, db) {
  app.get("/metrics/ltv/:customer_id", async (req, res) => {
    const row = await db.query("SELECT * FROM customer_ltv WHERE customer_id = $1", [req.params.customer_id]);
    if (!row) return res.status(404).json({ error: "not found" });
    res.json(row);
  });
}
