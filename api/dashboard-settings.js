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
          bokun_access_key: '',
          bokun_secret_key: '',
          woocommerce_consumer_key: '',
          woocommerce_consumer_secret: '',
          use_bokun_api: false
        });
      }
      const s = rows[0];
      return res.status(200).json({
        bokun_access_key: s.bokun_access_key || '',
        bokun_secret_key: s.bokun_secret_key || '',
        woocommerce_consumer_key: s.woocommerce_consumer_key || '',
        woocommerce_consumer_secret: s.woocommerce_consumer_secret || '',
        use_bokun_api: !!s.use_bokun_api,
        telegram_bot_token: s.telegram_bot_token || '',
        telegram_chat_id: s.telegram_chat_id || '',
        notification_email_to: s.notification_email_to || ''
      });
    }
    if (req.method === 'POST') {
      const { bokun_access_key, bokun_secret_key, woocommerce_consumer_key, woocommerce_consumer_secret, use_bokun_api, telegram_bot_token, telegram_chat_id, notification_email_to } = req.body || {};
      await sql`
        INSERT INTO settings (id, bokun_access_key, bokun_secret_key, woocommerce_consumer_key, woocommerce_consumer_secret, use_bokun_api, telegram_bot_token, telegram_chat_id, notification_email_to, updated_at)
        VALUES (1, ${bokun_access_key || ''}, ${bokun_secret_key || ''}, ${woocommerce_consumer_key || ''}, ${woocommerce_consumer_secret || ''}, ${!!use_bokun_api}, ${telegram_bot_token || ''}, ${telegram_chat_id || ''}, ${notification_email_to || ''}, NOW())
        ON CONFLICT (id) DO UPDATE SET
          bokun_access_key = EXCLUDED.bokun_access_key,
          bokun_secret_key = EXCLUDED.bokun_secret_key,
          woocommerce_consumer_key = EXCLUDED.woocommerce_consumer_key,
          woocommerce_consumer_secret = EXCLUDED.woocommerce_consumer_secret,
          use_bokun_api = EXCLUDED.use_bokun_api,
          telegram_bot_token = EXCLUDED.telegram_bot_token,
          telegram_chat_id = EXCLUDED.telegram_chat_id,
          notification_email_to = EXCLUDED.notification_email_to,
          updated_at = NOW();
      `;
      return res.status(200).json({ success: true });
    }
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  if (type === 'whitelist') {
    if (req.method === 'GET') {
      const { rows } = await sql`SELECT phone_number, role, is_active FROM user_whitelist ORDER BY role, phone_number`;
      return res.status(200).json({ whitelist: rows });
    }
    if (req.method === 'POST') {
      const { phone_number, role, is_active } = req.body || {};
      if (!phone_number || !role) return res.status(400).json({ error: 'Missing phone_number or role' });
      await sql`
        INSERT INTO user_whitelist (phone_number, role, is_active)
        VALUES (${phone_number}, ${role}, COALESCE(${is_active}, TRUE))
        ON CONFLICT (phone_number) DO UPDATE SET role = EXCLUDED.role, is_active = EXCLUDED.is_active;
      `;
      return res.status(200).json({ success: true });
    }
    if (req.method === 'DELETE') {
      const { phone_number } = req.body || {};
      if (!phone_number) return res.status(400).json({ error: 'Missing phone_number' });
      await sql`DELETE FROM user_whitelist WHERE phone_number = ${phone_number}`;
      return res.status(200).json({ success: true });
    }
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  // Default: dashboard analytics
  const period = req.query.period || 'thisMonth';
  const [start, end] = getBangkokDateRange(period);
  const channel = req.query.channel;
  // Helper to get channel filter SQL and params
  function getChannelFilterSql(col = 'booking_number') {
    if (!channel) return { sql: '', params: [] };
    if (channel === 'Website') return { sql: `AND ${col} LIKE '6%'`, params: [] };
    if (channel === 'OTA') return { sql: `AND (${col} LIKE 'GYG%' OR ${col} NOT LIKE '6%')`, params: [] };
    return { sql: '', params: [] };
  }
  try {
    // Total Bookings: bookings with tour_date in period
    const channelFilter = getChannelFilterSql();
    const { rows: totalRows } = await sql.query(
      `SELECT COUNT(*) AS count FROM bookings WHERE tour_date >= $1 AND tour_date < $2 ${channelFilter.sql}`,
      [start, end, ...channelFilter.params]
    );
    const totalBookings = parseInt(totalRows[0].count, 10);
    // New Bookings: bookings with book_date in period
    const newRowsFilter = getChannelFilterSql();
    const { rows: newRows } = await sql.query(
      `SELECT COUNT(*) AS count FROM bookings WHERE book_date >= $1 AND book_date < $2 ${newRowsFilter.sql}`,
      [start, end, ...newRowsFilter.params]
    );
    const newBookings = parseInt(newRows[0].count, 10);
    const booked = totalBookings;
    const { rows: doneRows } = await sql.query(
      `SELECT COUNT(*) AS count FROM bookings WHERE tour_date >= $1 AND tour_date < $2 AND customer = TRUE ${channelFilter.sql}`,
      [start, end, ...channelFilter.params]
    );
    const done = parseInt(doneRows[0].count, 10);
    const { rows: paidRows } = await sql.query(
      `SELECT COALESCE(SUM(paid),0) AS sum FROM bookings WHERE tour_date >= $1 AND tour_date < $2 ${channelFilter.sql}`,
      [start, end, ...channelFilter.params]
    );
    const totalEarnings = parseFloat(paidRows[0].sum);
    const { rows: revenueRows } = await sql.query(
      `SELECT tour_date::date AS day, COALESCE(SUM(paid),0) AS revenue, COUNT(*) AS count
       FROM bookings WHERE tour_date >= $1 AND tour_date < $2 ${channelFilter.sql}
       GROUP BY day ORDER BY day`, [start, end, ...channelFilter.params]
    );
    const { rows: destRows } = await sql.query(
      `SELECT program, COUNT(*) AS count, COALESCE(SUM(adult),0) + COALESCE(SUM(child),0) AS total_pax
       FROM bookings WHERE tour_date >= $1 AND tour_date < $2 ${channelFilter.sql} GROUP BY program ORDER BY count DESC`, [start, end, ...channelFilter.params]
    );
    let percentNew = null, percentEarnings = null, percentTotal = null;
    let prevPeriod = null;
    switch (period) {
      case 'thisWeek': prevPeriod = 'lastWeek'; break;
      case 'lastWeek': prevPeriod = 'prevLastWeek'; break;
      case 'thisMonth': prevPeriod = 'lastMonth'; break;
      case 'lastMonth': prevPeriod = 'prevLastMonth'; break;
      case 'thisYear': prevPeriod = 'lastYear'; break;
      case 'lastYear': prevPeriod = 'prevLastYear'; break;
      case 'all':
      default:
        prevPeriod = null;
        break;
    }
    if (prevPeriod) {
      let prevStart, prevEnd;
      if (period === 'lastWeek') {
        // prevLastWeek: week before last
        const now = new Date();
        const end = getBangkokDateRange('lastWeek')[0];
        const start = new Date(end);
        start.setUTCDate(start.getUTCDate() - 7);
        prevStart = start.toISOString().slice(0, 10);
        prevEnd = end;
      } else if (period === 'lastMonth') {
        // prevLastMonth: month before last
        const now = new Date();
        const end = getBangkokDateRange('lastMonth')[0];
        const start = new Date(end);
        start.setUTCMonth(start.getUTCMonth() - 1);
        prevStart = start.toISOString().slice(0, 10);
        prevEnd = end;
      } else if (period === 'lastYear') {
        // prevLastYear: year before last
        const now = new Date();
        const end = getBangkokDateRange('lastYear')[0];
        const start = new Date(end);
        start.setUTCFullYear(start.getUTCFullYear() - 1);
        prevStart = start.toISOString().slice(0, 10);
        prevEnd = end;
      } else {
        [prevStart, prevEnd] = getBangkokDateRange(prevPeriod);
      }
      // New Bookings percent change
      const { rows: lastNewRows } = await sql.query(
        `SELECT COUNT(*) AS count FROM bookings WHERE book_date >= $1 AND book_date < $2`, [prevStart, prevEnd]
      );
      const lastNew = parseInt(lastNewRows[0].count, 10);
      percentNew = lastNew === 0 ? null : ((newBookings - lastNew) / lastNew) * 100;
      // Earnings percent change
      const { rows: lastPaidRows } = await sql.query(
        `SELECT COALESCE(SUM(paid),0) AS sum FROM bookings WHERE tour_date >= $1 AND tour_date < $2`, [prevStart, prevEnd]
      );
      const lastEarnings = parseFloat(lastPaidRows[0].sum);
      percentEarnings = lastEarnings === 0 ? null : ((totalEarnings - lastEarnings) / lastEarnings) * 100;
      // Total Bookings percent change
      const { rows: lastTotalRows } = await sql.query(
        `SELECT COUNT(*) AS count FROM bookings WHERE tour_date >= $1 AND tour_date < $2`, [prevStart, prevEnd]
      );
      const lastTotal = parseInt(lastTotalRows[0].count, 10);
      percentTotal = lastTotal === 0 ? null : ((totalBookings - lastTotal) / lastTotal) * 100;
    }
    const { rows: paxRows } = await sql.query(
      `SELECT COALESCE(SUM(adult),0) AS adults, COALESCE(SUM(child),0) AS children FROM bookings WHERE tour_date >= $1 AND tour_date < $2 ${channelFilter.sql}`,
      [start, end, ...channelFilter.params]
    );
    const totalAdults = parseInt(paxRows[0].adults, 10);
    const totalChildren = parseInt(paxRows[0].children, 10);
    const { rows: allRows } = await sql.query(
      `SELECT booking_number, COALESCE(adult,0) AS adult, COALESCE(child,0) AS child, COALESCE(infant,0) AS infant, rate
       FROM bookings WHERE tour_date >= $1 AND tour_date < $2 ${channelFilter.sql}`,
      [start, end, ...channelFilter.params]
    );
    let websiteCount = 0, otaCount = 0, websitePassengers = 0, otaPassengers = 0;
    allRows.forEach(row => {
      const pax = Number(row.adult) + Number(row.child) + Number(row.infant);
      if (row.booking_number.startsWith('6')) {
        websiteCount++;
        websitePassengers += pax;
      } else if (row.booking_number.startsWith('GYG') || !row.booking_number.startsWith('6')) {
        otaCount++;
        otaPassengers += pax;
      }
    });
    const channels = [
      { channel: 'Website', count: websiteCount, passengers: websitePassengers },
      { channel: 'OTA', count: otaCount, passengers: otaPassengers }
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