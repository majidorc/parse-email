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
          WHEN sender ILIKE '%info@tours.co.th%' THEN 'Website'
          WHEN sender ILIKE '%bokun.io%' THEN 'Viator'
          ELSE 'Website'
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
          WHEN sender ILIKE '%info@tours.co.th%' THEN 'Website'
          WHEN sender ILIKE '%bokun.io%' THEN 'Viator'
          ELSE 'Website'
        END AS channel,
        COUNT(*) AS count
      FROM parsed_emails
      GROUP BY channel
      ORDER BY count DESC`
    );
    // Total sale (sum of paid) and total bookings (count) from bookings table
    const totalResult = await client.query('SELECT COALESCE(SUM(paid),0) AS total_sale, COUNT(*) AS total_bookings FROM bookings');
    const totalSale = parseFloat(totalResult.rows[0].total_sale);
    const totalBookings = parseInt(totalResult.rows[0].total_bookings, 10);
    // Viator Sale (bokun emails except GYG)
    const viatorResult = await client.query(`
      SELECT COALESCE(SUM(b.paid),0) AS viator_sale, COUNT(*) AS viator_count 
      FROM bookings b
      LEFT JOIN parsed_emails p ON b.booking_number = p.booking_number
      WHERE p.sender ILIKE '%bokun.io%' AND b.booking_number NOT LIKE 'GYG%'
    `);
    const viatorSale = parseFloat(viatorResult.rows[0].viator_sale);
    const viatorCount = parseInt(viatorResult.rows[0].viator_count, 10);
    
    // Website Sale (info@tours.co.th + GYG bookings)
    const websiteResult = await client.query(`
      SELECT COALESCE(SUM(b.paid),0) AS website_sale, COUNT(*) AS website_count 
      FROM bookings b
      LEFT JOIN parsed_emails p ON b.booking_number = p.booking_number
      WHERE (p.sender ILIKE '%info@tours.co.th%' OR b.booking_number LIKE 'GYG%')
    `);
    const websiteSale = parseFloat(websiteResult.rows[0].website_sale);
    const websiteCount = parseInt(websiteResult.rows[0].website_count, 10);
    

    
    // NEW: Detailed breakdown by source_email (inbox) showing Viator vs Website
    const bySourceChannelResult = await client.query(
      `SELECT 
        COALESCE(source_email, 'Unknown') AS source_email,
        CASE
          WHEN sender ILIKE '%info@tours.co.th%' THEN 'Website'
          WHEN sender ILIKE '%bokun.io%' THEN 'Viator'
          ELSE 'Website'
        END AS channel,
        COUNT(*) AS count
      FROM parsed_emails
      GROUP BY source_email, channel
      ORDER BY source_email, count DESC`
    );
    
    res.status(200).json({
      bySender: bySenderResult.rows,
      bySupplier: bySellerResult.rows,
      bySource: bySourceResult.rows,
      byChannel: byChannelResult.rows,
      bySourceChannel: bySourceChannelResult.rows, // NEW: detailed breakdown
      totalSale,
      totalBookings,
      viatorSale,
      viatorCount,
      websiteSale,
      websiteCount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
} 