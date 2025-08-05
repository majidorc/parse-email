const { sql } = require('@vercel/postgres');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { check_new, sync } = req.query;

    if (check_new === 'true') {
      // Check for new web notifications since last check
      const { rows } = await sql`
        SELECT COUNT(*) as total 
        FROM web_notifications 
        WHERE created_at >= NOW() - INTERVAL '5 minutes'
      `;
      
      return res.json({
        total: parseInt(rows[0].total),
        newBookings: parseInt(rows[0].total)
      });
    }

    if (sync === 'true') {
      // Background sync - check for new web notifications in the last hour
      const { rows } = await sql`
        SELECT 
          booking_number,
          customer_name,
          tour_date,
          program,
          created_at
        FROM web_notifications 
        WHERE created_at >= NOW() - INTERVAL '1 hour'
        ORDER BY created_at DESC
        LIMIT 10
      `;
      
      return res.json({
        newBookings: rows,
        count: rows.length
      });
    }

    // Default: return recent bookings for notification
    const { rows } = await sql`
      SELECT 
        booking_number,
        customer_name,
        tour_date,
        program,
        created_at
      FROM bookings 
      ORDER BY created_at DESC
      LIMIT 5
    `;

    return res.json({
      recentBookings: rows,
      count: rows.length
    });

  } catch (error) {
    console.error('Notification API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
} 