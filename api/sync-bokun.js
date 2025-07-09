const { sql } = require('@vercel/postgres');
const axios = require('axios');

module.exports = async (req, res) => {
  // Only allow POST (for cron/scheduler)
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // Get settings
  const { rows } = await sql`SELECT * FROM settings ORDER BY updated_at DESC LIMIT 1;`;
  if (!rows.length || !rows[0].use_bokun_api) {
    return res.status(200).json({ ok: true, message: 'Bokun API not enabled in settings.' });
  }
  const bokunApiKey = rows[0].bokun_api_key;
  if (!bokunApiKey) {
    return res.status(400).json({ error: 'No Bokun API key set in settings.' });
  }

  // Fetch bookings from Bokun API (example endpoint, update as needed)
  try {
    // Replace with actual Bokun API endpoint and auth method
    const response = await axios.get('https://api.bokun.io/v1/bookings', {
      headers: {
        'Authorization': `Bearer ${bokunApiKey}`,
        'Content-Type': 'application/json'
      }
    });
    const bookings = response.data;
    // For now, just log the bookings
    console.log('[BOKUN SYNC] Fetched bookings:', bookings.length);
    // Upsert each booking into DB
    let upserted = 0;
    for (const b of bookings) {
      // Map Bokun API fields to DB fields (adjust as needed)
      const bookingNumber = b.bookingNumber || b.booking_number || b.id;
      if (!bookingNumber) continue;
      const isoDate = b.tourDate || b.tour_date || b.date;
      const sku = b.sku || '';
      const program = b.program || b.productName || '';
      const name = b.name || b.customerName || '';
      const adult = b.adult || b.adults || 0;
      const child = b.child || b.children || 0;
      const infant = b.infant || b.infants || 0;
      const hotel = b.hotel || '';
      const phoneNumber = b.phoneNumber || b.phone || '';
      const rawTourDate = b.rawTourDate || b.tourDate || '';
      const paid = b.paid || null;
      const bookDate = b.bookDate || b.createdAt || null;
      const channel = 'Bokun';
      await sql`
        INSERT INTO bookings (booking_number, tour_date, sku, program, customer_name, adult, child, infant, hotel, phone_number, notification_sent, raw_tour_date, paid, book_date, channel)
        VALUES (${bookingNumber}, ${isoDate}, ${sku}, ${program}, ${name}, ${adult}, ${child}, ${infant}, ${hotel}, ${phoneNumber}, FALSE, ${rawTourDate}, ${paid}, ${bookDate}, ${channel})
        ON CONFLICT (booking_number) DO UPDATE SET
          tour_date = EXCLUDED.tour_date,
          sku = EXCLUDED.sku,
          program = EXCLUDED.program,
          customer_name = EXCLUDED.customer_name,
          adult = EXCLUDED.adult,
          child = EXCLUDED.child,
          infant = EXCLUDED.infant,
          hotel = EXCLUDED.hotel,
          phone_number = EXCLUDED.phone_number,
          notification_sent = EXCLUDED.notification_sent,
          raw_tour_date = EXCLUDED.raw_tour_date,
          paid = EXCLUDED.paid,
          book_date = EXCLUDED.book_date,
          channel = EXCLUDED.channel;
      `;
      upserted++;
      console.log(`[BOKUN SYNC] Upserted booking: ${bookingNumber}`);
    }
    return res.status(200).json({ ok: true, count: bookings.length, upserted });
  } catch (err) {
    console.error('[BOKUN SYNC] Error fetching bookings:', err.message);
    return res.status(500).json({ error: 'Failed to fetch Bokun bookings', details: err.message });
  }
}; 