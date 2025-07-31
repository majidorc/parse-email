-- Migration script to add order_number column to bookings table
-- Run this script on your friend's database to fix the error

-- Add the order_number column if it doesn't exist
DO $$ 
BEGIN
    -- Check if the column exists
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'bookings' 
        AND column_name = 'order_number'
    ) THEN
        -- Add the column
        ALTER TABLE bookings ADD COLUMN order_number TEXT;
        
        -- Create index for the new column
        CREATE INDEX IF NOT EXISTS idx_bookings_order_number ON bookings(order_number);
        
        RAISE NOTICE 'Added order_number column to bookings table';
    ELSE
        RAISE NOTICE 'order_number column already exists in bookings table';
    END IF;
END $$; 