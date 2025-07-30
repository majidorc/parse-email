const { sql } = require('@vercel/postgres');

async function runMigration() {
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
      
    } else {
      console.log('✅ order_number column already exists');
    }
    
    console.log('Migration completed successfully!');
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigration(); 