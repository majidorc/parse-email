import { getClient } from '../db';

export default async function handler(req, res) {
  const client = await getClient();
  try {
    // Bookings grouped by sender
    const bySenderResult = await client.query(
      `SELECT sender, COUNT(*) AS count
       FROM parsed_emails
       GROUP BY sender
       ORDER BY count DESC`
    );
    // Bookings grouped by supplier
    const bySupplierResult = await client.query(
      `SELECT supplier, COUNT(*) AS count
       FROM parsed_emails
       GROUP BY supplier
       ORDER BY count DESC`
    );
    res.status(200).json({
      bySender: bySenderResult.rows,
      bySupplier: bySupplierResult.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
} 