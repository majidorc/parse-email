const { sql } = require('@vercel/postgres');
const { getSession } = require('./auth.js');
const NotificationManager = require('../notificationManager.js');

module.exports = async (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });
  const userRole = session.role;
  if (!["admin", "accounting", "reservation"].includes(userRole)) return res.status(403).json({ error: 'Forbidden: Admin, Accounting, or Reservation only' });

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { booking_number } = req.body;
    
    if (!booking_number) {
      return res.status(400).json({ error: 'Booking number is required' });
    }

    // Fetch booking details including customer email
    const { rows } = await sql`
      SELECT booking_number, customer_name, customer_email, tour_date, sku, program, hotel, adult, child, infant, phone_number
      FROM bookings 
      WHERE booking_number = ${booking_number}
    `;

    if (!rows.length) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = rows[0];

    if (!booking.customer_email) {
      return res.status(400).json({ error: 'No customer email available for this booking' });
    }

    // Create notification manager instance
    const notificationManager = new NotificationManager();
    
    // Construct the notification message
    const message = notificationManager.constructNotificationMessage(booking);
    
    // Send email to customer
    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: booking.customer_email,
      subject: `Booking Confirmation: ${booking.booking_number} - ${booking.program || 'Tour'}`,
      text: message,
      html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4F46E5; margin-bottom: 20px;">Booking Confirmation</h2>
        <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <pre style="font-family: 'Courier New', monospace; white-space: pre-wrap; margin: 0;">${message}</pre>
        </div>
        <p style="color: #6B7280; font-size: 14px; margin-top: 20px;">
          Thank you for your booking. If you have any questions, please don't hesitate to contact us.
        </p>
      </div>`
    };

    await notificationManager.transporter.sendMail(mailOptions);

    return res.status(200).json({ 
      success: true, 
      message: 'Email sent successfully to customer',
      customer_email: booking.customer_email
    });

  } catch (error) {
    console.error('Error sending customer email:', error);
    return res.status(500).json({ 
      error: 'Failed to send email', 
      details: error.message 
    });
  }
};
