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
    const lastMonthCountQuery = `SELECT COUNT(*) AS count FROM bookings ${summaryWhere ? summaryWhere + ' AND' : 'WHERE'} tour_date >= $${summaryParams.length + 1} AND tour_date < $${summaryParams.length + 2}`;
    const lastMonthOpNotSentPaidQuery = `SELECT COALESCE(SUM(paid),0) AS sum FROM bookings ${summaryWhere ? summaryWhere + ' AND' : 'WHERE'} tour_date >= $${summaryParams.length + 1} AND tour_date < $${summaryParams.length + 2} AND (op IS NULL OR op = false)`;
    // This Month
    const thisMonthCountQuery = `SELECT COUNT(*) AS count FROM bookings ${summaryWhere ? summaryWhere + ' AND' : 'WHERE'} tour_date >= $${summaryParams.length + 3} AND tour_date < $${summaryParams.length + 4}`;
    const thisMonthOpNotSentPaidQuery = `SELECT COALESCE(SUM(paid),0) AS sum FROM bookings ${summaryWhere ? summaryWhere + ' AND' : 'WHERE'} tour_date >= $${summaryParams.length + 3} AND tour_date < $${summaryParams.length + 4} AND (op IS NULL OR op = false)`;
    const summaryValues = [
      ...summaryParams,
      lastMonthStartStr, thisMonthStartStr,
      thisMonthStartStr, nextMonthStartStr
    ];
    const [lastMonthCountRes, lastMonthOpNotSentPaidRes, thisMonthCountRes, thisMonthOpNotSentPaidRes] = await Promise.all([
      sql.query(lastMonthCountQuery, summaryValues),
      sql.query(lastMonthOpNotSentPaidQuery, summaryValues),
      sql.query(thisMonthCountQuery, summaryValues),
      sql.query(thisMonthOpNotSentPaidQuery, summaryValues)
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
      lastMonthOpNotSentPaid: parseFloat(lastMonthOpNotSentPaidRes.rows[0].sum),
      thisMonthCount: parseInt(thisMonthCountRes.rows[0].count, 10),
      thisMonthOpNotSentPaid: parseFloat(thisMonthOpNotSentPaidRes.rows[0].sum)
    });
  } catch (err) {
    console.error('Accounting API error:', err);
    res.status(500).json({ error: 'Failed to fetch accounting data', details: err.message, stack: err.stack });
  }
}; 