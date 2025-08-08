const { sql } = require('@vercel/postgres');
const { getSession } = require('./auth.js');
const axios = require('axios');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const session = getSession(req);
  if (!session) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const userRole = session.role;
  if (!['admin', 'accounting', 'reservation'].includes(userRole)) {
    return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
  }

  try {
    const { booking_number, message } = req.body;

    if (!booking_number) {
      return res.status(400).json({ error: 'Booking number is required' });
    }

    // Fetch booking details
    const { rows } = await sql.query(
      `SELECT booking_number, customer_name, tour_date, sku, program, hotel, adult, child, infant, phone_number
       FROM bookings
       WHERE booking_number = $1`,
      [booking_number]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = rows[0];

    // Construct the message if not provided
    let lineMessage = message;
    if (!lineMessage) {
      lineMessage = `📋 Booking Update: ${booking.booking_number}
👤 Customer: ${booking.customer_name || 'N/A'}
📅 Tour Date: ${booking.tour_date ? booking.tour_date.substring(0, 10) : 'N/A'}
🏷️ Program: ${booking.program || 'N/A'}
🏨 Hotel: ${booking.hotel || 'N/A'}
👥 Pax: ${booking.adult || 0} Adult, ${booking.child || 0} Child, ${booking.infant || 0} Infant
📞 Phone: ${booking.phone_number || 'N/A'}`;
    }

    // Send to Line group
    const lineResponse = await axios.post('https://api.line.me/v2/bot/message/push', {
      to: process.env.LINE_GROUP_ID,
      messages: [
        {
          type: 'text',
          text: lineMessage
        }
      ]
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
      }
    });

    if (lineResponse.status === 200) {
      res.status(200).json({ 
        success: true, 
        message: 'Message sent to Line group successfully' 
      });
    } else {
      res.status(500).json({ 
        error: 'Failed to send message to Line group' 
      });
    }

  } catch (error) {
    console.error('Error sending Line message:', error);
    res.status(500).json({ 
      error: 'Failed to send Line message', 
      details: error.message 
    });
  }
};
