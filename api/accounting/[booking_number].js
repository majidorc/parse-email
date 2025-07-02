const { sql } = require('@vercel/postgres');

module.exports = async (req, res) => {
  const bookingNumber = req.query.booking_number;
  if (!bookingNumber) {
    return res.status(400).json({ success: false, error: 'Missing booking_number' });
  }
  if (req.method === 'PATCH') {
    const { paid } = req.body;
    if (paid === undefined) {
      return res.status(400).json({ success: false, error: 'Missing paid' });
    }
    try {
      await sql.query('UPDATE bookings SET paid = $1 WHERE booking_number = $2', [paid, bookingNumber]);
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  } else if (req.method === 'DELETE') {
    try {
      await sql.query('DELETE FROM bookings WHERE booking_number = $1', [bookingNumber]);
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  } else {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
}; 