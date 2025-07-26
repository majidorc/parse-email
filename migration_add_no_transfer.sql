-- Migration: Add no_transfer column to bookings table
-- This column will track whether a booking has "No Transfer" status

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS no_transfer BOOLEAN DEFAULT FALSE;

-- Add index for better performance when filtering by no_transfer
CREATE INDEX IF NOT EXISTS idx_bookings_no_transfer ON bookings(no_transfer);

-- Update existing records to have no_transfer = false by default
UPDATE bookings SET no_transfer = FALSE WHERE no_transfer IS NULL; 