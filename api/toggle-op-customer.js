const { sql } = require('@vercel/postgres');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  try {
    const { booking_number, type } = req.body;
    if (!booking_number || !['op', 'ri', 'customer'].includes(type)) {
      return res.status(400).json({ error: 'Invalid request' });
    }
    // Fetch current state
    const { rows } = await sql`SELECT op, ri, customer FROM bookings WHERE booking_number = ${booking_number}`;
    if (!rows.length) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    let { op, ri, customer } = rows[0];
    if (type === 'op') {
      op = !op;
      if (!op) customer = false; // Unchecking OP also unchecks Customer
    } else if (type === 'ri') {
      ri = !ri;
    } else if (type === 'customer') {
      if (!op) {
        return res.status(400).json({ error: 'OP must be ✓ first.' });
      }
      customer = !customer;
    }
    await sql`UPDATE bookings SET op = ${op}, ri = ${ri}, customer = ${customer} WHERE booking_number = ${booking_number}`;
    return res.status(200).json({ op, ri, customer });
  } catch (err) {
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
}; 