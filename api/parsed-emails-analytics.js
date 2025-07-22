import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
  try {
    // Bookings grouped by sender
    const bySenderResult = await sql`
      SELECT sender, COUNT(*) AS count
      FROM parsed_emails
      GROUP BY sender
      ORDER BY count DESC
    `;
    // Bookings grouped by supplier
    const bySupplierResult = await sql`
      SELECT supplier, COUNT(*) AS count
      FROM parsed_emails
      GROUP BY supplier
      ORDER BY count DESC
    `;
    res.status(200).json({
      bySender: bySenderResult.rows,
      bySupplier: bySupplierResult.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
} 