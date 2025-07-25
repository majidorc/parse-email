const { sql } = require('@vercel/postgres');
const { getSession } = require('./auth.js');

module.exports = async (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });
  const userRole = session.role;
  if (!["admin", "accounting", "reservation"].includes(userRole)) return res.status(403).json({ error: 'Forbidden: Admin, Accounting, or Reservation only' });

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { booking_number } = req.query;

  if (!booking_number) {
    return res.status(400).json({ error: 'Missing booking_number parameter' });
  }

  try {
    // Get the parsed email data
    const { rows: emailRows } = await sql`
      SELECT sender, subject, body, parsed_at 
      FROM parsed_emails 
      WHERE booking_number = ${booking_number}
      ORDER BY parsed_at DESC
      LIMIT 1
    `;

    if (!emailRows.length) {
      return res.status(404).json({ error: 'No parsed email found for this booking' });
    }

    const emailData = emailRows[0];
    
    // Get the booking data
    const { rows: bookingRows } = await sql`
      SELECT * FROM bookings WHERE booking_number = ${booking_number}
    `;

    const bookingData = bookingRows.length > 0 ? bookingRows[0] : null;

    // Convert the email body to text for analysis
    const emailBody = emailData.body.toString('utf8');
    
    // Look for optional add-ons in the email content
    const optionalMatches = emailBody.match(/Optional[:\s]*([^\n\r]+)/gi);
    const boatMatches = emailBody.match(/Boat[^\n\r]*/gi);
    const longneckMatches = emailBody.match(/Longneck[^\n\r]*/gi);
    
    // Check for common patterns
    const patterns = {
      optional: optionalMatches,
      boat: boatMatches,
      longneck: longneckMatches,
      containsOptional: emailBody.toLowerCase().includes('optional'),
      containsBoat: emailBody.toLowerCase().includes('boat'),
      containsLongneck: emailBody.toLowerCase().includes('longneck')
    };

    return res.status(200).json({
      booking_number,
      email: {
        sender: emailData.sender,
        subject: emailData.subject,
        parsed_at: emailData.parsed_at,
        body_length: emailBody.length,
        body_preview: emailBody.substring(0, 500) + '...',
        patterns
      },
      booking: bookingData ? {
        rate: bookingData.rate,
        program: bookingData.program,
        sku: bookingData.sku,
        customer_name: bookingData.customer_name
      } : null
    });

  } catch (err) {
    console.error('Debug email error:', err);
    return res.status(500).json({ error: 'Failed to debug email', details: err.message });
  }
}; 