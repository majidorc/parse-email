import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  const client = await pool.connect();
  try {
    // Bookings grouped by sender
    const bySenderResult = await client.query(
      `SELECT sender, COUNT(*) AS count FROM parsed_emails GROUP BY sender ORDER BY count DESC`
    );
    // Bookings grouped by seller (parsed from body and sender)
    const bySellerResult = await client.query(
      `SELECT
        CASE
          WHEN body ILIKE '%Sold by Viator.com%' THEN 'Viator.com'
          WHEN body ILIKE '%Sold by GetYourGuide%' THEN 'GetYourGuide'
          WHEN sender = 'info@tours.co.th' THEN 'WebSite'
          ELSE 'Other'
        END AS seller,
        COUNT(*) AS count
      FROM parsed_emails
      GROUP BY seller
      ORDER BY count DESC`
    );
    // Bookings grouped by source_email (inbox)
    const bySourceResult = await client.query(
      `SELECT COALESCE(source_email, 'Unknown') AS source_email, COUNT(*) AS count FROM parsed_emails GROUP BY source_email ORDER BY count DESC`
    );
    // Bookings grouped by channel (OTA, WebSite, etc)
    const byChannelResult = await client.query(
      `SELECT
        CASE
          WHEN body ILIKE '%Sold by Viator.com%' THEN 'Viator.com'
          WHEN body ILIKE '%Sold by GetYourGuide%' THEN 'GetYourGuide'
          WHEN sender = 'info@tours.co.th' THEN 'WebSite'
          ELSE 'OTA'
        END AS channel,
        COUNT(*) AS count
      FROM parsed_emails
      GROUP BY channel
      ORDER BY count DESC`
    );
    res.status(200).json({
      bySender: bySenderResult.rows,
      bySupplier: bySellerResult.rows,
      bySource: bySourceResult.rows,
      byChannel: byChannelResult.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
} 