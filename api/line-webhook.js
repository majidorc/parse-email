import { sql } from '@vercel/postgres';
import NotificationManager from './notificationManager';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', async () => {
    let json;
    try {
      json = JSON.parse(body);
      console.log('LINE Webhook Event:', JSON.stringify(json, null, 2));
    } catch (e) {
      console.log('LINE Webhook Raw Body:', body);
      return res.status(200).send('OK');
    }

    // Handle postback events for OP/Customer buttons
    if (json.events && Array.isArray(json.events)) {
      for (const event of json.events) {
        if (event.type === 'postback' && event.postback && event.postback.data) {
          const [action, buttonType, bookingId] = event.postback.data.split(':');
          if (action === 'toggle' && (buttonType === 'op' || buttonType === 'customer')) {
            // Fetch booking
            const { rows } = await sql.query('SELECT * FROM bookings WHERE booking_number = $1', [bookingId]);
            if (!rows.length) continue;
            const booking = rows[0];
            let op = booking.op;
            let customer = booking.customer;
            let update = {};
            if (buttonType === 'op') {
              op = !op;
              update.op = op;
              if (!op) customer = false; // If OP is unchecked, also uncheck Customer
            } else if (buttonType === 'customer') {
              if (!op) {
                // Business rule: OP must be true first
                await replyToLine(event.replyToken, 'OP must be ✓ first.');
                continue;
              }
              customer = !customer;
              update.customer = customer;
            }
            // Update DB
            await sql.query(
              `UPDATE bookings SET op = $1, customer = $2 WHERE booking_number = $3`,
              [op, customer, bookingId]
            );
            // Send new button template with updated state
            const notificationManager = new NotificationManager();
            const messageData = notificationManager.constructNotificationMessage(booking);
            await notificationManager.sendLineButton(messageData, op, customer);
          }
        }
      }
    }
    res.status(200).send('OK');
  });
}

async function replyToLine(replyToken, message) {
  if (!replyToken) return;
  const axios = require('axios');
  await axios.post('https://api.line.me/v2/bot/message/reply', {
    replyToken,
    messages: [{ type: 'text', text: message }]
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
    }
  });
} 