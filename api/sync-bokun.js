const { sql } = require('@vercel/postgres');
const axios = require('axios');
const crypto = require('crypto');

module.exports = async (req, res) => {
  // Only allow POST (for cron/scheduler)
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // Get settings
  const { rows } = await sql`SELECT * FROM settings ORDER BY updated_at DESC LIMIT 1;`;
  if (!rows.length || !rows[0].use_bokun_api) {
    return res.status(200).json({ ok: true, message: 'Bokun API not enabled in settings.' });
  }
  const bokunAccessKey = rows[0].bokun_access_key;
  const bokunSecretKey = rows[0].bokun_secret_key;
  if (!bokunAccessKey || !bokunSecretKey) {
    return res.status(400).json({ error: 'Bokun Access Key or Secret Key not set in settings.' });
  }

  try {
    const fromDate = '2023-01-01';
    const toDate = new Date().toISOString().slice(0, 10);
    let allBookings = [];
    let page = 0;
    let pageSize = 100;
    let more = true;
    while (more) {
      const query = `?fromDate=${fromDate}&toDate=${toDate}&page=${page}&size=${pageSize}`;
      const path = `/v1/bookings${query}`;
      const method = 'GET';
      const host = 'api.bokun.io';
      const date = new Date().toISOString();
      const stringToSign = `${method}\n${path}\n${date}`;
      const signature = crypto.createHmac('sha256', bokunSecretKey)
        .update(stringToSign)
        .digest('hex');
      const headers = {
        'Bokun-AccessKey': bokunAccessKey,
        'Bokun-Date': date,
        'Bokun-Signature': signature,
        'Content-Type': 'application/json'
      };
      const url = `https://${host}${path}`;
      const response = await axios.get(url, { headers });
      const bookings = response.data;
      allBookings = allBookings.concat(bookings);
      console.log(`[BOKUN SYNC] Page ${page} fetched ${bookings.length} bookings.`);
      if (bookings.length < pageSize) {
        more = false;
      } else {
        page++;
      }
    }
    console.log('[BOKUN SYNC] All booking numbers:', allBookings.map(b => b.bookingNumber || b.booking_number || b.id));
    // Upsert each booking into DB
    let upserted = 0;
    for (const b of allBookings) {
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
    return res.status(200).json({ ok: true, count: allBookings.length, upserted });
  } catch (err) {
    console.error('[BOKUN SYNC] Error fetching bookings:', err.message);
    return res.status(500).json({ error: 'Failed to fetch Bokun bookings', details: err.message });
  }
}; 