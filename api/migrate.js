const { sql } = require('@vercel/postgres');
const { getSession } = require('./auth.js');

module.exports = async (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });
  const userRole = session.role;
  
  // Only admin can run migrations
  if (userRole !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Admin only' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Add net_total column to bookings table
    await sql`ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS net_total NUMERIC`;
    
    // Add index for better performance
    await sql`CREATE INDEX IF NOT EXISTS idx_bookings_net_total ON public.bookings (net_total)`;
    
    res.status(200).json({ success: true, message: 'Migration completed successfully' });
  } catch (err) {
    console.error('Migration error:', err);
    res.status(500).json({ error: 'Migration failed', details: err.message });
  }
}; 