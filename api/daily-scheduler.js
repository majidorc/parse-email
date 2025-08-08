const { sql } = require('@vercel/postgres');
const { getSession } = require('./auth.js');
const NotificationManager = require('../notificationManager');
const axios = require('axios');

// This is the main function for the daily cron job
module.exports = async (req, res) => {
    // Handle customer email sending
    if (req.method === 'POST' && req.body && req.body.booking_number && (!req.body.action || req.body.action !== 'line')) {
        const session = getSession(req);
        if (!session) return res.status(401).json({ error: 'Not authenticated' });
        const userRole = session.role;
        if (!["admin", "accounting", "reservation"].includes(userRole)) return res.status(403).json({ error: 'Forbidden: Admin, Accounting, or Reservation only' });

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
            
            // Format tour date as "09 Aug 2025"
            const tourDate = booking.tour_date ? new Date(booking.tour_date).toLocaleDateString('en-GB', { 
                day: '2-digit', 
                month: 'short', 
                year: 'numeric' 
            }) : 'N/A';
            
            // Clean hotel name - remove "THAILAND" from the end and zip codes
            const cleanHotel = booking.hotel ? booking.hotel
                .replace(/\s*THAILAND\s*$/i, '')
                .replace(/\s+[A-Za-z]+\s+\d{5}\s*$/i, '')
                .trim() : '';
            
            // Get pickup time from request or use default
            const pickupTime = req.body.pickup_time || '08:00 ~ 09:00';
            
            // Construct customer-friendly email message
            const customerMessage = `Hello ${booking.customer_name},

Warm Greetings from Thailand Tours
Thank you for choosing to book your trip with us!

We are pleased to confirm your booking, as detailed below.

Tour date: ${tourDate}
Pick up: ${cleanHotel}
Pickup time: ${pickupTime}

** Please be prepared and ready at the reception a few minutes before, and please note that the driver could be late by 15-30 minutes due to traffic and unwanted clauses.
We will try to be on time as possible , please just call us if driver be later more than 10 mins**

Should you require any other assistance, please do not hesitate to contact us at anytime by replying to this email.

We wish you a great day and a fantastic trip!

Best Regards,
Thailand Tours team`;
            
            // Send email to customer
            const mailOptions = {
                from: process.env.SMTP_FROM || process.env.SMTP_USER,
                to: booking.customer_email,
                subject: `Booking Confirmation: ${booking.booking_number} - ${booking.program || 'Tour'}`,
                text: customerMessage,
                html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #4F46E5; margin-bottom: 20px;">Booking Confirmation</h2>
                    <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                        <pre style="font-family: 'Courier New', monospace; white-space: pre-wrap; margin: 0;">${customerMessage}</pre>
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
    }

    // Handle Line message sending
    if (req.method === 'POST' && req.body && req.body.booking_number && req.body.action === 'line') {
        const session = getSession(req);
        if (!session) return res.status(401).json({ error: 'Not authenticated' });
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

            // Use the provided message (which should be the notification text from frontend)
            let lineMessage = message;
            if (!lineMessage) {
                // Fallback message if somehow no message is provided
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
    }

    // Original daily scheduler functionality - only for cron jobs
    if (req.method !== 'POST') {
        return res.status(405).send({ error: 'Method Not Allowed' });
    }

    // Basic security: check for a secret to prevent unauthorized runs.
    const cronSecret = req.headers['authorization'];
    if (cronSecret !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).send({ error: 'Unauthorized' });
    }

    try {
        // Get tomorrow's date in Asia/Bangkok timezone for logging purposes
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowInBangkok = tomorrow.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });

        console.log(`Scheduler running for Bangkok date: ${tomorrowInBangkok} (Tomorrow)`);

        // This query creates a precise 24-hour window for "tomorrow" in the Bangkok timezone.
        const { rows: bookings } = await sql`
            SELECT * FROM bookings
            WHERE
                tour_date >= date_trunc('day', now() AT TIME ZONE 'Asia/Bangkok') + interval '1 day' AND
                tour_date <  date_trunc('day', now() AT TIME ZONE 'Asia/Bangkok') + interval '2 day' AND
                notification_sent = false;
        `;

        if (bookings.length === 0) {
            console.log('No bookings scheduled for tomorrow in Bangkok.');
            return res.status(200).send('No bookings for tomorrow.');
        }

        console.log(`Found ${bookings.length} bookings for tomorrow in Bangkok. Sending notifications...`);
        let successCount = 0;
        let errorCount = 0;

        const notificationManager = new NotificationManager();

        for (const booking of bookings) {
            try {
                // The new NotificationManager takes the whole booking object
                await notificationManager.sendAll(booking);
                
                // Mark as sent in the database
                await sql`
                    UPDATE bookings SET notification_sent = true WHERE id = ${booking.id};
                `;
                console.log(`Marked booking ID ${booking.id} as sent.`);
                
                successCount++;
            } catch (notificationError) {
                console.error(`Failed to process notification for booking ${booking.id}:`, notificationError);
                errorCount++;
            }
        }

        const summary = `Notification process complete. Success: ${successCount}, Failed: ${errorCount}.`;
        console.log(summary);
        return res.status(200).send(summary);

    } catch (dbError) {
        console.error('Database error in cron job:', dbError);
        return res.status(500).json({ error: 'Database error.', details: dbError.message });
    }
}; 