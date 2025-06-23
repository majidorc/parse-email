const { sql } = require('@vercel/postgres');

module.exports = async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const offset = (page - 1) * limit;

  try {
    // Get total count
    const { rows: countRows } = await sql`SELECT COUNT(*) AS count FROM bookings`;
    const total = parseInt(countRows[0].count, 10);

    // Get paginated bookings
    const { rows: bookings } = await sql`
      SELECT booking_number, tour_date, customer_name, sku, program, op, customer, hotel, adult, child, infant
      FROM bookings
      ORDER BY tour_date DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    res.status(200).json({
      bookings,
      total,
      page,
      limit
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch bookings', details: err.message });
  }
}; 