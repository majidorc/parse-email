-- Comprehensive migration script for bookings table
-- Run this script on your friend's database to ensure all required columns exist

DO $$ 
BEGIN
    -- Add order_number column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'bookings' 
        AND column_name = 'order_number'
    ) THEN
        ALTER TABLE bookings ADD COLUMN order_number TEXT;
        RAISE NOTICE 'Added order_number column to bookings table';
    END IF;

    -- Add net_total column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'bookings' 
        AND column_name = 'net_total'
    ) THEN
        ALTER TABLE bookings ADD COLUMN net_total NUMERIC(12,2);
        RAISE NOTICE 'Added net_total column to bookings table';
    END IF;

    -- Add national_park_fee column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'bookings' 
        AND column_name = 'national_park_fee'
    ) THEN
        ALTER TABLE bookings ADD COLUMN national_park_fee BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Added national_park_fee column to bookings table';
    END IF;

    -- Add no_transfer column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'bookings' 
        AND column_name = 'no_transfer'
    ) THEN
        ALTER TABLE bookings ADD COLUMN no_transfer BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Added no_transfer column to bookings table';
    END IF;

    -- Add op column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'bookings' 
        AND column_name = 'op'
    ) THEN
        ALTER TABLE bookings ADD COLUMN op BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Added op column to bookings table';
    END IF;

    -- Add ri column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'bookings' 
        AND column_name = 'ri'
    ) THEN
        ALTER TABLE bookings ADD COLUMN ri BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Added ri column to bookings table';
    END IF;

    -- Add customer column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'bookings' 
        AND column_name = 'customer'
    ) THEN
        ALTER TABLE bookings ADD COLUMN customer BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Added customer column to bookings table';
    END IF;

    -- Add notification_sent column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'bookings' 
        AND column_name = 'notification_sent'
    ) THEN
        ALTER TABLE bookings ADD COLUMN notification_sent BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Added notification_sent column to bookings table';
    END IF;

    -- Add channel column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'bookings' 
        AND column_name = 'channel'
    ) THEN
        ALTER TABLE bookings ADD COLUMN channel TEXT;
        RAISE NOTICE 'Added channel column to bookings table';
    END IF;

    -- Add updated_fields column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'bookings' 
        AND column_name = 'updated_fields'
    ) THEN
        ALTER TABLE bookings ADD COLUMN updated_fields JSONB;
        RAISE NOTICE 'Added updated_fields column to bookings table';
    END IF;

    -- Add created_at column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'bookings' 
        AND column_name = 'created_at'
    ) THEN
        ALTER TABLE bookings ADD COLUMN created_at TIMESTAMP DEFAULT NOW();
        RAISE NOTICE 'Added created_at column to bookings table';
    END IF;

    -- Create indexes if they don't exist
    CREATE INDEX IF NOT EXISTS idx_bookings_order_number ON bookings(order_number);
    CREATE INDEX IF NOT EXISTS idx_bookings_tour_date ON bookings(tour_date);
    CREATE INDEX IF NOT EXISTS idx_bookings_book_date ON bookings(book_date);
    CREATE INDEX IF NOT EXISTS idx_bookings_program ON bookings(program);
    CREATE INDEX IF NOT EXISTS idx_bookings_sku ON bookings(sku);
    CREATE INDEX IF NOT EXISTS idx_bookings_customer_name ON bookings(customer_name);
    CREATE INDEX IF NOT EXISTS idx_bookings_hotel ON bookings(hotel);
    CREATE INDEX IF NOT EXISTS idx_bookings_no_transfer ON bookings(no_transfer);

    RAISE NOTICE 'Migration completed successfully!';
END $$; 