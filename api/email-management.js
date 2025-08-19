const { sql } = require('@vercel/postgres');
const { getSession } = require('./auth.js');

module.exports = async (req, res) => {
    const session = getSession(req);
    
    // Handle tracking pixel requests (no auth required)
    if (req.method === 'GET' && req.query.trackingPixelId) {
        return handleEmailTracking(req, res);
    }
    
    // For all other requests, require authentication
    if (!session) return res.status(401).json({ error: 'Not authenticated' });
    const userRole = session.role;
    if (!["admin", "accounting", "reservation"].includes(userRole)) return res.status(403).json({ error: 'Forbidden: Admin, Accounting, or Reservation only' });

    try {
        if (req.method === 'GET') {
            return handleGetEmailLogs(req, res);
        } else if (req.method === 'DELETE') {
            return handleDeleteEmailLog(req, res);
        } else {
            return res.status(405).json({ error: 'Method not allowed' });
        }
    } catch (error) {
        console.error('Error in email management API:', error);
        return res.status(500).json({ 
            error: 'Internal server error', 
            details: error.message 
        });
    }
};

// Handle email logs retrieval
async function handleGetEmailLogs(req, res) {
    const { 
        page = 1, 
        limit = 50, 
        status, 
        email_type, 
        customer_email,
        booking_number,
        date_from,
        date_to,
        sort_by = 'sent_at',
        sort_order = 'desc'
    } = req.query;

    // Build WHERE clause
    let whereConditions = [];
    let params = [];
    let paramCount = 0;

    if (status) {
        whereConditions.push(`status = $${++paramCount}`);
        params.push(status);
    }

    if (email_type) {
        whereConditions.push(`email_type = $${++paramCount}`);
        params.push(email_type);
    }

    if (customer_email) {
        whereConditions.push(`customer_email ILIKE $${++paramCount}`);
        params.push(`%${customer_email}%`);
    }

    if (booking_number) {
        whereConditions.push(`booking_number ILIKE $${++paramCount}`);
        params.push(`%${booking_number}%`);
    }

    if (date_from) {
        whereConditions.push(`sent_at >= $${++paramCount}`);
        params.push(date_from);
    }

    if (date_to) {
        whereConditions.push(`sent_at <= $${++paramCount}`);
        params.push(date_to + ' 23:59:59');
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Validate sort parameters
    const allowedSortColumns = ['sent_at', 'customer_email', 'subject', 'status', 'email_type', 'booking_number'];
    const allowedSortOrders = ['asc', 'desc'];
    
    const validSortBy = allowedSortColumns.includes(sort_by) ? sort_by : 'sent_at';
    const validSortOrder = allowedSortOrders.includes(sort_order.toLowerCase()) ? sort_order.toUpperCase() : 'DESC';

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM email_logs ${whereClause}`;
    const countResult = await sql.query(countQuery, params);
    const totalCount = parseInt(countResult.rows[0].count);

    // Calculate pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const totalPages = Math.ceil(totalCount / parseInt(limit));

    // Get email logs with pagination
    const logsQuery = `
        SELECT 
            el.*,
            b.customer_name,
            b.program,
            b.tour_date
        FROM email_logs el
        LEFT JOIN bookings b ON el.booking_number = b.booking_number
        ${whereClause}
        ORDER BY el.${validSortBy} ${validSortOrder}
        LIMIT $${++paramCount} OFFSET $${++paramCount}
    `;
    
    params.push(parseInt(limit), offset);
    const logsResult = await sql.query(logsQuery, params);

    // Get summary statistics
    const statsQuery = `
        SELECT 
            COUNT(*) as total_emails,
            COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_count,
            COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_count,
            COUNT(CASE WHEN status = 'opened' THEN 1 END) as opened_count,
            COUNT(CASE WHEN status = 'bounced' THEN 1 END) as bounced_count,
            COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count,
            AVG(CASE WHEN opened_at IS NOT NULL THEN EXTRACT(EPOCH FROM (opened_at - sent_at))/60 END) as avg_open_time_minutes
        FROM email_logs
        ${whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : ''}
    `;
    
    const statsResult = await sql.query(statsQuery, whereConditions.length > 0 ? params.slice(0, -2) : []);

    return res.status(200).json({
        success: true,
        data: {
            logs: logsResult.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total_count: totalCount,
                total_pages: totalPages,
                has_next: parseInt(page) < totalPages,
                has_prev: parseInt(page) > 1
            },
            statistics: statsResult.rows[0]
        }
    });
}

// Handle email log deletion
async function handleDeleteEmailLog(req, res) {
    const { id } = req.body;
    
    if (!id) {
        return res.status(400).json({ error: 'Email log ID is required' });
    }

    const { rows } = await sql`DELETE FROM email_logs WHERE id = ${id} RETURNING id`;
    
    if (rows.length === 0) {
        return res.status(404).json({ error: 'Email log not found' });
    }

    return res.status(200).json({ 
        success: true, 
        message: 'Email log deleted successfully' 
    });
}

// Handle email tracking (no auth required)
async function handleEmailTracking(req, res) {
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
}
