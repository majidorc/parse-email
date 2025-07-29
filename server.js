const express = require('express');
const bodyParser = require('body-parser');
const handler = require('./api/webhook.js');
const { sql } = require('@vercel/postgres');

const app = express();
app.use(bodyParser.raw({ type: '*/*' }));

app.post('/api/webhook', (req, res) => handler(req, res));
app.post('/api/telegram-bot', require('./api/telegram-bot.js'));
app.get('/', (req, res) => res.send('Parse Email API is running!'));
app.get('/booking/:booking_number', async (req, res) => {
  const { booking_number } = req.params;
  try {
    const { rows } = await sql`SELECT * FROM bookings WHERE booking_number = ${booking_number}`;
    if (!rows.length) {
      return res.status(404).send('<h1>Booking Not Found</h1>');
    }
    const b = rows[0];
    res.send(`<!DOCTYPE html>
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
    res.status(500).send('<h1>Server Error</h1>');
  }
});

app.get('/api/parsed-emails-analytics', require('./api/parsed-emails-analytics.js'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
}); 