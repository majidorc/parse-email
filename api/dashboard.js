const { sql } = require('@vercel/postgres');

function getBangkokDateRange(period) {
  // Returns [startDate, endDate] in YYYY-MM-DD for the given period in Bangkok time
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const bangkok = new Date(utc + 7 * 60 * 60 * 1000);
  let start, end;
  if (period === 'all') {
    start = '1970-01-01';
    end = '2100-01-01';
  } else if (period === 'lastMonth') {
    // Last month in Bangkok time
    const firstOfThisMonth = new Date(bangkok.getFullYear(), bangkok.getMonth(), 1);
    const firstOfLastMonth = new Date(bangkok.getFullYear(), bangkok.getMonth() - 1, 1);
    start = firstOfLastMonth.toISOString().slice(0, 10);
    end = firstOfThisMonth.toISOString().slice(0, 10);
  } else {
    // This month (default)
    const firstOfThisMonth = new Date(bangkok.getFullYear(), bangkok.getMonth(), 1);
    const firstOfNextMonth = new Date(bangkok.getFullYear(), bangkok.getMonth() + 1, 1);
    start = firstOfThisMonth.toISOString().slice(0, 10);
    end = firstOfNextMonth.toISOString().slice(0, 10);
  }
  return [start, end];
}

module.exports = async (req, res) => {
  const period = req.query.period || 'thisMonth'; // 'thisMonth', 'lastMonth', 'all'
  const [start, end] = getBangkokDateRange(period);
  try {
    // Total bookings (all time, no date filter)
    const { rows: totalRows } = await sql.query(
      `SELECT COUNT(*) AS count FROM bookings`
    );
    const totalBookings = parseInt(totalRows[0].count, 10);

    // New bookings (by created_at)
    const { rows: newRows } = await sql.query(
      `SELECT COUNT(*) AS count FROM bookings WHERE created_at >= $1 AND created_at < $2`, [start, end]
    );
    const newBookings = parseInt(newRows[0].count, 10);

    // Total earnings (sum of paid)
    const { rows: paidRows } = await sql.query(
      `SELECT COALESCE(SUM(paid),0) AS sum FROM bookings WHERE tour_date >= $1 AND tour_date < $2`, [start, end]
    );
    const totalEarnings = parseFloat(paidRows[0].sum);

    // Done vs Booked
    const { rows: doneRows } = await sql.query(
      `SELECT COUNT(*) AS count FROM bookings WHERE tour_date < CURRENT_DATE AND customer = TRUE AND tour_date >= $1 AND tour_date < $2`, [start, end]
    );
    const done = parseInt(doneRows[0].count, 10);
    const booked = totalBookings - done;

    // Revenue by day (for chart)
    const { rows: revenueRows } = await sql.query(
      `SELECT tour_date::date AS day, COALESCE(SUM(paid),0) AS revenue, COUNT(*) AS count
       FROM bookings WHERE tour_date >= $1 AND tour_date < $2
       GROUP BY day ORDER BY day`, [start, end]
    );
    // Top destinations (by program)
    const { rows: destRows } = await sql.query(
      `SELECT program, COUNT(*) AS count FROM bookings WHERE tour_date >= $1 AND tour_date < $2 GROUP BY program ORDER BY count DESC LIMIT 5`, [start, end]
    );

    // Percent changes (this month vs last month)
    let percentNew = null, percentEarnings = null;
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
    }

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
      period,
      start,
      end
    });
  } catch (err) {
    console.error('Dashboard API error:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard analytics', details: err.message });
  }
}; 