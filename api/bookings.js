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
      const { booking_number, column } = req.body;
      if (!booking_number || !['op', 'ri', 'customer'].includes(column)) {
        return res.status(400).json({ error: 'Invalid request' });
      }
      // Fetch current state
      const { rows } = await sql`SELECT op, ri, customer FROM bookings WHERE booking_number = ${booking_number}`;
      if (!rows.length) {
        return res.status(404).json({ error: 'Booking not found' });
      }
      let { op, ri, customer } = rows[0];
      if (column === 'op') {
        op = !op;
        if (!op) customer = false; // Unchecking OP also unchecks Customer
      } else if (column === 'ri') {
        ri = !ri;
      } else if (column === 'customer') {
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

  // Update booking rate logic
  if (req.method === 'PATCH') {
    try {
      const { booking_number, rate } = req.body;
      if (!booking_number || !rate) {
        return res.status(400).json({ error: 'Missing required fields: booking_number, rate' });
      }
      
      // Update the booking rate
      const { rows } = await sql`UPDATE bookings SET rate = ${rate} WHERE booking_number = ${booking_number} RETURNING booking_number, rate`;
      
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Booking not found' });
      }
      
      return res.status(200).json({ 
        success: true, 
        message: 'Rate updated successfully',
        booking_number: rows[0].booking_number,
        rate: rows[0].rate
      });
    } catch (err) {
      console.error('Error updating booking rate:', err);
      return res.status(500).json({ error: 'Failed to update rate', details: err.message });
    }
  }

  // Add new booking logic
  if (req.method === 'POST' && req.body && !req.body.type) {
    try {
      const {
        booking_number,
        tour_date,
        customer_name,
        phone_number = '',
        sku = '',
        program = '',
        rate = '',
        hotel = '',
        adult = 0,
        child = 0,
        infant = 0,
        paid = null,
        channel = 'Website',
        national_park_fee = false,
        no_transfer = false
      } = req.body;

      // Validate required fields
      if (!booking_number || !tour_date || !customer_name || !adult) {
        return res.status(400).json({ error: 'Missing required fields: booking_number, tour_date, customer_name, adult' });
      }

      // Check if booking already exists
      const { rows: existing } = await sql`SELECT booking_number FROM bookings WHERE booking_number = ${booking_number}`;
      if (existing.length > 0) {
        return res.status(409).json({ error: 'Booking number already exists' });
      }

      // Insert new booking
      await sql`
        INSERT INTO bookings (
          booking_number, tour_date, customer_name, phone_number, sku, program, rate, hotel,
          adult, child, infant, paid, channel, national_park_fee, no_transfer, book_date
        ) VALUES (
          ${booking_number}, ${tour_date}, ${customer_name}, ${phone_number}, ${sku}, ${program}, ${rate}, ${hotel},
          ${adult}, ${child}, ${infant}, ${paid}, ${channel}, ${national_park_fee}, ${no_transfer}, NOW()
        )
      `;

      return res.status(201).json({ 
        success: true, 
        message: 'Booking added successfully',
        booking_number 
      });
    } catch (err) {
      console.error('Error adding booking:', err);
      return res.status(500).json({ error: 'Failed to add booking', details: err.message });
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
    <div class='row'><span class='label'>Program:</span> <span class='value'>${b.program || ''}${b.rate ? ` - [${b.rate}]` : ''}</span></div>
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
        return res.status(200).json({ success: true });
      } catch (err) {
        console.error('Failed to update booking:', err); // Log full error to Vercel logs
        return res.status(500).json({ error: 'Failed to update booking', details: err.message, stack: err.stack });
      }
    }
    if (req.method === 'DELETE') {
      console.log('[DEBUG] DELETE request received for booking_number:', booking_number);
      console.log('[DEBUG] User role:', userRole);
      
      // Only Admin can delete bookings
      if (userRole !== 'admin') {
        console.log('[DEBUG] Access denied - user is not admin');
        return res.status(403).json({ error: 'Forbidden: Admins only' });
      }
      
      try {
        console.log('[DEBUG] Fetching booking details before deletion');
        // Get booking details before deletion
        const { rows: bookingDetails } = await sql`SELECT tour_date FROM bookings WHERE booking_number = ${booking_number}`;
        console.log('[DEBUG] Booking details found:', bookingDetails.length > 0);
        
        // Send cancellation notification to Telegram
        const NotificationManager = require('../notificationManager');
        const nm = new NotificationManager();
        const tourDate = bookingDetails.length > 0 ? bookingDetails[0].tour_date : null;
        console.log('[DEBUG] Sending cancellation notification');
        await nm.sendCancellationNotification(booking_number, 'Manual deletion by admin', null, tourDate);

        console.log('[DEBUG] Deleting booking from database');
        await sql`DELETE FROM bookings WHERE booking_number = ${booking_number}`;
        console.log('[DEBUG] Booking deleted successfully');
        return res.status(200).json({ success: true });
      } catch (err) {
        console.error('[DEBUG] Failed to delete booking:', err);
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
  const period = req.query.period || 'all';

  // Period filtering function (same as dashboard-settings.js)
  function getBangkokDateRange(period) {
    const now = new Date();
    function getStartOfWeek(date) {
      const d = new Date(date);
      const day = d.getUTCDay();
      const diff = (day === 0 ? -6 : 1) - day;
      d.setUTCDate(d.getUTCDate() + diff);
      d.setUTCHours(0, 0, 0, 0);
      return d;
    }
    function getStartOfYear(date) {
      return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    }
    function getStartOfNextYear(date) {
      return new Date(Date.UTC(date.getUTCFullYear() + 1, 0, 1));
    }
    let start, end;
    switch (period) {
      case 'thisWeek': {
        start = getStartOfWeek(now);
        end = new Date(start);
        end.setUTCDate(start.getUTCDate() + 7);
        break;
      }
      case 'lastWeek': {
        end = getStartOfWeek(now);
        start = new Date(end);
        start.setUTCDate(end.getUTCDate() - 7);
        break;
      }
      case 'thisMonth': {
        start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
        break;
      }
      case 'lastMonth': {
        end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
        break;
      }
      case 'twoMonthsAgo': {
        end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
        start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
        break;
      }
      case 'threeMonthsAgo': {
        end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
        start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1));
        break;
      }
      case 'sixMonthsAgo': {
        end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
        start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, 1));
        break;
      }
      case 'thisYear': {
        start = getStartOfYear(now);
        end = getStartOfNextYear(now);
        break;
      }
      case 'lastYear': {
        end = getStartOfYear(now);
        start = getStartOfYear(new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1)));
        break;
      }
      case 'all':
      default:
        start = new Date(Date.UTC(2000, 0, 1));
        end = new Date(Date.UTC(2100, 0, 1));
        break;
    }
    return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
  }

  // Get date range for period filtering
  const [periodStart, periodEnd] = getBangkokDateRange(period);

  try {
    let whereClause = '';
    let params = [];
    let paramIndex = 1;
    
    // Build WHERE clause combining search and period filtering
    const conditions = [];
    
    // Period filtering
    if (period !== 'all') {
      conditions.push(`(tour_date AT TIME ZONE 'Asia/Bangkok')::date >= $${paramIndex} AND (tour_date AT TIME ZONE 'Asia/Bangkok')::date < $${paramIndex + 1}`);
      params.push(periodStart, periodEnd);
      paramIndex += 2;
    }
    
    // Search filtering
    const dateSearchMatch = search.match(/^\d{4}-\d{2}-\d{2}$/);
    if (dateSearchMatch) {
      // Date-only search overrides period filtering
      conditions.push(`(tour_date AT TIME ZONE 'Asia/Bangkok')::date = $${paramIndex}`);
      params = [search]; // Reset params for date search
      paramIndex = 2;
    } else if (search) {
      conditions.push(`(booking_number ILIKE $${paramIndex} OR customer_name ILIKE $${paramIndex} OR sku ILIKE $${paramIndex} OR program ILIKE $${paramIndex} OR hotel ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    if (conditions.length > 0) {
      whereClause = `WHERE ${conditions.join(' AND ')}`;
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
      SELECT booking_number, COALESCE(order_number, '') as order_number, book_date, tour_date, customer_name, sku, program, op, ri, customer, hotel, adult, child, infant, phone_number, rate, updated_fields
      FROM bookings
      ${whereClause}
      ORDER BY ${sort} ${dirStr}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    const dataParams = [...params, limit, offset];
    const { rows: bookings } = await sql.query(dataQuery, dataParams);

    // Edge cache for 60s
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.status(200).json({
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
    return res.status(500).json({ error: 'Failed to fetch bookings', details: err.message, stack: err.stack });
  }

  // Order bookings endpoint - merged from order-bookings.js
  if (req.method === 'GET' && req.query.order_number && !req.query.page && !req.query.limit) {
    const { order_number } = req.query;

    try {
      // Get all bookings for this order number
      const { rows: bookings } = await sql`
        SELECT booking_number, COALESCE(order_number, '') as order_number, book_date, tour_date, customer_name, sku, program, op, ri, customer, hotel, adult, child, infant, phone_number, rate, updated_fields
        FROM bookings 
        WHERE order_number = ${order_number}
        ORDER BY tour_date ASC, booking_number ASC
      `;

      if (bookings.length === 0) {
        return res.status(404).json({ error: 'No bookings found for this order number' });
      }

      // Calculate order summary
      const totalBooks = bookings.reduce((sum, b) => sum + (b.adult || 0) + (b.child || 0) + (b.infant || 0), 0);
      const totalAdults = bookings.reduce((sum, b) => sum + (b.adult || 0), 0);
      const totalChildren = bookings.reduce((sum, b) => sum + (b.child || 0), 0);
      const totalInfants = bookings.reduce((sum, b) => sum + (b.infant || 0), 0);
      const totalPaid = bookings.reduce((sum, b) => sum + (parseFloat(b.paid) || 0), 0);

      // Group bookings by tour date
      const bookingsByDate = {};
      bookings.forEach(booking => {
        const tourDate = booking.tour_date ? booking.tour_date.toISOString().split('T')[0] : 'Unknown';
        if (!bookingsByDate[tourDate]) {
          bookingsByDate[tourDate] = [];
        }
        bookingsByDate[tourDate].push(booking);
      });

      return res.status(200).json({
        order_number,
        bookings,
        summary: {
          total_bookings: bookings.length,
          total_pax: totalBooks,
          total_adults: totalAdults,
          total_children: totalChildren,
          total_infants: totalInfants,
          total_paid: totalPaid,
          customer_name: bookings[0]?.customer_name || 'Unknown',
          hotel: bookings[0]?.hotel || 'Unknown',
          phone_number: bookings[0]?.phone_number || 'Unknown'
        },
        bookings_by_date: bookingsByDate
      });

    } catch (err) {
      console.error('Order bookings API error:', err);
      return res.status(500).json({ error: 'Failed to fetch order bookings', details: err.message });
    }
  }

  // Web notifications endpoint - merged from notifications.js
  if (req.method === 'GET' && (req.query.check_new || req.query.sync)) {
    try {
      const { check_new, sync } = req.query;

      if (check_new === 'true') {
        // Check for new web notifications since last check
        const { rows } = await sql`
          SELECT COUNT(*) as total 
          FROM web_notifications 
          WHERE created_at >= NOW() - INTERVAL '5 minutes'
        `;
        
        return res.json({
          total: parseInt(rows[0].total),
          newBookings: parseInt(rows[0].total)
        });
      }

      if (sync === 'true') {
        // Background sync - check for new web notifications in the last hour
        const { rows } = await sql`
          SELECT 
            booking_number,
            customer_name,
            tour_date,
            program,
            created_at
          FROM web_notifications 
          WHERE created_at >= NOW() - INTERVAL '1 hour'
          ORDER BY created_at DESC
          LIMIT 10
        `;
        
        return res.json({
          newBookings: rows,
          count: rows.length
        });
      }

      // Default: return recent bookings for notification
      const { rows } = await sql`
        SELECT 
          booking_number,
          customer_name,
          tour_date,
          program,
          created_at
        FROM web_notifications 
        ORDER BY created_at DESC
        LIMIT 5
      `;

      return res.json({
        recentBookings: rows,
        count: rows.length
      });

    } catch (error) {
      console.error('Notification API error:', error);
      return res.status(500).json({ 
        error: 'Internal server error',
        message: error.message 
      });
    }
  }
  
  // If we reach here, no valid endpoint was matched
  return res.status(404).json({ error: 'Endpoint not found' });
} 