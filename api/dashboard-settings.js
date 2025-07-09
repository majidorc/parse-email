const { sql } = require('@vercel/postgres');

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

module.exports = async (req, res) => {
  const type = req.query.type;
  if (type === 'settings') {
    if (req.method === 'GET') {
      const { rows } = await sql`SELECT * FROM settings ORDER BY updated_at DESC LIMIT 1;`;
      if (rows.length === 0) {
        return res.status(200).json({
          bokun_api_key: '',
          bokun_access_key: '',
          bokun_secret_key: '',
          woocommerce_api_key: '',
          woocommerce_api_secret: '',
          woocommerce_consumer_key: '',
          woocommerce_consumer_secret: '',
          use_bokun_api: false
        });
      }
      const s = rows[0];
      return res.status(200).json({
        bokun_api_key: s.bokun_api_key || '',
        bokun_access_key: s.bokun_access_key || '',
        bokun_secret_key: s.bokun_secret_key || '',
        woocommerce_api_key: s.woocommerce_api_key || '',
        woocommerce_api_secret: s.woocommerce_api_secret || '',
        woocommerce_consumer_key: s.woocommerce_consumer_key || '',
        woocommerce_consumer_secret: s.woocommerce_consumer_secret || '',
        use_bokun_api: !!s.use_bokun_api
      });
    }
    if (req.method === 'POST') {
      const { bokun_api_key, bokun_access_key, bokun_secret_key, woocommerce_api_key, woocommerce_api_secret, woocommerce_consumer_key, woocommerce_consumer_secret, use_bokun_api } = req.body || {};
      await sql`
        INSERT INTO settings (id, bokun_api_key, bokun_access_key, bokun_secret_key, woocommerce_api_key, woocommerce_api_secret, woocommerce_consumer_key, woocommerce_consumer_secret, use_bokun_api, updated_at)
        VALUES (1, ${bokun_api_key || ''}, ${bokun_access_key || ''}, ${bokun_secret_key || ''}, ${woocommerce_api_key || ''}, ${woocommerce_api_secret || ''}, ${woocommerce_consumer_key || ''}, ${woocommerce_consumer_secret || ''}, ${!!use_bokun_api}, NOW())
        ON CONFLICT (id) DO UPDATE SET
          bokun_api_key = EXCLUDED.bokun_api_key,
          bokun_access_key = EXCLUDED.bokun_access_key,
          bokun_secret_key = EXCLUDED.bokun_secret_key,
          woocommerce_api_key = EXCLUDED.woocommerce_api_key,
          woocommerce_api_secret = EXCLUDED.woocommerce_api_secret,
          woocommerce_consumer_key = EXCLUDED.woocommerce_consumer_key,
          woocommerce_consumer_secret = EXCLUDED.woocommerce_consumer_secret,
          use_bokun_api = EXCLUDED.use_bokun_api,
          updated_at = NOW();
      `;
      return res.status(200).json({ success: true });
    }
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  // Default: dashboard analytics
  const period = req.query.period || 'thisMonth';
  const [start, end] = getBangkokDateRange(period);
  try {
    const { rows: totalRows } = await sql.query(
      `SELECT COUNT(*) AS count FROM bookings WHERE tour_date >= $1 AND tour_date < $2`, [start, end]
    );
    const totalBookings = parseInt(totalRows[0].count, 10);
    const newBookings = totalBookings;
    const booked = totalBookings;
    const { rows: doneRows } = await sql.query(
      `SELECT COUNT(*) AS count FROM bookings WHERE tour_date >= $1 AND tour_date < $2 AND customer = TRUE`, [start, end]
    );
    const done = parseInt(doneRows[0].count, 10);
    const { rows: paidRows } = await sql.query(
      `SELECT COALESCE(SUM(paid),0) AS sum FROM bookings WHERE tour_date >= $1 AND tour_date < $2`, [start, end]
    );
    const totalEarnings = parseFloat(paidRows[0].sum);
    const { rows: revenueRows } = await sql.query(
      `SELECT tour_date::date AS day, COALESCE(SUM(paid),0) AS revenue, COUNT(*) AS count
       FROM bookings WHERE tour_date >= $1 AND tour_date < $2
       GROUP BY day ORDER BY day`, [start, end]
    );
    const { rows: destRows } = await sql.query(
      `SELECT program, COUNT(*) AS count, COALESCE(SUM(adult),0) + COALESCE(SUM(child),0) AS total_pax FROM bookings WHERE tour_date >= $1 AND tour_date < $2 GROUP BY program ORDER BY count DESC`, [start, end]
    );
    let percentNew = null, percentEarnings = null, percentTotal = null;
    if (period === 'thisMonth') {
      const [lastStart, lastEnd] = getBangkokDateRange('lastMonth');
      const { rows: lastNewRows } = await sql.query(
        `SELECT COUNT(*) AS count FROM bookings WHERE created_at >= $1 AND created_at < $2`, [lastStart, lastEnd]
      );
      const lastNew = parseInt(lastNewRows[0].count, 10);
      percentNew = lastNew === 0 ? null : ((newBookings - lastNew) / lastNew) * 100;
      const { rows: lastPaidRows } = await sql.query(
        `SELECT COALESCE(SUM(paid),0) AS sum FROM bookings WHERE tour_date >= $1 AND tour_date < $2`, [lastStart, lastEnd]
      );
      const lastEarnings = parseFloat(lastPaidRows[0].sum);
      percentEarnings = lastEarnings === 0 ? null : ((totalEarnings - lastEarnings) / lastEarnings) * 100;
      const { rows: lastTotalRows } = await sql.query(
        `SELECT COUNT(*) AS count FROM bookings WHERE tour_date >= $1 AND tour_date < $2`, [lastStart, lastEnd]
      );
      const lastTotal = parseInt(lastTotalRows[0].count, 10);
      percentTotal = lastTotal === 0 ? null : ((totalBookings - lastTotal) / lastTotal) * 100;
    }
    const { rows: paxRows } = await sql.query(
      `SELECT COALESCE(SUM(adult),0) AS adults, COALESCE(SUM(child),0) AS children FROM bookings WHERE tour_date >= $1 AND tour_date < $2`, [start, end]
    );
    const totalAdults = parseInt(paxRows[0].adults, 10);
    const totalChildren = parseInt(paxRows[0].children, 10);
    const { rows: allRows } = await sql.query(
      `SELECT booking_number FROM bookings WHERE tour_date >= $1 AND tour_date < $2`, [start, end]
    );
    let websiteCount = 0, otaCount = 0;
    allRows.forEach(row => {
      if (row.booking_number.startsWith('6')) websiteCount++;
      else if (row.booking_number.startsWith('GYG') || !row.booking_number.startsWith('6')) otaCount++;
    });
    const channels = [
      { channel: 'Website', count: websiteCount },
      { channel: 'OTA', count: otaCount }
    ];
    res.status(200).json({
      totalBookings,
      newBookings,
      totalEarnings,
      done,
      booked,
      revenueByDay: revenueRows,
      topDestinations: destRows,
      percentNew,
      percentEarnings,
      percentTotal,
      period,
      start,
      end,
      totalAdults,
      totalChildren,
      channels
    });
  } catch (err) {
    console.error('Dashboard/Settings API error:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard analytics', details: err.message });
  }
}; 