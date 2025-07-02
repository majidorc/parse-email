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
    let params = [];
    // Date-only search support
    const dateSearchMatch = search.match(/^\d{4}-\d{2}-\d{2}$/);
    if (dateSearchMatch) {
      // Use Bangkok time for date search
      whereClause = `WHERE (tour_date AT TIME ZONE 'Asia/Bangkok')::date = $1`;
      params = [search];
    } else if (search) {
      whereClause = `WHERE booking_number ILIKE $1 OR customer_name ILIKE $1 OR sku ILIKE $1 OR program ILIKE $1 OR hotel ILIKE $1`;
      params = [`%${search}%`];
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) AS count FROM bookings ${whereClause}`;
    const { rows: countRows } = await sql.query(countQuery, params);
    const total = parseInt(countRows[0].count, 10);

    // Use Bangkok time for today
    const todayBangkokSql = "(now() AT TIME ZONE 'Asia/Bangkok')::date";
    const tomorrowBangkokSql = "(now() AT TIME ZONE 'Asia/Bangkok')::date + INTERVAL '1 day'";
    const dayAfterTomorrowBangkokSql = "(now() AT TIME ZONE 'Asia/Bangkok')::date + INTERVAL '2 day'";
    const twoDaysAfterTomorrowBangkokSql = "(now() AT TIME ZONE 'Asia/Bangkok')::date + INTERVAL '3 day'";
    let todayWhere = '';
    let todayParams = [];
    let hasSearch = !!search;
    if (hasSearch) {
      todayWhere = `WHERE (booking_number ILIKE $1 OR customer_name ILIKE $1 OR sku ILIKE $1 OR program ILIKE $1 OR hotel ILIKE $1) AND tour_date >= ${todayBangkokSql} AND tour_date < ${tomorrowBangkokSql}`;
      todayParams = [`%${search}%`];
    } else {
      todayWhere = `WHERE tour_date >= ${todayBangkokSql} AND tour_date < ${tomorrowBangkokSql}`;
      todayParams = [];
    }
    // Count today's bookings
    const todayCountQuery = `SELECT COUNT(*) AS count FROM bookings ${todayWhere}`;
    const { rows: todayRows } = hasSearch
      ? await sql.query(todayCountQuery, todayParams)
      : await sql.query(todayCountQuery);
    const todayCount = parseInt(todayRows[0].count, 10);
    // Count not sent to OP today (strict boolean check)
    const todayOpNotSentQuery = `SELECT COUNT(*) AS count FROM bookings ${todayWhere} AND (op IS NULL OR op = FALSE)`;
    const { rows: opNotSentRows } = hasSearch
      ? await sql.query(todayOpNotSentQuery, todayParams)
      : await sql.query(todayOpNotSentQuery);
    const todayOpNotSent = parseInt(opNotSentRows[0].count, 10);
    // Count not sent to Customer today (strict boolean check)
    const todayCustomerNotSentQuery = `SELECT COUNT(*) AS count FROM bookings ${todayWhere} AND (customer IS NULL OR customer = FALSE)`;
    const { rows: customerNotSentRows } = hasSearch
      ? await sql.query(todayCustomerNotSentQuery, todayParams)
      : await sql.query(todayCustomerNotSentQuery);
    const todayCustomerNotSent = parseInt(customerNotSentRows[0].count, 10);

    // --- Tomorrow's stats (Bangkok time) ---
    let tomorrowWhere = '';
    let tomorrowParams = [];
    let dayAfterTomorrowWhere = '';
    let dayAfterTomorrowParams = [];
    if (dateSearchMatch) {
      // If searching by date, use that date for summary
      tomorrowWhere = `WHERE tour_date::date = $1`;
      tomorrowParams = [search];
      // Calculate day after tomorrow date string
      const searchDate = new Date(search);
      const dayAfterTomorrowDate = new Date(searchDate.getTime() + 24 * 60 * 60 * 1000);
      const dayAfterTomorrowStr = dayAfterTomorrowDate.toISOString().slice(0, 10);
      dayAfterTomorrowWhere = `WHERE tour_date::date = $1`;
      dayAfterTomorrowParams = [dayAfterTomorrowStr];
    } else if (search) {
      tomorrowWhere = `WHERE (booking_number ILIKE $1 OR customer_name ILIKE $1 OR sku ILIKE $1 OR program ILIKE $1 OR hotel ILIKE $1) AND tour_date >= ${tomorrowBangkokSql} AND tour_date < ${dayAfterTomorrowBangkokSql}`;
      tomorrowParams = [`%${search}%`];
      dayAfterTomorrowWhere = `WHERE (booking_number ILIKE $1 OR customer_name ILIKE $1 OR sku ILIKE $1 OR program ILIKE $1 OR hotel ILIKE $1) AND tour_date >= ${dayAfterTomorrowBangkokSql} AND tour_date < ${twoDaysAfterTomorrowBangkokSql}`;
      dayAfterTomorrowParams = [`%${search}%`];
    } else {
      tomorrowWhere = `WHERE tour_date >= ${tomorrowBangkokSql} AND tour_date < ${dayAfterTomorrowBangkokSql}`;
      tomorrowParams = [];
      dayAfterTomorrowWhere = `WHERE tour_date >= ${dayAfterTomorrowBangkokSql} AND tour_date < ${twoDaysAfterTomorrowBangkokSql}`;
      dayAfterTomorrowParams = [];
    }
    // Count tomorrow's bookings
    const tomorrowCountQuery = `SELECT COUNT(*) AS count FROM bookings ${tomorrowWhere}`;
    const { rows: tomorrowRows } = tomorrowParams.length
      ? await sql.query(tomorrowCountQuery, tomorrowParams)
      : await sql.query(tomorrowCountQuery);
    const tomorrowCount = parseInt(tomorrowRows[0].count, 10);
    // Count not sent to OP tomorrow
    const tomorrowOpNotSentQuery = `SELECT COUNT(*) AS count FROM bookings ${tomorrowWhere} AND (op IS NULL OR op = FALSE)`;
    const { rows: opNotSentTomorrowRows } = tomorrowParams.length
      ? await sql.query(tomorrowOpNotSentQuery, tomorrowParams)
      : await sql.query(tomorrowOpNotSentQuery);
    const tomorrowOpNotSent = parseInt(opNotSentTomorrowRows[0].count, 10);
    // Count not sent to Customer tomorrow
    const tomorrowCustomerNotSentQuery = `SELECT COUNT(*) AS count FROM bookings ${tomorrowWhere} AND (customer IS NULL OR customer = FALSE)`;
    const { rows: customerNotSentTomorrowRows } = tomorrowParams.length
      ? await sql.query(tomorrowCustomerNotSentQuery, tomorrowParams)
      : await sql.query(tomorrowCustomerNotSentQuery);
    const tomorrowCustomerNotSent = parseInt(customerNotSentTomorrowRows[0].count, 10);
    // --- End tomorrow's stats ---

    // --- Day After Tomorrow's stats (Bangkok time) ---
    const dayAfterTomorrowCountQuery = `SELECT COUNT(*) AS count FROM bookings ${dayAfterTomorrowWhere}`;
    const { rows: dayAfterTomorrowRows } = dayAfterTomorrowParams.length
      ? await sql.query(dayAfterTomorrowCountQuery, dayAfterTomorrowParams)
      : await sql.query(dayAfterTomorrowCountQuery);
    const dayAfterTomorrowCount = parseInt(dayAfterTomorrowRows[0].count, 10);
    // Count not sent to OP day after tomorrow
    const dayAfterTomorrowOpNotSentQuery = `SELECT COUNT(*) AS count FROM bookings ${dayAfterTomorrowWhere} AND (op IS NULL OR op = FALSE)`;
    const { rows: opNotSentDayAfterTomorrowRows } = dayAfterTomorrowParams.length
      ? await sql.query(dayAfterTomorrowOpNotSentQuery, dayAfterTomorrowParams)
      : await sql.query(dayAfterTomorrowOpNotSentQuery);
    const dayAfterTomorrowOpNotSent = parseInt(opNotSentDayAfterTomorrowRows[0].count, 10);
    // Count not sent to Customer day after tomorrow
    const dayAfterTomorrowCustomerNotSentQuery = `SELECT COUNT(*) AS count FROM bookings ${dayAfterTomorrowWhere} AND (customer IS NULL OR customer = FALSE)`;
    const { rows: customerNotSentDayAfterTomorrowRows } = dayAfterTomorrowParams.length
      ? await sql.query(dayAfterTomorrowCustomerNotSentQuery, dayAfterTomorrowParams)
      : await sql.query(dayAfterTomorrowCustomerNotSentQuery);
    const dayAfterTomorrowCustomerNotSent = parseInt(customerNotSentDayAfterTomorrowRows[0].count, 10);
    // --- End day after tomorrow's stats ---

    // Use string interpolation for ORDER BY direction
    let dataQuery = `
      SELECT booking_number, tour_date, customer_name, sku, program, op, ri, customer, hotel, adult, child, infant, phone_number
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
      todayCount,
      todayOpNotSent,
      todayCustomerNotSent,
      tomorrowCount,
      tomorrowOpNotSent,
      tomorrowCustomerNotSent,
      dayAfterTomorrowCount,
      dayAfterTomorrowOpNotSent,
      dayAfterTomorrowCustomerNotSent
    });
    // Edge cache for 60s
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
  } catch (err) {
    console.error('Bookings API error:', err);
    res.status(500).json({ error: 'Failed to fetch bookings', details: err.message, stack: err.stack });
  }
}; 