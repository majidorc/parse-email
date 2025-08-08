const { sql } = require('@vercel/postgres');
const { getSession } = require('./auth.js');

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
    case 'fourMonthsAgo': {
      end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1));
      start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 4, 1));
      break;
    }
    case 'sixMonthsAgo': {
      end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
      start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, 1));
      break;
    }
    case 'sevenMonthsAgo': {
      end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, 1));
      start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 7, 1));
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
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });
  const userRole = session.role;
  if (type === 'settings') {
    if (req.method === 'GET') {
      const { rows } = await sql`SELECT * FROM settings ORDER BY updated_at DESC LIMIT 1;`;
      if (rows.length === 0) {
        return res.status(200).json({
          telegram_bot_token: '',
          telegram_chat_id: '',
          notification_email_to: '',
          google_analytics_id: ''
        });
      }
      const s = rows[0];
      return res.status(200).json({
        telegram_bot_token: s.telegram_bot_token || '',
        telegram_chat_id: s.telegram_chat_id || '',
        notification_email_to: s.notification_email_to || '',
        google_analytics_id: s.google_analytics_id || ''
      });
    }
    if (req.method === 'POST') {
      if (userRole !== 'admin') return res.status(403).json({ error: 'Forbidden: Admins only' });
      const { telegram_bot_token, telegram_chat_id, notification_email_to, google_analytics_id } = req.body || {};
      await sql`
        INSERT INTO settings (id, telegram_bot_token, telegram_chat_id, notification_email_to, google_analytics_id, updated_at)
        VALUES (1, ${telegram_bot_token || ''}, ${telegram_chat_id || ''}, ${notification_email_to || ''}, ${google_analytics_id || ''}, NOW())
        ON CONFLICT (id) DO UPDATE SET
          telegram_bot_token = EXCLUDED.telegram_bot_token,
          telegram_chat_id = EXCLUDED.telegram_chat_id,
          notification_email_to = EXCLUDED.notification_email_to,
          google_analytics_id = EXCLUDED.google_analytics_id,
          updated_at = NOW();
      `;
      return res.status(200).json({ success: true });
    }
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  if (type === 'whitelist') {
    if (userRole !== 'admin') return res.status(403).json({ error: 'Forbidden: Admins only' });
    if (req.method === 'GET') {
      const { rows } = await sql`SELECT email, phone_number, telegram_user_id, role, is_active FROM user_whitelist ORDER BY role, email`;
      return res.status(200).json({ whitelist: rows });
    }
    if (req.method === 'POST') {
      const { email, phone_number, telegram_user_id, role, is_active } = req.body || {};
      if (!email || !role) return res.status(400).json({ error: 'Missing email or role' });
      await sql`
        INSERT INTO user_whitelist (email, phone_number, telegram_user_id, role, is_active)
        VALUES (${email}, ${phone_number || null}, ${telegram_user_id || null}, ${role}, COALESCE(${is_active}, TRUE))
        ON CONFLICT (email) DO UPDATE SET phone_number = EXCLUDED.phone_number, telegram_user_id = EXCLUDED.telegram_user_id, role = EXCLUDED.role, is_active = EXCLUDED.is_active;
      `;
      return res.status(200).json({ success: true });
    }
    if (req.method === 'DELETE') {
      const { email } = req.body || {};
      if (!email) return res.status(400).json({ error: 'Missing email' });
      await sql`DELETE FROM user_whitelist WHERE email = ${email}`;
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
    if (channel === 'Viator') return { sql: `AND ${col} LIKE '1%'`, params: [] };
    if (channel === 'OTA') return { sql: `AND (${col} LIKE 'GYG%' OR (${col} NOT LIKE '6%' AND ${col} NOT LIKE '1%'))`, params: [] };
    return { sql: '', params: [] };
  }
  try {
    // Total Bookings: bookings with tour_date in period (exclude deleted/cancelled)
    const channelFilter = getChannelFilterSql();
    const { rows: totalRows } = await sql.query(
      `SELECT COUNT(*) AS count FROM bookings WHERE tour_date >= $1 AND tour_date < $2 ${channelFilter.sql}`,
      [start, end, ...channelFilter.params]
    );
    const totalBookings = parseInt(totalRows[0].count, 10);
    
    // New Bookings: bookings with book_date in period (exclude deleted/cancelled)
    const newRowsFilter = getChannelFilterSql();
    const { rows: newRows } = await sql.query(
      `SELECT COUNT(*) AS count FROM bookings WHERE book_date >= $1 AND book_date < $2 ${newRowsFilter.sql}`,
      [start, end, ...newRowsFilter.params]
    );
    const newBookings = parseInt(newRows[0].count, 10);
    const booked = totalBookings;
    
    // Done bookings: customer = TRUE (exclude deleted/cancelled)
    const { rows: doneRows } = await sql.query(
      `SELECT COUNT(*) AS count FROM bookings WHERE tour_date >= $1 AND tour_date < $2 AND customer = TRUE ${channelFilter.sql}`,
      [start, end, ...channelFilter.params]
    );
    const done = parseInt(doneRows[0].count, 10);
    
    // Total Earnings: sum of paid (exclude deleted/cancelled)
    const { rows: paidRows } = await sql.query(
      `SELECT COALESCE(SUM(paid),0) AS sum FROM bookings WHERE tour_date >= $1 AND tour_date < $2 ${channelFilter.sql}`,
      [start, end, ...channelFilter.params]
    );
    const totalEarnings = parseFloat(paidRows[0].sum);
    
    // Calculate benefit using the same logic as accounting.js (with fallback to net_total)
    // Check if net_total column exists
    let hasNetTotalColumn = false;
    try {
      const { rows: columnCheck } = await sql.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'bookings' AND column_name = 'net_total'
      `);
      hasNetTotalColumn = columnCheck.length > 0;
    } catch (err) {
      hasNetTotalColumn = false;
    }

    const { rows: benefitRows } = await sql.query(
      `SELECT 
        b.adult, b.child, b.paid, r.net_adult, r.net_child${hasNetTotalColumn ? ', b.net_total' : ''}
       FROM bookings b
       LEFT JOIN products p ON b.sku = p.sku
       LEFT JOIN rates r ON r.product_id = p.id AND LOWER(TRIM(r.name)) = LOWER(TRIM(b.rate))
       WHERE b.tour_date >= $1 AND b.tour_date < $2 ${channelFilter.sql}`,
      [start, end, ...channelFilter.params]
    );
    
    const totalBenefit = benefitRows.reduce((sum, b) => {
      const netAdult = Number(b.net_adult) || 0;
      const netChild = Number(b.net_child) || 0;
      const adult = Number(b.adult) || 0;
      const child = Number(b.child) || 0;
      const paid = Number(b.paid) || 0;
      // Use stored net_total if available and column exists, otherwise calculate from rates
      const netTotal = hasNetTotalColumn && b.net_total !== null ? Number(b.net_total) : (netAdult * adult + netChild * child);
      return sum + (paid - netTotal);
    }, 0);
    const { rows: revenueRows } = await sql.query(
      `SELECT tour_date::date AS day, COALESCE(SUM(paid),0) AS revenue, COUNT(*) AS count
       FROM bookings WHERE tour_date >= $1 AND tour_date < $2 ${channelFilter.sql}
       GROUP BY day ORDER BY day`, [start, end, ...channelFilter.params]
    );
    const { rows: destRows } = await sql.query(
      `SELECT program, COUNT(*) AS count, COALESCE(SUM(adult),0) + COALESCE(SUM(child),0) AS total_pax
       FROM bookings WHERE tour_date >= $1 AND tour_date < $2 ${channelFilter.sql} GROUP BY program ORDER BY count DESC`, [start, end, ...channelFilter.params]
    );
    let percentNew = null, percentEarnings = null, percentTotal = null, percentBenefit = null;
    let prevPeriod = null;
    switch (period) {
      case 'thisWeek': prevPeriod = 'lastWeek'; break;
      case 'lastWeek': prevPeriod = 'prevLastWeek'; break;
      case 'thisMonth': prevPeriod = 'lastMonth'; break;
      case 'lastMonth': prevPeriod = 'prevLastMonth'; break;
      case 'twoMonthsAgo': prevPeriod = 'threeMonthsAgo'; break;
      case 'threeMonthsAgo': prevPeriod = 'fourMonthsAgo'; break;
      case 'sixMonthsAgo': prevPeriod = 'sevenMonthsAgo'; break;
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
      
      // Benefit percent change
      const { rows: lastBenefitRows } = await sql.query(
        `SELECT 
          b.adult, b.child, b.paid, r.net_adult, r.net_child${hasNetTotalColumn ? ', b.net_total' : ''}
         FROM bookings b
         LEFT JOIN products p ON b.sku = p.sku
         LEFT JOIN rates r ON r.product_id = p.id AND LOWER(TRIM(r.name)) = LOWER(TRIM(b.rate))
         WHERE b.tour_date >= $1 AND b.tour_date < $2 ${channelFilter.sql}`,
        [prevStart, prevEnd, ...channelFilter.params]
      );
      
      const lastTotalBenefit = lastBenefitRows.reduce((sum, b) => {
        const netAdult = Number(b.net_adult) || 0;
        const netChild = Number(b.net_child) || 0;
        const adult = Number(b.adult) || 0;
        const child = Number(b.child) || 0;
        const paid = Number(b.paid) || 0;
        // Use stored net_total if available and column exists, otherwise calculate from rates
        const netTotal = hasNetTotalColumn && b.net_total !== null ? Number(b.net_total) : (netAdult * adult + netChild * child);
        return sum + (paid - netTotal);
      }, 0);
      
      const percentBenefit = lastTotalBenefit === 0 ? null : ((totalBenefit - lastTotalBenefit) / Math.abs(lastTotalBenefit)) * 100;
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
    let websiteCount = 0, viatorCount = 0, websitePassengers = 0, viatorPassengers = 0;
    allRows.forEach(row => {
      const pax = Number(row.adult) + Number(row.child) + Number(row.infant);
      if (row.booking_number.startsWith('1')) {
        viatorCount++;
        viatorPassengers += pax;
      } else {
        // All other booking numbers go to Website (including '6', 'GYG', and any others)
        websiteCount++;
        websitePassengers += pax;
      }
    });
    const channels = [
      { channel: 'Website', count: websiteCount, passengers: websitePassengers },
      { channel: 'Viator', count: viatorCount, passengers: viatorPassengers }
    ];
    // Add cache control headers to prevent caching
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    res.status(200).json({
      totalBookings,
      newBookings,
      totalEarnings,
      totalBenefit,
      done,
      booked,
      revenueByDay: revenueRows,
      topDestinations: destRows,
      percentNew,
      percentEarnings,
      percentTotal,
      percentBenefit,
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

 