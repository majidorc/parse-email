const { sql } = require('@vercel/postgres');

module.exports = async (req, res) => {
  const { booking_number } = req.query;

  if (req.method !== 'PATCH') {
    res.setHeader('Allow', ['PATCH']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { column, value } = req.body || {};
  const allowedColumns = ['op', 'ri', 'customer'];
  if (!allowedColumns.includes(column)) {
    return res.status(400).json({ error: 'Invalid column' });
  }

  try {
    await sql`
      UPDATE bookings
      SET ${sql.identifier([column])} = ${value}
      WHERE booking_number = ${booking_number}
    `;
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update booking', details: err.message });
  }
}; 