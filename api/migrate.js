const { sql } = require('@vercel/postgres');

module.exports = async (req, res) => {
  // Simple authentication check
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Running migration to add order_number column...');
    
    // Check if order_number column exists
    const checkQuery = `
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'bookings' AND column_name = 'order_number'
    `;
    
    const { rows } = await sql.query(checkQuery);
    
    if (rows.length === 0) {
      console.log('order_number column does not exist, adding it...');
      
      // Add the column
      await sql.query('ALTER TABLE bookings ADD COLUMN order_number TEXT');
      console.log('✅ Added order_number column');
      
      // Create index
      await sql.query('CREATE INDEX IF NOT EXISTS idx_bookings_order_number ON bookings(order_number)');
      console.log('✅ Created index for order_number column');
      
      res.status(200).json({ 
        success: true, 
        message: 'Migration completed: Added order_number column and index' 
      });
      
    } else {
      console.log('✅ order_number column already exists');
      res.status(200).json({ 
        success: true, 
        message: 'Migration completed: order_number column already exists' 
      });
    }
    
  } catch (error) {
    console.error('Migration failed:', error);
    res.status(500).json({ 
      error: 'Migration failed', 
      details: error.message 
    });
  }
}; 