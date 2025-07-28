-- Migration to add order column to rates table
-- This will preserve the order of rates when they are reordered

ALTER TABLE rates ADD COLUMN IF NOT EXISTS rate_order INTEGER DEFAULT 0;

-- Update existing rates to have sequential order
UPDATE rates SET rate_order = id WHERE rate_order = 0;

-- Create index for better performance when ordering
CREATE INDEX IF NOT EXISTS idx_rates_order ON rates(product_id, rate_order); 