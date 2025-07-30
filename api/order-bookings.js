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

  const { order_number } = req.query;

  if (!order_number) {
    return res.status(400).json({ error: 'Missing order_number parameter' });
  }

  try {
    // Get all bookings for this order number
    const { rows: bookings } = await sql`
      SELECT booking_number, order_number, book_date, tour_date, customer_name, sku, program, op, ri, customer, hotel, adult, child, infant, phone_number, rate, updated_fields
      FROM bookings 
      WHERE order_number = ${order_number}
      ORDER BY tour_date ASC, booking_number ASC
    `;

    if (bookings.length === 0) {
      return res.status(404).json({ error: 'No bookings found for this order number' });
    }

    // Calculate order summary
    const totalBooks = bookings.reduce((sum, b) => sum + (b.adult || 0) + (b.child || 0) + (b.infant || 0), 0);
    const totalAdults = bookings.reduce((sum, b) => sum + (b.adult || 0), 0);
    const totalChildren = bookings.reduce((sum, b) => sum + (b.child || 0), 0);
    const totalInfants = bookings.reduce((sum, b) => sum + (b.infant || 0), 0);
    const totalPaid = bookings.reduce((sum, b) => sum + (parseFloat(b.paid) || 0), 0);

    // Group bookings by tour date
    const bookingsByDate = {};
    bookings.forEach(booking => {
      const tourDate = booking.tour_date ? booking.tour_date.toISOString().split('T')[0] : 'Unknown';
      if (!bookingsByDate[tourDate]) {
        bookingsByDate[tourDate] = [];
      }
      bookingsByDate[tourDate].push(booking);
    });

    res.status(200).json({
      order_number,
      bookings,
      summary: {
        total_bookings: bookings.length,
        total_pax: totalBooks,
        total_adults: totalAdults,
        total_children: totalChildren,
        total_infants: totalInfants,
        total_paid: totalPaid,
        customer_name: bookings[0]?.customer_name || 'Unknown',
        hotel: bookings[0]?.hotel || 'Unknown',
        phone_number: bookings[0]?.phone_number || 'Unknown'
      },
      bookings_by_date: bookingsByDate
    });

  } catch (err) {
    console.error('Order bookings API error:', err);
    res.status(500).json({ error: 'Failed to fetch order bookings', details Bois: err.message });
  }
}; 