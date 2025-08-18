import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
  try {
    // Bookings grouped by sender
    const { rows: bySenderResult } = await sql.query(
      `SELECT sender, COUNT(*) AS count FROM parsed_emails GROUP BY sender ORDER BY count DESC`
    );
    // Bookings grouped by seller (parsed from body and sender)
    const { rows: bySellerResult } = await sql.query(
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
    const { rows: bySourceResult } = await sql.query(
      `SELECT COALESCE(source_email, 'Unknown') AS source_email, COUNT(*) AS count FROM parsed_emails GROUP BY source_email ORDER BY count DESC`
    );
    // Bookings grouped by channel (OTA, WebSite, etc)
    const { rows: byChannelResult } = await sql.query(
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
    const { rows: totalResult } = await sql.query('SELECT COALESCE(SUM(paid),0) AS total_sale, COUNT(*) AS total_bookings FROM bookings');
    const totalSale = parseFloat(totalResult[0].total_sale);
    const totalBookings = parseInt(totalResult[0].total_bookings, 10);
    // Viator Sale (bokun emails except GYG)
    const { rows: viatorResult } = await sql.query(`
      SELECT COALESCE(SUM(b.paid),0) AS viator_sale, COUNT(*) AS viator_count 
      FROM bookings b
      LEFT JOIN parsed_emails p ON b.booking_number = p.booking_number
      WHERE p.sender ILIKE '%bokun.io%' AND b.booking_number NOT LIKE 'GYG%'
    `);
    const viatorSale = parseFloat(viatorResult[0].viator_sale);
    const viatorCount = parseInt(viatorResult[0].viator_count, 10);
    
    // Website Sale (info@tours.co.th + GYG bookings)
    const { rows: websiteResult } = await sql.query(`
      SELECT COALESCE(SUM(b.paid),0) AS website_sale, COUNT(*) AS website_count 
      FROM bookings b
      LEFT JOIN parsed_emails p ON b.booking_number = p.booking_number
      WHERE (p.sender ILIKE '%info@tours.co.th%' OR b.booking_number LIKE 'GYG%')
    `);
    const websiteSale = parseFloat(websiteResult[0].website_sale);
    const websiteCount = parseInt(websiteResult[0].website_count, 10);
    

    
    // NEW: Detailed breakdown by source_email (inbox) showing Viator vs Website
    const { rows: bySourceChannelResult } = await sql.query(
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
      bySender: bySenderResult,
      bySupplier: bySellerResult,
      bySource: bySourceResult,
      byChannel: byChannelResult,
      bySourceChannel: bySourceChannelResult, // NEW: detailed breakdown
      totalSale,
      totalBookings,
      viatorSale,
      viatorCount,
      websiteSale,
      websiteCount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
} 