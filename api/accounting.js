const { sql } = require('@vercel/postgres');
const { getSession } = require('./auth.js');

const ALLOWED_SORT_COLUMNS = [
  'booking_number', 'tour_date', 'book_date', 'sku', 'program', 'rate', 'hotel', 'paid'
];

module.exports = async (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });
  const userRole = session.role;
  if (userRole !== 'admin' && userRole !== 'accounting') return res.status(403).json({ error: 'Forbidden: Admins or Accounting only' });
  const bookingNumber = req.query.booking_number;
  if (bookingNumber) {
    if (req.method === 'PATCH') {
      const { paid } = req.body;
      if (paid === undefined) {
        return res.status(400).json({ success: false, error: 'Missing paid' });
      }
      try {
        await sql.query('UPDATE bookings SET paid = $1 WHERE booking_number = $2', [paid, bookingNumber]);
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json({ success: true });
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    } else if (req.method === 'DELETE') {
      // Only Admin can delete bookings
      if (userRole !== 'admin') return res.status(403).json({ error: 'Forbidden: Admins only' });
      try {
        await sql.query('DELETE FROM bookings WHERE booking_number = $1', [bookingNumber]);
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json({ success: true });
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    } else {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
  }

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
    // Build WHERE clause for both aliased and unaliased queries
    let whereClause = '';
    let whereClauseUnaliased = '';
    let params = [];
    // Date-only search support
    const dateRangeMatch = search.match(/^date:(\d{4}-\d{2}-\d{2}),(\d{4}-\d{2}-\d{2})$/);
    if (dateRangeMatch) {
      whereClause = `WHERE b.tour_date >= $1 AND b.tour_date < $2`;
      whereClauseUnaliased = `WHERE tour_date >= $1 AND tour_date < $2`;
      params = [dateRangeMatch[1], dateRangeMatch[2]];
      console.log('[DEBUG] Last Month filter:', params);
    } else {
      const dateSearchMatch = search.match(/^\d{4}-\d{2}-\d{2}$/);
      if (dateSearchMatch) {
        whereClause = `WHERE b.tour_date::date = $1`;
        whereClauseUnaliased = `WHERE tour_date::date = $1`;
        params = [search];
      } else if (search) {
        whereClause = `WHERE b.booking_number ILIKE $1 OR b.customer_name ILIKE $1 OR b.sku ILIKE $1 OR b.program ILIKE $1 OR b.hotel ILIKE $1`;
        whereClauseUnaliased = `WHERE booking_number ILIKE $1 OR customer_name ILIKE $1 OR sku ILIKE $1 OR program ILIKE $1 OR hotel ILIKE $1`;
        params = [`%${search}%`];
      }
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) AS count FROM bookings ${whereClauseUnaliased}`;
    console.log('[DEBUG] Count Query:', countQuery, params);
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
    let summaryWhere = whereClauseUnaliased;
    let summaryParams = [...params];
    // Last Month
    const lastMonthParams = [...params, lastMonthStartStr, thisMonthStartStr];
    const lastMonthCountQuery = `SELECT COUNT(*) AS count FROM bookings ${whereClauseUnaliased ? whereClauseUnaliased + ' AND' : 'WHERE'} tour_date >= $${params.length + 1} AND tour_date < $${params.length + 2}`;
    const lastMonthPaidQuery = `SELECT COALESCE(SUM(paid),0) AS sum FROM bookings ${whereClauseUnaliased ? whereClauseUnaliased + ' AND' : 'WHERE'} tour_date >= $${params.length + 1} AND tour_date < $${params.length + 2}`;
    // This Month
    const thisMonthParams = [...params, thisMonthStartStr, nextMonthStartStr];
    const thisMonthCountQuery = `SELECT COUNT(*) AS count FROM bookings ${whereClauseUnaliased ? whereClauseUnaliased + ' AND' : 'WHERE'} tour_date >= $${params.length + 1} AND tour_date < $${params.length + 2}`;
    const thisMonthPaidQuery = `SELECT COALESCE(SUM(paid),0) AS sum FROM bookings ${whereClauseUnaliased ? whereClauseUnaliased + ' AND' : 'WHERE'} tour_date >= $${params.length + 1} AND tour_date < $${params.length + 2}`;
    const [lastMonthCountRes, lastMonthPaidRes, thisMonthCountRes, thisMonthPaidRes] = await Promise.all([
      sql.query(lastMonthCountQuery, lastMonthParams),
      sql.query(lastMonthPaidQuery, lastMonthParams),
      sql.query(thisMonthCountQuery, thisMonthParams),
      sql.query(thisMonthPaidQuery, thisMonthParams)
    ]);

    // Use string interpolation for ORDER BY direction
    let dataQuery = `
      SELECT b.booking_number, b.book_date, b.tour_date, b.sku, b.program, b.rate, b.hotel, b.paid,
             b.adult, b.child,
             r.net_adult, r.net_child
      FROM bookings b
      LEFT JOIN products p ON b.sku = p.sku
      LEFT JOIN rates r ON r.product_id = p.id AND LOWER(TRIM(r.name)) = LOWER(TRIM(b.rate))
      ${whereClause}
      ORDER BY b.${sort} ${dirStr}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    const dataParams = [...params, limit, offset];
    const { rows: bookingsRaw } = await sql.query(dataQuery, dataParams);
    // Calculate benefit for each booking
    const bookings = bookingsRaw.map(b => {
      const netAdult = Number(b.net_adult) || 0;
      const netChild = Number(b.net_child) || 0;
      const adult = Number(b.adult) || 0;
      const child = Number(b.child) || 0;
      const paid = Number(b.paid) || 0;
      const netTotal = netAdult * adult + netChild * child;
      const benefit = paid - netTotal;
      return {
        booking_number: b.booking_number,
        book_date: b.book_date,
        tour_date: b.tour_date,
        sku: b.sku,
        program: b.program,
        rate: b.rate,
        hotel: b.hotel,
        paid: b.paid,
        benefit,
        net_total: netTotal,
        net_adult: b.net_adult,
        net_child: b.net_child,
        adult: b.adult,
        child: b.child
      };
    });
    // Calculate total benefit for all bookings (not just current page)
    let totalBenefit = 0;
    try {
      const allDataQuery = `
        SELECT b.adult, b.child, b.paid, r.net_adult, r.net_child
        FROM bookings b
        LEFT JOIN products p ON b.sku = p.sku
        LEFT JOIN rates r ON r.product_id = p.id AND LOWER(TRIM(r.name)) = LOWER(TRIM(b.rate))
        ${whereClause}
      `;
      const { rows: allRows } = await sql.query(allDataQuery, params);
      totalBenefit = allRows.reduce((sum, b) => {
        const netAdult = Number(b.net_adult) || 0;
        const netChild = Number(b.net_child) || 0;
        const adult = Number(b.adult) || 0;
        const child = Number(b.child) || 0;
        const paid = Number(b.paid) || 0;
        const netTotal = netAdult * adult + netChild * child;
        return sum + (paid - netTotal);
      }, 0);
    } catch (e) {
      totalBenefit = 0;
    }
    console.log('[DEBUG] Data Query:', dataQuery, dataParams, 'Result count:', bookings.length);

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      bookings,
      total,
      page,
      limit,
      lastMonthCount: parseInt(lastMonthCountRes.rows[0].count, 10),
      lastMonthOpNotSentPaid: parseFloat(lastMonthPaidRes.rows[0].sum),
      thisMonthCount: parseInt(thisMonthCountRes.rows[0].count, 10),
      thisMonthOpNotSentPaid: parseFloat(thisMonthPaidRes.rows[0].sum),
      totalBenefit
    });
  } catch (err) {
    console.error('Accounting API error:', err);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Failed to fetch accounting data', details: err.message, stack: err.stack });
    }
  }
}; 