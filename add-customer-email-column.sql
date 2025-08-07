-- Migration: Add customer_email column to bookings table
-- Run this on existing databases to add the new customer_email column

-- Add customer_email column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'bookings' 
        AND column_name = 'customer_email'
    ) THEN
        ALTER TABLE bookings ADD COLUMN customer_email TEXT;
        RAISE NOTICE 'Added customer_email column to bookings table';
    ELSE
        RAISE NOTICE 'customer_email column already exists in bookings table';
    END IF;
END $$;
