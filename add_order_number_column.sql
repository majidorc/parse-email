-- Add order_number column to bookings table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'bookings' AND column_name = 'order_number'
    ) THEN
        ALTER TABLE bookings ADD COLUMN order_number TEXT;
        CREATE INDEX IF NOT EXISTS idx_bookings_order_number ON bookings(order_number);
    END IF;
END $$; 