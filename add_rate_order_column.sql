-- Migration script to add rate_order column to rates table
-- This will fix the 500 error when importing Excel data

-- Add the rate_order column if it doesn't exist
DO $$ 
BEGIN
    -- Check if the column exists
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'rates' 
        AND column_name = 'rate_order'
    ) THEN
        -- Add the column
        ALTER TABLE rates ADD COLUMN rate_order INTEGER DEFAULT 0;
        
        -- Create index for the new column
        CREATE INDEX IF NOT EXISTS idx_rates_rate_order ON rates(rate_order);
        
        RAISE NOTICE 'Added rate_order column to rates table';
    ELSE
        RAISE NOTICE 'rate_order column already exists in rates table';
    END IF;
END $$; 