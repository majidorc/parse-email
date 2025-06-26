const { sql } = require('@vercel/postgres');

const ALLOWED_SORT_COLUMNS = [
  'booking_number', 'tour_date', 'customer_name', 'sku', 'program', 'op', 'ri', 'customer', 'hotel', 'adult', 'child', 'infant'
];

module.exports = async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const offset = (page - 1) * limit;

  // Sorting
  let sort = req.query.sort || 'tour_date';
  let dir = (req.query.dir || 'desc').toLowerCase();
  if (!ALLOWED_SORT_COLUMNS.includes(sort)) sort = 'tour_date';
  if (!['asc', 'desc'].includes(dir)) dir = 'desc';
  const dirStr = dir === 'asc' ? 'ASC' : 'DESC';

  try {
    // Get total count
    const { rows: countRows } = await sql`SELECT COUNT(*) AS count FROM bookings`;
    const total = parseInt(countRows[0].count, 10);

    // Use string interpolation for ORDER BY direction
    const query = `
      SELECT booking_number, tour_date, customer_name, sku, program, op, ri, customer, hotel, adult, child, infant
      FROM bookings
      ORDER BY ${sort} ${dirStr}
      LIMIT $1 OFFSET $2
    `;
    const { rows: bookings } = await sql.query(query, [limit, offset]);

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