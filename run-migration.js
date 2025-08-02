const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('Starting suppliers migration...');
    
    // Create suppliers table
    await client.query(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✓ Suppliers table created');

    // Add supplier_id column to products table
    await client.query(`
      ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL
    `);
    console.log('✓ supplier_id column added to products table');

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_supplier_id ON products(supplier_id)
    `);
    console.log('✓ supplier_id index created');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name)
    `);
    console.log('✓ suppliers name index created');

    console.log('✅ Migration completed successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    client.release();
    process.exit(0);
  }
}

runMigration(); 