const { sql } = require('@vercel/postgres');
const NotificationManager = require('../notificationManager');

// This is the main function for the daily cron job
module.exports = async (req, res) => {
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