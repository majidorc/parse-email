const { sql } = require('@vercel/postgres');

const ALLOWED_SORT_COLUMNS = [
  'booking_number', 'tour_date', 'customer_name', 'sku', 'program', 'hotel', 'paid'
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
    let params = [];
    // Date-only search support
    const dateSearchMatch = search.match(/^\d{4}-\d{2}-\d{2}$/);
    if (dateSearchMatch) {
      whereClause = `WHERE tour_date::date = $1`;
      params = [search];
    } else if (search) {
      whereClause = `WHERE booking_number ILIKE $1 OR customer_name ILIKE $1 OR sku ILIKE $1 OR program ILIKE $1 OR hotel ILIKE $1`;
      params = [`%${search}%`];
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) AS count FROM bookings ${whereClause}`;
    const { rows: countRows } = await sql.query(countQuery, params);
    const total = parseInt(countRows[0].count, 10);

    // Use string interpolation for ORDER BY direction
    let dataQuery = `
      SELECT booking_number, tour_date, customer_name, sku, program, hotel, paid
      FROM bookings
      ${whereClause}
      ORDER BY ${sort} ${dirStr}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    const dataParams = [...params, limit, offset];
    const { rows: bookings } = await sql.query(dataQuery, dataParams);

    res.status(200).json({
      bookings,
      total,
      page,
      limit
    });
  } catch (err) {
    console.error('Accounting API error:', err);
    res.status(500).json({ error: 'Failed to fetch accounting data', details: err.message, stack: err.stack });
  }
}; 