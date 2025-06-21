const { sql } = require('@vercel/postgres');
const nodemailer = require('nodemailer');
const axios = require('axios');

// This is the main function for the daily cron job
module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).send({ error: 'Method Not Allowed' });
    }

    // Basic security: check for a secret to prevent unauthorized runs.
    // This should be set as an environment variable in Vercel.
    const cronSecret = req.headers['authorization'];
    if (cronSecret !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).send({ error: 'Unauthorized' });
    }

    try {
        const today = new Date().toISOString().split('T')[0];

        // Find all bookings for today that haven't had a notification sent yet
        const { rows: bookings } = await sql`
            SELECT * FROM bookings 
            WHERE tour_date::date = CURRENT_DATE AND notification_sent = false;
        `;

        if (bookings.length === 0) {
            console.log('No bookings scheduled for today.');
            return res.status(200).send('No bookings for today.');
        }

        console.log(`Found ${bookings.length} bookings for today. Sending notifications...`);
        let successCount = 0;
        let errorCount = 0;

        for (const booking of bookings) {
            try {
                const notificationManager = new NotificationManager();
                // We need to re-create the `extractedInfo` object shape
                const extractedInfo = {
                    responseTemplate: `Please confirm the *pickup time* for this booking:\n\nBooking no : ${booking.booking_number}\nTour date : ${new Date(booking.tour_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit'}).replace(/ /g, '.')}\nProgram : ${booking.program}\nName : ${booking.customer_name}\nPax : ${booking.pax}\nHotel : ${booking.hotel}\nPhone Number : ${booking.phone_number}\nCash on tour : None\n\nPlease mentioned if there is any additional charge for transfer collect from customer`,
                    extractedInfo: { bookingNumber: booking.booking_number }
                };
                
                await notificationManager.sendAll(extractedInfo);
                
                // Mark as sent in the database
                console.log(`Attempting to mark booking ID ${booking.id} as sent...`);
                const updateResult = await sql`
                    UPDATE bookings SET notification_sent = true WHERE id = ${booking.id};
                `;
                console.log(`Update command executed for booking ID ${booking.id}. Result:`, updateResult);
                
                successCount++;
            } catch (notificationError) {
                console.error(`Failed to send notification for booking ${booking.booking_number}:`, notificationError);
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

// --- Re-usable NotificationManager ---
// We include this directly here to keep the file self-contained.
class NotificationManager {
  async sendEmail(extractedInfo) {
    if (!process.env.SMTP_HOST) return; // Simple check
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_PORT === '465',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transporter.sendMail({
      from: process.env.FROM_EMAIL,
      to: 'o0dr.orc0o@gmail.com',
      subject: `Booking Confirmation - ${extractedInfo.extractedInfo.bookingNumber}`,
      text: extractedInfo.responseTemplate,
      html: extractedInfo.responseTemplate.replace(/\n/g, '<br>'),
    });
  }

  async sendTelegram(extractedInfo) {
    if (!process.env.TELEGRAM_BOT_TOKEN) return; // Simple check
    const plainTextForCopy = extractedInfo.responseTemplate.replace(/\*/g, '');
    const message = "Please confirm the pickup time for this booking\\. Details to copy are below:\n\n" +
                    "```\n" + plainTextForCopy + "\n```";
    const payload = {
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'MarkdownV2'
    };
    await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, payload);
  }

  async sendAll(extractedInfo) {
    // In a real scenario, you might want to try both even if one fails.
    // For simplicity, we run them in sequence.
    await this.sendEmail(extractedInfo);
    await this.sendTelegram(extractedInfo);
  }
} 