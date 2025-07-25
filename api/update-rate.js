const { sql } = require('@vercel/postgres');
const { getSession } = require('./auth.js');

module.exports = async (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });
  const userRole = session.role;
  if (!["admin", "accounting", "reservation"].includes(userRole)) return res.status(403).json({ error: 'Forbidden: Admin, Accounting, or Reservation only' });

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { booking_number, rate } = req.body;

  if (!booking_number || !rate) {
    return res.status(400).json({ error: 'Missing booking_number or rate' });
  }

  try {
    // Check if booking exists
    const { rows } = await sql`SELECT * FROM bookings WHERE booking_number = ${booking_number}`;
    if (!rows.length) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Update the rate
    await sql`UPDATE bookings SET rate = ${rate} WHERE booking_number = ${booking_number}`;
    
    console.log(`[UPDATE RATE] Updated booking ${booking_number} with rate: ${rate}`);
    
    return res.status(200).json({ 
      success: true, 
      message: `Rate updated for booking ${booking_number}`,
      rate: rate
    });
  } catch (err) {
    console.error('Failed to update rate:', err);
    return res.status(500).json({ error: 'Failed to update rate', details: err.message });
  }
}; 