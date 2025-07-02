const { sql } = require('@vercel/postgres');

module.exports = async (req, res) => {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const bookingNumber = req.query.booking_number;
  const { paid } = req.body;
  if (!bookingNumber || paid === undefined) {
    return res.status(400).json({ success: false, error: 'Missing booking_number or paid' });
  }
  try {
    await sql.query('UPDATE bookings SET paid = $1 WHERE booking_number = $2', [paid, bookingNumber]);
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}; 