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
          WHEN body ILIKE '%GetYourGuide%' THEN 'GetYourGuide'
          WHEN body ILIKE '%Viator.com%' THEN 'Viator.com'
          WHEN sender = 'info@tours.co.th' THEN 'WebSite'
          ELSE 'OTA'
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
          WHEN body ILIKE '%GetYourGuide%' THEN 'GetYourGuide'
          WHEN body ILIKE '%Viator.com%' THEN 'Viator.com'
          WHEN sender = 'info@tours.co.th' THEN 'WebSite'
          ELSE 'OTA'
        END AS channel,
        COUNT(*) AS count
      FROM parsed_emails
      GROUP BY channel
      ORDER BY count DESC`
    );
    // Total sale (sum of paid) and total bookings (count)
    const totalResult = await client.query('SELECT COALESCE(SUM(paid),0) AS total_sale, COUNT(*) AS total_bookings FROM parsed_emails');
    const totalSale = parseFloat(totalResult.rows[0].total_sale);
    const totalBookings = parseInt(totalResult.rows[0].total_bookings, 10);
    res.status(200).json({
      bySender: bySenderResult.rows,
      bySupplier: bySellerResult.rows,
      bySource: bySourceResult.rows,
      byChannel: byChannelResult.rows,
      totalSale,
      totalBookings
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
} 