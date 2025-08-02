-- Add Suppliers Table
CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add supplier_id column to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL;

-- Create index for supplier_id
CREATE INDEX IF NOT EXISTS idx_products_supplier_id ON products(supplier_id);

-- Create index for supplier name
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name); 