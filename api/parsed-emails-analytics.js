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
          WHEN sender = 'info@tours.co.th' THEN 'Website'
          WHEN sender ILIKE '%bokun.io%' AND body ILIKE '%Sold by%GetYourGuide%' THEN 'GYG'
          WHEN sender ILIKE '%bokun.io%' AND body ILIKE '%Sold by%Viator.com%' THEN 'Viator'
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
          WHEN sender = 'info@tours.co.th' THEN 'Website'
          WHEN sender ILIKE '%bokun.io%' AND body ILIKE '%Sold by%GetYourGuide%' THEN 'GYG'
          WHEN sender ILIKE '%bokun.io%' AND body ILIKE '%Sold by%Viator.com%' THEN 'Viator'
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
    // OTA Sale (sum of paid for OTA bookings)
    const otaResult = await client.query("SELECT COALESCE(SUM(paid),0) AS ota_sale FROM bookings WHERE booking_number NOT LIKE '6%'");
    const otaSale = parseFloat(otaResult.rows[0].ota_sale);
    // Website Sale (sum of paid for Website bookings)
    const websiteResult = await client.query("SELECT COALESCE(SUM(paid),0) AS website_sale FROM bookings WHERE booking_number LIKE '6%'");
    const websiteSale = parseFloat(websiteResult.rows[0].website_sale);
    // OTA and Website booking counts
    const otaCountResult = await client.query("SELECT COUNT(*) AS ota_count FROM bookings WHERE booking_number NOT LIKE '6%'");
    const otaCount = parseInt(otaCountResult.rows[0].ota_count, 10);
    const websiteCountResult = await client.query("SELECT COUNT(*) AS website_count FROM bookings WHERE booking_number LIKE '6%'");
    const websiteCount = parseInt(websiteCountResult.rows[0].website_count, 10);
    
    // NEW: Specific Viator sales calculation
    const viatorResult = await client.query(`
      SELECT COALESCE(SUM(b.paid),0) AS viator_sale, COUNT(*) AS viator_count 
      FROM bookings b
      LEFT JOIN parsed_emails p ON b.booking_number = p.booking_number
      WHERE (
        b.channel = 'Viator' 
        OR (p.sender ILIKE '%bokun.io%' AND p.body ILIKE '%Sold by%Viator.com%')
        OR (p.sender ILIKE '%bokun.io%' AND p.body NOT ILIKE '%GetYourGuide%' AND p.body NOT ILIKE '%Sold by%GetYourGuide%')
        OR b.booking_number LIKE 'V%'
        OR b.booking_number LIKE '%VIATOR%'
      )
    `);
    const viatorSale = parseFloat(viatorResult.rows[0].viator_sale);
    const viatorCount = parseInt(viatorResult.rows[0].viator_count, 10);
    
    // NEW: GetYourGuide sales calculation
    const gygResult = await client.query(`
      SELECT COALESCE(SUM(b.paid),0) AS gyg_sale, COUNT(*) AS gyg_count 
      FROM bookings b
      LEFT JOIN parsed_emails p ON b.booking_number = p.booking_number
      WHERE (
        b.channel = 'GYG' 
        OR (p.sender ILIKE '%bokun.io%' AND p.body ILIKE '%Sold by%GetYourGuide%')
        OR b.booking_number LIKE 'GYG%'
      )
    `);
    const gygSale = parseFloat(gygResult.rows[0].gyg_sale);
    const gygCount = parseInt(gygResult.rows[0].gyg_count, 10);
    
    // NEW: Detailed breakdown by source_email (inbox) showing OTA vs Website
    const bySourceChannelResult = await client.query(
      `SELECT 
        COALESCE(source_email, 'Unknown') AS source_email,
        CASE
          WHEN sender = 'info@tours.co.th' THEN 'Website'
          WHEN sender ILIKE '%bokun.io%' AND body ILIKE '%Sold by%GetYourGuide%' THEN 'GYG'
          WHEN sender ILIKE '%bokun.io%' AND body ILIKE '%Sold by%Viator.com%' THEN 'Viator'
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
      otaSale,
      websiteSale,
      otaCount,
      websiteCount,
      viatorSale, // NEW: specific Viator sales
      viatorCount, // NEW: specific Viator count
      gygSale, // NEW: specific GYG sales
      gygCount // NEW: specific GYG count
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
} 