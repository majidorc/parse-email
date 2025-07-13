const { sql } = require('@vercel/postgres');
const { getSession } = require('./auth.js');

const ALLOWED_SORT_COLUMNS = [
  'booking_number', 'tour_date', 'customer_name', 'sku', 'program', 'op', 'ri', 'customer', 'hotel', 'adult', 'child', 'infant'
];

module.exports = async (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });
  const userRole = session.role;
  if (!["admin", "accounting", "reservation"].includes(userRole)) return res.status(403).json({ error: 'Forbidden: Admin, Accounting, or Reservation only' });

  // Toggle OP/RI/Customer logic (from toggle-op-customer.js)
  if (req.method === 'POST' && req.body && req.body.type === 'toggle') {
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
  }

  const { booking_number } = req.query;

  // If booking_number is present, handle single booking logic
  if (booking_number) {
    if (req.method === 'GET') {
      try {
        const { rows } = await sql`SELECT * FROM bookings WHERE booking_number = ${booking_number}`;
        if (!rows.length) {
          return res.status(404).send('<h1>Booking Not Found</h1>');
        }
        const b = rows[0];
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(`<!DOCTYPE html>
<html lang='en'>
<head>
  <meta charset='UTF-8'>
  <meta name='viewport' content='width=device-width, initial-scale=1.0'>
  <title>Booking #${b.booking_number}</title>
  <style>
    body { font-family: sans-serif; background: #f7fbff; margin: 0; padding: 0; }
    .container { max-width: 480px; margin: 24px auto; background: #fff; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); padding: 24px; }
    h1 { color: #1a237e; font-size: 1.4em; margin-bottom: 0.5em; }
    .row { margin-bottom: 1em; }
    .label { font-weight: bold; color: #333; display: inline-block; min-width: 120px; }
    .value { color: #222; }
    .pax { margin-top: 0.5em; }
    .footer { color: #888; font-size: 0.9em; margin-top: 2em; text-align: center; }
  </style>
</head>
<body>
  <div class='container'>
    <h1>Booking #${b.booking_number}</h1>
    <div class='row'><span class='label'>Tour Date:</span> <span class='value'>${b.tour_date ? b.tour_date.toISOString ? b.tour_date.toISOString().slice(0,10) : b.tour_date.substring(0,10) : ''}</span></div>
    <div class='row'><span class='label'>Customer:</span> <span class='value'>${b.customer_name || ''}</span></div>
    <div class='row'><span class='label'>Program:</span> <span class='value'>${b.program || ''}</span></div>
    <div class='row'><span class='label'>SKU:</span> <span class='value'>${b.sku || ''}</span></div>
    <div class='row'><span class='label'>Hotel:</span> <span class='value'>${b.hotel || ''}</span></div>
    <div class='row'><span class='label'>Phone:</span> <span class='value'>${b.phone_number || ''}</span></div>
    <div class='row pax'><span class='label'>Pax:</span> <span class='value'>${b.adult || 0} Adult${b.adult == 1 ? '' : 's'}, ${b.child || 0} Child${b.child == 1 ? '' : 'ren'}, ${b.infant || 0} Infant${b.infant == 1 ? '' : 's'}</span></div>
    <div class='row'><span class='label'>OP:</span> <span class='value'>${b.op ? '✅' : '❌'}</span> <span class='label'>RI:</span> <span class='value'>${b.ri ? '✅' : '❌'}</span> <span class='label'>Customer:</span> <span class='value'>${b.customer ? '✅' : '❌'}</span></div>
    <div class='footer'>Generated for Telegram Instant View</div>
  </div>
</body>
</html>`);
      } catch (err) {
        return res.status(500).send('<h1>Server Error</h1>');
      }
    }
    if (req.method === 'PATCH') {
      const { column, value } = req.body || {};
      const allowedColumns = ['op', 'ri', 'customer'];
      if (!allowedColumns.includes(column)) {
        return res.status(400).json({ error: 'Invalid column' });
      }
      try {
        // Business rule: 'customer' can only be set to true if 'op' is already true
        if (column === 'customer' && (value === true || value === 1 || value === '1' || value === 'true')) {
          const { rows } = await sql`SELECT op FROM bookings WHERE booking_number = ${booking_number}`;
          const opValue = rows[0]?.op;
          if (!(opValue === true || opValue === 1 || opValue === '1' || opValue === 'true')) {
            return res.status(400).json({ error: "Cannot set Customer ✓ unless OP is already ✓." });
          }
        }
        // Build the query string with the validated column name
        const query = `
          UPDATE bookings
          SET ${column} = $1
          WHERE booking_number = $2
        `;
        await sql.query(query, [value, booking_number]);
        res.status(200).json({ success: true });
      } catch (err) {
        console.error('Failed to update booking:', err); // Log full error to Vercel logs
        res.status(500).json({ error: 'Failed to update booking', details: err.message, stack: err.stack });
      }
    }
    if (req.method === 'DELETE') {
      // Only Admin can delete bookings
      if (userRole !== 'admin') return res.status(403).json({ error: 'Forbidden: Admins only' });
      try {
        await sql`DELETE FROM bookings WHERE booking_number = ${booking_number}`;
        return res.status(200).json({ success: true });
      } catch (err) {
        console.error('Failed to delete booking:', err);
        return res.status(500).json({ error: 'Failed to delete booking', details: err.message });
      }
    }
    // If not GET, PATCH, or DELETE, fall through to main logic (405)
    if (req.method !== 'PATCH' && req.method !== 'GET' && req.method !== 'DELETE') {
      res.setHeader('Allow', ['PATCH', 'GET', 'DELETE']);
      return res.status(405).json({ error: 'Method not allowed' });
    }
    return;
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
      SELECT booking_number, book_date, tour_date, customer_name, sku, program, op, ri, customer, hotel, adult, child, infant, phone_number, rate, updated_fields
      FROM bookings
      ${whereClause}
      ORDER BY ${sort} ${dirStr}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    const dataParams = [...params, limit, offset];
    const { rows: bookings } = await sql.query(dataQuery, dataParams);

    // Edge cache for 60s
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
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
  } catch (err) {
    console.error('Bookings API error:', err);
    res.status(500).json({ error: 'Failed to fetch bookings', details: err.message, stack: err.stack });
  }
}; 