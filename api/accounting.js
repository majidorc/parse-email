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
    const dateRangeMatch = search.match(/^date:(\d{4}-\d{2}-\d{2}),(\d{4}-\d{2}-\d{2})$/);
    if (dateRangeMatch) {
      whereClause = `WHERE tour_date >= $1 AND tour_date < $2`;
      params = [dateRangeMatch[1], dateRangeMatch[2]];
    } else {
      const dateSearchMatch = search.match(/^\d{4}-\d{2}-\d{2}$/);
      if (dateSearchMatch) {
        whereClause = `WHERE tour_date::date = $1`;
        params = [search];
      } else if (search) {
        whereClause = `WHERE booking_number ILIKE $1 OR customer_name ILIKE $1 OR sku ILIKE $1 OR program ILIKE $1 OR hotel ILIKE $1`;
        params = [`%${search}%`];
      }
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) AS count FROM bookings ${whereClause}`;
    const { rows: countRows } = await sql.query(countQuery, params);
    const total = parseInt(countRows[0].count, 10);

    // Calculate date ranges for last month and this month
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thisMonthStartStr = thisMonthStart.toISOString().slice(0, 10);
    const nextMonthStartStr = nextMonthStart.toISOString().slice(0, 10);
    const lastMonthStartStr = lastMonthStart.toISOString().slice(0, 10);

    // Summary queries for all matching bookings (not just current page)
    let summaryWhere = whereClause;
    let summaryParams = [...params];
    // Last Month
    const lastMonthParams = [...params, lastMonthStartStr, thisMonthStartStr];
    const lastMonthCountQuery = `SELECT COUNT(*) AS count FROM bookings ${whereClause ? whereClause + ' AND' : 'WHERE'} tour_date >= $${params.length + 1} AND tour_date < $${params.length + 2}`;
    const lastMonthPaidQuery = `SELECT COALESCE(SUM(paid),0) AS sum FROM bookings ${whereClause ? whereClause + ' AND' : 'WHERE'} tour_date >= $${params.length + 1} AND tour_date < $${params.length + 2} AND (op IS NULL OR op = false)`;
    // This Month
    const thisMonthParams = [...params, thisMonthStartStr, nextMonthStartStr];
    const thisMonthCountQuery = `SELECT COUNT(*) AS count FROM bookings ${whereClause ? whereClause + ' AND' : 'WHERE'} tour_date >= $${params.length + 1} AND tour_date < $${params.length + 2}`;
    const thisMonthPaidQuery = `SELECT COALESCE(SUM(paid),0) AS sum FROM bookings ${whereClause ? whereClause + ' AND' : 'WHERE'} tour_date >= $${params.length + 1} AND tour_date < $${params.length + 2} AND (op IS NULL OR op = false)`;
    const [lastMonthCountRes, lastMonthPaidRes, thisMonthCountRes, thisMonthPaidRes] = await Promise.all([
      sql.query(lastMonthCountQuery, lastMonthParams),
      sql.query(lastMonthPaidQuery, lastMonthParams),
      sql.query(thisMonthCountQuery, thisMonthParams),
      sql.query(thisMonthPaidQuery, thisMonthParams)
    ]);

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
      limit,
      lastMonthCount: parseInt(lastMonthCountRes.rows[0].count, 10),
      lastMonthOpNotSentPaid: parseFloat(lastMonthPaidRes.rows[0].sum),
      thisMonthCount: parseInt(thisMonthCountRes.rows[0].count, 10),
      thisMonthOpNotSentPaid: parseFloat(thisMonthPaidRes.rows[0].sum)
    });
  } catch (err) {
    console.error('Accounting API error:', err);
    res.status(500).json({ error: 'Failed to fetch accounting data', details: err.message, stack: err.stack });
  }
}; 