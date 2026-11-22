// The real "work" of one order. Kept separate so it can be unit-tested with a fake db.
export async function processOrder(db, orderId) {
  const { rowCount } = await db.query(
    "UPDATE orders SET status = 'processed', processed_at = now() WHERE id = $1 AND status = 'pending'",
    [orderId],
  );
  return rowCount === 1; // false = unknown id or already processed (safe to run twice)
}
