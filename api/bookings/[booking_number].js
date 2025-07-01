const { sql } = require('@vercel/postgres');

module.exports = async (req, res) => {
  const { booking_number } = req.query;

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

  if (req.method !== 'PATCH') {
    res.setHeader('Allow', ['PATCH', 'GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
}; 