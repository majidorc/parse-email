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

  const search = req.query.search ? req.query.search.trim() : '';

  try {
    let whereClause = '';
    let params = [limit, offset];
    if (search) {
      whereClause = `WHERE booking_number ILIKE $3 OR customer_name ILIKE $3 OR sku ILIKE $3 OR program ILIKE $3 OR hotel ILIKE $3`;
      params = [limit, offset, `%${search}%`];
    }
    // Get total count
    const countQuery = `SELECT COUNT(*) AS count FROM bookings ${whereClause}`;
    const { rows: countRows } = await sql.query(countQuery, search ? [params[2]] : []);
    const total = parseInt(countRows[0].count, 10);

    // Use string interpolation for ORDER BY direction
    const query = `
      SELECT booking_number, tour_date, customer_name, sku, program, op, ri, customer, hotel, adult, child, infant
      FROM bookings
      ${whereClause}
      ORDER BY ${sort} ${dirStr}
      LIMIT $1 OFFSET $2
    `;
    const { rows: bookings } = await sql.query(query, params);

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