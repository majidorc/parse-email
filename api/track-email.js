const { sql } = require('@vercel/postgres');

module.exports = async (req, res) => {
    // Only allow GET requests (tracking pixel requests)
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { trackingPixelId } = req.query;
        
        if (!trackingPixelId) {
            return res.status(400).json({ error: 'Tracking pixel ID is required' });
        }

        // Get client IP and user agent
        const ipAddress = req.headers['x-forwarded-for'] || 
                         req.headers['x-real-ip'] || 
                         req.connection.remoteAddress;
        
        const userAgent = req.headers['user-agent'] || 'Unknown';

        // Update email log with open information
        const { rows } = await sql`
            UPDATE email_logs 
            SET 
                status = 'opened',
                opened_at = NOW(),
                opened_count = opened_count + 1,
                ip_address = ${ipAddress},
                user_agent = ${userAgent}
            WHERE tracking_pixel_id = ${trackingPixelId}
            RETURNING id, customer_email, subject
        `;

        if (rows.length === 0) {
            console.warn(`Tracking pixel not found: ${trackingPixelId}`);
            // Return a 1x1 transparent GIF even if not found to avoid errors
            return res.status(200)
                .setHeader('Content-Type', 'image/gif')
                .setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
                .setHeader('Pragma', 'no-cache')
                .setHeader('Expires', '0')
                .send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
        }

        const emailLog = rows[0];
        console.log(`Email opened: ${emailLog.customer_email} - ${emailLog.subject}`);

        // Return a 1x1 transparent GIF
        res.status(200)
            .setHeader('Content-Type', 'image/gif')
            .setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
            .setHeader('Pragma', 'no-cache')
            .setHeader('Expires', '0')
            .send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));

    } catch (error) {
        console.error('Error tracking email open:', error);
        
        // Return a 1x1 transparent GIF even on error to avoid breaking email display
        res.status(200)
            .setHeader('Content-Type', 'image/gif')
            .setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
            .setHeader('Pragma', 'no-cache')
            .setHeader('Expires', '0')
            .send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
    }
};
