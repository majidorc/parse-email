-- Migration to add order_number column to bookings table
-- Run this in your Neon/PostgreSQL database

-- Add order_number column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'bookings' AND column_name = 'order_number'
    ) THEN
        ALTER TABLE bookings ADD COLUMN order_number TEXT;
    END IF;
END $$;

-- Create index for order_number if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_bookings_order_number ON bookings(order_number); 